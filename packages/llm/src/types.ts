// Provider-neutral chat types. Anthropic's content-block format is the neutral shape;
// OpenAI-format providers are mapped to/from it in openai.ts.

export type Block =
  | { type: "text"; text: string }
  | { type: "tool_use"; id: string; name: string; input: unknown }
  | { type: "tool_result"; tool_use_id: string; content: string; is_error?: boolean };

export type Msg = { role: "user" | "assistant"; content: Block[] };

export type ToolDef = { name: string; description: string; input_schema: Record<string, unknown> };
export type ToolChoice = "auto" | { name: string };

export type CompleteRequest = { system: string; messages: Msg[]; tools: ToolDef[]; toolChoice: ToolChoice; maxTokens: number };
export type Usage = { input: number; output: number };
export type CompleteResponse = { content: Block[]; stop: "tool_use" | "end" | "max_tokens"; usage: Usage; via?: string };

export interface ChatClient {
  /** e.g. "anthropic:claude-haiku-5-5", logged with every result. */
  readonly id: string;
  complete(req: CompleteRequest): Promise<CompleteResponse>;
}

export const addUsage = (a: Usage, b: Usage): Usage => ({ input: a.input + b.input, output: a.output + b.output });
