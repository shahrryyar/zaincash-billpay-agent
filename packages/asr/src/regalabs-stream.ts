// Server-side use of RegaLabs' dedicated live-call recognizer. The existing push-to-talk upload is adapted into
// PCM frames; only complete finals + done become a Transcript. Partials never reach the agent or wallet.
import { AsrError, type Transcriber, type Transcript } from "./types";
import { inspectWav } from "./wav";

export type AsrStreamSocket = Pick<WebSocket, "readyState" | "onopen" | "onmessage" | "onerror" | "onclose" | "send" | "close">;
export type RegalabsStreamOptions = {
  url: string;
  apiKey: string;
  language?: string;
  timeoutMs?: number;
  createSocket?: (url: string) => AsrStreamSocket;
};

/** The socket requires raw 16 kHz mono PCM16, not the RIFF header or any metadata chunks. */
function pcmFromWav(wav: Uint8Array): Uint8Array {
  const info = inspectWav(wav);
  if (!info.ok || info.sampleRate !== 16000 || info.channels !== 1) throw new AsrError("bad_audio", "Streaming ASR requires 16 kHz mono PCM16 WAV");
  const view = new DataView(wav.buffer, wav.byteOffset, wav.byteLength);
  for (let at = 12; at + 8 <= wav.length;) {
    const size = view.getUint32(at + 4, true), body = at + 8;
    if (body + size > wav.length) throw new AsrError("bad_audio", "Truncated WAV");
    if (String.fromCharCode(...wav.subarray(at, at + 4)) === "data") {
      if (!size || size % 2) throw new AsrError("bad_audio", "Invalid PCM16 data");
      return wav.slice(body, body + size);
    }
    at = body + size + (size % 2);
  }
  throw new AsrError("bad_audio", "Missing PCM data");
}

function streamError(code: unknown): AsrError {
  if (code === "invalid_api_key" || code === "unauthorized" || code === "authentication_required") return new AsrError("auth", "Streaming ASR authentication failed");
  if (code === "insufficient_quota" || code === "insufficient_credits") return new AsrError("quota", "Streaming ASR credit unavailable");
  if (code === "rate_limit_exceeded" || code === "too_many_streams") return new AsrError("rate_limited", "Streaming ASR capacity reached");
  if (code === "unsupported_language") return new AsrError("unsupported_language", "Streaming ASR language rejected");
  // Retain safe machine codes for diagnostics; never echo provider messages or anything shaped like a key.
  const detail = typeof code === "string" && /^[a-z][a-z0-9_]{0,47}$/.test(code) && !code.startsWith("rega_") ? ` (${code})` : "";
  return new AsrError("unavailable", `Streaming ASR unavailable${detail}`);
}

