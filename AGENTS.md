# AGENTS.md — Instructions for AI coding assistants

You are helping a **solo builder** ship the ZainCash Agentic AI Challenge, **Topic 04: Bill Pay & Transfer Agent**, on a real timeline: **design brief 22/10, MVP 08/11** (docs/20). Read `README.md`, then the doc relevant to your task in `docs/`. The docs are the spec. If code and docs disagree, stop and ask.

## Prime directive

**The LLM understands. Deterministic code moves money.**

- The LLM outputs a JSON intent. It may call **read-only tools** (search contacts, balance, bills, history, quote) and `propose` a *pending* card (docs/05 §Tools). It has **no tool that executes a payment**, no wallet write, no token access, and its output never reaches the wallet API without passing Zod validation and the state machine.
- Every contact, biller, amount, and balance shown to the user comes from the mock wallet database — never from model text.

## Non-negotiable invariants (tests must enforce each)

1. **No execution without a valid confirmation token.** Token is server-issued, single-use, short-lived, and bound to a hash of the exact payload. (docs/07)
2. **No duplicate debit under retry.** Every execute call carries an idempotency key; the same key returns the stored result. (docs/07)
3. **Ambiguity → ask, never guess.** More than one candidate contact/biller, missing amount, or two actions in one sentence must produce a clarification, not an execution. (docs/04)
4. **Fail closed.** Any validation error, unknown entity, insufficient balance, service down, or low ASR confidence ends in a safe state with an honest message. Nothing is sent. (docs/13)
5. **Invalid model output never reaches execution.** Zod rejects → ask the user to rephrase. (docs/05)
6. **Iraqi Arabic is the default** for all user-facing text. Copy lives in one file; see docs/15.
7. **Synthetic data only.** No real customer data, no real payment rails.

## Stack (decided)

- TypeScript monorepo, pnpm workspaces.
- `apps/web`: Next.js (App Router), Tailwind, RTL, phone-shaped UI.
- `apps/wallet-api`: Hono + SQLite (better-sqlite3 or Drizzle) — the mock ZainCash wallet.
- `packages/core`: Zod schemas, state machine, resolver, normaliser, copy strings. **Pure, no I/O, fully unit-tested.**
- `packages/llm`: Claude (Haiku/Sonnet 5.5, paid, capped) primary; OpenAI-format fallbacks (Groq, Gemini, OpenRouter, local). Read-only tool loop + `propose` (docs/05).
- `eval/`: TypeScript harness; Python/FastAPI only if needed (e.g., WER tooling).
- `packages/asr`: speech to text for the optional voice path — RegaLabs Iraqi-Arabic ASR via its OpenAI-compatible developer API (`/v1/audio/transcriptions`, server-side key), plus a fake for tests (docs/09). Voice transcripts enter the same orchestrator turn as text, after the confidence gate / read-back. Never block the text path on it.

Do **not** add LangGraph, vector DBs, multi-agent orchestration, or microservices. A plain state machine is the deliberate choice (judges reward "simple and reliable").

## Working rules

- Commit small and often with clear messages — commit history across the build period is a judging gate.
- Write tests first for `packages/core` invariants.
- Never fabricate evaluation numbers. Report what the harness measures.
- Free LLM tiers may train on prompts: **synthetic data only**. Claude key is paid: respect `LLM_DAILY_TOKEN_CAP` (tokens per process per UTC day; prices are not assumed) and the spend limit on the Anthropic workspace. Keys in `.env` (gitignored), never committed. Cache LLM responses in dev/eval; backoff on 429.
- **Never tune on held-out.** MVP numbers come from dev; held-out runs once.
- Keep the never-cut list intact (docs/02). If time is short, cut in this order: TTS → fine-tuning → visual polish → voice.
- Disclose every model, library, and AI assistant used — append to docs/19 as you go.
- When unsure about Iraqi dialect wording, flag it with `<!-- VERIFY-DIALECT -->` for the human to check.
