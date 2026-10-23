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

- Baseline production verification complete. Recovery and editable post-recording voice drafts implemented and tested locally; release verification below will record the deployed commit.
- Test-only additions: `apps/web/playwright.production.config.ts`, `apps/web/production-e2e/recovery.spec.ts`, `eval/src/production-web.ts`.
- Raw browser logs/reports/traces: `.cache/production-e2e/`; fixtures and keys remain ignored.
- Live browser partials remain queued. A custom WebSocket relay would change packaging/lifecycle; the current release deliberately keeps the supported standalone app, existing upload-to-stream adapter and free single instance. No microservice or paid-plan change is authorised.
- Human follow-ups are in docs/34. Do not pretend physical-phone testing, native review, interviews or author rehearsal were performed by the assistant.

## Local release verification

- 943 unit/integration tests passed across workspace checks (942 in the full run, plus the added threshold test in the 16/16 web recheck). Core draft invariants were written/tested red before implementation; route tests were also red before their fix.
- Typechecking passed; 19/19 Chromium scenarios plus a focused phone/200%-zoom voice review check passed against the production standalone build, scripted model and fake ASR. Coverage includes both languages, editing the name and amount, no model call before explicit request submission, original transcript preservation, discard, late responses, low confidence, provider failure, denied permission, early release/track cleanup, fake microphone WAV conversion, plus the original payment/schedule/isolation/recovery scenarios.
- Earlier local browser attempts used a 23,000-IQD sentence absent from the explicitly scripted fake model. They failed safely with no card; the fixture was changed to supported demo sentences. Original logs remain in `.cache/production-e2e/draft-browser*.log`.
- New runtime dependencies: none. No hosted infrastructure or provider settings changed. The Docker image built successfully and its running container passed health and editable-draft checks. Production checks are recorded below after completion.
