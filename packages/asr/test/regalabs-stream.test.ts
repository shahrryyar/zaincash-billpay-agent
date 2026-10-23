import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createRegalabsStreamTranscriber, type AsrStreamSocket } from "../src/regalabs-stream";
import { encodeWav } from "../src/wav";

class Socket {
  readyState = 0;
  onopen: WebSocket["onopen"] = null;
  onmessage: WebSocket["onmessage"] = null;
  onerror: WebSocket["onerror"] = null;
  onclose: WebSocket["onclose"] = null;
  sent: (string | ArrayBuffer)[] = [];
  close = vi.fn(() => { this.readyState = 3; });
  send(data: string | ArrayBuffer) { this.sent.push(data); }
  open() { this.readyState = 1; this.onopen?.call(this as unknown as WebSocket, new Event("open")); }
  message(data: unknown) { this.onmessage?.call(this as unknown as WebSocket, new MessageEvent("message", { data: JSON.stringify(data) })); }
  disconnected(code = 1000) { this.readyState = 3; this.onclose?.call(this as unknown as WebSocket, { code } as CloseEvent); }
}
const wav = () => encodeWav(new Float32Array(1600).fill(0.1)); // 100 ms, two 50 ms frames
const final = (text = "دز خمسين ألف لأحمد", utterance = 1) => ({ type: "final", utterance, text, language: "ar", reason: "end", start_ms: 0, end_ms: 100, dropped_ms: 0 });
function setup(extra = {}) {
  const socket = new Socket();
  const connect = vi.fn((_url: string) => socket as unknown as AsrStreamSocket);
  const client = createRegalabsStreamTranscriber({ url: "wss://api.regalabs.dev/v1/audio/transcriptions/stream", apiKey: "rega_live_test_secret", createSocket: connect, timeoutMs: 1000, ...extra });
  return { socket, connect, client };
}
async function ready(s: Socket) { s.open(); s.message({ type: "ready" }); await vi.advanceTimersByTimeAsync(100); }

