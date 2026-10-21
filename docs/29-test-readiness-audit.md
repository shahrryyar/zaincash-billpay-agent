# Test readiness audit — 2026-10-21

Reviewed against `docs/00-official-brief.md`, the dated deliverables in `docs/20`, numbered planning docs, public submission docs, evaluation data/results, CI, and the relevant implementation/tests. Baseline commit: `7ed356c`.

**Verdict: ready to begin exploratory testing; resolve evaluation gaps and spec conflicts before the final held-out run or submission.** The core exists. The largest gaps are human evidence, measurement coverage, and inconsistent descriptions of what is built.

This is an audit, not a payment-path change. Existing held-out sets were not rerun, edited, or used as input to new tests. No paid-provider calls were made. Organiser rules below are the locally recorded September brief and October pack; no new organiser confirmation was obtained.

## Checks performed in this audit

| Check | Outcome |
|---|---|
| `pnpm test` | PASS: 872 tests across 39 test files. Core 465; ASR 34; LLM 81; wallet 104; orchestrator 151; eval 25; web 12. |
| `pnpm typecheck` | PASS, exit 0. |
| `pnpm smoke -- --fake` | PASS: 15/15. Scripted pipeline coverage, not model-quality evidence. |
| `PW_CHROMIUM=/usr/bin/google-chrome pnpm --filter @zc/web e2e` | PASS: production Next build and 9/9 browser scenarios. Default launch first failed because Playwright's expected browser revision was absent; the configured local-Chrome override succeeded. |
| Ambiguous time reproduction | `parseWhen("باچر بعد الظهر", Date.UTC(2026,9,21,6))` returns `ok` for 22/10 at 12:00 Baghdad, rather than asking for an hour. |
| Commit history | Local history contains commits on 15, 16, 17 and 19 October. Remote accessibility/current CI were not checked. |

Fresh secret/dependency scans, Docker image execution, deployed-host checks, real-model eval, live microphone/ASR, accessibility inspection and independent usability testing were not performed by this audit. Configured CI jobs are not evidence that the latest remote run passed.

### Local Stage-11 ASR update supplied during the audit

The author reports a working laptop-only OpenAI-compatible endpoint at `http://127.0.0.1:8790/v1/audio/transcriptions`, served by `rega-asr-work/local-asr/server.py`. ZainCash is configured with `ASR_PROVIDER=regalabs` and `REGALABS_BASE_URL=http://127.0.0.1:8790/v1`; its separate local key is held outside version control and was not inspected or printed by this audit.

Reported client checks: correct Sorani transcription with language `ckb` in 2.9 seconds; a 2.4-second Iraqi-Arabic phone clip detected as `ar` in 0.7 seconds; wrong key rejected with 401. These are author-reported spot checks, not independent measurements here, corpus accuracy or complete voice-payment E2E. Local API access is therefore available for testing; a paid hosted API key is no longer a prerequisite for laptop voice testing.

The service runs on CPU while the GPU trains the corrector; reported typical sentence latency is about three seconds against a 15-second client timeout. It does not start on boot and takes about 85 seconds to load. Start from `local-asr/` with the author's command: `nohup /home/jackal/Desktop/idk/nemo-venv/bin/python server.py > server.log 2>&1 &`. Confirm readiness before opening the demo; do not mistake model warm-up for per-request latency. A remote hosted web server cannot reach this laptop's loopback address, and a Docker container's loopback is its own: those deployments need a separately configured reachable ASR endpoint.

Still missing: real microphone-to-read-back-to-card-to-confirm checks, representative consented recordings with human references, WER/CER and amount/name survival, longer/noisy speech latency, and local-server-unavailable/text-fallback tests. Disclose the exact Stage-11 checkpoint/provenance and prior work before reporting its accuracy; do not attribute local Stage-11 results to the hosted RegaLabs service.

## Organiser requirement coverage

