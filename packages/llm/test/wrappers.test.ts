import { describe, it, expect } from "vitest";
import { withBudget, withCache, withFallback, withRetry, memoryStore, fileStore, cacheKey, BudgetExceededError } from "../src/wrappers";
import { ProviderError } from "../src/openai";
import type { ChatClient, CompleteRequest } from "../src/types";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const REQ: CompleteRequest = { system: "s", messages: [{ role: "user", content: [{ type: "text", text: "hi" }] }], tools: [], toolChoice: "auto", maxTokens: 10 };
const ok = (id: string, tokens = 10): ChatClient & { n: number } => {
  const c = { id, n: 0, async complete() { c.n++; return { content: [{ type: "text" as const, text: id }], stop: "end" as const, usage: { input: tokens, output: 0 } }; } };
  return c;
};
const failing = (id: string, status: number): ChatClient & { n: number } => {
  const c = { id, n: 0, async complete(): Promise<never> { c.n++; throw new ProviderError("boom", status); } };
  return c;
};
const noSleep = async () => {};

describe("withRetry: exponential backoff on 429/5xx only", () => {
  it("retries a 429 then succeeds", async () => {
    let n = 0;
    const inner: ChatClient = { id: "x", async complete() { if (n++ < 2) throw new ProviderError("429", 429); return ok("x").complete(REQ); } };
    const sleeps: number[] = [];
    const r = await withRetry(inner, { retries: 2, baseMs: 100, sleep: async (ms) => void sleeps.push(ms) }).complete(REQ);
    expect(r.content[0]).toMatchObject({ text: "x" });
    expect(sleeps).toEqual([100, 200]);
  });
  it("gives up after the retry limit", async () => {
    const f = failing("x", 503);
    await expect(withRetry(f, { retries: 2, sleep: noSleep }).complete(REQ)).rejects.toMatchObject({ status: 503 });
    expect(f.n).toBe(3);
  });
  it("retries a network-level connection error (no HTTP status)", async () => {
    let n = 0;
    const flaky: ChatClient = { id: "x", async complete() { n++; if (n < 3) { class APIConnectionError extends Error {} // like the SDK's: the class name is the only marker, `name` stays "Error"
      throw new APIConnectionError("Connection error."); } return { content: [], stop: "end", usage: { input: 1, output: 1 } }; } };
    await withRetry(flaky, { retries: 2, sleep: noSleep }).complete(REQ);
    expect(n).toBe(3);
  });
  it("retries a plain socket reset message too", async () => {
    let n = 0;
    const flaky: ChatClient = { id: "x", async complete() { n++; if (n < 2) throw new Error("fetch failed: read ECONNRESET"); return { content: [], stop: "end", usage: { input: 1, output: 1 } }; } };
    await withRetry(flaky, { retries: 2, sleep: noSleep }).complete(REQ);
    expect(n).toBe(2);
  });
  it("does not retry a 400 (a bug, not a limit)", async () => {
    const f = failing("x", 400);
    await expect(withRetry(f, { sleep: noSleep }).complete(REQ)).rejects.toMatchObject({ status: 400 });
    expect(f.n).toBe(1);
  });
});

describe("withBudget: daily token cap", () => {
  it("blocks once the cap is reached and resets the next UTC day", async () => {
    let t = Date.UTC(2026, 9, 15, 12);
    const inner = ok("m", 60);
    const b = withBudget(inner, { maxTokensPerDay: 100, now: () => t });
    await b.complete(REQ); // 60
    await b.complete(REQ); // 120 (the call that crosses the cap still completes)
    await expect(b.complete(REQ)).rejects.toBeInstanceOf(BudgetExceededError);
    expect(inner.n).toBe(2);
    t += 86_400_000;
    await expect(b.complete(REQ)).resolves.toBeTruthy();
  });
});

describe("withFallback: Claude first, free providers after", () => {
  it("uses the first provider when it works", async () => {
    const a = ok("claude"), b = ok("groq");
    const r = await withFallback([a, b]).complete(REQ);
    expect(r.via).toBe("claude");
    expect(b.n).toBe(0);
  });
  it("falls through on failure and reports who answered", async () => {
    const a = failing("claude", 529), b = failing("groq", 429), c = ok("gemini");
    const r = await withFallback([a, b, c]).complete(REQ);
    expect(r.via).toBe("gemini");
    expect([a.n, b.n, c.n]).toEqual([1, 1, 1]);
  });
  it("throws the last error when everyone fails", async () => {
    await expect(withFallback([failing("a", 500), failing("b", 429)]).complete(REQ)).rejects.toMatchObject({ status: 429 });
  });
  it("a budget error on the primary falls through to the next provider", async () => {
    const capped = withBudget(ok("claude", 100), { maxTokensPerDay: 50 });
    await capped.complete(REQ);
    const r = await withFallback([capped, ok("groq")]).complete(REQ);
    expect(r.via).toBe("groq");
  });
  it("needs at least one provider", () => expect(() => withFallback([])).toThrow());
});

describe("withCache: identical requests cost nothing", () => {
  it("serves the second identical request from the cache with zero usage", async () => {
    const inner = ok("m", 50);
    const c = withCache(inner, memoryStore());
    const a = await c.complete(REQ);
    const b = await c.complete(REQ);
    expect(inner.n).toBe(1);
    expect(c.stats).toEqual({ hits: 1, misses: 1 });
    expect(b.content).toEqual(a.content);
    expect(b.usage).toEqual({ input: 0, output: 0 });
  });
  it("a different request or a different model is a different key", async () => {
    const inner = ok("m");
    const c = withCache(inner, memoryStore());
    await c.complete(REQ);
    await c.complete({ ...REQ, system: "other" });
    expect(inner.n).toBe(2);
    expect(cacheKey("a", REQ)).not.toBe(cacheKey("b", REQ));
  });
  it("persists on disk across instances", async () => {
    const dir = mkdtempSync(join(tmpdir(), "zc-llm-"));
    try {
      const one = ok("m");
      await withCache(one, fileStore(dir)).complete(REQ);
      const two = ok("m");
      await withCache(two, fileStore(dir)).complete(REQ);
      expect(one.n + two.n).toBe(1);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
  it("does not cache failures", async () => {
    let n = 0;
    const inner: ChatClient = { id: "m", async complete() { if (n++ === 0) throw new Error("x"); return ok("m").complete(REQ); } };
    const c = withCache(inner, memoryStore());
    await expect(c.complete(REQ)).rejects.toThrow();
    await expect(c.complete(REQ)).resolves.toBeTruthy();
  });
});
