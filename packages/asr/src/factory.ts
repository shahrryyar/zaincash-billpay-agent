import { createFakeTranscriber } from "./fake";
import { createOpenAICompatTranscriber } from "./openai-compat";
import { createRegalabsStreamTranscriber } from "./regalabs-stream";
import type { Transcriber } from "./types";

export const REGALABS_DEFAULT_BASE_URL = "https://api.regalabs.dev/v1";
/**
 * RegaLabs detects the spoken language itself, so by default no `language` is sent ("auto"): one setting serves the
 * Iraqi-Arabic and the Kurdish (Sorani) screen. Set REGALABS_ASR_LANGUAGE (e.g. "ckb", "ar") to force one.
 */
export const REGALABS_DEFAULT_LANGUAGE = "auto";
const forced = (v: string | undefined): string | undefined => { const x = v?.trim(); return x && x.toLowerCase() !== "auto" ? x : undefined; };

export type AsrConfig = {
  transcriber: Transcriber | null;
  /** "off" when no provider is configured: the mic is hidden and the text path is unaffected. */
  provider: "regalabs" | "openai-compat" | "fake" | "off";
  description: string;
  language: string | null;
  maxSeconds: number;
};

type Env = Record<string, string | undefined>;
const int = (v: string | undefined, d: number, min: number, max: number) => {
  const n = Number(v);
  return Number.isInteger(n) && n >= min && n <= max ? n : d;
};

/**
 * ASR_PROVIDER = regalabs | openai-compat | fake | off. Unset: regalabs when REGALABS_API_KEY is set, otherwise off.
 * Keys stay server-side; the browser only ever sends audio to our own route.
 */
export function asrFromEnv(env: Env, deps: { fetch?: typeof fetch } = {}): AsrConfig {
  const maxSeconds = int(env.ASR_MAX_SECONDS, 30, 3, 120);
  const timeoutMs = int(env.ASR_TIMEOUT_MS, 15_000, 1_000, 120_000);
  const requested = (env.ASR_PROVIDER ?? (env.REGALABS_API_KEY ? "regalabs" : "off")).trim().toLowerCase();
  const fetchOpt = deps.fetch ? { fetch: deps.fetch } : {};

  if (requested === "regalabs") {
    if (!env.REGALABS_API_KEY) return { transcriber: null, provider: "off", description: "regalabs selected but REGALABS_API_KEY is empty: voice off", language: null, maxSeconds };
    const language = forced(env.REGALABS_ASR_LANGUAGE);
    const streamUrl = env.REGALABS_STREAM_URL?.trim();
    if (streamUrl) {
      let url: URL;
      try {
        url = new URL(streamUrl);
        if (url.protocol !== "wss:" || url.username || url.password) throw new Error("invalid socket URL");
      } catch {
        return { transcriber: null, provider: "off", description: "invalid REGALABS_STREAM_URL: voice off", language: null, maxSeconds };
      }
      const transcriber = createRegalabsStreamTranscriber({ url: streamUrl, apiKey: env.REGALABS_API_KEY, language: language ?? "auto", timeoutMs });
      return { transcriber, provider: "regalabs", description: `RegaLabs streaming ASR (${language ?? "auto"}) at ${url.host}`, language: language ?? "auto", maxSeconds };
    }
    const baseUrl = env.REGALABS_BASE_URL?.trim() || REGALABS_DEFAULT_BASE_URL;
    const transcriber = createOpenAICompatTranscriber({ baseUrl, apiKey: env.REGALABS_API_KEY, provider: "regalabs", ...(language ? { language } : {}), timeoutMs, ...fetchOpt });
    const shown = language ?? REGALABS_DEFAULT_LANGUAGE;
    return { transcriber, provider: "regalabs", description: `RegaLabs ASR (${shown === "auto" ? "language auto-detected" : shown}) at ${new URL(baseUrl).host}`, language: shown, maxSeconds };
  }
  if (requested === "openai-compat") {
    if (!env.ASR_BASE_URL || !env.ASR_API_KEY) return { transcriber: null, provider: "off", description: "openai-compat selected but ASR_BASE_URL/ASR_API_KEY missing: voice off", language: null, maxSeconds };
    const language = env.ASR_LANGUAGE?.trim() || "ar";
    const model = env.ASR_MODEL?.trim() || undefined;
    const transcriber = createOpenAICompatTranscriber({
      baseUrl: env.ASR_BASE_URL, apiKey: env.ASR_API_KEY, provider: "openai-compat", language, responseFormat: "verbose_json", timeoutMs,
      ...(model ? { model } : {}), ...fetchOpt,
    });
    return { transcriber, provider: "openai-compat", description: `OpenAI-compatible ASR ${model ?? ""} (${language}) at ${new URL(env.ASR_BASE_URL).host}`, language, maxSeconds };
  }
  if (requested === "fake") return { transcriber: createFakeTranscriber(), provider: "fake", description: "fake ASR (demo simulator, hears nothing)", language: null, maxSeconds };
  return { transcriber: null, provider: "off", description: "voice off (no ASR provider configured)", language: null, maxSeconds };
}