| Requirement | Evidence in repo | Remaining work / acceptance |
|---|---|---|
| Natural-language Iraqi Arabic; text first | Core parsers/resolver, LLM adapters, web, Arabic dev/held-out results | Test the intended live provider on unscripted inputs; retain Arabic as default. |
| Readable explicit confirmation before payment | Payload-bound, session-bound, single-use, 120-second tokens; wallet and machine tests; confirmation card | Verify real users read recipient, masked phone, amount, fee and balance correctly. Typed/spoken yes must never bypass the button. |
| Ask about ambiguity | Duplicate/similar-name seed; clarification tests; historical Arabic recall 100% | Test Kurdish spelling variants and vague times. Existing known cases auto-resolve or invent precision; see below. |
| No double payment on retries | Atomic SQLite execution; multi-process tests; stored stress report | Keep ledger assertions in the full test run, including lost confirmation response and different keys sharing one token. |
| Honest safe failure | Failure copy, UNKNOWN_OUTCOME/recheck, injected faults, public failure-mode table | Check failure code and displayed claim, not just final state. Unknown outcome must never claim unchanged balance. |
| Mock wallet only, synthetic customer records | Seed, Hono/SQLite wallet, mock badge, no real payment connection | Keep actual personal/account data out of requests, captures and logs. |
| LLM-generated data, >=50 dialect requests including ambiguous/malformed | 120 Arabic dev + 180 original held-out; fresh 180-case heldout2; Kurdish sets | Quantity is covered. **Human editing/review for realism is not covered.** |
| Data edited/check-sampled by hand | Explicitly absent in docs/11, data README and disclosure; blank review sheets | Have a human review the fresh sample and copy; record actual count, edits and reviewer role. Human labelling of every row is an internal docs/11 ambition; the brief explicitly requires hand editing/realism and sample checking. |
| Held-out results, no tuning on held-out | Arabic 81.1% at `1445bff`; Kurdish 92.2% at `49319bd`; frozen hashes | Those sets are spent. Current code needs a properly measured fresh run after review and freeze. Do not represent historical scores as current verification. |
| Results on requests that should not go through | No-confirm checks, unsafe-card metric, wallet invariants | Correct the S1 definition/denominator and add stronger wrong-card evaluation before publishing new safety claims. |
| Repository history spanning build period | Multiple local commit days; repo link in public docs | Verify judge access and that the intended code/evidence are pushed. Continue real development history. |
| Live run on judge-supplied input | App and real-provider adapters exist | Scripted fake mode cannot satisfy this gate. Rehearse with an unseen human request using the actual intended provider. |
| Full model/library/tool/data disclosure | `DISCLOSURE.md`, docs/19 | Include this Codex audit; remove contradictory privacy and fallback claims elsewhere. |
| >=3 documented failure modes | Public file has FM-01 through FM-21 | Covered; checklist's count of 16 is stale. Keep limitations separate from claims of mitigation. |
| Evidence of speaking to users (20% of score) | Five real interviews, recorded in CSV and docs/17 | Covered at a basic level, but narrow ages/city; no exact quotes, trust observations or Arabic phrasing. Broaden with older/assisted and Arabic-speaking users, record reasons for refusal and actual task outcomes. |
| Voice | Client, gate/read-back, fake tests | Stretch only. No recordings, WER/CER or real-service evidence established here. Keep optional until tested. |

The brief's hard gates are history, live judge input, disclosure and documented failure modes. Targets such as 90% E2E, five voice speakers, usability success 4/5 and native review of >=50 items are project acceptance targets, not additional organiser gates.

## Before spending heldout2: evaluation findings

1. **S1 does not measure its documented definition.** In `eval/src/run.ts`, `unsafe_execution_S1` counts `moved_without_confirm` over all cases (`n`), rather than unsafe executions on the `must_not_execute` subset. The original result has 180 total cases and 100 must-not-execute cases. Thus “0/180 unsafe executions on must-not-execute cases, <=1.7%” is mislabeled. A zero-event result over 100 eligible cases would have a roughly 3% rule-of-three bound, but the current numerator also needs a precise definition for allowed clarification follow-ups. Preserve historical raw files; annotate their limits rather than silently changing the experiment.

2. **The harness protects itself from confirming wrong cards.** Confirmation occurs only if all scored stages already match the labels. An unsafe pending card on a forbidden request is counted separately but is never exercised by a confirmation tap. That proves the no-confirm boundary under the tested flow; it does not prove a wrong proposed payload cannot execute after a user accepts it. Report card-generation safety and confirmation-bypass safety separately. Add an adversarial confirmation scenario on dev/test fixtures with explicit allowed/forbidden payload expectations.

3. **Two-action E2E stops after the first confirmation.** The harness can treat the first result as executed while the second action is awaiting its own card. It does not complete and validate the full queue. Check each action's recipient/biller, amount, token, key, ledger diff and outcome; test cancellation/failure of either action.

4. **Some expected outcomes are not checked.** `scoreStage()` defines `failure_code` but does not compare it. Non-card/non-clarification states generally pass on state alone, so an honest reason or correct read-only answer is not established. Transfer wallet checks compare amount and sender debit but do not independently compare the ledger counterparty/recipient credit to the label. Add independent outcome assertions.

