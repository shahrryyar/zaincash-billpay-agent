# 10 — LLM strategy

Updated 2026-10-21. The author removed the paid Claude key and supplied a Google AI Studio key. The current laptop configuration is `LLM_PROVIDER=gemini`, `GEMINI_MODEL=gemini-3.5-flash-lite`, tools mode, no configured fallback. Keys stay in `.env`/host secrets. Historical Claude results describe their recorded commits, not Gemini.

## Provider choice and evidence

| Provider | Current evidence | Constraint |
|---|---|---|
| Claude Haiku 5.5 | Historical Arabic/Sorani held-out and dev comparisons (docs/12); real-client checks earlier on 21/10 | Paid key removed; subsequent 401 runs are infrastructure failures |
| Gemini 3.5 Flash-Lite | Authenticated and completed a tool-assisted transfer check; current dev and web results in docs/30 | This project/model returned a free quota of 15 requests/minute; not a universal promise |
| Gemini 3.1 Flash-Lite / 3.8 Flash | 503/high-demand or timeout in setup probes | Not selected for this demo |
| Gemini 2.5 Flash-Lite | API returned 404, unavailable to this new project/user | Not selected |
| Groq / OpenRouter / local | Adapters exist; no current credential/runtime benchmark | Do not claim measured quality |

Free-model availability and quotas change: use the active console plus official links in docs/31. Only synthetic wallet data is sent. A working key is not a quality or uptime result.

## Contract

`ChatClient.complete` is the provider-neutral boundary (`packages/llm/src/types.ts`). Anthropic uses its SDK. Other providers use the OpenAI-compatible adapter and function tools; the current adapter does not request a separate JSON response mode. The final `propose` argument must pass Zod and deterministic source/entity checks regardless of provider. The model has read-only tools and no execute/confirm/schedule-write tool (docs/05).

Gemini function calls can contain opaque thought signatures. The adapter preserves each signature on its original call across subsequent tool steps; other providers do not receive this metadata. It is never displayed as reasoning or interpreted as payment authority. See [Google's signature contract](https://ai.google.dev/gemini-api/docs/generate-content/thought-signatures).

Tools mode permits at most four read-only tool calls and a bounded number of model turns, then forces `propose`. Workflow mode supplies context and forces `propose` directly. The executable prompt and schema are in prompt.ts/tools.ts/schema.ts; old illustrative prompt snippets are not another contract.

## Reliability and configuration

- `LLM_PROVIDER`, provider key/model variables, `LLM_FALLBACKS`: selected provider then configured alternatives; missing providers are skipped and reported.
- `LLM_REQUEST_INTERVAL_MS` (0..60000, default 0) spaces actual starts, including retries, per provider **within one process**. Current local value 5000 ms accommodates the observed 15 RPM quota. Run web/smoke/eval sequentially: separate processes and other apps share the upstream quota.
- OpenAI-compatible requests: temperature 0, 8-second per-request timeout, wrapper retries up to twice on 429/5xx/network errors with exponential backoff. Pacing adds waiting before requests. Anthropic has an 8-second SDK timeout, one SDK retry and the same outer retry wrapper; temperature is omitted by default, not fixed to zero.
- Invalid/cut-off output never bypasses validation. A cut-off response gets one larger-output retry; persistent failure returns an honest safe reply.
- `LLM_DAILY_TOKEN_CAP` counts weighted tokens per provider/process/UTC day after completed calls. It is not a money cap or cross-process quota reservation; paid accounts also need a provider spend limit.
- `LLM_CACHE=1` stores identical provider/request responses for dev/eval. Cached replay is not a fresh model sample or provider latency. `--cache-only` permits offline dev replay and fails on cache misses; it is forbidden for held-out.

## Selection and final evaluation

Compare on development data first: safety, slot accuracy, ambiguity, complete action queues, latency and quota headroom. Report infrastructure errors separately. Historical Claude tools/workflow comparisons are in docs/12; do not infer that those rankings transfer to Gemini.

Human review of fresh requests/copy → resolve labels and freeze their new hash → freeze prompt, code and scorer → one complete fresh held-out run with the selected provider. Original Arabic and Sorani held-out sets are spent. Do not tune on any held-out result or reuse the same spent set to claim improvement. No fine-tuning is currently justified or implemented.
