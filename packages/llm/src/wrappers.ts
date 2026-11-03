// Composable ChatClient wrappers: rate limit, circuit breaker, retry (429/5xx), token budget, fallback chain, response cache.
// Order used in production: cache( fallback([ budget(retry(breaker(limit(claude)))), budget(retry(breaker(limit(groq)))), ... ]) ).
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { weightedTokens, type ChatClient, type CompleteRequest, type CompleteResponse } from "./types";

/** The caller cancelled (its AbortSignal fired). Never retried. */
export class CancelledError extends Error { override readonly name = "CancelledError"; constructor(message = "request cancelled by the caller") { super(message); } }
/** No upstream slot in time, a retry hint past the deadline, or an open circuit: the honest "busy" (the orchestrator says so). */
export class ProviderBusyError extends Error {
  override readonly name = "ProviderBusyError";
  constructor(message: string, readonly retryAfterMs?: number, options?: { cause?: unknown }) { super(message, options); }
}

/** A sleep the caller's signal can cut short (rejects with CancelledError). */
export const sleep = (ms: number, signal?: AbortSignal) => new Promise<void>((res, rej) => {
  if (signal?.aborted) return rej(new CancelledError());
  const done = () => { signal?.removeEventListener("abort", stop); res(); };
  const stop = () => { clearTimeout(timer); rej(new CancelledError()); };
  const timer = setTimeout(done, ms);
  signal?.addEventListener("abort", stop, { once: true });
});

export class BudgetExceededError extends Error {}

type Nap = (ms: number, signal?: AbortSignal) => Promise<void>;
/** `p`, or CancelledError as soon as the signal fires. */
const cancellable = <T>(p: Promise<T>, signal?: AbortSignal): Promise<T> => !signal ? p : new Promise<T>((res, rej) => {
  const stop = () => rej(new CancelledError());
  if (signal.aborted) return stop();
  signal.addEventListener("abort", stop, { once: true });
  p.then(res, rej).finally(() => signal.removeEventListener("abort", stop));
});
export type RateLimitOptions = { perMinute: number; intervalMs?: number; maxWaitMs: number; windowMs?: number; now?: () => number; sleep?: Nap };

/** At most `perMinute` request starts (retries included) per rolling window, optionally `intervalMs` apart. A start that
 * cannot happen within `maxWaitMs` (or before the request's deadline) fails at once with ProviderBusyError: nothing queues
 * past what the turn can use, and an abandoned wait never fires. Process-local, not a cross-process quota guarantee. */
export function withRateLimit(inner: ChatClient, o: RateLimitOptions): ChatClient {
  const per = o.perMinute, gap = o.intervalMs ?? 0, win = o.windowMs ?? 60_000;
  if (!Number.isInteger(per) || per < 0) throw new Error("requests per minute must be a whole number >= 0");
  if (!Number.isFinite(gap) || gap < 0 || gap > 60000) throw new Error("request interval must be in 0..60000 ms");
  if (Number.isNaN(o.maxWaitMs) || o.maxWaitMs < 0) throw new Error("max wait must be >= 0 ms");
  const now = o.now ?? Date.now, nap = o.sleep ?? sleep;
  let starts: number[] = []; // reserved start times, ascending (some may be in the future)
  let gate: Promise<void> = Promise.resolve(); // waiters wake in reservation order
  const drop = (at: number) => { const i = starts.indexOf(at); if (i >= 0) starts.splice(i, 1); };
  return {
    id: inner.id,
    async complete(req) {
      if (req.signal?.aborted) throw new CancelledError();
      const t0 = now();
      starts = starts.filter((s) => s > t0 - Math.max(win, gap));
      let at = t0;
      const last = starts[starts.length - 1];
      if (gap > 0 && last !== undefined) at = Math.max(at, last + gap);
      if (per > 0 && starts.length >= per) at = Math.max(at, (starts[starts.length - per] as number) + win);
      const limit = Math.min(t0 + o.maxWaitMs, req.deadline ?? Infinity);
      if (at > limit) throw new ProviderBusyError(`${inner.id}: no request slot within ${Math.max(0, limit - t0)} ms (limit ${per || "-"}/min)`, at - t0);
      starts.push(at); starts.sort((a, b) => a - b);
      if (at > t0) {
        const wait = gate.then(() => nap(Math.max(0, at - now()), req.signal));
        gate = wait.catch(() => {});
        try { await cancellable(wait, req.signal); } catch (e) { drop(at); throw e; }
      }
      if (req.signal?.aborted) { drop(at); throw new CancelledError(); }
      return inner.complete(req);
    },
  };
}

