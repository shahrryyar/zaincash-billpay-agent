import { describe, it, expect } from "vitest";
import { mkdtempSync, rmSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chatFromEnv } from "../src/factory";
import type { CompleteRequest } from "../src/types";

const REQ: CompleteRequest = { system: "s", messages: [{ role: "user", content: [{ type: "text", text: "hi" }] }], tools: [], toolChoice: "auto", maxTokens: 10 };
const okResp = { content: [{ type: "text", text: "ok" }], stop_reason: "end_turn", usage: { input_tokens: 5, output_tokens: 2 } };
const anthropicClient = (calls: any[] = []) => ({ messages: { create: async (p: unknown) => { calls.push(p); return okResp; } } });
const fetchOk = (calls: string[] = []) => async (url: string) => { calls.push(url); return { ok: true, status: 200, json: async () => ({ choices: [{ finish_reason: "stop", message: { content: "free" } }] }), text: async () => "" }; };
const failingAnthropic = { messages: { create: async () => { throw Object.assign(new Error("overloaded"), { status: 529 }); } } };

describe("chatFromEnv", () => {
  it("Claude only, default model Haiku 5.5", async () => {
    const calls: any[] = [];
    const { chat, description } = chatFromEnv({ ANTHROPIC_API_KEY: "sk-test" }, { anthropicClient: anthropicClient(calls) });
    await chat.complete(REQ);
    expect(calls[0].model).toBe("claude-haiku-5-5");
    expect(description[0]).toContain("anthropic:claude-haiku-5-5: enabled");
  });
  it("LLM_MODEL overrides the model", async () => {
    const calls: any[] = [];
    await chatFromEnv({ ANTHROPIC_API_KEY: "k", LLM_MODEL: "claude-sonnet-5-5" }, { anthropicClient: anthropicClient(calls) }).chat.complete(REQ);
    expect(calls[0].model).toBe("claude-sonnet-5-5");
  });
  it("never puts a key in the description", () => {
    const { description } = chatFromEnv({ ANTHROPIC_API_KEY: "sk-super-secret", LLM_FALLBACKS: "groq", GROQ_API_KEY: "gsk-secret", GROQ_MODEL: "m" }, { anthropicClient: anthropicClient(), fetch: fetchOk() });
    expect(JSON.stringify(description)).not.toMatch(/secret/);
  });
  it("falls back to a free provider when Claude fails", async () => {
    const urls: string[] = [];
    const { chat } = chatFromEnv(
      { ANTHROPIC_API_KEY: "k", LLM_FALLBACKS: "groq", GROQ_API_KEY: "g", GROQ_MODEL: "qwen" },
      { anthropicClient: failingAnthropic, fetch: fetchOk(urls) },
    );
    const r = await chat.complete(REQ);
    expect(r.via).toBe("groq:qwen");
    expect(urls[0]).toContain("api.groq.com");
  });
  it("skips providers that are not configured and says why", () => {
    const { description } = chatFromEnv({ ANTHROPIC_API_KEY: "k", LLM_FALLBACKS: "groq,gemini,local" }, { anthropicClient: anthropicClient() });
    expect(description.join("|")).toMatch(/groq: skipped.*gemini: skipped.*local: skipped/);
  });
  it("works without Claude if a free provider is configured", async () => {
    const { chat, description } = chatFromEnv({ LLM_PROVIDER: "groq", GROQ_API_KEY: "g", GROQ_MODEL: "m" }, { fetch: fetchOk() });
    expect((await chat.complete(REQ)).via).toBe("groq:m");
    expect(description.join("|")).toContain("groq:m: enabled");
  });
  it("throws a helpful error when nothing is configured", () => {
    expect(() => chatFromEnv({})).toThrow(/ANTHROPIC_API_KEY/);
  });
  it("the daily token budget stops a runaway loop", async () => {
    const c = chatFromEnv({ ANTHROPIC_API_KEY: "k", LLM_DAILY_TOKEN_CAP: "10" }, { anthropicClient: anthropicClient() }).chat;
    await c.complete(REQ); // 7 tokens
    await c.complete(REQ); // 14 tokens (crosses the cap)
    await expect(c.complete(REQ)).rejects.toThrow(/budget/);
  });
  it("LLM_CACHE=1 caches identical requests on disk", async () => {
    const dir = mkdtempSync(join(tmpdir(), "zc-cache-"));
    try {
      const calls: any[] = [];
      const { chat, description } = chatFromEnv({ ANTHROPIC_API_KEY: "k", LLM_CACHE: "1" }, { anthropicClient: anthropicClient(calls), cacheDir: dir });
      await chat.complete(REQ);
      await chat.complete(REQ);
      expect(calls).toHaveLength(1);
      expect(readdirSync(dir)).toHaveLength(1);
      expect(description.join("|")).toContain("cache: on");
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
});
