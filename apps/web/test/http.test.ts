import { describe, it, expect } from "vitest";
import { BodyError, clientIp, readForm, readJson } from "../server/http";

const streamOf = (chunks: number, size: number) => new ReadableStream<Uint8Array>({
  start(c) { for (let i = 0; i < chunks; i++) c.enqueue(new Uint8Array(size).fill(32)); c.close(); },
});
const post = (body: BodyInit, headers: Record<string, string> = {}) => new Request("http://x/api", { method: "POST", body, headers, duplex: "half" } as RequestInit);

describe("request bodies are size-checked before they are buffered", () => {
  it("a declared Content-Length over the cap is refused with 413 without reading the body", async () => {
    let reads = 0;
    const body = new ReadableStream<Uint8Array>({ pull(c) { if (++reads > 1000) c.close(); else c.enqueue(new Uint8Array(10)); } }, { highWaterMark: 0 });
    const e = await readJson(post(body, { "content-length": "999999", "content-type": "application/json" }), 1000).catch((x) => x);
    expect(e).toBeInstanceOf(BodyError);
    expect(e.status).toBe(413);
    expect(e.message).toContain("999999"); // refused on the header
    expect(reads).toBe(0);
  });
  it("no Content-Length (chunked): reading stops at the cap", async () => {
    const e = await readJson(post(streamOf(100, 1000)), 4000).catch((x) => x);
    expect(e).toMatchObject({ status: 413 });
  });
  it("a small JSON body parses; broken JSON is a 400, not a crash", async () => {
    expect(await readJson(post(JSON.stringify({ text: "hi" })), 1000)).toEqual({ text: "hi" });
    await expect(readJson(post("{oops"), 1000)).rejects.toMatchObject({ status: 400 });
    await expect(readJson(post("[1]"), 1000)).rejects.toMatchObject({ status: 400 });
  });
  it("multipart: refused over the cap, parsed under it", async () => {
    const f = new FormData(); f.append("session_id", "s1"); f.append("file", new Blob([new Uint8Array(5000)]), "a.wav");
    const r = new Request("http://x", { method: "POST", body: f });
    const big = await readForm(r.clone(), 1000).catch((x) => x);
    expect(big).toMatchObject({ status: 413 });
    const ok = await readForm(r, 100_000);
    expect(ok.get("session_id")).toBe("s1");
  });
});

describe("client IP for the per-IP limit", () => {
  it("first X-Forwarded-For hop, trimmed; a constant when absent", () => {
    expect(clientIp(new Request("http://x", { headers: { "x-forwarded-for": " 203.0.113.7 , 10.0.0.1" } }))).toBe("203.0.113.7");
    expect(clientIp(new Request("http://x"))).toBe("unknown");
    expect(clientIp(new Request("http://x", { headers: { "x-forwarded-for": "x".repeat(500) } })).length).toBeLessThanOrEqual(64);
  });
});
