// OpenAI-compatible speech to text. RegaLabs' developer API has exactly this shape
// (POST {base}/audio/transcriptions, multipart "file" = WAV PCM16, "language", Bearer key, OpenAI error envelope),
// so the same client also runs a Whisper baseline on Groq/OpenAI for the WER comparison.
import { AsrError, type Transcriber, type TranscribeOptions, type Transcript } from "./types";

export type OpenAICompatOptions = {
  /** e.g. https://api.regalabs.dev/v1 (no trailing /audio/...). */
  baseUrl: string;
  apiKey: string;
  provider: string;
  language?: string;
  model?: string;
  /** "verbose_json" asks for segments, from which a confidence can be derived when the provider sends avg_logprob. */
  responseFormat?: "json" | "verbose_json";
  timeoutMs?: number;
  /** Retries on 5xx/429/network with the SAME Idempotency-Key, so the provider never bills a retry twice. */
  retries?: number;
  fetch?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
};

const errorCode = (body: unknown): string | undefined => (body as { error?: { code?: string } } | null)?.error?.code;
const errorMessage = (body: unknown): string | undefined => (body as { error?: { message?: string } } | null)?.error?.message;

/** A confidence in [0,1] from whatever the provider returned; undefined when it gave none. Never invented. */
export function confidenceFrom(body: unknown): number | undefined {
  const b = body as { confidence?: unknown; segments?: { avg_logprob?: unknown }[] } | null;
  if (typeof b?.confidence === "number" && Number.isFinite(b.confidence) && b.confidence >= 0 && b.confidence <= 1) return b.confidence;
  const lps = (b?.segments ?? []).map((s) => s?.avg_logprob).filter((x): x is number => typeof x === "number" && Number.isFinite(x));
  if (lps.length === 0) return undefined;
  const mean = lps.reduce((a, x) => a + x, 0) / lps.length;
  return Math.max(0, Math.min(1, Math.exp(mean)));
}

function classify(status: number, body: unknown): AsrError {
  const code = errorCode(body);
  const msg = errorMessage(body) ?? `HTTP ${status}`;
  if (status === 401 || status === 403) return new AsrError("auth", msg, status);
  if (status === 402) return new AsrError("quota", msg, status);
  if (status === 429) return new AsrError("rate_limited", msg, status);
  if (code === "unsupported_language") return new AsrError("unsupported_language", msg, status);
  if (status === 400 || status === 413 || status === 415) return new AsrError("bad_audio", msg, status);
  if (status >= 500) return new AsrError("unavailable", msg, status);
  return new AsrError("rejected", msg, status);
}

export function createOpenAICompatTranscriber(o: OpenAICompatOptions): Transcriber {
  const doFetch = o.fetch ?? fetch;
  const sleep = o.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const now = o.now ?? Date.now;
  const url = `${o.baseUrl.replace(/\/+$/, "")}/audio/transcriptions`;
  const timeoutMs = o.timeoutMs ?? 15_000;
  const retries = o.retries ?? 1;
  const id = `${o.provider}:${o.model ?? o.language ?? "default"}`;

  async function once(wav: Uint8Array, key: string, signal?: AbortSignal): Promise<{ status: number; body: unknown }> {
    const form = new FormData();
    form.append("file", new Blob([wav.slice()], { type: "audio/wav" }), "utterance.wav");
    if (o.language) form.append("language", o.language);
    if (o.model) form.append("model", o.model);
    if (o.responseFormat) form.append("response_format", o.responseFormat);
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), timeoutMs);
    const onAbort = () => ctl.abort();
    signal?.addEventListener("abort", onAbort);
    try {
      const res = await doFetch(url, { method: "POST", headers: { authorization: `Bearer ${o.apiKey}`, "idempotency-key": key }, body: form, signal: ctl.signal });
      const text = await res.text();
      let body: unknown = null;
      try { body = text ? JSON.parse(text) : null; } catch { body = { text }; }
      return { status: res.status, body };
    } catch (e) {
      if (ctl.signal.aborted && !signal?.aborted) throw new AsrError("timeout", `no answer within ${timeoutMs} ms`);
      throw new AsrError("unavailable", (e as Error).message);
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
    }
  }

  return {
    id,
    async transcribe(wav: Uint8Array, opts: TranscribeOptions = {}): Promise<Transcript> {
      const key = (opts.requestId ?? `zc-asr-${now()}-${Math.random().toString(36).slice(2, 10)}`).slice(0, 160);
      const started = now();
      let last: AsrError | null = null;
      for (let attempt = 0; attempt <= retries; attempt++) {
        if (attempt > 0) await sleep(300 * attempt);
        try {
          const { status, body } = await once(wav, key, opts.signal);
          if (status >= 200 && status < 300) {
            const b = body as { text?: unknown; language?: unknown } | null;
            if (typeof b?.text !== "string") throw new AsrError("rejected", "response has no text field", status);
            const confidence = confidenceFrom(body);
            return {
              text: b.text, provider: id, latencyMs: now() - started,
              ...(confidence !== undefined ? { confidence } : {}),
              ...(typeof b.language === "string" ? { language: b.language } : {}),
            };
          }
          last = classify(status, body);
        } catch (e) {
          last = e instanceof AsrError ? e : new AsrError("unavailable", (e as Error).message);
        }
        if (!["unavailable", "rate_limited", "timeout"].includes(last.code)) break; // auth/quota/bad audio: retrying cannot help
      }
      throw last ?? new AsrError("unavailable", "unknown failure");
    },
  };
}
