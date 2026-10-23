# Production verification and improvements — 2026-10-23

The author requested full production E2E testing, then authorised all feasible improvements and a clear list of human follow-ups. Render must remain on the free plan. Never run held-out data before the required human review/freeze, invent evaluation results, or weaken confirmation/idempotency.

## Frozen baseline

Application commit `921334514023048b99e4353c518498d37792afd4`, Render deploy `dep-dbdl13on74is7395mc4g`, real Gemini 3.5 Flash-Lite and hosted RegaLabs streaming ASR. All verification uses new synthetic per-session wallets.

- Production API checks: **17/17 passed**, covering forged/cross-session approvals, eight simultaneous confirmations, editing a pending amount, missing/unknown slots, insufficient funds, USD rejection, injection, independent multi-action approvals, schedule conversion/cancellation/execution, vague/recurring requests, grounded info, 5xx recovery, invalid audio and expired/cross-session voice acceptance. `eval/results/production-api-2026-10-23.json`.
- Initial browser suite: **8/10 passed**. The hero payment itself completed correctly, but its final scroll assertion assumed overflow in a tall phone viewport. A recovery fixture used an outdated label because the running worker had already loaded its initial source. Both original failures are preserved.
- Corrected browser recheck: **2/2 passed**, with the original scenario's desktop viewport and the actual recheck-button label. No production code changed between these runs. Unique functional browser scenarios covered: zoom, hero transfer/receipt, cancellation, timeout, biller outage, expiry, scheduling, separate sessions, Sorani, and lost browser response/recheck/reload.
- Real UX defect found: after the browser loses a successful confirmation response, it shows the old “nothing sent yet” card beside the honest uncertainty message, even when background balance refresh reflects the debit. The backend still replays safely and debits once. Hide that stale card and block a new request until outcome recovery.

## Implementation order and acceptance

1. **Uncertain outcomes:** only truthful recovery controls while a response is missing; no stale pending card or fresh send. Recheck must show one stable receipt and exactly one debit.
2. **Voice review:** live draft text in the composer, explicit submission/editing, raw transcript accessible, deterministic amounts/names untouched, stale/partial/error/cancel events cannot submit. Keep the key server-side and one deployed service. Test both languages, existing drafts, start/stop/cancel, out-of-order results and provider failure. Keep payment confirmation separate.
3. **Progress and judge evidence:** understandable request/review/confirmation/receipt states; a concise judge runbook with links to actual results and disclosed limits. No unmeasured “perfect” or accuracy claims.
4. **Verification and release:** focused tests, workspace checks, browser scenarios, production build/container, deploy the reviewed commit to the existing free service, then repeat affected production checks. Preserve failed attempts; no invisible test retries.

## Status / handoff

- Recovery and editable post-recording voice drafts deployed on the free service. Local/CI and production release observations are recorded below.
- Test-only additions: `apps/web/playwright.production.config.ts`, `apps/web/production-e2e/recovery.spec.ts`, `eval/src/production-web.ts`.
- Raw browser logs/reports/traces: `.cache/production-e2e/`; fixtures and keys remain ignored.
- Live browser partials remain queued. A custom WebSocket relay would change packaging/lifecycle; the current release deliberately keeps the supported standalone app, existing upload-to-stream adapter and free single instance. No microservice or paid-plan change is authorised.
- Human follow-ups are in docs/34. Do not pretend physical-phone testing, native review, interviews or author rehearsal were performed by the assistant.

## Local release verification

- 943 unit/integration tests passed in GitHub CI on application commit `648e368` (also checked locally across the full run and focused web recheck). Core draft invariants were written/tested red before implementation; route tests were also red before their fix.
- Typechecking passed; GitHub CI passed 20/20 Chromium scenarios (locally: 19/19 plus the added focused phone/200%-zoom review check) against the production standalone build, scripted model and fake ASR. Coverage includes both languages, editing the name and amount, no model call before explicit request submission, original transcript preservation, discard, late responses, low confidence, provider failure, denied permission, early release/track cleanup, fake microphone WAV conversion, plus the original payment/schedule/isolation/recovery scenarios.
- Earlier local browser attempts used a 23,000-IQD sentence absent from the explicitly scripted fake model. They failed safely with no card; the fixture was changed to supported demo sentences. Original logs remain in `.cache/production-e2e/draft-browser*.log`.
- New runtime dependencies: none. No hosted infrastructure or provider settings changed. The Docker image built successfully and its running container passed health and editable-draft checks. Production checks are recorded below after completion.