describe("dedicated RegaLabs streaming ASR, server-side adapter", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("authenticates before audio, sends 16 kHz PCM frames and end, waits for done and ignores partials", async () => {
    const { socket, client, connect } = setup();
    let settled = false;
    const result = client.transcribe(wav()).then((v) => { settled = true; return v; });
    socket.open();
    expect(socket.sent).toEqual([JSON.stringify({ type: "auth", token: "rega_live_test_secret" })]);
    socket.message({ type: "ready" });
    await vi.advanceTimersByTimeAsync(100);
    const controls = socket.sent.filter((v): v is string => typeof v === "string").map((v) => JSON.parse(v));
    expect(controls).toEqual([{ type: "auth", token: "rega_live_test_secret" }, { type: "configure", language: "auto", sample_rate: 16000 }, { type: "end" }]);
    const frames = socket.sent.filter((v): v is ArrayBuffer => typeof v !== "string");
    expect(frames.map((v) => v.byteLength)).toEqual([1600, 1600]);
    expect(new Uint8Array(frames[0]!)).toEqual(wav().subarray(44, 1644));
    expect(connect.mock.calls[0]?.[0]).not.toContain("rega_live_test_secret");
    socket.message({ type: "partial", utterance: 1, text: "different unsafe partial" });
    socket.message(final()); await Promise.resolve(); expect(settled).toBe(false);
    socket.message({ type: "done", audio_ms: 100, credits: 1 });
    expect(await result).toMatchObject({ text: "دز خمسين ألف لأحمد", provider: "regalabs-stream:auto", language: "ar" });
    expect((await result).confidence).toBeUndefined();
    expect(socket.close).toHaveBeenCalledTimes(1);
  });

  it("joins complete ordered final utterances, including an empty trailing final", async () => {
    const { socket, client } = setup({ language: "ckb" });
    const result = client.transcribe(wav()); await ready(socket);
    socket.message(final("پەنجا هەزار", 1)); socket.message(final("بنێرە بۆ ئاراس", 2));
    socket.message({ ...final("", 3), reason: "empty" }); socket.message({ type: "done" });
    expect((await result).text).toBe("پەنجا هەزار بنێرە بۆ ئاراس");
  });

  it.each(["capacity", "overloaded", "error"])("rejects %s finals even after a usable partial", async (reason) => {
    const { socket, client } = setup(); const result = client.transcribe(wav());
    const rejected = expect(result).rejects.toMatchObject({ code: "unavailable" }); await ready(socket);
    socket.message({ type: "partial", text: "pay" }); socket.message({ ...final(), reason }); await rejected;
  });

  it.each([
    { ...final(), dropped_ms: 20 },
    { ...final(), utterance: 2 },
    { ...final(), text: 100 },
    { ...final(), reason: "unknown" },
    { ...final(), end_ms: -1 },
  ])("rejects malformed, missing or dropped final audio %#", async (event) => {
    const { socket, client } = setup(); const result = client.transcribe(wav());
    const rejected = expect(result).rejects.toMatchObject({ code: "rejected" }); await ready(socket); socket.message(event); await rejected;
  });

  it("rejects duplicate final events instead of duplicating the user's command", async () => {
    const { socket, client } = setup(); const result = client.transcribe(wav());
    const rejected = expect(result).rejects.toMatchObject({ code: "rejected" }); await ready(socket);
    socket.message(final()); socket.message(final()); await rejected;
  });

  it("never accepts a partial or final if the stream closes before done", async () => {
    const { socket, client } = setup(); const result = client.transcribe(wav());
    const rejected = expect(result).rejects.toMatchObject({ code: "unavailable" }); await ready(socket);
    socket.message(final()); socket.disconnected(); await rejected;
  });

  it("done cannot promote a partial into a transcript", async () => {
    const { socket, client } = setup(); const result = client.transcribe(wav());
    const rejected = expect(result).rejects.toMatchObject({ code: "rejected" }); await ready(socket);
    socket.message({ type: "partial", utterance: 1, text: "دز مليون لأحمد" }); socket.message({ type: "done" }); await rejected;
  });

  it("a premature done rejects rather than accepting only the first frame", async () => {
    const { socket, client } = setup(); const result = client.transcribe(wav());
    const rejected = expect(result).rejects.toMatchObject({ code: "rejected" }); socket.open(); socket.message({ type: "ready" });
    socket.message(final()); socket.message({ type: "done" }); await rejected;
  });

  it("an empty complete final returns silence for the existing voice gate to reject", async () => {
    const { socket, client } = setup(); const result = client.transcribe(wav()); await ready(socket);
    socket.message(final("")); socket.message({ type: "done" }); expect((await result).text).toBe("");
  });

  it.each([["invalid_api_key", "auth"], ["insufficient_quota", "quota"], ["asr_busy", "unavailable"], ["asr_unavailable", "unavailable"], ["rate_limit_exceeded", "rate_limited"]])("classifies %s and never retries a charged stream", async (error, code) => {
    const { socket, client, connect } = setup(); const result = client.transcribe(wav());
    const rejected = expect(result).rejects.toMatchObject({ code }); socket.open(); socket.message({ type: "error", error, message: "upstream error" }); await rejected;
    expect(connect).toHaveBeenCalledTimes(1);
  });

  it("fails closed on invalid JSON", async () => {
    const { socket, client } = setup(); const result = client.transcribe(wav());
    const rejected = expect(result).rejects.toMatchObject({ code: "rejected" }); socket.open();
    socket.onmessage?.call(socket as unknown as WebSocket, new MessageEvent("message", { data: "bad json" })); await rejected;
  });

  it("diagnoses upstream machine codes without echoing provider messages or key-shaped values", async () => {
    const { socket, client } = setup(); const result = client.transcribe(wav());
    const rejected = expect(result).rejects.toMatchObject({ code: "unavailable", message: "Streaming ASR unavailable" });
    socket.open(); socket.message({ type: "error", error: "rega_live_secret", message: "rega_live_secret" }); await rejected;
  });

  it("times out and cleans up the stream", async () => {
    const { socket, client } = setup(); const result = client.transcribe(wav());
    const rejected = expect(result).rejects.toMatchObject({ code: "timeout" }); await vi.advanceTimersByTimeAsync(1200); await rejected;
    expect(socket.close).toHaveBeenCalledTimes(1);
  });

  it("aborting stops audio and never reconnects", async () => {
    const { socket, client, connect } = setup(); const abort = new AbortController();
    const result = client.transcribe(wav(), { signal: abort.signal }); const rejected = expect(result).rejects.toMatchObject({ code: "unavailable" });
    socket.open(); socket.message({ type: "ready" }); abort.abort(); const sent = socket.sent.length;
    await vi.advanceTimersByTimeAsync(300); await rejected;
    expect(socket.sent).toHaveLength(sent); expect(connect).toHaveBeenCalledTimes(1);
  });

  it("already-aborted requests open no socket", async () => {
    const { client, connect } = setup(); const abort = new AbortController(); abort.abort();
    await expect(client.transcribe(wav(), { signal: abort.signal })).rejects.toMatchObject({ code: "unavailable" }); expect(connect).not.toHaveBeenCalled();
  });

  it.each([new Uint8Array([1, 2]), encodeWav(new Float32Array(100), 8000), wav().subarray(0, 80)])("rejects invalid format before connecting %#", async (audio) => {
    const { client, connect } = setup(); await expect(client.transcribe(audio)).rejects.toMatchObject({ code: "bad_audio" }); expect(connect).not.toHaveBeenCalled();
  });

  it("rejects an insecure socket URL before connecting", async () => {
    const { client, connect } = setup({ url: "ws://public.example/stream" });
    await expect(client.transcribe(wav())).rejects.toMatchObject({ code: "rejected" }); expect(connect).not.toHaveBeenCalled();
  });
});
