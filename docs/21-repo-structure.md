# 21 — Repository Structure

**As built (2026-10-17):** `apps/web` (Next 16, `server/engine.ts`, `server/voice.ts`, routes turn/confirm/cancel/tick/schedule-card/schedules/wallet/admin/voice), `apps/wallet-api` (Hono, `src/app.ts`, `db.ts`, `seed.ts`, `fees.ts`, `schedule.ts`), `packages/core`, `packages/llm`, `packages/orchestrator` (turn/confirm, CLI), `packages/asr` (voice), `eval/` (`src/run.ts`, `score.ts`, `stats.ts`, `wer.ts`, `voice.ts`, `data/`, `gen/`, `results/`, `voice/`). No `services/asr-bridge`, no LiveKit, no `pnpm seed` (the seed is applied on start; `/admin/reset`). Scripts: `dev`, `test`, `typecheck`, `build`, `eval`, `stress`, `cli`, `smoke`, `--filter @zc/asr check`, `--filter @zc/eval eval:voice`. Env: see `.env.example`.

Original plan:

```
zaincash-billpay-agent/
├─ README.md  AGENTS.md  CLAUDE.md
├─ docs/                         # this spec (00–25) + research/
├─ package.json  pnpm-workspace.yaml  tsconfig.base.json  .env.example
├─ apps/
│  ├─ web/                       # Next.js App Router, RTL UI, /api/turn, /api/confirm, /api/livekit-token
│  │  ├─ app/
│  │  ├─ components/ (Chat, CandidatePicker, ConfirmCard, ResultCard, MicButton, WhyPanel, AdminFaults)
│  │  └─ server/orchestrator.ts
│  └─ wallet-api/                # Hono + SQLite mock wallet
│     ├─ src/routes/ (users, contacts, billers, quotes, transfers, billPayments, admin)
│     ├─ src/db/ (schema.sql, migrations)
│     └─ seed/seed.json
├─ packages/
│  ├─ core/                      # PURE: schema.ts, normalise.ts, amount.ts, resolver.ts, machine.ts, copy.ts
│  │  └─ test/                   # invariants (Vitest)
│  └─ llm/                       # anthropic.ts, openai-compat.ts, tools.ts, prompt.ts, cache.ts, index.ts (Understander)
├─ eval/
│  ├─ data/ (dev.jsonl, heldout.jsonl, heldout.sha256)
│  ├─ voice/ (manifest.jsonl, *.webm)
│  ├─ gen/ (generation prompts + scripts)
│  ├─ run.ts  metrics.ts  stress.ts
│  └─ results/
└─ services/asr-bridge/          # optional FastAPI/TS bridge to RegaLabs ASR if needed
```

## Scripts
| Command | Does |
|---|---|
| `pnpm dev` | wallet-api :8787 + web :3000 |
| `pnpm test` | Vitest all packages |
| `pnpm seed` | reset wallet DB from seed.json |
| `pnpm eval --split dev\|heldout --provider anthropic\|groq\|gemini\|all --mode tools\|workflow` | evaluation |
| `pnpm stress` | idempotency/token stress tests |

## `.env.example`
```
LLM_PROVIDER=anthropic   # anthropic|groq|gemini|openrouter|local
LLM_MODE=tools           # tools|workflow
ANTHROPIC_API_KEY=
LLM_MODEL=claude-haiku-5-5
LLM_HARD_MODEL=claude-sonnet-5-5
LLM_FALLBACKS=groq,gemini,local
GROQ_API_KEY=
GEMINI_API_KEY=
LLM_DAILY_TOKEN_CAP=
LLM_CACHE=1
WALLET_API_URL=http://localhost:8787
DEMO_MODE=1
ADMIN_SECRET=
LIVEKIT_URL=
LIVEKIT_API_KEY=
LIVEKIT_API_SECRET=
REGALABS_ASR_AGENT=          # agent name / dispatch id
REGALABS_ASR_MODE=streaming  # streaming|offline
ASR_CONF_LOW=0.5
ASR_CONF_HIGH=0.8
CONFIRM_TOKEN_TTL_S=120
```

## Conventions
- Money: integer IQD, type `type IQD = number & {__brand:"IQD"}`.
- No I/O in `packages/core`.
- Commit style: Conventional Commits (`feat(core): resolver handles kunya`).
