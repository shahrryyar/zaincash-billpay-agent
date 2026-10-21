import { describe, it, expect } from "vitest";
import { anthropicChat } from "../src/anthropic";
import { openAIChat, ProviderError, type FetchLike } from "../src/openai";
import { TOOL_DEFS } from "../src/tools";
import type { CompleteRequest } from "../src/types";

const req = (over: Partial<CompleteRequest> = {}): CompleteRequest => ({
  system: "SYS", maxTokens: 512, toolChoice: "auto", tools: [TOOL_DEFS.get_balance, TOOL_DEFS.propose],
  messages: [{ role: "user", content: [{ type: "text", text: "دز خمسين ألف لأحمد" }] }], ...over,
});

describe("Anthropic adapter", () => {
  const fakeClient = (resp: unknown) => { const calls: any[] = []; return { calls, client: { messages: { create: async (p: unknown) => { calls.push(p); return resp; } } } }; };
  const resp = { content: [{ type: "text", text: "hi" }, { type: "tool_use", id: "tu1", name: "propose", input: { a: 1 } }, { type: "thinking", thinking: "x" }], stop_reason: "tool_use", usage: { input_tokens: 11, output_tokens: 7 } };

  it("maps the request: system, messages, tools with input_schema, auto tool choice", async () => {
    const f = fakeClient(resp);
    await anthropicChat({ client: f.client, model: "claude-haiku-5-5", temperature: 0 }).complete(req());
    const p = f.calls[0];
    expect(p).toMatchObject({ model: "claude-haiku-5-5", max_tokens: 512, system: "SYS", temperature: 0, tool_choice: { type: "auto" } });
    expect(p.tools.map((t: any) => t.name)).toEqual(["get_balance", "propose"]);
    expect(p.tools[1].input_schema.type).toBe("object");
    expect(p.messages).toEqual([{ role: "user", content: [{ type: "text", text: "دز خمسين ألف لأحمد" }] }]);
  });
  it("with a stable prefix: two system blocks, the first marked for caching; no prefix: a plain string", async () => {
    const f = fakeClient(resp);
    const c = anthropicChat({ client: f.client, model: "m" });
    await c.complete(req({ system: "STABLE\n\nDYNAMIC part", systemPrefix: "STABLE" }));
    await c.complete(req({ system: "ONLY" }));
    expect(f.calls[0].system).toEqual([{ type: "text", text: "STABLE", cache_control: { type: "ephemeral" } }, { type: "text", text: "DYNAMIC part" }]);
    expect(f.calls[1].system).toBe("ONLY");
  });
  it("a prefix that is not the start of the system text is ignored (never reorders the prompt)", async () => {
    const f = fakeClient(resp);
    await anthropicChat({ client: f.client, model: "m" }).complete(req({ system: "SOMETHING ELSE", systemPrefix: "STABLE" }));
    expect(f.calls[0].system).toBe("SOMETHING ELSE");
  });
  it("reports cache reads and writes separately from normal input", async () => {
    const f = fakeClient({ ...resp, usage: { input_tokens: 200, output_tokens: 50, cache_read_input_tokens: 4000, cache_creation_input_tokens: 0 } });
    const r = await anthropicChat({ client: f.client, model: "m" }).complete(req());
    expect(r.usage).toEqual({ input: 200, output: 50, cacheRead: 4000 });
    const g = fakeClient({ ...resp, usage: { input_tokens: 10, output_tokens: 5, cache_creation_input_tokens: 4164 } });
    expect((await anthropicChat({ client: g.client, model: "m" }).complete(req())).usage).toEqual({ input: 10, output: 5, cacheWrite: 4164 });
  });
  it("forced tool choice", async () => {
    const f = fakeClient(resp);
    await anthropicChat({ client: f.client, model: "m" }).complete(req({ toolChoice: { name: "propose" } }));
    expect(f.calls[0].tool_choice).toEqual({ type: "tool", name: "propose" });
  });
  it("omits temperature unless configured", async () => {
    const f = fakeClient(resp);
    await anthropicChat({ client: f.client, model: "m" }).complete(req());
    expect(f.calls[0]).not.toHaveProperty("temperature");
  });
  it("maps the response: text and tool_use kept, other block types dropped, usage and stop mapped", async () => {
    const r = await anthropicChat({ client: fakeClient(resp).client, model: "claude-haiku-5-5" }).complete(req());
    expect(r.content).toEqual([{ type: "text", text: "hi" }, { type: "tool_use", id: "tu1", name: "propose", input: { a: 1 } }]);
    expect(r.stop).toBe("tool_use");
    expect(r.usage).toEqual({ input: 11, output: 7 });
    expect(r.via).toBe("anthropic:claude-haiku-5-5");
  });
  it("passes tool_result blocks (with is_error) through unchanged", async () => {
    const f = fakeClient(resp);
    const messages = [
      { role: "user" as const, content: [{ type: "text" as const, text: "x" }] },
      { role: "assistant" as const, content: [{ type: "tool_use" as const, id: "t1", name: "get_balance", input: {} }] },
      { role: "user" as const, content: [{ type: "tool_result" as const, tool_use_id: "t1", content: "{}", is_error: true }] },
    ];
    await anthropicChat({ client: f.client, model: "m" }).complete(req({ messages }));
    expect(f.calls[0].messages[2].content[0]).toEqual({ type: "tool_result", tool_use_id: "t1", content: "{}", is_error: true });
  });
  it("API errors propagate", async () => {
    const client = { messages: { create: async () => { throw Object.assign(new Error("rate"), { status: 429 }); } } };
    await expect(anthropicChat({ client, model: "m" }).complete(req())).rejects.toMatchObject({ status: 429 });
  });
  it("does not send Gemini-only signatures to Anthropic on a fallback", async () => {
    const f = fakeClient(resp);
    await anthropicChat({ client: f.client, model: "m" }).complete(req({ messages: [{ role: "assistant", content: [{ type: "tool_use", id: "t1", name: "get_balance", input: {}, googleThoughtSignature: "opaque-signature" }] }] }));
    expect(f.calls[0].messages[0].content).toEqual([{ type: "tool_use", id: "t1", name: "get_balance", input: {} }]);
  });
});

