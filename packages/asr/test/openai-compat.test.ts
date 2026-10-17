import { describe, it, expect } from "vitest";
import { AsrError, confidenceFrom, createOpenAICompatTranscriber, encodeWav } from "../src/index";

type Call = { url: string; headers: Record<string, string>; form: FormData };
function fakeFetch(responses: (Response | Error)[]) {
  const calls: Call[] = [];
  const f = (async (url: string, init: RequestInit) => {
    calls.push({ url, headers: init.headers as Record<string, string>, form: init.body as FormData });
    const r = responses.shift();
    if (!r) throw new Error("no response scripted");
    if (r instanceof Error) throw r;
    return r;
  }) as unknown as typeof fetch;
  return { f, calls };
}
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const wav = encodeWav(new Float32Array(1600));
const mk = (f: typeof fetch, extra = {}) =>
  createOpenAICompatTranscriber({ baseUrl: "https://api.regalabs.dev/v1/", apiKey: "rega_live_test", provider: "regalabs", language: "acm", fetch: f, sleep: async () => {}, ...extra });

describe("OpenAI-compatible transcriber (RegaLabs developer API shape)", () => {
  it("posts multipart WAV + language with the bearer key and an idempotency key", async () => {
    const { f, calls } = fakeFetch([json(200, { text: "دز خمسين ألف لأحمد" })]);
    const t = await mk(f).transcribe(wav, { requestId: "req-1" });
    expect(t).toMatchObject({ text: "دز خمسين ألف لأحمد", provider: "regalabs:acm" });
    expect(t.confidence).toBeUndefined(); // RegaLabs returns { text } only: never invent a confidence
    expect(calls[0]?.url).toBe("https://api.regalabs.dev/v1/audio/transcriptions");
    expect(calls[0]?.headers.authorization).toBe("Bearer rega_live_test");
    expect(calls[0]?.headers["idempotency-key"]).toBe("req-1");
    expect(calls[0]?.form.get("language")).toBe("acm");
    const file = calls[0]?.form.get("file") as File;
    expect(file.type).toBe("audio/wav");
    expect(new Uint8Array(await file.arrayBuffer())).toEqual(wav);
  });
  it("retries a 503 with the SAME idempotency key (no double billing), then succeeds", async () => {
    const { f, calls } = fakeFetch([json(503, { error: { message: "engine", type: "api_error", code: "engine_unavailable" } }), json(200, { text: "ادفع المولدة" })]);
    expect((await mk(f).transcribe(wav, { requestId: "k" })).text).toBe("ادفع المولدة");
    expect(calls.map((c) => c.headers["idempotency-key"])).toEqual(["k", "k"]);
  });
  it.each([
    [401, "invalid_api_key", "auth"],
    [402, "insufficient_quota", "quota"],
    [400, "unsupported_language", "unsupported_language"],
    [400, "unsupported_format", "bad_audio"],
    [413, "file_too_large", "bad_audio"],
  ])("HTTP %s %s -> %s, no retry", async (status, code, expected) => {
    const { f, calls } = fakeFetch([json(status, { error: { message: "m", type: "x", code } }), json(200, { text: "should not be used" })]);
    const err = await mk(f).transcribe(wav).catch((e) => e);
    expect(err).toBeInstanceOf(AsrError);
    expect(err.code).toBe(expected);
    expect(calls).toHaveLength(1);
  });
  it("network failure on every attempt: unavailable", async () => {
    const { f, calls } = fakeFetch([new Error("ECONNREFUSED"), new Error("ECONNREFUSED")]);
    await expect(mk(f).transcribe(wav)).rejects.toMatchObject({ code: "unavailable" });
    expect(calls).toHaveLength(2);
  });
  it("a 200 without a text field is rejected, not treated as silence", async () => {
    const { f } = fakeFetch([json(200, { transcript_missing: true })]);
    await expect(mk(f).transcribe(wav)).rejects.toMatchObject({ code: "rejected" });
  });
  it("times out", async () => {
    const hang = (async (_u: string, init: RequestInit) => new Promise((_r, rej) => init.signal?.addEventListener("abort", () => rej(new Error("aborted"))))) as unknown as typeof fetch;
    await expect(mk(hang, { timeoutMs: 20, retries: 0 }).transcribe(wav)).rejects.toMatchObject({ code: "timeout" });
  });
  it("sends model and response_format when configured (Whisper baseline)", async () => {
    const { f, calls } = fakeFetch([json(200, { text: "x", segments: [{ avg_logprob: -0.1 }] })]);
    const t = await mk(f, { model: "whisper-large-v3", responseFormat: "verbose_json" }).transcribe(wav);
    expect(calls[0]?.form.get("model")).toBe("whisper-large-v3");
    expect(calls[0]?.form.get("response_format")).toBe("verbose_json");
    expect(t.confidence).toBeCloseTo(Math.exp(-0.1));
  });
});

describe("confidenceFrom", () => {
  it("uses an explicit 0..1 confidence", () => expect(confidenceFrom({ confidence: 0.7 })).toBe(0.7));
  it("ignores an out-of-range confidence", () => expect(confidenceFrom({ confidence: 70 })).toBeUndefined());
  it("derives from mean avg_logprob", () => expect(confidenceFrom({ segments: [{ avg_logprob: -1 }, { avg_logprob: 0 }] })).toBeCloseTo(Math.exp(-0.5)));
  it("nothing given -> undefined", () => expect(confidenceFrom({ text: "x" })).toBeUndefined());
});
