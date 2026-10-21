import { it, expect } from "vitest";
import { withCache, type CompleteRequest, type CompleteResponse } from "@zc/llm";
import { cacheOnlyClient } from "../src/cache-only";
it("replays identical cached requests without credentials and refuses new requests without a network path", async () => {
  const data = new Map<string, CompleteResponse>();
  const store = { get: (k: string) => data.get(k), set: (k: string, v: CompleteResponse) => { data.set(k, v); } };
  const req: CompleteRequest = { system: "fixture", messages: [], tools: [], toolChoice: "auto", maxTokens: 100 };
  const response: CompleteResponse = { content: [{ type: "text", text: "stored fixture" }], stop: "end", usage: { input: 5, output: 5 } };
  await withCache({ id: "model", async complete() { return response; } }, store).complete(req);
  const replay = cacheOnlyClient("model", store);
  expect(await replay.complete(req)).toMatchObject({ content: response.content, usage: { input: 0, output: 0 } });
  await expect(replay.complete({ ...req, system: "different" })).rejects.toThrow("CACHE_MISS");
});
