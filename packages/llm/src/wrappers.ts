// Composable ChatClient wrappers: retry (429/5xx), token budget, fallback chain, response cache.
// Order used in production: cache( fallback([ budget(retry(claude)), budget(retry(groq)), ... ]) ).
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { weightedTokens, type ChatClient, type CompleteRequest, type CompleteResponse } from "./types";

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export class BudgetExceededError extends Error {}

/** Space provider request starts, including retries. Process-local, not a cross-process quota guarantee. */
export function withPacing(inner: ChatClient, o: { intervalMs: number; now?: () => number; sleep?: (ms: number) => Promise<void> }): ChatClient {
  if (!Number.isFinite(o.intervalMs) || o.intervalMs < 0 || o.intervalMs > 60000) throw new Error("request interval must be in 0..60000 ms");
  const now = o.now ?? Date.now, nap = o.sleep ?? sleep;
  let gate = Promise.resolve(), nextAt = 0;
  return {
    id: inner.id,
    async complete(req) {
      const slot = gate.then(async () => {
        const delay = nextAt - now();
        if (delay > 0) await nap(delay);
        nextAt = now() + o.intervalMs;
      });
      gate = slot.catch(() => {});
      await slot;
      return inner.complete(req);
    },
  };
}

const isRetryable = (e: unknown) => {
  const s = (e as { status?: number })?.status;
  // Network-level failures carry no HTTP status. The Anthropic SDK does not set `name` on them, so look at the class
  // (APIConnectionError / APIConnectionTimeoutError), the usual socket messages and the cause.
  const err = e as { name?: string; message?: string; constructor?: { name?: string }; cause?: unknown };
  const cls = err?.constructor?.name ?? "";
  return s === 429 || (typeof s === "number" && s >= 500) || err?.name === "AbortError" || /^APIConnection\w*Error$/.test(cls) || /^APIConnection\w*Error$/.test(err?.name ?? "")
    || (s === undefined && /connection error|ECONNRESET|ETIMEDOUT|EAI_AGAIN|fetch failed|socket hang up/i.test(`${err?.message ?? ""} ${String((err?.cause as Error | undefined)?.message ?? "")}`));
};

export function withRetry(inner: ChatClient, o: { retries?: number; baseMs?: number; sleep?: (ms: number) => Promise<void> } = {}): ChatClient {
  const retries = o.retries ?? 2, base = o.baseMs ?? 400, nap = o.sleep ?? sleep;
  return {
    id: inner.id,
    async complete(req) {
      for (let attempt = 0; ; attempt++) {
        try { return await inner.complete(req); }
        catch (e) {
          if (attempt >= retries || !isRetryable(e)) throw e;
          await nap(base * 2 ** attempt); // exponential backoff on 429 / 5xx (organiser guide)
        }
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

export const cacheKey = (id: string, req: CompleteRequest) => createHash("sha256").update(JSON.stringify({ id, req })).digest("hex");

/** Dev/eval replay: identical (model, request) is answered from disk and costs no tokens. A replay is not a fresh model sample. */
export function withCache(inner: ChatClient, store: CacheStore): ChatClient & { stats: { hits: number; misses: number } } {
  const stats = { hits: 0, misses: 0 };
  return {
    id: inner.id, stats,
    async complete(req) {
      const k = cacheKey(inner.id, req);
      const hit = store.get(k);
      if (hit) { stats.hits++; return { ...hit, usage: { input: 0, output: 0 } }; }
      stats.misses++;
      const res = await inner.complete(req);
      store.set(k, res);
      return res;
    },
  };
}
