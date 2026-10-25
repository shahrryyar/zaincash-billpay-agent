// Provider-neutral chat types. Anthropic's content-block format is the neutral shape;
// OpenAI-format providers are mapped to/from it in openai.ts.

export type Block =
  | { type: "text"; text: string }
  // Opaque Gemini continuation metadata. Never shown to users or treated as intent.
  | { type: "tool_use"; id: string; name: string; input: unknown; googleThoughtSignature?: string }
  | { type: "tool_result"; tool_use_id: string; content: string; is_error?: boolean };

export type Msg = { role: "user" | "assistant"; content: Block[] };

export type ToolDef = { name: string; description: string; input_schema: Record<string, unknown> };
export type ToolChoice = "auto" | { name: string };

/** `systemPrefix`: the leading part of `system` that never changes between requests; providers that support prompt caching cache it together with the tools. */
export type CompleteRequest = { system: string; systemPrefix?: string; messages: Msg[]; tools: ToolDef[]; toolChoice: ToolChoice; maxTokens: number };
/** input = tokens billed at the normal rate; cacheRead / cacheWrite = prompt-cache tokens (read at a fraction of the price, write at a small premium). */
export type Usage = { input: number; output: number; cacheRead?: number; cacheWrite?: number };
/** `attempts`: upstream requests behind this answer (retries included, 0 for a cache hit); absent means one. Free tiers count each. */
export type CompleteResponse = { content: Block[]; stop: "tool_use" | "end" | "max_tokens"; usage: Usage; via?: string; attempts?: number };

export interface ChatClient {
  /** e.g. "anthropic:claude-haiku-5-5", logged with every result. */
  readonly id: string;
  complete(req: CompleteRequest): Promise<CompleteResponse>;
}

export const addUsage = (a: Usage, b: Usage): Usage => ({
  input: a.input + b.input, output: a.output + b.output,
  ...((a.cacheRead ?? 0) + (b.cacheRead ?? 0) > 0 ? { cacheRead: (a.cacheRead ?? 0) + (b.cacheRead ?? 0) } : {}),
  ...((a.cacheWrite ?? 0) + (b.cacheWrite ?? 0) > 0 ? { cacheWrite: (a.cacheWrite ?? 0) + (b.cacheWrite ?? 0) } : {}),
});
/** Budget weight of one call in "normal tokens": a cache read costs about a tenth, a cache write about 1.25x. Prices are not assumed beyond these published ratios. */
export const weightedTokens = (u: Usage): number => u.input + u.output + Math.round((u.cacheRead ?? 0) * 0.1) + Math.round((u.cacheWrite ?? 0) * 1.25);
