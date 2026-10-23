# MVP update — Topic 04: Bill Pay & Transfer Agent

Shahryar Sabir Muhammed (RegaLabs), solo · DRAFT · updated 23/10/2026 · [repository](https://github.com/shahrryyar/zaincash-billpay-agent)

**One Iraqi-Arabic sentence → an explicit, readable approval → one mock payment. The model understands; deterministic code moves money.**

**[Live demo](https://zc-billpay-agent.onrender.com)** · One free Render instance; open before presenting to allow wake-up.

## What works

Transfers, bills, balance/history questions and one-off scheduled payments; Iraqi Arabic by default and a Sorani switch. Duplicate names ask a question. Up to three ordered actions are announced and each needs its own confirmation. The card shows saved recipient, masked number, amount in words/digits, fee and balances from wallet data.

The model proposes JSON using read-only tools. Zod and deterministic code validate it. Payments require a payload/session-bound, single-use 120-second confirmation token; retries reuse an idempotency key. Typed/spoken yes cannot pay. Fault controls demonstrate failure and recovery after a lost response. **Synthetic wallet only; no real rails.**

Optional voice uses hosted RegaLabs streaming ASR with a server-side key. After recording, review/edit the draft and explicitly send the request before Gemini runs; payment still requires its separate confirmation. The original transcript stays accessible. Words while speaking remain queued; task voice accuracy is unmeasured.

## Evidence and its limits

| Check | Measured result |
|---|---|
| Historical Arabic held-out, Claude Haiku 5.5, commit 1445bff, n=180, run once | E2E 81.1% [74.8,86.2]; observed unconfirmed debits 0/180 |
| Historical Sorani held-out, Claude Haiku 5.5, commit 49319bd, n=90, run once | E2E 92.2% [84.8,96.2]; observed unconfirmed debits 0/90 |
| Wallet concurrency stress, four processes | 1,000 requests / 50 keys → 50 debits, zero duplicates |
| Current software checks | 943 unit/integration tests; typecheck; Docker and 20 scripted browser cases; green CI |
| Live Gemini + RegaLabs deployment checks | 16/16 API checks + 1/1 voice-expiry check; browser 10/11 initially, then 1/1 network-failure recheck. Transport/safety, not accuracy |

Historical labels are LLM-made, not human-reviewed. Scorer v1 missed some queued-action/recipient-side checks; v2 now checks these and separates safety denominators. These Claude scores are not current Gemini accuracy estimates. Original held-out sets are spent; heldout2 awaits human review and freeze. [Full limitations](docs/30-readiness-execution.md) · [production results](docs/33-production-improvements.md).

**Five real interviews:** Sulaymaniyah, ages 19–22, all native Kurdish speakers. All wanted automation/scheduling and preferred typing; 2/5 had sent to the wrong person; 3/5 would use this, 2/5 would not (reason not recorded). Language preference was not asked. Small, one-city sample; no invented quotes or broader impact claim.

## Remaining before submission

Native-speaker review of requests/copy; observed usability and physical-phone tests; consented recordings before voice-accuracy claims. Demo wallets reset on restart/eviction. Gemini uses process-local pacing for the observed 15 RPM quota; availability/latency remain constraints.

Human-review fresh labels, freeze dataset/prompt/code/scorer, then run heldout2 once. Rehearse delivery with unseen input, review the prepared backup video, and confirm organiser/judge run permission under the proprietary licence. [Disclosure](DISCLOSURE.md) · [21 failure modes](FAILURE_MODES.md) · [hosting/API guide](docs/31-free-api-hosting-and-local-asr.md).
