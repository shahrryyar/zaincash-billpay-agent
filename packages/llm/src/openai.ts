// OpenAI-format adapter for the free fallbacks (Groq, Gemini, OpenRouter, local). Plain fetch, no SDK.
import type { Block, ChatClient, CompleteRequest, CompleteResponse, Msg } from "./types";

export type FetchLike = (url: string, init: { method: string; headers: Record<string, string>; body: string; signal?: AbortSignal }) => Promise<{ ok: boolean; status: number; json(): Promise<any>; text(): Promise<string> }>;
export type OpenAIOptions = { baseUrl: string; apiKey: string; model: string; label: string; fetch?: FetchLike; timeoutMs?: number; temperature?: number };

export class ProviderError extends Error {
  constructor(message: string, readonly status: number) { super(message); }
}

function toOpenAIMessages(system: string, messages: Msg[], google: boolean): unknown[] {
  const out: unknown[] = [{ role: "system", content: system }];
  for (const m of messages) {
    if (m.role === "assistant") {
      const text = m.content.filter((b): b is Extract<Block, { type: "text" }> => b.type === "text").map((b) => b.text).join("");
      const calls = m.content.filter((b): b is Extract<Block, { type: "tool_use" }> => b.type === "tool_use")
        .map((b) => ({ id: b.id, type: "function", function: { name: b.name, arguments: JSON.stringify(b.input) },
          ...(google && b.googleThoughtSignature !== undefined ? { extra_content: { google: { thought_signature: b.googleThoughtSignature } } } : {}),
        }));
      out.push({ role: "assistant", content: text || null, ...(calls.length ? { tool_calls: calls } : {}) });
    } else {
      const results = m.content.filter((b): b is Extract<Block, { type: "tool_result" }> => b.type === "tool_result");
      if (results.length) for (const r of results) out.push({ role: "tool", tool_call_id: r.tool_use_id, content: r.content });
      else out.push({ role: "user", content: m.content.map((b) => (b.type === "text" ? b.text : "")).join("") });
    }
  }
  return out;
}

export function openAIChat(opts: OpenAIOptions): ChatClient {
  const id = `${opts.label}:${opts.model}`;
  const doFetch: FetchLike = opts.fetch ?? ((url, init) => fetch(url, init) as ReturnType<FetchLike>);
  return {
    id,
    async complete(req: CompleteRequest): Promise<CompleteResponse> {
      const body = {
        model: opts.model,
        messages: toOpenAIMessages(req.system, req.messages, opts.label === "gemini"),
        tools: req.tools.map((t) => ({ type: "function", function: { name: t.name, description: t.description, parameters: t.input_schema } })),
        tool_choice: req.toolChoice === "auto" ? "auto" : { type: "function", function: { name: req.toolChoice.name } },
        max_tokens: req.maxTokens,
        temperature: opts.temperature ?? 0,
      };
      const ctl = new AbortController();
      const timer = setTimeout(() => ctl.abort(), opts.timeoutMs ?? 8000);
      try {
        const res = await doFetch(`${opts.baseUrl.replace(/\/$/, "")}/chat/completions`, {
          method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${opts.apiKey}` }, body: JSON.stringify(body), signal: ctl.signal,
        });
        if (!res.ok) {
          // the provider's own reason (e.g. a tool schema it does not accept), so a failed setup is diagnosable; never the key
          const why = await res.text().then((t) => { try { return String(JSON.parse(t)?.error?.message ?? t); } catch { return t; } }, () => "");
          throw new ProviderError(`${opts.label} HTTP ${res.status}${why ? `: ${why.replace(/\s+/g, " ").slice(0, 300)}` : ""}`, res.status);
        }
        const data = await res.json();
        const msg = data.choices?.[0]?.message ?? {};
        const content: Block[] = [];
        if (msg.content) content.push({ type: "text", text: String(msg.content) });
        for (const c of msg.tool_calls ?? []) {
          let input: unknown;
          try { input = JSON.parse(c.function?.arguments ?? "{}"); } catch { input = { __unparseable_arguments: String(c.function?.arguments ?? "") }; }
          const signature = opts.label === "gemini" ? c.extra_content?.google?.thought_signature : undefined;
          content.push({ type: "tool_use", id: c.id ?? `call_${content.length}`, name: c.function?.name ?? "", input,
            ...(typeof signature === "string" ? { googleThoughtSignature: signature } : {}),
          });
        }
        const fr = data.choices?.[0]?.finish_reason;
        const stop = fr === "tool_calls" ? "tool_use" : fr === "length" ? "max_tokens" : "end";
        return { content, stop, usage: { input: data.usage?.prompt_tokens ?? 0, output: data.usage?.completion_tokens ?? 0 }, via: id };
      } finally { clearTimeout(timer); }
    },
  };
}