describe("OpenAI-format adapter (Groq / Gemini / OpenRouter / local)", () => {
  const mkFetch = (data: unknown, status = 200) => {
    const calls: { url: string; init: any }[] = [];
    const fetchFn: FetchLike = async (url, init) => { calls.push({ url, init }); return { ok: status < 400, status, json: async () => data, text: async () => JSON.stringify(data) }; };
    return { calls, fetchFn };
  };
  const okData = { choices: [{ finish_reason: "tool_calls", message: { content: null, tool_calls: [{ id: "c1", type: "function", function: { name: "propose", arguments: '{"status":"ok"}' } }] } }], usage: { prompt_tokens: 30, completion_tokens: 9 } };
  const chat = (f: FetchLike) => openAIChat({ baseUrl: "https://api.groq.com/openai/v1/", apiKey: "k", model: "qwen", label: "groq", fetch: f });

  it("maps the request to chat.completions with function tools and a bearer key", async () => {
    const m = mkFetch(okData);
    await chat(m.fetchFn).complete(req());
    const c = m.calls[0]!;
    expect(c.url).toBe("https://api.groq.com/openai/v1/chat/completions");
    expect(c.init.headers.authorization).toBe("Bearer k");
    const body = JSON.parse(c.init.body);
    expect(body).toMatchObject({ model: "qwen", max_tokens: 512, temperature: 0, tool_choice: "auto" });
    expect(body.messages[0]).toEqual({ role: "system", content: "SYS" });
    expect(body.messages[1]).toEqual({ role: "user", content: "دز خمسين ألف لأحمد" });
    expect(body.tools[1]).toMatchObject({ type: "function", function: { name: "propose" } });
    expect(body.tools[1].function.parameters.type).toBe("object");
  });
  it("forced tool choice", async () => {
    const m = mkFetch(okData);
    await chat(m.fetchFn).complete(req({ toolChoice: { name: "propose" } }));
    expect(JSON.parse(m.calls[0]!.init.body).tool_choice).toEqual({ type: "function", function: { name: "propose" } });
  });
  it("maps assistant tool_use and user tool_result messages", async () => {
    const m = mkFetch(okData);
    const messages = [
      { role: "user" as const, content: [{ type: "text" as const, text: "x" }] },
      { role: "assistant" as const, content: [{ type: "tool_use" as const, id: "t1", name: "get_balance", input: {} }] },
      { role: "user" as const, content: [{ type: "tool_result" as const, tool_use_id: "t1", content: '{"data":1}' }] },
    ];
    await chat(m.fetchFn).complete(req({ messages }));
    const sent = JSON.parse(m.calls[0]!.init.body).messages;
    expect(sent[2]).toEqual({ role: "assistant", content: null, tool_calls: [{ id: "t1", type: "function", function: { name: "get_balance", arguments: "{}" } }] });
    expect(sent[3]).toEqual({ role: "tool", tool_call_id: "t1", content: '{"data":1}' });
  });
  it("maps the response: tool_calls to tool_use blocks, usage, stop, via", async () => {
    const r = await chat(mkFetch(okData).fetchFn).complete(req());
    expect(r.content).toEqual([{ type: "tool_use", id: "c1", name: "propose", input: { status: "ok" } }]);
    expect(r.stop).toBe("tool_use");
    expect(r.usage).toEqual({ input: 30, output: 9 });
    expect(r.via).toBe("groq:qwen");
  });
  it("round-trips Gemini thought signatures on their original tool calls across multiple steps", async () => {
    const m = mkFetch({ choices: [{ finish_reason: "tool_calls", message: { tool_calls: [
      { id: "signed", function: { name: "get_balance", arguments: "{}" }, extra_content: { google: { thought_signature: "opaque+/==" } } },
      { id: "unsigned", function: { name: "get_bills", arguments: "{}" } },
    ] } }] });
    const c = openAIChat({ baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai", apiKey: "fake", model: "gemini-test", label: "gemini", fetch: m.fetchFn });
    const first = await c.complete(req());
    const messages = [...req().messages, { role: "assistant" as const, content: first.content }, { role: "user" as const, content: [
      { type: "tool_result" as const, tool_use_id: "signed", content: "{}" },
      { type: "tool_result" as const, tool_use_id: "unsigned", content: "{}" },
    ] }];
    const second = await c.complete(req({ messages }));
    await c.complete(req({ messages: [...messages, { role: "assistant", content: second.content }] }));
    for (const index of [1, 2]) {
      const sent = JSON.parse(m.calls[index]!.init.body).messages[2].tool_calls;
      expect(sent[0].extra_content).toEqual({ google: { thought_signature: "opaque+/==" } });
      expect(sent[1]).not.toHaveProperty("extra_content");
    }
  });
  it("text-only replies", async () => {
    const r = await chat(mkFetch({ choices: [{ finish_reason: "stop", message: { content: "hello" } }] }).fetchFn).complete(req());
    expect(r.content).toEqual([{ type: "text", text: "hello" }]);
    expect(r.stop).toBe("end");
  });
  it("does not forward Gemini signatures to another OpenAI-format provider", async () => {
    const m = mkFetch(okData);
    await chat(m.fetchFn).complete(req({ messages: [{ role: "assistant", content: [{ type: "tool_use", id: "t", name: "get_balance", input: {}, googleThoughtSignature: "opaque" }] }] }));
    expect(JSON.parse(m.calls[0]!.init.body).messages[1].tool_calls[0]).not.toHaveProperty("extra_content");
  });
  it("unparseable tool arguments do not crash: they become an input the schema will reject", async () => {
    const bad = { choices: [{ finish_reason: "tool_calls", message: { tool_calls: [{ id: "c1", function: { name: "propose", arguments: "{oops" } }] } }] };
    const r = await chat(mkFetch(bad).fetchFn).complete(req());
    expect((r.content[0] as any).input).toHaveProperty("__unparseable_arguments");
  });
  it("non-2xx throws a ProviderError carrying the status (so retry/fallback can react)", async () => {
    await expect(chat(mkFetch({}, 429).fetchFn).complete(req())).rejects.toMatchObject({ status: 429 });
    await expect(chat(mkFetch({}, 429).fetchFn).complete(req())).rejects.toBeInstanceOf(ProviderError);
  });
  it("the provider's own error text is in the message (a refused tool schema is diagnosable), short and without the key", async () => {
    const err = { error: { message: "tools.0.function.parameters: unsupported keyword propertyNames", type: "invalid_request_error" } };
    const e = (await chat(mkFetch(err, 400).fetchFn).complete(req()).then(() => null, (x: unknown) => x)) as ProviderError;
    expect(e.message).toContain("HTTP 400");
    expect(e.message).toContain("propertyNames");
    expect(e.message).not.toContain("Bearer");
    expect(e.message.length).toBeLessThan(400);
  });
});
