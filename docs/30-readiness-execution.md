# Readiness execution — 2026-10-21

Follow-up to the [initial requirements audit](29-test-readiness-audit.md), performed under the author's instruction to fix/test everything possible and prepare the demo for hosting. This is a synthetic financial demo. No award, flawless behavior, production readiness or organiser acceptance is guaranteed.

## Completed changes

- Tests first: vague afternoon/day-part requests ask for an hour; impossible dates and unsupported 24:00 boundaries cannot turn into another valid time. Kurdish lossy vowel variants ask/propose candidates instead of silently selecting a plausible person. Explicit schedules remain implemented.
- Scorer v2 independently checks actual sender debit, recipient credit, ledger counterparty, amount and fee; wrong labelled cards are deliberately confirmed only inside the synthetic evaluator. Complete labelled two/three-action queues, read-only answers, failure reasons and voice confidence/read-back are checked. S1 must-not-execute, no-confirm bypass and wrong-payload-after-confirm have separate denominators. Frozen held-out hashes cannot be disguised as dev; partial/spent held-out and result overwrites are refused.
- Offline cache-only developer replay makes no provider calls, fails on misses, and is labelled separately from quality/availability/latency. Voice cache identity includes endpoint and checkpoint revision.
- Phone 200% layout wraps language controls, balances, card rows/buttons and input. Completed receipts now show the wallet-derived recipient/biller, fee and Baghdad creation time. The browser allows 60 seconds for paced/tool-assisted requests; this does not meet the three-second latency target by itself.
- Google AI Studio adapter preserves opaque Gemini tool-call signatures on their original calls, stripping them on other-provider fallbacks. Optional per-process request pacing includes retries. Gemini development prompt clarifies strict info fields and JSON null for missing bill amounts; Zod/source checks remain strict.
- README, scope/architecture/contracts, persistence/privacy descriptions, model strategy, disclosure, plan/checklist, one-page update and handoff now describe current behavior. docs/28 points to the canonical root MVP_UPDATE.md. The initial audit remains a dated record.

Early developer runs recorded commit/source hashes at completion while work continued; their dirty metadata is not a frozen experiment. The harness now snapshots provenance at the start and flags source changes during the run. Final held-out evaluation must use reviewed, frozen code/data.

## Verification completed

