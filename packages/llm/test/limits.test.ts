// Free-tier guards: sliding-window limiter with a bounded wait, 429 retry hints, circuit breaker, cancellation.
import { describe, it, expect } from "vitest";
import { withRateLimit, withRetry, withCircuitBreaker, cacheKey, ProviderBusyError, CancelledError } from "../src/wrappers";
import { openAIChat, ProviderError, type FetchLike } from "../src/openai";
import { chatFromEnv } from "../src/factory";
import { createUnderstander } from "../src/understand";
import { scriptedChat, use, HERO_INTENT } from "./fakes";
import type { ChatClient, CompleteRequest } from "../src/types";

const REQ: CompleteRequest = { system: "s", messages: [{ role: "user", content: [{ type: "text", text: "hi" }] }], tools: [], toolChoice: "auto", maxTokens: 10 };
const okRes = { content: [{ type: "text" as const, text: "ok" }], stop: "end" as const, usage: { input: 1, output: 1 } };
const counting = (fail?: () => unknown): ChatClient & { n: number } => {
  const c = { id: "x", n: 0, async complete() { c.n++; const e = fail?.(); if (e) throw e; return okRes; } };
  return c;
};
const clock = () => { const c = { t: 0, now: () => c.t, sleep: async (ms: number) => { c.t += ms; } }; return c; };

describe("withRateLimit: N request starts per rolling minute, bounded wait", () => {
  it("a burst fits the window; the next start waits until the oldest leaves it", async () => {
    const c = clock(); const starts: number[] = [];
    const inner: ChatClient = { id: "x", async complete() { starts.push(c.t); return okRes; } };
    const rl = withRateLimit(inner, { perMinute: 3, maxWaitMs: 60_000, now: c.now, sleep: c.sleep });
    for (let i = 0; i < 4; i++) await rl.complete(REQ);
    expect(starts).toEqual([0, 0, 0, 60_000]);
  });
  it("a slot further away than the max wait fails fast as busy, with no upstream request", async () => {
    const c = clock(); const inner = counting();
    const rl = withRateLimit(inner, { perMinute: 2, maxWaitMs: 20_000, now: c.now, sleep: c.sleep });
    await rl.complete(REQ); await rl.complete(REQ);
    await expect(rl.complete(REQ)).rejects.toBeInstanceOf(ProviderBusyError);
    expect(inner.n).toBe(2);
    expect(c.t).toBe(0); // it did not sit in a queue first
  });
  it("the request's own deadline bounds the wait too", async () => {
    const c = clock(); const inner = counting();
    const rl = withRateLimit(inner, { perMinute: 0, intervalMs: 5000, maxWaitMs: 60_000, now: c.now, sleep: c.sleep });
    await rl.complete(REQ);
    await expect(rl.complete({ ...REQ, deadline: 3000 })).rejects.toBeInstanceOf(ProviderBusyError);
    expect(inner.n).toBe(1);
  });
  it("a cancelled wait never fires upstream and frees its slot", async () => {
    const inner = counting();
    const rl = withRateLimit(inner, { perMinute: 1, windowMs: 200, maxWaitMs: 5000 });
    await rl.complete(REQ);
    const ctl = new AbortController();
    const p = rl.complete({ ...REQ, signal: ctl.signal });
    setTimeout(() => ctl.abort(), 10);
    await expect(p).rejects.toBeInstanceOf(CancelledError);
    expect(inner.n).toBe(1);
    await new Promise((r) => setTimeout(r, 220));
    await rl.complete(REQ); // the cancelled reservation did not push this one out
    expect(inner.n).toBe(2);
  });
  it("rejects invalid settings rather than silently disabling the guard", () => {
    expect(() => withRateLimit(counting(), { perMinute: -1, maxWaitMs: 1 })).toThrow();
    expect(() => withRateLimit(counting(), { perMinute: 1, maxWaitMs: -1 })).toThrow();
  });
});

