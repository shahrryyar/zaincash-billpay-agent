# 20 — Build plan and delivery status

Updated 2026-10-25. The October organiser pack (docs/35) confirms that only 22/10 and 08/11 are fixed; every other date is tentative. It adds an Espresso Lab meet and greet (date TBC) and a booking link for the 20-minute MVP sessions, to be sent before sessions open. No date changed.

| Date | Deliverable | Current evidence |
|---|---|---|
| 22/10/2026 | Design brief, <=5 slides / 2 pages, PDF/PPTX, EN/AR, Name_Topic, GitHub link, Typeform | Brief files committed; author previously reported upload. Retain the receipt. |
| 08/11/2026 | Scored MVP: E2E core, repo/history, first measured test results, one-page update; 20-minute session when booking opens | Core built; dev/historical held-out evidence exists. Final update, rehearsal, live-host decision and human review still need evidence. Top 10 continue. |
| TBC | Progress review | Live judge input, independent held-out results, >=3 failure modes, full disclosure |
| TBC | Meet and greet (Espresso Lab) | Informal; after the design brief deadline |
| TBC | Demo Day | Live demo plus surprise input, final repo, one-page summary and measured results |

## Implemented

Text-first web/CLI; pure validation and state machine; duplicate-name resolution; confirmed transfers/bills; token/idempotency/fault paths; read-only tool loop; evaluation and CI; one-off scheduling; Arabic/Sorani picker; optional voice client/read-back; per-session mock sandboxes; Docker/Render configuration.

## Incomplete evidence, not missing architecture

- Human hand review/editing of fresh dialect requests and native review of copy; consented task recordings and WER/CER.
- Broader user tests beyond the five recorded young Sulaymaniyah interviewees; actual observed task success/trust/misread amounts.
- Fresh final result after scorer and code freeze. Spent Arabic/Kurdish sets must not be rerun. heldout2 stays reserved until review and freeze.
- Current Gemini development runs are in docs/30; historical Claude comparisons are not a controlled current-model comparison. Groq remains unmeasured.
- Judge run permission, deployment/account decision, demo rehearsal/backup and submission acknowledgement.

The 2026-10-21 readiness work is tracked in docs/29 and its follow-up execution report. Do not mark M5 hand-checking, voice evaluation or independent usability as complete because automated tests pass.

## Scope and stop rules

Never cut text, state-machine safety, ambiguity handling, explicit confirmation, idempotency, mock wallet, honest failures and evaluation. Cut TTS, fine-tuning, visual polish, then voice; WhatsApp stays outside this MVP. Keep scheduled transfers/bill payments and Sorani already built, with the same safety path.

Tune only on dev. Core invariant changes start with failing tests. Keep small author-attributed commits, real measured artifacts, and disclosure. Current development quality is not an independent held-out score. Do not claim production readiness or guaranteed challenge ranking.