| Check | Evidence |
|---|---|
| Offline unit/property/integration suites | 900 passed: core 472, ASR 34, LLM 86, wallet 104, orchestrator 151, eval 41, web 12 |
| TypeScript | Full workspace typecheck passed; receipt changes separately checked |
| Scripted pipeline | 15/15 smoke; demonstrates mechanics, not arbitrary-input model quality |
| Production/browser | Next production build; 10 browser scenarios with local Chrome, including phone zoom; all 10 scenarios passed again with recipient/time receipt assertions |
| Secrets | Fresh full-history gitleaks 8.30.1 found no leaks; ignored .env is mode 600. No credentials printed or committed |
| Dependencies | pnpm production audit: zero advisories; OSV-Scanner 2.7.0 scanned 208 lockfile packages, no issues |
| Docker/CI | [CI run on 43ccdf7](https://github.com/shahrryyar/zaincash-billpay-agent/actions/runs/39652108713) passed all five jobs, including building/running image and health + scripted turn. [CI on 8a0492a](https://github.com/shahrryyar/zaincash-billpay-agent/actions/runs/39653505379) also passed after the receipt, prompt and Blueprint changes. Local build was cancelled during exceptionally slow Debian downloads after remote image verification succeeded |
| Live web, real Claude | 9/9 transport/behavior checks before key removal: ambiguity, button-only approval/replay, edit invalidation, lost response, failure, two actions, schedule once, vague time, bad WAV/text fallback, real ASR read-back; [artifact](../eval/results/readiness-web-claude.json) |
| Accessibility | Real-ASR read-back state: axe WCAG 2 A/AA zero violations, 21 passed rules; phone zoom regression. Not full accessibility/user certification |

The later local four-worker accessibility-regression rerun encountered heavy RAM/swap pressure alongside training and the loaded ASR; 7/10 finished, three timed out. Extra assistant browsers/web processes were closed and the suite was rerun with one worker rather than changing product safety or raising test expectations. The one-worker rerun passed all 10 scenarios, including actual Home/End scrolling. A fresh receipt-state axe scan then found zero violations (23 passed rules); the earlier finding remains in local evidence.

## Real model runs and honest failures

Historical Arabic and Sorani held-out sets were neither rerun nor edited. They remain spent; their scores describe earlier commits and scorer v1 limitations (docs/12). heldout2 remains unspent pending human review and final freeze.

- Claude smoke passed 15/15 before the author removed its key. Fresh Sorani dev was 56/60 (93.3%), zero provider errors; three rows lack complete later-action labels and one omits a plausible candidate. [Result](../eval/results/readiness-ku-tools-final.md).
- The first 21 full-flow Claude fixtures were 20/21; the only miss was a fixture expecting FAILED_SAFE for an unknown number where the saved-contact spec correctly asks. The corrected fixture replay is 21/21 from cache, **not a new model sample or latency result**. Both artifacts remain.
- The Claude key was removed during Arabic development evaluation: 81/120 succeeded, 39 rows returned 401. Subsequent workflow/Sonnet/schedule/fixture attempts all returned authentication failures. Those artifacts are preserved as infrastructure failures, not comparative model-quality scores.
- Google AI Studio authenticated successfully. Gemini 2.5 Flash-Lite returned unavailable/404, 3.1 Flash-Lite and 3.8 Flash returned overload/503 or timeout. 3.5 Flash-Lite works after the signature fix; the failing 400 probe remains.
- Early Gemini probes using readiness.dev.jsonl with --split dev inherited the generic three-labeller caption; their actual fixture provenance is Codex-authored, not independent human/three-family labels. The dataset path/hash is preserved; later runs use --split readiness-dev.
- Parallel initial Gemini checks exceeded the actual project/model free quota, reported by Google as 15 requests/minute with retry delay. Initial smoke was 11/15; live web was 4/9; a fixture run was 4/21. Their failures remain visible. Per-process spacing is now 5000 ms, and tests run sequentially. Other processes/apps share the same quota and can still exhaust it.
- Paced Gemini fixture run: 20/21, no provider errors; all four schedule, four two-action and one three-action cases passed. The miss was an invalid extra field on a read-only info action, safely rejected. [Result](../eval/results/readiness-gemini35-paced.md). The paced web run was 8/9: one bill-plus-transfer proposal used an invalid missing-amount object; no payment was made. These developer failures motivated the stricter prompt examples, not a schema relaxation.

<!-- CURRENT-DEV-RESULTS -->
Gemini 3.5 Flash-Lite development checks are complete; all are synthetic/developer evidence, not held-out results. Arabic tools mode measured 93/120 (77.5%) with two provider timeouts; a cache-only replay of the same outputs after resolver/time fixes measured 101/120 (84.2%). That replay is a code-regression comparison, not a new model or latency result. The workflow comparison measured 85.4% first-turn state accuracy (n=103), 76.7% end-to-end (n=120), 15 provider errors, and 0/8 two-action completion. Tools mode remains selected because it is the safer, better-supported multi-action path; the workflow result does not justify changing the default.

Sorani tools mode measured 54/60 (90.0%) with no provider errors. The original scorer reported an apparent S1 event on KU-0093; scorer 2.1 replay identifies the legacy label defect, retains 54/60 E2E, and reports 0/25 eligible S1 events while three later-action queues remain incomplete. This correction does not establish safety on excluded cases. Gemini schedule-dev measured 23/26 (88.5% E2E); an offline replay after the bare-today fix reached 100% first-turn state accuracy (n=24), still 23/26 E2E because a bill-only fixture lacks an amount label and a two-action row lacks later-action labels. The 21-case readiness/full-flow run measured 19/21 (90.5%), with two safe failures (unsupported bill-info wording and three actions in one sentence); its run overlapped scorer changes and is explicitly marked source-changed. Full artifacts preserve row-level results and limitations: [Arabic tools](../eval/results/readiness-gemini35-ar-dev.md), [Arabic tools replay](../eval/results/readiness-gemini35-ar-corefix-replay.md), [Arabic workflow](../eval/results/readiness-gemini35-ar-workflow.md), [Sorani tools](../eval/results/readiness-gemini35-ku-dev.md), [Sorani scorer 2.1 replay](../eval/results/readiness-gemini35-ku-scorer21-replay.md), [schedule](../eval/results/readiness-gemini35-schedule.md), [schedule replay](../eval/results/readiness-gemini35-schedule-corefix-replay.md), and [full-flow fixtures](../eval/results/readiness-gemini35-complete-v2.md).
<!-- END-CURRENT-DEV-RESULTS -->

## Local ASR and microphone

Stage-11 avg3-36k44k48k.nemo, SHA-256 e9de02a14d531d79c531d442e6d7294d175cda55d118cf34fa4ab6efb052b02c; CPU context [56,13], blank penalty .9. Server code/checkpoint are pre-existing work outside this repo. Independent wrong-key check returned 401; unsupported zz language returned 400. A public 14.64-second Sorani clip traversed the client and web upload, with individual observed latencies about 9.0 and 3.3 seconds. These are spot checks, not a representative latency distribution or WER result.

Chrome fake microphone input fed the same prerecorded clip through MediaRecorder, decode/resample/PCM16 WAV, /api/voice and the real local ASR. A transcript read-back appeared with no payment approval; screenshot/video are in .cache/readiness/. This verifies the capture transport, not a physical phone mic, task accuracy or consented human testing. The local ASR process disappeared once and was restarted; it needs manual startup/warm-up and must stay alive.

The underlying model supports 80/320/400 ms streaming chunks (author-supplied capability). The present laptop wrapper returns final HTTP transcription. The requested editable live composer, optional request auto-send and correction review are recorded **for later**, as requested, in docs/32. Sending a transcript/request will never replace explicit payment approval.

## Hosting preparation

Dockerfile/health endpoint and Render Blueprint are prepared; no public demo has been deployed. The Blueprint uses Gemini 3.5 Flash-Lite and server-side key entry with 5000 ms pacing. Re-check availability/quota in the deployment project. Optional voice variables must be configured in the host only after a reachable ASR endpoint exists; a remote host's 127.0.0.1 cannot reach this laptop.

[docs/31](31-free-api-hosting-and-local-asr.md) links official free-provider, Render CLI/MCP and Cloudflare Tunnel docs, and explains the whole-laptop vs hosted-web/laptop-ASR layouts. Render CLI 2.30.0 was downloaded with official SHA256 verification into .cache/hosting-tools/render. Its real Blueprint validation stopped because no authorised workspace/default workspace is selected; no validation success or deployment is claimed. No tunnel or network access-rule change was made. The author cancelled the phone IP restriction/LAN-origin work. Phone HTTPS is still required for normal microphone access. Hosted wallets/schedules are in-memory and disappear on restart/eviction; do not market them as durable banking storage.

## Remaining evidence and decisions

| Item | Why it remains |
|---|---|
| Native Arabic/Sorani sample/copy review and hand edits | Organiser realism requirement; an AI cannot claim human sign-off. Review sheets remain pending |
| Reviewed/frozen heldout2 single final run | Requires the human review and code/prompt/scorer freeze first; no premature run just because a key exists |
| Consented 40–60 task recordings from at least five speakers, human references | Needed for actual WER/CER, name/amount survival and voice-payment completion |
| Broader interviews and observed usability tasks | Five genuine interviews exist, but narrow city/age sample; no invented outcomes/quotes |
| Host account authorisation, publication and reachable ASR route | Account/endpoint not supplied; no public exposure created |
| Author presentation rehearsals, surprise human input and backup review | Automated technical captures are not the author's delivery or a judge-input gate |
| Organiser replies and proprietary evaluation run permission | No reply/permission is invented; licence was not silently broadened |
| Uniform support reference for every failure; candidate history dates | Still UX follow-ups; existing receipt/payment references and masked candidates are implemented |

Technical captures now include a scripted ambiguity/card/receipt backup, direct transfer and timeout-after-commit recovery, plus the real-ASR simulated microphone clip. These are labelled technical rehearsals, not author delivery practice. Videos/screenshots remain local in .cache/readiness/.

A one-page PDF draft of MVP_UPDATE.md was generated with local Chrome from reproducible print HTML (brief/build_mvp_update.py), verified with pdfinfo and visually inspected. It is labelled DRAFT and has not been submitted.

Public deliverables: [MVP_UPDATE.md](../MVP_UPDATE.md), [DEMO.md](../DEMO.md), [DISCLOSURE.md](../DISCLOSURE.md), [FAILURE_MODES.md](../FAILURE_MODES.md), [checklist](22-submission-checklist.md). Never-cut safety/text/mock requirements remain intact. No held-out tuning, fabricated measurements or real payment rails were introduced.

### Legacy Sorani label correction

KU-0093 produced an apparent S1=1 event in the first Sorani run: the row was tagged two_actions but labelled only mobile top-up failure and a single intent type. The app correctly reported that unavailable service, then offered the separately requested generator card. The evaluator auto-approved that card against the failed-first-action label. This is retained in the original artifact and is not counted as a product defect or silently erased. Scorer 2.1 detects the independent legacy category, withholds approval for the unlabelled later action and reports incomplete coverage; its offline replay keeps 54/60 E2E but reports zero S1 events among 25 eligible rows. This does not prove safety on the excluded incomplete cases. A paired regression verifies the legitimate second payment with explicit labels and proves a model cannot get the exemption by appending an action to a single-action forbidden case.
