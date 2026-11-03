// OpenAI-format adapter for the free fallbacks (Groq, Gemini, OpenRouter, local). Plain fetch, no SDK.
import type { Block, ChatClient, CompleteRequest, CompleteResponse, Msg } from "./types";
import { CancelledError, parseRetryAfter } from "./wrappers";

export type FetchLike = (url: string, init: { method: string; headers: Record<string, string>; body: string; signal?: AbortSignal }) => Promise<{ ok: boolean; status: number; headers?: { get(name: string): string | null }; json(): Promise<any>; text(): Promise<string> }>;
export type OpenAIOptions = { baseUrl: string; apiKey: string; model: string; label: string; fetch?: FetchLike; timeoutMs?: number; temperature?: number };

/** `retryAfterMs`: the provider's own retry hint (Gemini RetryInfo / Retry-After); `daily`: a per-day quota ran out. */
export class ProviderError extends Error {
  readonly retryAfterMs: number | undefined;
  readonly daily: boolean;
  constructor(message: string, readonly status: number, extra: { retryAfterMs?: number | undefined; daily?: boolean } = {}) {
    super(message); this.retryAfterMs = extra.retryAfterMs; this.daily = extra.daily ?? false;
  }
}

/** Google's documented placeholder for tool calls that did not come from Gemini (history from another model). */
export const GEMINI_SKIP_SIGNATURE = "skip_thought_signature_validator";

/** An error body's message, retry hint and per-day flag. Gemini's OpenAI endpoint may wrap the error in an array. */
function errorInfo(text: string): { why: string; retryAfterMs?: number; daily: boolean } {
  let j: any;
  try { j = JSON.parse(text); } catch { return { why: text, daily: /PerDay|per day/i.test(text) }; }
  const err = (Array.isArray(j) ? j[0] : j)?.error ?? {};
  const details: any[] = Array.isArray(err.details) ? err.details : [];
  const delay = details.find((d) => String(d?.["@type"] ?? "").endsWith("RetryInfo"))?.retryDelay;
  const m = typeof delay === "string" ? /^(\d+(?:\.\d+)?)s$/.exec(delay) : null;
  const quotaIds = details.flatMap((d) => (Array.isArray(d?.violations) ? d.violations : [])).map((v: any) => String(v?.quotaId ?? ""));
  return { why: String(err.message ?? text), ...(m ? { retryAfterMs: Math.ceil(Number(m[1]) * 1000) } : {}), daily: quotaIds.some((q) => /PerDay/i.test(q)) || /PerDay|per day/i.test(String(err.message ?? "")) };
}

function toOpenAIMessages(system: string, messages: Msg[], google: boolean): unknown[] {
  const out: unknown[] = [{ role: "system", content: system }];
  for (const m of messages) {
    if (m.role === "assistant") {
      const text = m.content.filter((b): b is Extract<Block, { type: "text" }> => b.type === "text").map((b) => b.text).join("");
      const uses = m.content.filter((b): b is Extract<Block, { type: "tool_use" }> => b.type === "tool_use");
      // A step with no signature at all came from another provider (fallback mid-turn): Gemini 3 would answer 400.
      const foreign = google && uses.length > 0 && uses.every((b) => b.googleThoughtSignature === undefined);
      const calls = uses.map((b, i) => {
        const sig = google ? b.googleThoughtSignature ?? (foreign && i === 0 ? GEMINI_SKIP_SIGNATURE : undefined) : undefined;
        return { id: b.id, type: "function", function: { name: b.name, arguments: JSON.stringify(b.input) }, ...(sig !== undefined ? { extra_content: { google: { thought_signature: sig } } } : {}) };
      });
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
      if (req.signal?.aborted) throw new CancelledError();
      const ctl = new AbortController();
      const timer = setTimeout(() => ctl.abort(), opts.timeoutMs ?? 8000);
      const onCancel = () => ctl.abort();
      req.signal?.addEventListener("abort", onCancel, { once: true });
      try {
        const res = await doFetch(`${opts.baseUrl.replace(/\/$/, "")}/chat/completions`, {
          method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${opts.apiKey}` }, body: JSON.stringify(body), signal: ctl.signal,
        });
        if (!res.ok) {
          // the provider's own reason (e.g. a tool schema it does not accept), so a failed setup is diagnosable; never the key
          const info = errorInfo(await res.text().catch(() => ""));
          const retryAfterMs = info.retryAfterMs ?? parseRetryAfter(res.headers?.get("retry-after"));
          throw new ProviderError(`${opts.label} HTTP ${res.status}${info.why ? `: ${info.why.replace(/\s+/g, " ").slice(0, 300)}` : ""}`, res.status, { retryAfterMs, daily: info.daily });
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
      } catch (e) {
        if (req.signal?.aborted) throw new CancelledError(); // the caller's cancel, not our timeout: never retried
        throw e;
      } finally { clearTimeout(timer); req.signal?.removeEventListener("abort", onCancel); }
    },
  };
}
