// Builds the production ChatClient chain from environment variables (docs/10, .env.example).
// The selected provider first, with optional fallbacks. Keys are never printed.
import { anthropicChat, createAnthropicChat } from "./anthropic";
import { openAIChat, type FetchLike } from "./openai";
import { fileStore, withBudget, withCache, withFallback, withRetry, withPacing } from "./wrappers";
import type { ChatClient } from "./types";

export type Env = Record<string, string | undefined>;
export type FactoryOptions = { cacheDir?: string; fetch?: FetchLike; anthropicClient?: Parameters<typeof anthropicChat>[0]["client"]; now?: () => number };

const OPENAI_FORMAT: Record<string, { base: string; keyVar: string; modelVar: string }> = {
  groq: { base: "https://api.groq.com/openai/v1", keyVar: "GROQ_API_KEY", modelVar: "GROQ_MODEL" },
  gemini: { base: "https://generativelanguage.googleapis.com/v1beta/openai/", keyVar: "GEMINI_API_KEY", modelVar: "GEMINI_MODEL" },
  openrouter: { base: "https://openrouter.ai/api/v1", keyVar: "OPENROUTER_API_KEY", modelVar: "OPENROUTER_MODEL" },
};

export function chatFromEnv(env: Env, o: FactoryOptions = {}): { chat: ChatClient; description: string[] } {
  const primary = (env.LLM_PROVIDER ?? "anthropic").trim();
  const fallbacks = (env.LLM_FALLBACKS ?? "").split(",").map((x) => x.trim()).filter(Boolean);
  const order = [primary, ...fallbacks.filter((f) => f !== primary)];
  const cap = Number(env.LLM_DAILY_TOKEN_CAP ?? 2_000_000);
  const intervalMs = Number(env.LLM_REQUEST_INTERVAL_MS ?? 0);
  const description: string[] = [];
  const clients: ChatClient[] = [];

  for (const name of order) {
    let c: ChatClient | null = null;
    if (name === "anthropic") {
      const key = env.ANTHROPIC_API_KEY;
      const model = env.LLM_MODEL || "claude-haiku-5-5";
      if (!key) { description.push("anthropic: skipped (no ANTHROPIC_API_KEY)"); continue; }
      c = o.anthropicClient ? anthropicChat({ client: o.anthropicClient, model }) : createAnthropicChat({ apiKey: key, model });
    } else if (name === "local") {
      const base = env.LOCAL_BASE_URL, model = env.LOCAL_MODEL;
      if (!base || !model) { description.push("local: skipped (set LOCAL_BASE_URL and LOCAL_MODEL)"); continue; }
      c = openAIChat({ baseUrl: base, apiKey: "local", model, label: "local", ...(o.fetch ? { fetch: o.fetch } : {}) });
    } else if (OPENAI_FORMAT[name]) {
      const p = OPENAI_FORMAT[name] as (typeof OPENAI_FORMAT)[string];
      const key = env[p.keyVar], model = env[p.modelVar];
      if (!key || !model) { description.push(`${name}: skipped (set ${p.keyVar} and ${p.modelVar})`); continue; }
      c = openAIChat({ baseUrl: p.base, apiKey: key, model, label: name, ...(o.fetch ? { fetch: o.fetch } : {}) });
    } else { description.push(`${name}: unknown provider, ignored`); continue; }
    clients.push(withBudget(withRetry(withPacing(c, { intervalMs })), { maxTokensPerDay: cap, ...(o.now ? { now: o.now } : {}) }));
    description.push(`${c.id}: enabled (budget ${cap} tokens/day)`);
  }
  if (intervalMs > 0) description.push(`request pacing: ${intervalMs} ms per provider in this process (other processes share the upstream quota)`);
  if (clients.length === 0) throw new Error(`No LLM configured. ${description.join("; ")}. Set ANTHROPIC_API_KEY in .env (see .env.example).`);

  let chat: ChatClient = clients.length === 1 ? (clients[0] as ChatClient) : withFallback(clients);
  if (env.LLM_CACHE === "1") {
    chat = withCache(chat, fileStore(o.cacheDir ?? ".cache/llm"));
    description.push("response cache: on (identical requests cost nothing)");
  }
  return { chat, description };
}
