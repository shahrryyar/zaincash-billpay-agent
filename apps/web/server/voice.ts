// The voice route's logic (docs/09), kept out of the Next route so it is unit-tested.
// Audio in -> checks -> ASR -> the SAME orchestrator turn as typed text (voice: true). Voice has no execution logic
// of its own, and every failure here ends with nothing sent and an honest message.
import { appendFileSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { t, type CopyKey } from "@zc/core";
import { AsrError, inspectWav, type AsrConfig, type Transcript } from "@zc/asr";
import type { Reply, TurnInput } from "@zc/orchestrator";

export type VoiceDeps = {
  orch: { turn(sessionId: string, input: TurnInput): Promise<Reply> };
  asr: AsrConfig;
  /** The demo simulator (typed text posing as a transcript) works only with the fake provider in DEMO_MODE. */
  demo: boolean;
  /** Optional: keep each utterance (WAV + transcript) to build the voice eval set. Synthetic, consented speech only. */
  captureDir?: string | undefined;
  newId: () => string;
  log?: (msg: string) => void;
};

export type VoiceResult =
  | { status: 200; reply: Reply; transcript: { text: string; confidence: number | null; provider: string; latency_ms: number } }
  | { status: 400 | 413 | 502 | 503; error: string; message: string };

const MIN_SECONDS = 0.3;
const fail = (status: 400 | 413 | 502 | 503, error: string, key: CopyKey): VoiceResult => ({ status, error, message: t(key) });

export function createVoiceHandler(d: VoiceDeps) {
  const log = d.log ?? ((m: string) => console.error(m));
  const maxBytes = (d.asr.maxSeconds + 1) * 32_000 + 4_096; // 16 kHz mono PCM16 + header slack

  return async function handle(form: FormData): Promise<VoiceResult> {
    if (!d.asr.transcriber) return fail(503, "voice_off", "voice_off");
    const sid = String(form.get("session_id") ?? "web").slice(0, 80);
    const file = form.get("file");
    if (!(file instanceof Blob)) return fail(400, "no_audio", "asr_low");
    if (file.size > maxBytes) return fail(413, "too_long", "asr_too_long");
    const wav = new Uint8Array(await file.arrayBuffer());
    const info = inspectWav(wav);
    if (!info.ok) return fail(400, info.error, "asr_low");
    if (info.durationS > d.asr.maxSeconds) return fail(413, "too_long", "asr_too_long");
    if (info.durationS < MIN_SECONDS) return fail(400, "too_short", "asr_low");

    const simText = form.get("sim_text");
    const simConf = Number(form.get("sim_confidence"));
    const hint = d.asr.provider === "fake" && d.demo && typeof simText === "string"
      ? { text: simText.slice(0, 400), ...(Number.isFinite(simConf) && String(form.get("sim_confidence") ?? "") !== "" ? { confidence: simConf } : {}) }
      : undefined;

    const id = d.newId();
    let heard: Transcript;
    try {
      heard = await d.asr.transcriber.transcribe(wav, { requestId: `zc-${id}`, ...(hint ? { hint } : {}) });
    } catch (e) {
      const code = e instanceof AsrError ? e.code : "unavailable";
      log(`[voice] asr failed: ${code}${e instanceof AsrError && e.status ? ` HTTP ${e.status}` : ""}: ${(e as Error).message}`);
      return fail(502, `asr_${code}`, "asr_unavailable");
    }

    if (d.captureDir) {
      try {
        mkdirSync(d.captureDir, { recursive: true });
        const name = `${id}.wav`;
        writeFileSync(join(d.captureDir, name), wav);
        appendFileSync(join(d.captureDir, "captures.jsonl"), JSON.stringify({ id, file: name, hypothesis: heard.text, confidence: heard.confidence ?? null, provider: heard.provider, latency_ms: heard.latencyMs, duration_s: Number(info.durationS.toFixed(2)), ts: new Date().toISOString(), reference: null }) + "\n");
      } catch (e) { log(`[voice] capture failed: ${(e as Error).message}`); }
    }

    const reply = await d.orch.turn(sid, { text: heard.text, voice: true, ...(heard.confidence !== undefined ? { asrConfidence: heard.confidence } : {}) });
    return { status: 200, reply, transcript: { text: heard.text, confidence: heard.confidence ?? null, provider: heard.provider, latency_ms: heard.latencyMs } };
  };
}