describe("withRetry: honours the provider's retry hint within the turn's deadline", () => {
  it("waits Gemini's RetryInfo delay instead of the fixed backoff", async () => {
    let n = 0; const sleeps: number[] = [];
    const inner: ChatClient = { id: "x", async complete() { if (n++ === 0) throw new ProviderError("429", 429, { retryAfterMs: 3000 }); return okRes; } };
    await withRetry(inner, { sleep: async (ms) => void sleeps.push(ms) }).complete(REQ);
    expect(sleeps).toEqual([3000]);
  });
  it("reads a Retry-After header (seconds) on an SDK-style error", async () => {
    let n = 0; const sleeps: number[] = [];
    const inner: ChatClient = { id: "x", async complete() { if (n++ === 0) throw Object.assign(new Error("429"), { status: 429, headers: new Headers({ "retry-after": "2" }) }); return okRes; } };
    await withRetry(inner, { sleep: async (ms) => void sleeps.push(ms) }).complete(REQ);
    expect(sleeps).toEqual([2000]);
  });
  it("a hint longer than the time left fails fast as busy, no second request", async () => {
    const inner = counting(() => new ProviderError("429", 429, { retryAfterMs: 30_000 })); const sleeps: number[] = [];
    await expect(withRetry(inner, { maxDelayMs: 20_000, sleep: async (ms) => void sleeps.push(ms) }).complete(REQ)).rejects.toBeInstanceOf(ProviderBusyError);
    await expect(withRetry(inner, { now: () => 0, sleep: async (ms) => void sleeps.push(ms) }).complete({ ...REQ, deadline: 1000 })).rejects.toBeInstanceOf(ProviderBusyError);
    expect(inner.n).toBe(2);
    expect(sleeps).toEqual([]);
  });
  it("its own timeout (AbortError) is retried at most once", async () => {
    const inner = counting(() => new DOMException("aborted", "AbortError"));
    await expect(withRetry(inner, { retries: 3, sleep: async () => {} }).complete(REQ)).rejects.toMatchObject({ name: "AbortError" });
    expect(inner.n).toBe(2);
  });
  it("a caller cancel is never retried", async () => {
    const ctl = new AbortController(); ctl.abort();
    const inner = counting(() => new DOMException("aborted", "AbortError"));
    await expect(withRetry(inner, { retries: 3, sleep: async () => {} }).complete({ ...REQ, signal: ctl.signal })).rejects.toBeTruthy();
    expect(inner.n).toBe(1);
  });
  it("busy is never retried", async () => {
    const inner = counting(() => new ProviderBusyError("busy"));
    await expect(withRetry(inner, { retries: 3, sleep: async () => {} }).complete(REQ)).rejects.toBeInstanceOf(ProviderBusyError);
    expect(inner.n).toBe(1);
  });
});

describe("withCircuitBreaker: stop calling a provider that said no", () => {
  it("a daily-quota 429 opens it: busy at once, no upstream calls, until the delay passes", async () => {
    const c = clock(); let fail = true;
    const inner = counting(() => (fail ? new ProviderError("quota", 429, { daily: true, retryAfterMs: 40_000 }) : undefined));
    const br = withCircuitBreaker(inner, { now: c.now, dailyOpenMs: 60_000 });
    await expect(br.complete(REQ)).rejects.toBeInstanceOf(ProviderBusyError);
    await expect(br.complete(REQ)).rejects.toBeInstanceOf(ProviderBusyError);
    expect(inner.n).toBe(1);
    c.t += 60_001; fail = false;
    await expect(br.complete(REQ)).resolves.toBeTruthy();
    expect(inner.n).toBe(2);
  });
  it("repeated 429s open it for the hinted delay; a success resets the count", async () => {
    const c = clock(); const script = [429, 429, 0, 429, 429, 429];
    const inner = counting(() => { const s = script.shift(); return s ? new ProviderError("rpm", s, { retryAfterMs: 5000 }) : undefined; });
    const br = withCircuitBreaker(inner, { now: c.now, threshold: 3 });
    await expect(br.complete(REQ)).rejects.toBeInstanceOf(ProviderError);
    await expect(br.complete(REQ)).rejects.toBeInstanceOf(ProviderError);
    await br.complete(REQ); // reset
    await expect(br.complete(REQ)).rejects.toBeInstanceOf(ProviderError);
    await expect(br.complete(REQ)).rejects.toBeInstanceOf(ProviderError);
    await expect(br.complete(REQ)).rejects.toBeInstanceOf(ProviderBusyError); // third in a row
    await expect(br.complete(REQ)).rejects.toBeInstanceOf(ProviderBusyError);
    expect(inner.n).toBe(6);
    c.t += 5001;
    await br.complete(REQ);
    expect(inner.n).toBe(7);
  });
});

