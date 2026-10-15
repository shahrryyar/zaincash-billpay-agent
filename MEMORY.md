# MEMORY.md — project state for humans and AI assistants

Short, current, no secrets. Update when a decision changes. Full spec lives in `docs/` (**local only, gitignored**), so anything critical is repeated here.

## What this is
ZainCash Agentic AI Challenge Iraq, **Topic 04: Bill Pay & Transfer Agent**. Solo entry: Shahryar Sabir (RegaLabs). One Iraqi Arabic sentence in, one confirmed exactly-once transaction out, against a **mock** wallet with **synthetic** data.

## Deadlines (organiser pack, 11/10/2026)
| Date | What |
|---|---|
| 22/10/2026 | Design brief (not scored). Done locally in `brief/` (gitignored). Upload via Typeform. |
| 08/11/2026 | **MVP, scored.** Core works end to end, repo + commit history, first test-set results, one-page update. Top 10 continue. |
| TBC | Progress review, Demo Day |

Accepted into the build stage already. Elimination is after the MVP.

## Prime directive
**The LLM understands. Deterministic code moves money.** The model may call read-only tools and `propose` a pending card. It has no payment tool, no token access, no wallet write.

## Invariants (tests must enforce)
1. No execution without a valid confirmation token (single-use, 120 s, bound to payload hash).
2. No duplicate debit under retry (idempotency key per card; same key = stored result).
3. Ambiguity means ask, never guess.
4. Fail closed: any doubt, nothing is sent, honest message.
5. Invalid model output never reaches execution (Zod).
6. Iraqi Arabic is the default for all user-facing text (one copy file).
7. Synthetic data only. Keys only in `.env`.

## Decisions
- **LLM:** Claude primary (Haiku 5.5 live, Sonnet 5.5 hard cases; paid, spend-capped). Groq and Gemini 3 Flash-Lite as free fallbacks. Anthropic has no free tier; free tiers may train on prompts, so synthetic data only.
- **Agentic design:** read-only tool loop (max 4 calls) plus `propose`; ablation vs plain workflow on the dev set.
- **Stack:** TypeScript, pnpm workspaces, Next.js (web, later), Hono + SQLite (wallet), Zod, Vitest. No LangGraph or agent framework on purpose.
- **Voice:** RegaLabs Iraqi-Arabic ASR via LiveKit is the author's own pre-existing service, disclosed. Ships only if a spike passes before the MVP. Text path never depends on it.
- **Evidence finding:** 500 App Store reviews show pain is failed/stuck money, maintenance, support, fees, KYC, fraud. None asks for fewer taps. Lead with safe/honest/recoverable; test the fewer-steps premise in interviews.
- **Held-out set is never tuned on.** MVP numbers come from the dev split. Never invent eval numbers.

## Status
- [x] Planning docs, research, design brief (local).
- [x] M0: pnpm workspace, CI, `.env.example`, smoke tests green.
- [x] **M1 done** (`packages/core`, 257 tests): normaliser, `parseAmount`, Zod schema + cross-checks, token guard, Jaro-Winkler + resolver, `amountInWords`/`formatIQD`, copy table, state machine reducer (5k random + 5k guided sequences, mutation-tested 16/16).
- [x] **M2 done** (`apps/wallet-api`, 70 tests, 17/18 then 18/18 wallet mutants killed): Hono + SQLite mock wallet, one BEGIN IMMEDIATE txn per execute, token issue endpoint, quotes, fault injection, audit log. Measured: `eval/results/wallet-safety-stress.json` (4 OS processes, 1,000 requests: 50 executions, 950 replays, 0 duplicates). Run `pnpm stress`.
- [x] **M3 built and tested OFFLINE** (scripted model): `packages/llm` (62 tests: Claude + OpenAI-format adapters, retry/budget/fallback/cache, env factory, agent loop with 5 read-only tools + `propose`), `packages/orchestrator` (93 tests + safety property test; mutation-tested 18/18): hero scenario, clarification, cards, cancel/expiry/edit, retries, lookup, faults. **Live model NOT yet run: needs `ANTHROPIC_API_KEY` in a local `.env` (copy `.env.example`).** Then `pnpm --filter @zc/orchestrator smoke` (15 sentences, sanity only) and `... cli`.
- [ ] M4 web UI. M5 data. M6 eval. M7 voice. M8 demo. M9 docs.

## Next steps
1. Add `.env` with the Anthropic key, run `smoke` (tools vs workflow), fix prompt on what fails. 2. M4 web UI (Next.js RTL) calling `turn`/`confirm`. 3. Dev set generation (M5) + eval harness (M6).
2. Start dev-set generation early (runs in background).
3. Voice spike (LiveKit + RegaLabs) in week 1.
4. 2 to 3 interviews if possible; log in `docs/17`.
5. Commit small and often (commit history is a judging gate).

## Open-source findings (docs/research/03, local)
- No Arabic number-word parser exists in JS; `pyarabic` (GPL) got 8/24 on Iraqi money phrases with silent wrong answers. Own parser stays.
- Jaro-Winkler cannot separate same-person typos from different people (حسن/حسين 0.933). Fuzzy only proposes candidates; user always picks. Fuse.js rejected.
- Own code on the money path (normaliser, parser, JW, reducer). Libs: Zod, Hono, better-sqlite3, Anthropic SDK. Dev: fast-check, promptfoo, jaro-winkler (oracle).
- Add gitleaks + OSV-Scanner to CI. Avoid GPL/NC assets (pyarabic, MADAR mirrors, factlogic corpus).

## Open questions
Repo public or private (currently private; organisers need access), whether RegaLabs ASR is acceptable (asked, no reply), whether judge input includes voice.

## Run
`pnpm install && pnpm typecheck && pnpm test`
