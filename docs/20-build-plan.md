# 20 — Build Plan

Dates are **real** (organiser pack, 11/10/2026). Only 22/10 and 08/11 are fixed; the rest is tentative.

## Status 2026-10-17
Done early: M0–M6 and M8 (core, wallet, LLM, web, data, eval, demo panel), scheduling (docs/27), design brief uploaded.
**The held-out set was run once on 16/10** (earlier than the plan below): E2E 81.1%, S1 0/180. It is spent; the MVP
update reports it as the single held-out run, plus dev numbers labelled as tuned. M7 voice: built and tested with a
fake ASR (docs/09); waits for a RegaLabs key and `acm` in the gateway allow-list; WER needs recordings.
Left: voice key + recordings, interviews (author), native dialect review, demo rehearsal ×3, MVP one-pager (docs/28).

## Timeline

| Date | Gate | Needs |
|---|---|---|
| **22/10** | Design brief (not scored) | ≤5 slides / 2 pages, PDF/PPTX, EN or AR, file `Name_Topic`, GitHub link, upload via Typeform |
| TBC | Meet & greet, Espresso Lab | — |
| **08/11** | **MVP (scored)** + 20-min session | Core works E2E, repo + commit history, **first results on a test set**, 1-page update. Top 10 advance |
| TBC | Progress review (finalists) | Live demo on judge input, **held-out** results, ≥3 failure modes, full disclosure |
| TBC | Demo Day | Live demo + 1 surprise input, final repo, 1-page summary, eval results |

Same 6 criteria score every stage (docs/00). MVP is already judged on reliability, so core safety ships first.

## Milestones (dependency order)

| M | Deliverable | Done when |
|---|---|---|
| M0 | Repo, pnpm, CI Vitest, `.env.example`, `.gitignore` (.env) | `pnpm test` green; pushed to GitHub |
| M1 | `packages/core`: schema, normaliser, `parseAmount`, resolver, machine, copy | Invariant tests pass |
| M2 | Mock wallet: seed, quotes, transfers, bill-payments, idempotency, tokens, faults | Token + idempotency tests incl. 20× concurrent |
| M3 | LLM adapters (Claude + OpenAI-format fallbacks), read-only tools, both modes; orchestrator `/api/turn`, `/api/confirm` | CLI: sentence → card JSON |
| M4 | Web UI: chat, picker, confirm card, results, RTL | Hero scenario by text |
| M5 | Data: seed final, dev + held-out, hash frozen | ≥150 held-out, hand-checked |
| M6 | Eval harness + first run (Haiku, Sonnet, best free; tools vs workflow) | Real numbers + CIs in docs/12 |
| M7 | Voice: RegaLabs ASR developer API (LiveKit dropped, docs/09), confidence gating + read-back. **Spike in week 0–1, full by MVP if it passes** | Hero by voice; WER measured |
| M8 | Demo polish: "Why?" panel, fault toggle, rehearse ×3 | Demo < 5 min |
| M9 | Docs final: disclosure, failure modes, results, interviews | Checklist ✅ |
| M10 | Stretch: WhatsApp, Kurdish, TTS | Only if M0–M9 solid |

## Week plan to MVP

| Week | Dates | Goal | Ships |
|---|---|---|---|
| 0 | 15–22/10 | Brief + repo + start | Design brief submitted; repo ready; M0; M1 started; **research docs (done: R1/R2; teardown TODO)**; interviews if possible; **start dev-set generation**; **voice spike** (LiveKit + RegaLabs: answers doc 09 checklist) |
| 1 | 23–29/10 | Safe core | M1, M2, M3 done (**both arms: workflow + tool loop**). Hero scenario via CLI. Property + concurrency tests in CI (docs/26) |
| 2 | 30/10–5/11 | Usable + measured | M4, M5, M6. First dev results + ablation; held-out frozen (hash); **voice in the app if the spike passed** |
| 3 | 6–8/11 | MVP | MVP run on **dev** (held-out untouched), 1-page update, demo rehearsal. **Submit 08/11** |
| After | Nov+ | Finals prep | M7 voice, M8, M9; held-out run once; failure modes; disclosure |

## Rules
- Commit daily, Conventional Commits. Commit history is a gate.
- **Held-out is never used for tuning.** MVP results = dev split; held-out run once, for the progress review.
- Stop rule each day: tests green, pushed, docs updated.
- MVP cut order (if late): voice → polish → WhatsApp. Voice stays only if the spike is good; the author tests it personally before committing. Never cut the never-list (docs/02).
