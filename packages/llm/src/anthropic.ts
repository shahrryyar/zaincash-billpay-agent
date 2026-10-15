// Anthropic adapter (primary: Claude Haiku/Sonnet). Native tool use; our neutral blocks ARE Anthropic's blocks.
import Anthropic from "@anthropic-ai/sdk";
import type { Block, ChatClient, CompleteRequest, CompleteResponse } from "./types";

export type AnthropicLike = { messages: { create(params: any): Promise<any> } };
export type AnthropicOptions = { client: AnthropicLike; model: string; temperature?: number | undefined };

export function anthropicChat(opts: AnthropicOptions): ChatClient {
  const id = `anthropic:${opts.model}`;
  return {
    id,
    async complete(req: CompleteRequest): Promise<CompleteResponse> {
      const params: Record<string, unknown> = {
        model: opts.model,
        max_tokens: req.maxTokens,
        system: req.system,
        messages: req.messages.map((m) => ({ role: m.role, content: m.content })),
        tools: req.tools.map((t) => ({ name: t.name, description: t.description, input_schema: t.input_schema })),
        tool_choice: req.toolChoice === "auto" ? { type: "auto" } : { type: "tool", name: req.toolChoice.name },
      };
      if (opts.temperature !== undefined) params.temperature = opts.temperature;
      const res = await opts.client.messages.create(params);
      const content: Block[] = [];
      for (const b of res.content ?? []) {
        if (b.type === "text") content.push({ type: "text", text: b.text });
        else if (b.type === "tool_use") content.push({ type: "tool_use", id: b.id, name: b.name, input: b.input });
      }
      const stop = res.stop_reason === "tool_use" ? "tool_use" : res.stop_reason === "max_tokens" ? "max_tokens" : "end";
      return { content, stop, usage: { input: res.usage?.input_tokens ?? 0, output: res.usage?.output_tokens ?? 0 }, via: id };
    },
  };
}

/** Real client: 1 SDK retry, 8 s timeout (docs/10). The key comes from the environment, never from code. */
export function createAnthropicChat(opts: { apiKey: string; model: string; temperature?: number }): ChatClient {
  const client = new Anthropic({ apiKey: opts.apiKey, maxRetries: 1, timeout: 8000 });
  return anthropicChat({ client: client as unknown as AnthropicLike, model: opts.model, temperature: opts.temperature });
}
