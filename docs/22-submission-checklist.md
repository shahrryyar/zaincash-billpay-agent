# 22 — Submission checklist

Updated 2026-10-25 against the organisers' October pack. Row IDs (NS-, RS-, FA-) point at [docs/35](35-organiser-requirements-matrix.md). [Current verification and gaps](30-readiness-execution.md). A checked item means the repo holds evidence. It does not mean the organisers accepted anything. Items marked **(human)** can only be done or confirmed by the author or real people.

## Timeline (NS-01–NS-08)

Fixed: design brief 22/10, MVP 08/11. Tentative: Espresso Lab meet and greet, MVP session dates, progress review, Demo Day. The organisers will confirm dates in advance and send a booking link before MVP sessions open.

- [x] 22/10 design brief: ≤5 slides or two pages, user and problem, end-to-end flow with diagram, models/tools/data, test plan, risks and weekly plan, GitHub link. Source in `brief/`. Upload reported by the author.
- [ ] **(human)** Keep the brief upload receipt (NS-02).
- [ ] **(human)** Attend the Espresso Lab meet and greet when the date is announced (NS-03).
- [ ] **(human)** Watch for the MVP booking link and book a 20-minute session (NS-05).
- [ ] **(human)** Submit the MVP by 08/11 (NS-04). Channel, time and timezone are not stated; ask the organisers.

## MVP, due 08/11 (NS-16–NS-20)

- [x] Core works end to end on sample inputs: live demo, CI on `648e368`, production checks (docs/33).
- [x] GitHub repository with commit history.
- [x] First results on a test set: historical Claude held-out, plus Gemini 3.5 Flash-Lite dev results (docs/30).
- [x] One-page update with the three required sections: what works, what does not work yet, what comes next (`MVP_UPDATE.md`, checked by `eval/test/submission-docs.test.ts`). PDF draft regenerated 2026-10-25 and checked at one page.
- [ ] **(human)** Review and approve the MVP update wording, then submit it.
- [ ] **(human)** Demo and discuss in the 20-minute session; rehearse first.
- [ ] Run the code-switch dev set and record model requests per turn on Gemini (needs a key; not run on 2026-10-25).

## Progress review, finalists, date TBC (NS-21–NS-25)

- [x] Working app that can be demoed live.
- [ ] **(human)** Rehearse on an unseen input someone else gives you.
- [ ] Held-out results on a set not tuned on: heldout2 is frozen and unspent. It needs **(human)** review → freeze of data, prompt, code and scorer → one run on the final provider. Only the author decides when.
- [x] At least three documented failure modes with handling: FM-01–FM-21 in FAILURE_MODES.md.
- [x] Full disclosure of models, tools, data and AI coding assistants, including a per-component provider table and the changes since the brief (DISCLOSURE.md, docs/19).

## Demo Day, date TBC (NS-26–NS-29)

- [ ] **(human)** Live demo and Q&A, including one unexpected judge input.
- [ ] Final repository, frozen.
- [ ] One-page summary, separate from the MVP update.
- [ ] Final evaluation results (heldout2).

## Ground rules (NS-37–NS-42) and free-tier rules (FA-08–FA-15)

- [x] Synthetic data only; no real personal or customer data.
- [x] Disclose models, tools, data and AI coding assistants.
- [x] Iraqi Arabic is the default for user-facing text (Sorani is opt-in).
- [x] Code on GitHub with real history; keys kept out (`.gitignore`, gitleaks in CI, `eval/test/submission-docs.test.ts`).
- [x] 429 backoff, response cache in development, small runs before large ones.
- [x] Provider and model recorded per component (DISCLOSURE.md).
- [ ] **(human)** One account per provider; no extra accounts to get around limits (FA-08).
- [ ] **(human)** Tell the organisers early that the free Gemini quota (about 15 a minute, 500 a day per project) could run out during a busy demo (FA-15). Measure requests per turn first.

## Topic 04 requirements (September topic brief, docs/00)

- [x] Readable card and explicit button confirmation before payment; bound token tests.
- [x] Ambiguity asks; duplicate/similar names and vague times have regressions.
- [x] Retry idempotency, concurrent token use and lost-response recovery tested.
- [x] Honest insufficient-funds, unknown-entity, service-down and unknown-outcome handling.
- [x] Synthetic mock wallet with duplicates and similar names; no real rails.
- [x] At least 50 dialect requests including malformed and ambiguous cases.
- [x] Mixed Arabic and English: deterministic tests (`packages/core/test/codeswitch.test.ts`) and a 25-row code-switch dev set (RS-04). Model run pending.
- [ ] **(human)** Hand-edit and sample-review requests for realism, and native copy check (RS-03, RS-06). Review sheets remain unsigned.
- [x] Historical held-out artifacts frozen before their single runs; never rerun the spent sets.
- [x] Scorer v2 covers wrong labelled payloads, recipient credit, full labelled queues and separate safety denominators.
- [ ] Fresh reviewed/frozen heldout2 measured once on the intended final provider.

## Evidence and rehearsal

- [x] Five real interviews logged and synthesised (docs/17); narrow sample disclosed.
- [x] Informal prototype tryout with three mates reported by the author; all three gave positive feedback (docs/17).
- [ ] **(human)** Task, device, language, help and error notes from that tryout, plus broader participants. Do not manufacture results.
- [x] Local Stage-11 client/upload transport and read-back checks.
- [ ] **(human)** Consented task voice corpus and WER/CER/name/amount/E2E metrics before any voice-quality claim.
- [x] Offline tests, typecheck, browser scenarios and secret/dependency scans recorded in docs/30.
- [x] OWASP LLM Top 10 walk-through with evidence (docs/14, RS-11).
- [ ] **(human)** Rehearse demo delivery three times, including unseen human input.
- [ ] **(human)** Review the final backup recording; technical captures are in `.cache/readiness/`.
- [ ] **(human)** Right before presenting: seed reset, faults off, network backup and API quota headroom checked.

## Hosting and repo

- [x] README, .env.example, Dockerfile, Render Blueprint and hosting/local-ASR guide prepared.
- [x] Render CLI account authenticated and workspace selected; author authorised deployment.
- [x] Free Docker service live at https://zc-billpay-agent.onrender.com, with 5/5 real-model public smoke checks. Automatic deploys off.
- [ ] **(human)** Verify the public HTTPS demo on a physical phone (desktop phone-sized checks passed).
- [x] Hosted voice uses the RegaLabs streaming ASR endpoint, with a server-side key and explicit transcript review before Gemini.
- [x] Keys kept in ignored server-side secrets; no keys in image, source or history scans.
- [ ] **(human)** Resolve organiser/author permission for judges to run the proprietary repo. Do not silently change the licence.
- [x] CI green on deployed application commit `648e368` (943 tests, 20 browser scenarios, image/dependency/secret checks). Recheck on the final submission commit. The 2026-10-25 changes (tests, eval report, docs) are not deployed.