/** Fixed spacing only, unbounded wait (the old LLM_REQUEST_INTERVAL_MS behaviour); chatFromEnv uses withRateLimit. */
export function withPacing(inner: ChatClient, o: { intervalMs: number; now?: () => number; sleep?: Nap }): ChatClient {
  return withRateLimit(inner, { perMinute: 0, intervalMs: o.intervalMs, maxWaitMs: Infinity, ...(o.now ? { now: o.now } : {}), ...(o.sleep ? { sleep: o.sleep } : {}) });
}

const statusOf = (e: unknown) => (e as { status?: number })?.status;
/** Our own request timeout: fetch's AbortError or the Anthropic SDK's timeout class. */
const isAbort = (e: unknown) => (e as { name?: string })?.name === "AbortError" || (e as object)?.constructor?.name === "APIConnectionTimeoutError";

/** Retry hint in ms: a ProviderError's parsed RetryInfo, a Retry-After header (SDK errors), or "retry in 17s" in the text. */
export function retryAfterMs(e: unknown): number | undefined {
  const err = e as { retryAfterMs?: unknown; headers?: unknown; message?: string };
  if (typeof err?.retryAfterMs === "number" && Number.isFinite(err.retryAfterMs) && err.retryAfterMs >= 0) return err.retryAfterMs;
  const h = err?.headers as { get?: (k: string) => string | null } | Record<string, string> | undefined;
  const raw = typeof (h as { get?: unknown })?.get === "function" ? (h as { get: (k: string) => string | null }).get("retry-after") : (h as Record<string, string> | undefined)?.["retry-after"];
  const fromHeader = parseRetryAfter(raw);
  if (fromHeader !== undefined) return fromHeader;
  const m = /retry (?:in|after) (\d+(?:\.\d+)?)\s*s/i.exec(err?.message ?? "");
  return m ? Math.ceil(Number(m[1]) * 1000) : undefined;
}
export function parseRetryAfter(v: string | null | undefined): number | undefined {
  if (!v) return undefined;
  if (/^\s*\d+(\.\d+)?\s*$/.test(v)) return Math.ceil(Number(v) * 1000);
  const at = Date.parse(v);
  return Number.isFinite(at) ? Math.max(0, at - Date.now()) : undefined;
}
const isDaily = (e: unknown) => (e as { daily?: unknown })?.daily === true || /PerDay|per day/i.test((e as Error)?.message ?? "");

const isRetryable = (e: unknown) => {
  const s = statusOf(e);
  // Network-level failures carry no HTTP status. The Anthropic SDK does not set `name` on them, so look at the class
  // (APIConnectionError / APIConnectionTimeoutError), the usual socket messages and the cause.
  const err = e as { name?: string; message?: string; constructor?: { name?: string }; cause?: unknown };
  const cls = err?.constructor?.name ?? "";
  return s === 429 || (typeof s === "number" && s >= 500) || err?.name === "AbortError" || /^APIConnection\w*Error$/.test(cls) || /^APIConnection\w*Error$/.test(err?.name ?? "")
    || (s === undefined && /connection error|ECONNRESET|ETIMEDOUT|EAI_AGAIN|fetch failed|socket hang up/i.test(`${err?.message ?? ""} ${String((err?.cause as Error | undefined)?.message ?? "")}`));
};

/** Retries 429/5xx/network. A 429 waits the provider's own hint; a wait past `maxDelayMs` or the request's deadline fails
 * fast as busy. Its own timeout is retried once at most; a caller cancel or busy never. */
export function withRetry(inner: ChatClient, o: { retries?: number; baseMs?: number; maxDelayMs?: number; now?: () => number; sleep?: Nap } = {}): ChatClient {
  const retries = o.retries ?? 2, base = o.baseMs ?? 400, maxDelay = o.maxDelayMs ?? 20_000, now = o.now ?? Date.now, nap = o.sleep ?? sleep;
  return {
    id: inner.id,
    async complete(req) {
      let timeouts = 0;
      for (let attempt = 0; ; attempt++) {
        try { const res = await inner.complete(req); return { ...res, attempts: attempt + (res.attempts ?? 1) }; }
        catch (e) {
          if (req.signal?.aborted || e instanceof CancelledError || e instanceof ProviderBusyError || e instanceof BudgetExceededError) throw e;
          if (isAbort(e) && ++timeouts > 1) throw e;
          if (attempt >= retries || !isRetryable(e)) throw e;
          const hint = statusOf(e) === 429 ? retryAfterMs(e) : undefined;
          const delay = hint ?? base * 2 ** attempt; // exponential backoff when the provider gives no hint (organiser guide)
          const room = Math.min(maxDelay, (req.deadline ?? Infinity) - now());
          if (delay > room) throw new ProviderBusyError(`${inner.id}: provider asks to wait ${delay} ms, only ${Math.max(0, room)} ms left`, delay, { cause: e });
          await nap(delay, req.signal);
        }
      }
    },
  };
}