export function createRegalabsStreamTranscriber(o: RegalabsStreamOptions): Transcriber {
  const language = o.language ?? "auto";
  const provider = `regalabs-stream:${language}`;
  return {
    id: provider,
    async transcribe(wav, opts = {}): Promise<Transcript> {
      let url: URL;
      try { url = new URL(o.url); } catch { throw new AsrError("rejected", "Invalid ASR stream URL"); }
      if (url.protocol !== "wss:" || url.username || url.password) throw new AsrError("rejected", "ASR stream URL must use secure WebSocket without URL credentials");
      const pcm = pcmFromWav(wav);
      if (opts.signal?.aborted) throw new AsrError("unavailable", "Streaming ASR cancelled");
      const started = Date.now();
      // No automatic retry: the socket is billed in audio windows and has no documented replay key.
      return new Promise<Transcript>((resolve, reject) => {
        let socket: AsrStreamSocket;
        try { socket = (o.createSocket ?? ((u) => new WebSocket(u)))(url.href); }
        catch { reject(new AsrError("unavailable", "ASR stream could not connect")); return; }
        let settled = false, ready = false, ended = false, offset = 0, nextUtterance = 1;
        let spokenLanguage: string | undefined;
        const finals: string[] = [];
        let frameTimer: ReturnType<typeof setTimeout> | undefined;
        let timeout: ReturnType<typeof setTimeout>;
        const finish = (error?: AsrError) => {
          if (settled) return;
          settled = true;
          clearTimeout(timeout); clearTimeout(frameTimer);
          opts.signal?.removeEventListener("abort", abort);
          socket.onopen = null; socket.onmessage = null; socket.onerror = null; socket.onclose = null;
          try { socket.close(); } catch { /* already disconnected */ }
          if (error) reject(error);
          else resolve({ text: finals.filter(Boolean).join(" "), provider, latencyMs: Date.now() - started, ...(spokenLanguage ? { language: spokenLanguage } : {}) });
        };
        const abort = () => finish(new AsrError("unavailable", "Streaming ASR cancelled"));
        const send = (data: string | ArrayBuffer) => {
          if (settled) return false;
          try { socket.send(data); return true; }
          catch { finish(new AsrError("unavailable", "ASR stream disconnected")); return false; }
        };
        const nextFrame = () => {
          if (settled) return;
          if (offset >= pcm.length) {
            ended = true; send(JSON.stringify({ type: "end" })); return;
          }
          // 50 ms = 1600 bytes; below the documented 64 KB frame limit. Pace the live-call recognizer in real time.
          if (!send(pcm.slice(offset, offset + 1600).buffer)) return;
          offset += 1600;
          frameTimer = setTimeout(nextFrame, 50);
        };
        timeout = setTimeout(() => finish(new AsrError("timeout", "Streaming ASR did not finish in time")), (o.timeoutMs ?? 15000) + Math.ceil(pcm.length / 32));
        opts.signal?.addEventListener("abort", abort, { once: true });
        socket.onopen = () => { send(JSON.stringify({ type: "auth", token: o.apiKey })); };
        socket.onerror = () => finish(new AsrError("unavailable", "ASR stream handshake or connection failed"));
        socket.onclose = () => finish(new AsrError("unavailable", "ASR stream closed before completion"));
        socket.onmessage = (event) => {
          if (settled) return;
          let msg: Record<string, unknown>;
          try {
            if (typeof event.data !== "string") throw new Error("not JSON text");
            const parsed: unknown = JSON.parse(event.data);
            if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("not an object");
            msg = parsed as Record<string, unknown>;
          } catch { finish(new AsrError("rejected", "Invalid ASR stream message")); return; }
          if (msg.type === "error") { finish(streamError(msg.error ?? msg.code)); return; }
          if (msg.type === "ready") {
            if (ready) { finish(new AsrError("rejected", "Duplicate ASR stream readiness")); return; }
            ready = true;
            if (send(JSON.stringify({ type: "configure", language, sample_rate: 16000 }))) nextFrame();
          } else if (msg.type === "final") {
            if (["capacity", "overloaded", "error"].includes(String(msg.reason))) { finish(new AsrError("unavailable", "ASR could not transcribe the full recording")); return; }
            if (!ready || msg.utterance !== nextUtterance || typeof msg.text !== "string" || !["end", "empty"].includes(String(msg.reason))
              || msg.dropped_ms !== 0 || typeof msg.start_ms !== "number" || !Number.isFinite(msg.start_ms) || msg.start_ms < 0
              || typeof msg.end_ms !== "number" || !Number.isFinite(msg.end_ms) || msg.end_ms < msg.start_ms
              || (msg.reason === "empty" && msg.text.trim() !== "")) {
              finish(new AsrError("rejected", "Incomplete or invalid ASR final")); return;
            }
            nextUtterance++;
            finals.push(msg.text.trim());
            if (typeof msg.language === "string") spokenLanguage = msg.language;
          } else if (msg.type === "done") {
            if (!ended || nextUtterance === 1) finish(new AsrError("rejected", "ASR stream completed without a full final"));
            else finish();
          }
          // Partials and configuration acknowledgements are deliberately not used as final transcripts.
        };
      });
    },
  };
}
