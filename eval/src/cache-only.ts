import { withCache, type CacheStore, type ChatClient } from "@zc/llm";

/** Replay only previously stored model responses. A miss fails closed; this client has no network implementation. */
export function cacheOnlyClient(id: string, store: CacheStore): ChatClient {
  return withCache({ id, async complete() { throw new Error("CACHE_MISS: offline replay has no stored response; no provider was called"); } }, store);
}