## Deployment

Application commit **`648e3687081501f98bc5eedc415d59123ba08dc4`**, Render deployment **`dep-dbdojf59fdbs73brp75g`**, observed live on 2026-10-23 at 16:23 UTC. Free plan, one instance, automatic deployments off; existing provider secrets/settings unchanged. Health identifies Gemini 3.5 Flash-Lite and voice enabled. [Deployment observation](../eval/results/production-release-deployment-2026-10-23.json). [Green CI](https://github.com/shahrryyar/zaincash-billpay-agent/actions/runs/39986189329).

## Production browser release results

Initial release suite: **10/11 passed**. The scheduling request encountered Chrome `net::ERR_NETWORK_CHANGED` on the testing laptop; its trace records no HTTP response. The app showed the honest busy/error state. A subsequent read-only wallet check confirmed balance 200,000 IQD and no schedules; no approval was attempted. The separate scheduling recheck then passed **1/1** with no product change. The first test-filter command selected zero cases and was corrected; local command logs are retained.

- [Original 11-case result, including the failure](../eval/results/production-release-browser-2026-10-23.json).
- [Wallet observation after network failure](../eval/results/production-release-network-failure-2026-10-23.json).
- [Scheduling recheck](../eval/results/production-release-schedule-recheck-2026-10-23.json).

The other scenarios passed: zoom, ambiguous transfer/receipt, cancellation, post-commit timeout, biller outage, expiry, session isolation, Sorani, lost browser confirmation response/recheck, and the new real-provider voice path. Real ASR returned `پەنجە هەزار بنێرە بۆ ئاراستەی` from the synthetic Sorani fixture, including a recipient recognition error. It remained an unsent editable draft with no model call. Editing to «دز 23000 لعلي كريم» then explicitly sending invoked real Gemini and produced a 23,000-IQD card; only payment approval produced one ledger reference and balance 176,700 IQD. Original transcript/model trace are attached to the browser result. This is transport/edit/confirmation evidence, **not ASR task accuracy**.

A silent technical walkthrough of that real production flow is saved locally at `.cache/production-e2e/production-voice-walkthrough.mp4` (18.76 seconds, three-second hold on the final receipt). The source WebM and screenshot remain beside the test output. It uses Chrome fake microphone input and synthetic speech; it is not the author's delivery rehearsal or a physical-device recording. Author review is still required.

A Chrome/axe WCAG 2 A/AA scan of the editable review state in the production Docker image with local fake providers found **0 violations, 21 passed rules**. [Artifact](../eval/results/production-release-accessibility-2026-10-23.json). This covers one automated state, not a screen-reader study or full certification.

## Production API release results

**16/16 passed** in the [main release audit](../eval/results/production-release-api-2026-10-23.json), plus **1/1** in the [optional real-ASR legacy read-back expiry/cross-session check](../eval/results/production-release-voice-expiry-2026-10-23.json), run separately to avoid repeating successful checks. Main coverage includes forged/session-bound approval, eight concurrent confirmations with one debit, pending amount edits, missing/unknown slots, insufficient funds, currency rejection, injection, two independent approvals, schedule conversion/cancellation/due-once behaviour, vague/recurring times, grounded info, 5xx recovery and malformed audio. The new browser voice case separately covers editable draft submission and payment confirmation.

The main API report's optional `application_commit` field says `unknown` because the launcher omitted it. The Render deployment was read before/after this run and remained `648e368`; its signed-off association is this dated report and the deployment observation, not a rewritten raw artifact. No failed API case was hidden, no held-out set was run, and no real wallet data/rails were used.
