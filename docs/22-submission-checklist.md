# 22 — Submission checklist

Updated 2026-10-23. [Current verification and gaps](30-readiness-execution.md). Checked items refer to evidence already recorded, not organiser acceptance.

## Dated deliverables

- [x] 22/10 design brief reported uploaded; source in brief/.
- [x] Working core, public repository/history, initial measured results and one-page MVP draft prepared.
- [ ] 08/11 MVP upload / booked review completed.
- [ ] Progress review / Demo Day dates confirmed.

## Scoring gates

- [x] Public repo, pushed source and real history across multiple build days.
- [ ] Live run on an unexpected judge-supplied input (future event).
- [x] Model/library/assistant/data/conflict disclosure in DISCLOSURE.md and docs/19.
- [x] At least three documented failure modes: FM-01 through FM-21.

## Topic 04 requirements

- [x] Readable card and explicit button confirmation before payment; bound token tests.
- [x] Ambiguity asks; duplicate/similar names and vague times have regressions.
- [x] Retry idempotency, concurrent token use and lost-response recovery tested.
- [x] Honest insufficient-funds, unknown-entity, service-down and unknown-outcome handling.
- [x] Synthetic mock wallet with duplicates and similar names; no real rails.
- [x] At least 50 dialect requests including malformed and ambiguous cases.
- [ ] Human editing/sample review for realism and native copy check; review sheets remain unsigned.
- [x] Historical held-out artifacts frozen before their single runs; never rerun the spent sets.
- [x] Scorer v2 covers wrong labelled payloads, recipient credit, full labelled queues and separate safety denominators.
- [ ] Fresh reviewed/frozen heldout2 measured once on the intended final provider.

## Evidence and rehearsal

- [x] Five real interviews logged and synthesised (docs/17); narrow sample disclosed.
- [ ] Broader interviews and observed usability tasks; do not manufacture results.
- [x] Local Stage-11 client/upload transport and read-back checks.
- [ ] Consented task voice corpus and WER/CER/name/amount/E2E metrics if making voice-quality claims.
- [x] Current offline tests/typecheck, browser scenarios and secret/dependency scans recorded in docs/30.
- [ ] Author's demo delivery rehearsed three times, including unseen human input.
- [ ] Final backup recording reviewed by the author; technical captures are in .cache/readiness/.
- [ ] Seed reset, faults off, network backup and API quota headroom checked immediately before presenting.

## Hosting and repo

- [x] README, .env.example, Dockerfile, Render Blueprint and hosting/local-ASR guide prepared.
- [x] Render CLI account authenticated and workspace selected; author authorised deployment.
- [x] Render billing requirement resolved; free Docker service live at https://zc-billpay-agent.onrender.com, with 5/5 real-model public smoke checks.
- [ ] Author verifies the public HTTPS demo on a physical phone (desktop phone-sized browser checks passed).
- [x] Hosted voice uses the dedicated RegaLabs streaming ASR endpoint, with server-side key and mandatory read-back; 3/3 public checks and a fake-microphone browser check passed. No laptop-ASR tunnel is needed for this deployment.
- [x] Keys kept in ignored server-side secrets, no keys in image/source/history scans.
- [ ] Organiser/author permission for judges to run the proprietary repo resolved. Do not silently change the licence.
- [ ] Final CI green on the submitted commit, not just an earlier run.
