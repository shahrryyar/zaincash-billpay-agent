# 03 — Architecture

## Principle
**LLM understands. Deterministic code executes.** Same input → same outcome in the execution layer.

## Layers

```
┌──────────────────────── CHANNEL ────────────────────────┐
│  Web app (Next.js, phone-shaped, RTL)   [WhatsApp later]│
│   ├─ Text box  ─────────────────────────────┐           │
│   └─ Mic (push-to-talk) → /api/voice → RegaLabs ASR ┤ text│
└─────────────────────────────────────────────┼───────────┘
                                              ▼
┌──────────────────── LANGUAGE LAYER (model) ──────────────┐
│ 1. Normalise text (digits, alef/ya/ta-marbuta, tatweel)  │
│ 2. LLM agent loop (≤4 read-only tool calls, then JSON)   │
│    Reads via masked tools. Can `propose`, never execute. │
└──────────────────────────────┬───────────────────────────┘
                               ▼
┌──────────────── EXECUTION LAYER (deterministic) ─────────┐
│ 3. Zod schema validation        invalid → ask rephrase   │
│ 4. Amount cross-check           LLM amount vs parser     │
│ 5. Resolver: contacts/billers   0 → unknown, >1 → ask    │
│ 6. Pre-checks: balance, limits, biller status            │
│ 7. State machine → AWAITING_CONFIRM + confirmation token │
│ 8. User taps Confirm (UI only — not the model)           │
│ 9. Execute: token + idempotency key → Mock Wallet API    │
│10. Result → honest message (dialect copy table)          │
└──────────────────────────────┬───────────────────────────┘
                               ▼
┌──────────────────── MOCK ZAINCASH WALLET ────────────────┐
│ Hono + SQLite: users, contacts, billers, bills, balances,│
│ transactions, idempotency_keys, confirmation_tokens,     │
│ audit_log. Fault injection: latency, timeout, 5xx.       │
└──────────────────────────────────────────────────────────┘
```

## Components

| Component | Location | Responsibility | I/O? |
|---|---|---|---|
| `normalise` | packages/core | Arabic/Arabizi/digit normalisation | pure |
| `intentSchema` | packages/core | Zod discriminated union (docs/05) | pure |
| `parseAmount` | packages/core | Deterministic dialect money parser (docs/08) | pure |
| `resolver` | packages/core | Fuzzy-match mentions → contact/biller candidates | pure (data passed in) |
| `machine` | packages/core | State machine + guards (docs/04) | pure |
| `copy` | packages/core | All user-facing strings (ar-IQ, ku, en) | pure |
| `llm` | packages/llm | `understand(text, ctx, tools) → unknown JSON`; selected provider (current Gemini), optional fallbacks | network |
| `tools` | orchestrator | Read-only tool handlers (docs/05 §Tools): masked, session-scoped handles | wallet GET only |
| `asr` | packages/asr + apps/web `/api/voice` | RegaLabs ASR developer API (HTTP), WAV helpers, fake; voice gate in core | network |
| `orchestrator` | packages/orchestrator (used by apps/web API routes, the CLI and the eval) | Wires LLM → core → wallet | network |
| `wallet-api` | apps/wallet-api | Mock ZainCash API | db |
| `eval` | eval/ | Runs held-out set through orchestrator; metrics | — |

## Why no agent framework
The flow is a fixed, auditable sequence. LangGraph or multi-agent setups would add nondeterminism and debugging cost with no evaluation gain. Judges weight "no unjustified complexity" at 20%. The "agentic" part is the model turning messy dialect into structured action plans and driving the clarification dialogue. The money path stays boring on purpose.

## What the LLM sees and can do (agentic, bounded)
The model runs a **short loop**: read tools → decide → `propose`. Max **4 tool calls** per turn, then it returns the final intent JSON.

| Allowed (read-only, no side effects) | Never available |
|---|---|
| `search_contacts`, `get_balance`, `list_bills`, `get_history`, `quote` | any `execute_*`, `confirm`, token mint/read, wallet write |
| deterministic clarification copy from the state machine | raw contact lists, full phone numbers, account ids |
| `propose` (creates a **pending** card; no money moves) | |

Guarantees (details in docs/05 §Tools):
- **Grounded resolution.** Tool results carry session handles (`c1`, `c2`) for lookups. `propose` carries the full Intent with the user's recipient words, not a selected handle; deterministic code resolves again and asks about ambiguous names.
- **Amounts come from the user's words.** `source_text` must appear in the input and agree with `parseAmount`.
- **Complete mediation (OWASP LLM06).** Every tool call and `propose` is re-validated server-side. Execution still needs the confirmation token (docs/07). A fully hostile model can propose a wrong pending card; explicit user approval could still authorise that wrong proposal, which is why the readable card, source checks and wrong-payload evaluation matter.
- **Data minimisation changes.** Masked **synthetic** contact data now reaches the LLM provider through tool results. Phones masked (`••4471`); synthetic balances/quotes and the raw user text also reach the provider (docs/14). Disclose in docs/19.
- **Ablation (docs/26):** arm A = single-call workflow (JSON intent + deterministic resolver) vs arm B = tool loop, same dev set and metrics. Keep the safer arm, then the more accurate, then the cheaper.

## Request lifecycle (happy path)
1. `POST /api/turn {session_id, text, lang?}`; audio goes to `POST /api/voice`
2. Orchestrator: normalise → LLM → Zod → amount cross-check → resolver → pre-checks.
3. State `AWAITING_CONFIRM`: server stores `{payloadHash, token, expiresAt, idempotencyKey}` and a `card_id` and returns the confirmation card model.
4. User taps Confirm → `POST /api/confirm {session_id, card_id}`; token and key stay server-side.
5. Orchestrator → `POST wallet/transfers` with `Idempotency-Key`. On timeout it retries with the same key.
6. Result → `EXECUTED` card with reference, or `FAILED_SAFE` with an honest message.

## Latency budget (target, measure in eval)
| Step | Target |
|---|---|
| ASR final transcript | measure after the utterance upload; current HTTP path is not streaming |
| LLM intent | ≤ 2.0 s |
| Resolve + checks | ≤ 50 ms |
| Execute (mock) | ≤ 300 ms |
| **Text request → confirmation card** | **≤ 3 s p50 (workflow arm), ≤ 6 s p50 (tool-loop arm)** — measure both |

## As built (2026-10-17)
- Measured latency to card (held-out, tools mode): p50 2.3 s, p95 3.7 s. Workflow arm on dev: p50 1.3 s.
- Voice converges at the same `turn()` after the voice gate (docs/09). No LiveKit.
- The web app runs the mock wallet in-process (`apps/web/server/engine.ts`); `apps/wallet-api` can also run standalone.

## Stack
TypeScript everywhere (pnpm workspaces). Next.js + Tailwind (web), Hono + SQLite (wallet), Zod (contracts), Vitest (tests). FastAPI only if a Python-only tool is needed (e.g., WER computation with `jiwer`, or a RegaLabs SDK).
