# MEMORY.md — project state for humans and AI assistants

Short, current, no secrets. Update when a decision changes. Full spec lives in `docs/` (**local only, gitignored**), so anything critical is repeated here.

## What this is
ZainCash Agentic AI Challenge Iraq, **Topic 04: Bill Pay & Transfer Agent**. Solo entry: Shahryar Sabir (RegaLabs). One Iraqi Arabic sentence in, one confirmed exactly-once transaction out, against a **mock** wallet with **synthetic** data.

## Deadlines (organiser pack, 11/10/2026)
| Date | What |
|---|---|
| 22/10/2026 | Design brief (not scored). **Uploaded.** Source in `brief/` (gitignored). It names this repo: github.com/shahrryyar/zaincash-billpay-agent |
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
- **LLM:** Claude primary (Haiku 5.5 live; Sonnet 5.5 only as comparison: not better on dev). Groq/Gemini/OpenRouter/local fallbacks are wired but need keys. Anthropic has no free tier; free tiers may train on prompts, so synthetic data only. Prompt caching on the stable prefix keeps cost low (per request ~150 normal input + ~3.5k cache-read + 170-380 output). Budget cap in code is `LLM_DAILY_TOKEN_CAP` (tokens, per process); the real cap is the spend limit on the Anthropic workspace.
- **Agentic design:** read-only tool loop (max 4 calls) + `propose`. `tools` beat `workflow` on dev (97.5% vs 90.0% at the time), so tools is the default. The model has no tool that pays, confirms, schedules or cancels.
- **Stack:** TypeScript, pnpm, Next 16 web, Hono + SQLite mock wallet, Zod, Vitest. No agent framework on purpose.
- **Fees/limits** come from ZainCash's public Fees & Limits page (read 2026-10-16), in `apps/wallet-api/src/fees.ts` with source and date.
- **Scheduling** (docs/27): model copies the time words, `packages/core/src/when.ts` computes the instant, the approved instant is part of the confirmation token, wallet runner pays once, re-checks everything at run time.
- **License:** proprietary, all rights reserved, until the author changes it. Judges/organisers need written permission from the author to run it.
- **Voice:** RegaLabs ASR via LiveKit is the author's own pre-existing service (disclosed). Blocked on the author giving connection details. Text path never depends on it.
- **Evidence finding:** 500 App Store reviews: pain is failed/stuck money, support, fees, KYC, fraud, not "too many taps". Lead with safe/honest/recoverable.
- **No human labels, no interviews.** Test labels are LLM-made (agy, Fable, Haiku, adjudicated). docs/17 has no interviews and must never get invented ones.

## Status (2026-10-16 end of day)
- Built and pushed (main = origin/main, 67f5e24): core (333 tests), llm (74), wallet-api (102), orchestrator (113), eval (13), web app. CI: typecheck, test, build, gitleaks.
- **Tested by hand in real Chrome (bsk), not only by tests:** instant message + typing indicator, hero flow with real fee, schedule create/confirm/list/cancel, clock advance + notification, failed scheduled run, «جدولها» button, typed «اجدولها», date-only flow, out-of-scope replies, timeout-after-commit retry, Arabizi follow-up, biller alias.
- **Dev (Haiku 5.5, tools):** 92.5% e2e (111/120), S1 0/120. **Schedule dev:** 26/26 (dev only). Dev was tuned, so it is optimistic.
- **HELD-OUT RUN ONCE** (commit 1445bff, hash 13e0fa33…): e2e **81.1%** [74.8, 86.2] n=180; state acc 81.3%; ambiguity recall 100% (n=42), precision 73.7%; **S1 unsafe execution 0/180 (upper 95% bound 1.7%)**; card on must-not-execute 1/100; p50/p95 to card 2.3 s / 3.7 s. **Held-out is spent: never re-run it to chase a number; any change needs a fresh set and must be disclosed.** Analysis: `eval/results/heldout-haiku-tools.md`. Misses: «نفس المبلغ مال اخر مرة» (`previous` not implemented, asks), malformed chatter answered as out_of_scope (safe; label says rephrase), «ورقة/دفتر» asked instead of refused, descriptor words after a name.
- `.env` is complete except values only the author has: GROQ/GEMINI/OPENROUTER keys+models, LOCAL_BASE_URL/MODEL, LIVEKIT_*, REGALABS_ASR_AGENT.

## Next steps
1. **Voice** (M7): needs RegaLabs/LiveKit details from the author. Text path stays independent.
2. **One-page MVP update for 08/11** (use the measured numbers above, say held-out was run once, say labels are LLM-only).
3. docs/19 final (Human vs AI summary), docs/13 failure modes with the held-out misses, docs/23 Q&A refresh.
4. Demo rehearsal x3 (docs/18) incl. the scheduling segment («قدّم الوقت ساعة» in the demo panel) and a screen recording backup.
5. Real interviews are the biggest missing score: send the 5-question voice-note kit in docs/17 to 2 real ZainCash users; if impossible, say "hypotheses only".
6. Possible improvements (need a fresh test set to measure): `previous` («نفس المرة الفاتت»), refuse «ورقة/دفتر», clarification order (unit before recipient), Latin-letter time words.
7. Add OSV-Scanner to CI. Ask organisers: judge input text or voice, demo format, may judges run a proprietary-licensed repo.

## Working rules (from the author)
- **Commits are authored by the author only: no `Co-Authored-By` trailer, no "Generated with" footer.** Small commits, imperative subject.
- **Test with real Chrome (`bsk`) and do not assume.** Chat like a real person (typos, follow-ups, corrections, small talk), not only scripted sentences.
- **Do the work with the AI tools (me, Haiku, Fable, agy); do not hand tasks to the author.** Exception: never fabricate evidence (interviews, labels checked by "a human", numbers).
- `.env` is mine to edit for config; never print keys. Key must be workspace-scoped on Anthropic.
- Restart `pnpm dev` after changing core/orchestrator/llm code (the web engine is a singleton).
- Typecheck exit code matters: do not pipe it into `tail`/`head` and trust the status.
- Check `git push` really pushed (`git status -sb`). Never commit `.env`.
- Disclosure of AI tools stays in `docs/19`.

## Open-source findings (docs/research/03, local)
- No Arabic number-word parser exists in JS; `pyarabic` (GPL) got 8/24 on Iraqi money phrases with silent wrong answers. Own parser stays.
- Jaro-Winkler cannot separate same-person typos from different people (حسن/حسين 0.933). Fuzzy only proposes candidates; user always picks. Fuse.js rejected.
- Own code on the money path (normaliser, parser, JW, reducer). Libs: Zod, Hono, better-sqlite3, Anthropic SDK. Dev: fast-check, promptfoo, jaro-winkler (oracle).
- Add gitleaks + OSV-Scanner to CI. Avoid GPL/NC assets (pyarabic, MADAR mirrors, factlogic corpus).

## Open questions
Repo is **public** (decided) but the license grants nothing to anyone but the author. Still unanswered by the organisers: whether the RegaLabs ASR is acceptable (author emailed, no reply), whether judge input includes voice, demo format. Contributor sidebar may show an old co-author from rewritten history; the author said that is acceptable.

## Run
`pnpm install && pnpm typecheck && pnpm test`; app: `pnpm dev` (http://localhost:3000); eval: `pnpm eval -- --split dev --mode tools` (held-out refuses to run: spent).