describe("OpenAI-format adapter: 429 details and cancellation", () => {
  const geminiFetch = (status: number, body: unknown, headers: Record<string, string> = {}) => {
    const calls: { init: any }[] = [];
    const fetchFn: FetchLike = async (_u, init) => { calls.push({ init }); return { ok: status < 400, status, headers: new Headers(headers), json: async () => body, text: async () => JSON.stringify(body) }; };
    return { calls, fetchFn };
  };
  const gemini = (f: FetchLike) => openAIChat({ baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai/", apiKey: "k", model: "g", label: "gemini", fetch: f });
  it("reads Gemini's RetryInfo and a per-day QuotaFailure from the error body", async () => {
    const body = [{ error: { code: 429, status: "RESOURCE_EXHAUSTED", message: "You exceeded your current quota.", details: [
      { "@type": "type.googleapis.com/google.rpc.QuotaFailure", violations: [{ quotaId: "GenerateRequestsPerDayPerProjectPerModel-FreeTier" }] },
      { "@type": "type.googleapis.com/google.rpc.RetryInfo", retryDelay: "17s" },
    ] } }];
    const e = (await gemini(geminiFetch(429, body).fetchFn).complete(REQ).catch((x) => x)) as ProviderError;
    expect(e).toBeInstanceOf(ProviderError);
    expect(e).toMatchObject({ status: 429, retryAfterMs: 17_000, daily: true });
    expect(e.message).toContain("You exceeded your current quota");
  });
  it("a per-minute 429 with a Retry-After header is not daily", async () => {
    const e = (await gemini(geminiFetch(429, { error: { message: "rpm" } }, { "retry-after": "4" }).fetchFn).complete(REQ).catch((x) => x)) as ProviderError;
    expect(e).toMatchObject({ status: 429, retryAfterMs: 4000, daily: false });
  });
  it("the caller's signal aborts the upstream request", async () => {
    const ctl = new AbortController();
    const hang: FetchLike = (_u, init) => new Promise((_r, rej) => init.signal?.addEventListener("abort", () => rej(new DOMException("aborted", "AbortError"))));
    const p = gemini(hang).complete({ ...REQ, signal: ctl.signal });
    ctl.abort();
    await expect(p).rejects.toBeInstanceOf(CancelledError);
  });
  it("tool calls made by another provider get Gemini's documented skip signature (else Gemini 3 answers 400)", async () => {
    const m = geminiFetch(200, { choices: [{ finish_reason: "stop", message: { content: "x" } }] });
    await gemini(m.fetchFn).complete({ ...REQ, messages: [...REQ.messages,
      { role: "assistant", content: [{ type: "tool_use", id: "a", name: "get_balance", input: {} }, { type: "tool_use", id: "b", name: "get_history", input: {} }] },
      { role: "user", content: [{ type: "tool_result", tool_use_id: "a", content: "{}" }, { type: "tool_result", tool_use_id: "b", content: "{}" }] }] });
    const calls = JSON.parse(m.calls[0]!.init.body).messages[2].tool_calls;
    expect(calls[0].extra_content).toEqual({ google: { thought_signature: "skip_thought_signature_validator" } });
    expect(calls[1]).not.toHaveProperty("extra_content");
  });
});

describe("request plumbing", () => {
  it("the cache key ignores the signal and the deadline", () => {
    expect(cacheKey("m", { ...REQ, signal: new AbortController().signal, deadline: 123 })).toBe(cacheKey("m", REQ));
  });
  it("chatFromEnv: LLM_REQUESTS_PER_MIN with LLM_MAX_WAIT_MS=0 answers busy instead of queueing", async () => {
    let n = 0;
    const f: FetchLike = async () => { n++; return { ok: true, status: 200, json: async () => ({ choices: [{ finish_reason: "stop", message: { content: "x" } }] }), text: async () => "" }; };
    const { chat, description } = chatFromEnv({ LLM_PROVIDER: "gemini", GEMINI_API_KEY: "k", GEMINI_MODEL: "g", LLM_REQUESTS_PER_MIN: "2", LLM_MAX_WAIT_MS: "0" }, { fetch: f });
    await chat.complete(REQ); await chat.complete(REQ);
    await expect(chat.complete(REQ)).rejects.toBeInstanceOf(ProviderBusyError);
    expect(n).toBe(2);
    expect(description.join("|")).toMatch(/2 requests per rolling minute/);
  });
  it("chatFromEnv: LLM_REQUEST_TIMEOUT_MS bounds one upstream request; a bad value is refused", async () => {
    let calls = 0;
    const hang: FetchLike = (_u, init) => { calls++; return new Promise((_, rej) => (init as { signal?: AbortSignal }).signal?.addEventListener("abort", () => rej(Object.assign(new Error("aborted"), { name: "AbortError" })))); };
    const { chat } = chatFromEnv({ LLM_PROVIDER: "gemini", GEMINI_API_KEY: "k", GEMINI_MODEL: "g", LLM_REQUEST_TIMEOUT_MS: "30", LLM_REQUESTS_PER_MIN: "0" }, { fetch: hang });
    await expect(chat.complete(REQ)).rejects.toThrow();
    expect(calls).toBe(2); // own timeout retried once, then given up
    expect(() => chatFromEnv({ LLM_PROVIDER: "gemini", GEMINI_API_KEY: "k", GEMINI_MODEL: "g", LLM_REQUEST_TIMEOUT_MS: "0" }, { fetch: hang })).toThrow(/LLM_REQUEST_TIMEOUT_MS/);
  });
  it("chatFromEnv: default limit is 14 per minute", () => {
    const { description } = chatFromEnv({ LLM_PROVIDER: "gemini", GEMINI_API_KEY: "k", GEMINI_MODEL: "g" }, { fetch: (async () => ({})) as never });
    expect(description.join("|")).toMatch(/14 requests per rolling minute/);
  });
  it("understander: deadlineMs puts one absolute deadline on every request of the turn; the signal travels too", async () => {
    const seen: CompleteRequest[] = [];
    const { chat } = scriptedChat([[use("get_balance", {})], [use("propose", HERO_INTENT)]]);
    const spy: ChatClient = { id: chat.id, complete: (r) => { seen.push(r); return chat.complete(r); } };
    const host = { searchContacts: async () => [], listBills: async () => [], getBalance: async () => ({ balance_iqd: 1 }), getHistory: async () => [], quote: async () => ({}) } as never;
    const ctl = new AbortController();
    await createUnderstander({ chat: spy, mode: "tools", host, deadlineMs: 30_000, now: () => 1000 }).understand({ text: "x", context: { billers: [] }, signal: ctl.signal });
    expect(seen.map((r) => r.deadline)).toEqual([31_000, 31_000]);
    expect(seen.every((r) => r.signal === ctl.signal)).toBe(true);
  });
  it("understander: no deadlineMs means no deadline field (cached fixtures stay valid)", async () => {
    const { chat, requests } = scriptedChat([[use("propose", HERO_INTENT)]]);
    await createUnderstander({ chat, mode: "workflow" }).understand({ text: "x", context: { billers: [] } });
    expect(requests[0]).not.toHaveProperty("deadline");
  });
});
