# MEMORY.md — current project state

Updated 2026-10-21. No secrets. Read README.md, AGENTS.md and the relevant numbered doc; docs/ and brief/ are tracked. The full readiness audit is docs/29; follow-up verification and outstanding evidence are docs/30.

Solo entry: Shahryar Sabir Muhammed (RegaLabs), ZainCash Topic 04. Design brief reported uploaded (22/10); MVP due 08/11. Mock wallet, synthetic data, no real rails. The model understands; deterministic code moves money.

## Safety and scope

- Payload/session-bound, single-use 120-second confirmation token; idempotency key per card. Button confirmation only; typed/spoken yes never pays.
- Saved contacts only; ambiguity asks. Up to three ordered actions, announced and approved separately. Transfers, bills, read-only questions and one-off schedules are implemented. Do not remove scheduling.
- Invalid model output, low ASR confidence and unavailable services fail closed. Unknown execution outcomes remain UNKNOWN_OUTCOME and recheck the same key; never claim unchanged balance without evidence.
- Arabic default, Sorani selectable, copy in core. Pure state machine and deterministic wallet; no agent framework/vector DB/multi-agent service.

## Current providers and runtime

- The author removed the paid Claude key. Google AI Studio key stored only in ignored .env, mode 600; never print it. Local selection: Gemini 3.5 Flash-Lite, tools mode, no configured fallback, cache on.
- Actual Gemini project/model free quota returned 15 requests/minute. LLM_REQUEST_INTERVAL_MS=5000 spaces starts/retries per provider within each process. Run web/eval/smoke sequentially; separate processes/apps still share quota. Current numbers and failed probes are in docs/30. Do not call setup success a quality result.
- Gemini thought signatures round-trip on original tool calls; stripped for other providers. Invalid/absent model output cannot pay.
- Local ASR: http://127.0.0.1:8790/v1, ASR_PROVIDER=regalabs, language auto, separate local key. Stage-11 avg3-36k44k48k checkpoint SHA256 e9de02a14d531d79c531d442e6d7294d175cda55d118cf34fa4ab6efb052b02c; CPU context [56,13], blank penalty .9. No hosted-service credit needed locally. External server: /home/jackal/storage/Desktop/idk/rega-asr-work/local-asr/server.py, Python /home/jackal/Desktop/idk/nemo-venv/bin/python. Manual startup, roughly 70–85 seconds warm-up; check /healthz. Keep the process alive; it does not auto-start.
- The model supports streaming chunks of 80/320/400 ms; current local wrapper is final HTTP only. User requested editable live transcript/send-or-review composer **for later**; captured in docs/32, not implemented or promised as live.
- The user cancelled phone-IP allowlisting/LAN-origin changes. Do not change network exposure. Phone HTTPS and hosting are future authorised setup steps after account availability; no tunnel/public deployment created here.
- Hosted demo sandboxes are in-memory: balances, tokens, receipts, schedules and session traces vanish on restart/eviction. No durable/full replay claim. Render account/ASR reachability still needed (docs/31).

## Evaluation and human evidence

- Original Arabic held-out: Claude Haiku 5.5 at 1445bff, 81.1% E2E n=180. Sorani: at 49319bd, 92.2% n=90. Both spent. Historical v1 zero counts were all-case unconfirmed debits, not the current must-not-execute S1. Historical E2E/latency have documented scorer limitations.
- Never rerun/tune on spent held-out; heldout2 remains unspent. Human review/editing of fresh labels/copy comes before re-freezing, code/prompt/scorer freeze and the single final run. Do not run it simply because a key is now available.
- Scorer v2 verifies recipient credit, fees/ledger and labelled queued actions; independent must-not-execute, no-confirm and wrong-payload metrics. --cache-only is offline dev replay only, not new quality/latency evidence.
- Date/vague afternoon/24:00 and Kurdish lossy-vowel ambiguity bugs fixed with tests first. Scheduling preserved.
- Five real interviews: Sulaymaniyah, ages 19–22, native Kurdish speakers; automation/scheduling/typing wanted, 2/5 wrong-person experience, 3/5 would use, 2/5 not (reason absent). Language preference not asked. No invented quotations or extra participants.
- Still human-only: native sample/copy review, broader interviews/usability, consented task recordings/references, author delivery rehearsal, organiser response/licence permission. Public audio transport checks are not consented task WER.
- Current verification evidence and API failures are in docs/30; public one-page draft is MVP_UPDATE.md (docs/28 points there). Disclosure in docs/19 and DISCLOSURE.md.

## Working rules

Main only; small commits with the configured author identity, no coauthor/footer. Check that push reached origin. .env is authorised to edit, never commit/print credentials. Restart pnpm dev after core/orchestrator/llm changes (singleton engine). Test real Chrome with agent-browser in a named session; scripted fake mode is a disclosed backup, not judge-input quality evidence. Use exit codes for typecheck/tests, not just tail output. Never fabricate numbers, interviews, human labels or consent. Proprietary licence stays until the author grants an explicit change.

## Commands

pnpm install; pnpm typecheck; pnpm test; pnpm dev; pnpm smoke. Browser: PW_CHROMIUM=/usr/bin/google-chrome pnpm --filter @zc/web e2e. Eval: pnpm eval -- --split dev --mode tools --concurrency 1 --tag unique-name. Live checks: pnpm --filter @zc/eval check:web -- --base http://localhost:3000 --tag unique-name. ASR: pnpm --filter @zc/asr check /path/to/public-sample.wav. See docs/31 for hosting, free-provider official links, Render CLI/MCP and Cloudflare tunnel choices.
