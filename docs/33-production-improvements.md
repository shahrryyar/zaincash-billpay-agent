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

- Baseline production verification complete; product changes not deployed yet.
- Test-only additions: `apps/web/playwright.production.config.ts`, `apps/web/production-e2e/recovery.spec.ts`, `eval/src/production-web.ts`.
- Raw browser logs/reports/traces: `.cache/production-e2e/`; fixtures and keys remain ignored.
- A custom Next.js server is required for a same-origin WebSocket relay if live browser partials are implemented; official Next docs explicitly disallow combining a custom server with generated standalone `server.js`. Use a supported packaging approach and prove the Docker image before changing production. No microservice or paid-plan change is authorised.
- Human follow-ups are in docs/34. Do not pretend physical-phone testing, native review, interviews or author rehearsal were performed by the assistant.
