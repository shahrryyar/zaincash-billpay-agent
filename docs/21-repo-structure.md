# 21 — Repository and running the implementation

Updated 2026-10-21. `package.json`, workspace package scripts and `.env.example` are the executable command/config references.

| Location | Responsibility |
|---|---|
| apps/web | Next App Router UI, API routes, session sandboxes and voice proxy |
| apps/wallet-api | Hono + SQLite mock wallet, seed, fees, token/idempotency checks and scheduled-payment runner |
| packages/core | Pure schemas, amount/time parsers, resolver, reducer, copy, Kurdish and voice gate |
| packages/llm | Anthropic/OpenAI-format clients, bounded read-only tool loop, workflow, cache, retries and token budget |
| packages/orchestrator | Common text/voice turn, deterministic effects, card confirmation, CLI/smoke |
| packages/asr | RegaLabs-compatible transcription client, WAV conversion/validation, fake and check command |
| eval | Scorer, developer/held-out datasets, voice scoring and measured reports |
| docs, brief, research | Committed specification, submitted design artifacts and recorded evidence |

## Commands

- `pnpm install --frozen-lockfile`
- `pnpm typecheck`, `pnpm test`, `pnpm build`
- `pnpm dev`: web on localhost:3000 with an in-process per-session mock wallet; no separate wallet process is required.
- `LLM_PROVIDER=fake pnpm dev`: scripted demo only, not arbitrary judge input.
- `pnpm cli`, `pnpm smoke`, `pnpm smoke -- --fake`
- `PW_CHROMIUM=/usr/bin/google-chrome pnpm --filter @zc/web e2e`: local Chrome override if Playwright's pinned browser is absent; CI installs its pinned Chromium.
- `pnpm eval -- --split dev --mode tools` (provider/model from env; there is no --provider switch).
- `pnpm eval -- --split readiness-dev --data eval/data/readiness.dev.jsonl --mode tools`: fully labelled development flows, including multiple payments.
- `pnpm stress`: refresh the multi-process wallet safety artifact deliberately.
- `pnpm --filter @zc/asr check /path/to/file.wav`
- `pnpm --filter @zc/eval eval:voice`: consented manifest required; no accuracy number without one.

Seed data is applied on wallet creation; the demo reset button calls the reset API. There is no `pnpm seed`. Standalone wallet: `pnpm --filter @zc/wallet-api dev`, optionally DB_PATH for a persistent wallet file. Hosted sandboxes remain in memory and expire/restart; pending schedules need a live retained sandbox.

## Configuration

Copy `.env.example` to `.env` and fill credentials locally. Never print or commit them. Use LLM_PROVIDER, LLM_MODEL, LLM_MODE, LLM_FALLBACKS and LLM_DAILY_TOKEN_CAP. LLM_CACHE=1 caches identical responses; LLM_CACHE=0 is needed for fresh-provider reliability/latency measurements.

Voice uses ASR_PROVIDER, REGALABS_API_KEY, REGALABS_BASE_URL and REGALABS_ASR_LANGUAGE=auto. The laptop Stage-11 path is `http://127.0.0.1:8790/v1` with its separate local key. Hosted/container deployments need a reachable endpoint of their own. No LiveKit settings or server are required. ASR_TIMEOUT_MS defaults to 15000; unknown confidence is read back by default.

Other hosted limits: TURNS_PER_10_MIN, SANDBOX_IDLE_MIN, SANDBOX_MAX. DEMO_MODE controls demo administration. The standalone wallet's admin requires its secret; hosted wallet administration is in-process and sandbox-local.