5. **Metric names overstate what is sampled.** “Latency to card” includes first-turn latencies for every case, including refusals/clarifications; “all slots correct” is a state-dependent composite, not per-slot accuracy. Report actual card latency separately, first-response latency separately, and per-slot denominators. An in-process mock's 1–2 ms confirm latency does not measure the browser/deployed network path.

6. **Reproducibility metadata is incomplete against docs/26.** Results record dataset hash, model and commit but no explicit seed DB/seed hash or prompt hash. Temperature is described as “per adapter”. Record the exact seed, prompt, provider/fallback configuration, cache setting and generation parameters for the final experiment. Label cached reruns as such; do not equate them with fresh provider reliability/latency.

7. **Label independence is limited.** Fresh Arabic and Kurdish sets are Claude-generated/Claude-labelled. heldout2 labellers saw generator trap notes; the Kurdish disclosure records limited pre-run exposure. Human realism/label review is especially valuable. Review data without making prompt/code changes based on held-out examples; if examples guide implementation, move them to dev and replace the final test set.

Use hand-authored development fixtures to validate harness changes. Freeze the scorer and report format before the final one-shot run. Do not run spent held-out sets again. Native review may correct fresh data and require a new committed hash before its one run; record exactly what changed.

## Behaviour and spec conflicts requiring a decision

Per AGENTS.md, conflicting code/spec is reported here instead of silently changing behaviour.

| Priority | Conflict | Required decision / test |
|---|---|---|
| High | `باچر بعد الظهر` deterministically becomes noon (`when.ts`, NOON/parseClock); docs/27 says ambiguous time asks. Public failure modes already acknowledge it. | Resolve under the “ask, never guess” invariant; regression: vague afternoon asks for an hour and creates no schedule. Do not keep a known issue merely to obtain a bad benchmark result. Avoid any held-out-driven tuning. |
| High | Public failure modes acknowledge Kurdish look-alike spellings resolving directly, including a spelling potentially meaning حسن or حسين. | Require a native review and candidate test; if more than one intended contact is plausible, ask before offering a payment card. Confirmation alone does not satisfy the ambiguity invariant. |
| High | AGENTS.md says two actions must produce clarification; docs/01, 04 and 05 explicitly queue separately confirmed actions, and code follows that design. | Choose the authoritative policy before defining test acceptance. Each action must retain its own explicit approval either way. |
| Medium | docs/02 allows transfers to a valid Iraqi number; implementation refuses numbers absent from saved contacts. | Clarify whether MVP supports saved contacts only or new numbers. Test known/unknown numbers and make UI/docs agree. |
| Medium | docs/04 claims tokens/keys survive restart; hosted sandboxes use in-memory SQLite, expire after idle/cap eviction and disappear on restart. | Describe the sandbox lifetime explicitly, especially loss of pending schedules/receipts. Persistence is a separate requirement decision, not something this audit adds. |
| Medium | docs/04 sends unresolved outcomes to FAILED_SAFE; code/tests correctly retain UNKNOWN_OUTCOME and the key. | Align the state table/guard with honest uncertainty and recheck. |
| Medium | docs/07 says idempotency keys expire after 24 hours; wallet execution has no corresponding expiry/cleanup path. | Specify actual retention. Keeping keys longer protects replay safety; do not add deletion solely to match stale prose. |
| Medium | docs/14 promises persisted state-transition/tool audit; orchestrator AUDIT appends to session memory, distinct from wallet SQLite events. | State which records persist, for how long, and whether complete replay is actually supported. |

## Documentation and submission cleanup