/** After a daily-quota 429, or `threshold` 429s in a row, answer busy without calling upstream until the provider's
 * retry hint has passed (else `openMs`, `dailyOpenMs` for a daily quota). Any success closes the count. */
export function withCircuitBreaker(inner: ChatClient, o: { now?: () => number; threshold?: number; openMs?: number; dailyOpenMs?: number } = {}): ChatClient {
  const now = o.now ?? Date.now, threshold = o.threshold ?? 3, openMs = o.openMs ?? 30_000, dailyOpenMs = o.dailyOpenMs ?? 15 * 60_000;
  let openUntil = 0, streak = 0;
  return {
    id: inner.id,
    async complete(req) {
      const t = now();
      if (t < openUntil) throw new ProviderBusyError(`${inner.id}: paused after quota errors (${openUntil - t} ms left)`, openUntil - t);
      try { const res = await inner.complete(req); streak = 0; return res; }
      catch (e) {
        if (statusOf(e) !== 429) throw e;
        const daily = isDaily(e), hint = retryAfterMs(e);
        if (!daily && ++streak < threshold) throw e;
        const ms = daily ? Math.max(hint ?? 0, dailyOpenMs) : hint ?? openMs;
        openUntil = now() + ms; streak = 0;
        throw new ProviderBusyError(`${inner.id}: ${daily ? "daily quota reached" : "repeated 429s"}; paused ${ms} ms`, ms, { cause: e });
      }
    },
  };
}

/** Token budget per UTC day. Prices are not assumed: the cap is in tokens (set LLM_DAILY_TOKEN_CAP). */
export function withBudget(inner: ChatClient, o: { maxTokensPerDay: number; now?: () => number }): ChatClient {
  const now = o.now ?? Date.now;
  let day = -1, used = 0;
  return {
    id: inner.id,
    async complete(req) {
      const d = Math.floor(now() / 86_400_000);
      if (d !== day) { day = d; used = 0; }
      if (used >= o.maxTokensPerDay) throw new BudgetExceededError(`daily token budget of ${o.maxTokensPerDay} reached for ${inner.id}`);
      const res = await inner.complete(req);
      used += weightedTokens(res.usage);
      return res;
    },
  };
}

/** Try each provider in order; the first success wins. `via` names who answered. */
export function withFallback(chats: ChatClient[]): ChatClient {
  if (chats.length === 0) throw new Error("withFallback needs at least one ChatClient");
  return {
    id: chats.map((c) => c.id).join(" > "),
    async complete(req) {
      let last: unknown;
      for (const c of chats) {
        try {
          const res = await c.complete(req);
          return { ...res, via: res.via ?? c.id };
        } catch (e) { last = e; }
      }
      throw last;
    },
  };
}

export interface CacheStore { get(key: string): CompleteResponse | undefined; set(key: string, v: CompleteResponse): void }
export const memoryStore = (): CacheStore => { const m = new Map<string, CompleteResponse>(); return { get: (k) => m.get(k), set: (k, v) => void m.set(k, v) }; };
export function fileStore(dir: string): CacheStore {
  mkdirSync(dir, { recursive: true });
  return {
    get(k) { const f = join(dir, `${k}.json`); return existsSync(f) ? (JSON.parse(readFileSync(f, "utf8")) as CompleteResponse) : undefined; },
    set(k, v) { writeFileSync(join(dir, `${k}.json`), JSON.stringify(v)); },
  };
}

/** The signal and deadline are per-call plumbing, not part of what was asked. */
export const cacheKey = (id: string, req: CompleteRequest) => { const { signal: _s, deadline: _d, ...rest } = req; return createHash("sha256").update(JSON.stringify({ id, req: rest })).digest("hex"); };

/** Dev/eval replay: identical (model, request) is answered from disk and costs no tokens. A replay is not a fresh model sample. */
export function withCache(inner: ChatClient, store: CacheStore): ChatClient & { stats: { hits: number; misses: number } } {
  const stats = { hits: 0, misses: 0 };
  return {
    id: inner.id, stats,
    async complete(req) {
      const k = cacheKey(inner.id, req);
      const hit = store.get(k);
      if (hit) { stats.hits++; return { ...hit, usage: { input: 0, output: 0 }, attempts: 0 }; }
      stats.misses++;
      const res = await inner.complete(req);
      store.set(k, res);
      return res;
    },
  };
}
