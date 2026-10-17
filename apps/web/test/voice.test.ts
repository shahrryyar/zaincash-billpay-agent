import { describe, it, expect } from "vitest";
import { mkdtempSync, readFileSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AsrError, asrFromEnv, createFakeTranscriber, encodeWav } from "@zc/asr";
import type { Reply, TurnInput } from "@zc/orchestrator";
import { createVoiceHandler, type VoiceDeps } from "../server/voice";

const reply = (text: string): Reply => ({ session_id: "s", phase: "IDLE", messages: [{ kind: "info", text }], card: null, candidates: [], result: null, audit: [], trace: {}, readback: null });
function deps(over: Partial<VoiceDeps> = {}) {
  const turns: { sid: string; input: TurnInput }[] = [];
  const orch = { async turn(sid: string, input: TurnInput) { turns.push({ sid, input }); return reply("ok"); } };
  let n = 0;
  const d: VoiceDeps = { orch, asr: { ...asrFromEnv({ ASR_PROVIDER: "fake" }) }, demo: true, newId: () => `v${++n}`, log: () => {}, ...over };
  return { d, turns };
}
const wavOf = (seconds: number) => new Blob([encodeWav(new Float32Array(Math.round(16_000 * seconds)).fill(0.1)) as BlobPart], { type: "audio/wav" });
const form = (fields: Record<string, string | Blob>) => { const f = new FormData(); for (const [k, v] of Object.entries(fields)) f.append(k, v); return f; };

describe("voice route: audio -> checks -> ASR -> the same orchestrator turn as text", () => {
  it("voice off: 503 with an honest message, the orchestrator is never called", async () => {
    const { d, turns } = deps({ asr: asrFromEnv({}) });
    const r = await createVoiceHandler(d)(form({ session_id: "s", file: wavOf(1) }));
    expect(r).toMatchObject({ status: 503, error: "voice_off" });
    expect(turns).toHaveLength(0);
  });
  it("transcript goes to orch.turn with voice: true (and no invented confidence)", async () => {
    const asr = { ...asrFromEnv({ ASR_PROVIDER: "fake" }), transcriber: createFakeTranscriber([{ text: "ادفع المولدة" }]) };
    const { d, turns } = deps({ asr, demo: false });
    const r = await createVoiceHandler(d)(form({ session_id: "s1", file: wavOf(1.2) }));
    expect(r.status).toBe(200);
    expect(turns).toEqual([{ sid: "s1", input: { text: "ادفع المولدة", voice: true } }]);
  });
  it("passes the provider's confidence when it has one", async () => {
    const asr = { ...asrFromEnv({ ASR_PROVIDER: "fake" }), transcriber: createFakeTranscriber([{ text: "x", confidence: 0.91 }]) };
    const { d, turns } = deps({ asr });
    await createVoiceHandler(d)(form({ file: wavOf(1) }));
    expect(turns[0]?.input.asrConfidence).toBe(0.91);
  });
  it("ASR failure fails closed: 502, nothing reaches the orchestrator", async () => {
    const asr = { ...asrFromEnv({ ASR_PROVIDER: "fake" }), transcriber: createFakeTranscriber([new AsrError("unavailable", "down", 503)]) };
    const { d, turns } = deps({ asr });
    const r = await createVoiceHandler(d)(form({ file: wavOf(1) }));
    expect(r).toMatchObject({ status: 502, error: "asr_unavailable" });
    if (r.status !== 200) expect(r.message).toContain("ما انرسل شي");
    expect(turns).toHaveLength(0);
  });
  it("rejects non-WAV, too short and too long audio before paying for ASR", async () => {
    const fake = createFakeTranscriber([{ text: "never" }]);
    const { d, turns } = deps({ asr: { ...asrFromEnv({ ASR_PROVIDER: "fake", ASR_MAX_SECONDS: "5" }), transcriber: fake } });
    const h = createVoiceHandler(d);
    expect((await h(form({ file: new Blob(["webm bytes"]) }))).status).toBe(400);
    expect((await h(form({ file: wavOf(0.1) }))).status).toBe(400);
    expect((await h(form({ file: wavOf(5.5) }))).status).toBe(413);
    expect((await h(form({}))).status).toBe(400);
    expect(fake.calls).toBe(0);
    expect(turns).toHaveLength(0);
  });
  it("the simulator text is honoured only with the fake provider in demo mode", async () => {
    const { d, turns } = deps();
    await createVoiceHandler(d)(form({ file: wavOf(0.5), sim_text: "دز خمسين ألف لأحمد", sim_confidence: "0.6" }));
    expect(turns[0]?.input).toEqual({ text: "دز خمسين ألف لأحمد", voice: true, asrConfidence: 0.6 });
    const real = createFakeTranscriber([{ text: "what the provider heard" }]);
    const off = deps({ demo: false, asr: { ...asrFromEnv({ ASR_PROVIDER: "fake" }), transcriber: real } });
    await createVoiceHandler(off.d)(form({ file: wavOf(0.5), sim_text: "injected" }));
    expect(off.turns[0]?.input.text).toBe("what the provider heard");
  });
  it("capture mode keeps the WAV and a jsonl row (reference left empty for a human to fill)", async () => {
    const dir = mkdtempSync(join(tmpdir(), "zc-voice-"));
    const { d } = deps({ captureDir: dir });
    await createVoiceHandler(d)(form({ file: wavOf(0.5), sim_text: "ادفع الماي" }));
    expect(readdirSync(dir).sort()).toEqual(["captures.jsonl", "v1.wav"]);
    expect(JSON.parse(readFileSync(join(dir, "captures.jsonl"), "utf8"))).toMatchObject({ id: "v1", hypothesis: "ادفع الماي", reference: null, provider: "fake" });
  });
});