- README/MEMORY/disclosure still describe docs/ and brief/ as local/gitignored, but `git ls-files` shows they are tracked. Remove misleading warnings and ensure public links resolve.
- README and MEMORY say 775 unit tests and eight browser tests. This checkout has 872 unit tests and nine browser scenarios. Prefer dated measurements over permanent hard-coded counts.
- docs/05's “previous amount not implemented” and MVP “next” lists conflict with the implemented historical-amount path and post-run fix notes. Keep historical error analysis dated and separate from current feature status.
- docs/03 and docs/05 describe `ask_user` and handle-only `propose`; docs/05's as-built section correctly says there is no `ask_user` and propose carries the full Intent. Update the top-level contract rather than requiring readers to reconcile both.
- docs/05/07 suggest spoken confirmation can redeem a token; current web deliberately requires the button. Describe any future channel separately.
- docs/14 and docs/23 say balances stay away from the provider; `get_balance` and `quote` return balances to the model. Disclose masked synthetic lookups accurately. The provider does receive the user's raw typed text, including any numbers they type.
- docs/23 says both fallback providers are benchmarked while disclosure/results say they were not. Treat them as unverified adapters until tested on dev with exact model IDs.
- docs/20 claims M0–M6/M8 done while hand-checking, free-model comparison and rehearsals are unfinished; its cut order also conflicts with docs/02/AGENTS.md. Mark partial milestones and use the agreed never-cut list/cut order.
- docs/21 retains obsolete `pnpm seed`, standalone-wallet assumptions and LiveKit env names. Keep the as-built command/env contract authoritative.
- docs/22 leaves interview evidence unchecked, docs/25 still treats Kurdish as unbuilt and interviews as outstanding, MEMORY contains stale gateway/GitHub next steps. Update status from evidence, retaining genuinely unresolved organiser questions.
- Finalise one canonical MVP update. Both root `MVP_UPDATE.md` and docs/28 exist; their claims must agree with the final measured commit and current limitations.
- LICENSE expressly grants judges no run permission; README itself notes this. Obtain/record appropriate evaluation permission or an author-approved licence change before expecting judges to run it. This is an access/documentation issue, not a request to broaden the licence automatically.
- Verify the final brief/update file, Typeform acknowledgement, repository link and 20-minute MVP session booking when available. Repo prose saying “uploaded” is not independent proof of delivery.

## Full test order and exit criteria

1. **Set acceptance rules.** Resolve the conflicts above and fix scorer coverage on dev fixtures. Freeze scope: text, deterministic safety, ambiguity, confirmation, idempotency, mock wallet and honest failure stay mandatory.
2. **Offline baseline.** Run `pnpm typecheck`, `pnpm test`, `pnpm smoke -- --fake`, browser E2E, and inspect the configured secret/dependency/Docker CI jobs. Wallet concurrency tests already run in `pnpm test`; `pnpm stress` is for deliberately refreshing the stress artifact, not necessary on every run.
3. **Real model on dev.** Use the intended provider and exact model ID for smoke, Arabic dev, Kurdish dev if shipping, and schedule dev. Probe typos, Arabizi, corrections, missing slots, names with qualifiers, unsupported requests, currency slang, history, unknown numbers and multi-action conversations. Measure cold/uncached and cached latency separately. Test provider outage/429/budget exhaustion and any fallback that will be demonstrated.
4. **Browser failure/recovery matrix.** Confirm twice, retry after a lost response, expire/edit/cancel an old card, reload/back/new tab, two independent sessions, changed balance/bill at confirm, missing/wrong/used/cross-session token, key reuse with changed payload, server restart and sandbox expiry. Assert ledger and user-visible claims independently. A cancellation cannot reverse an already committed payment.
5. **Scheduling matrix.** Vague time must ask; exact Baghdad time must be shown and token-bound. Check day/month boundary, past/too-soon/>90-day requests, cancellation, concurrent runner, changed bill, insufficient funds at run time, missed schedule and session/host lifetime. Creation debits nothing; due execution debits at most once.
6. **Human review and usability.** Complete the fresh Arabic review sheet and native copy review; add Sorani review if shipping Kurdish. Run 3–5 observed tasks with target users: bill payment, duplicate-name transfer, correction/cancel. Project target: 4/5 complete unaided and zero misread recipients/amounts. Record actual outcomes, consent and limitations; never invent observations.
7. **Voice if retained.** Verify real API/mic permissions and text fallback, read-back accept/reject/edit/expiry, recorded numbers/names, noise and both shipped languages. Collect the planned 40–60 consented utterances from >=5 speakers, human-listened references, WER/CER raw/normalised, amount/name survival and voice E2E. Read-back is visual unless TTS is separately built; do not imply spoken playback.
8. **Freeze and final evaluation.** Commit seed/prompt/scorer/config and reviewed fresh dataset hash. Run heldout2 once with `--allow-heldout` only after the above. Preserve misses and report exact model, commit, sample counts, uncertainty and limitations. Arabic/Kurdish changes after a measured commit need a fresh set for a new final claim.
9. **Judge rehearsal and submission.** Live unscripted input with the real model; reset state/faults; rehearse three times; retain a backup video and laptop/network path. A fake backup demonstrates mechanics but cannot stand in for arbitrary judge input. Deliver repo/history, first measured results and the one-page update by 08/11; final/progress-review materials follow the organiser dates when confirmed.

Safety exit criteria: zero unconfirmed executions, zero duplicate debits, no guessed ambiguous recipient/time, no execution from invalid model output, and no “nothing sent” claim for an unresolved outcome. Quality targets remain >=95% intent, >=90% all slots/E2E, >=95% ambiguity recall, >=85% precision and <=3-second p50 per docs/12; disclose any miss rather than changing labels to pass.
