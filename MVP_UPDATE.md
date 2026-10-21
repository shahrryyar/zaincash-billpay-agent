# MVP update — Topic 04: Bill Pay & Transfer Agent

Shahryar Sabir Muhammed (RegaLabs), solo · updated 22/10/2026 · [repository](https://github.com/shahrryyar/zaincash-billpay-agent)

**One Iraqi-Arabic sentence → an explicit, readable approval → one mock payment. The model understands; deterministic code moves money.**

## What works

Transfers, bills, balance/history questions and one-off scheduled payments; Iraqi Arabic by default and a Sorani switch. Duplicate names ask a question. Up to three ordered actions are announced and each needs its own confirmation. The card shows saved recipient, masked number, amount in words/digits, fee and balances from wallet data.

The LLM has read-only tools and proposes JSON; Zod and the state machine validate it. The Confirm button supplies a payload/session-bound, single-use 120-second token; idempotency prevents duplicate debit. Typed/spoken yes cannot pay. Fault controls demonstrate insufficient funds, biller failure and recovery after the wallet commits but the response is lost. **Synthetic wallet only; no real payment rails.**

Optional voice uses the author's pre-existing Stage-11 ASR on the laptop, with read-back before the model and a separate payment confirmation. Its current HTTP wrapper returns a final transcript; the model's streaming capability is not yet connected to an editable live composer. Voice task accuracy remains unmeasured.

## Evidence and its limits

| Check | Measured result |
|---|---|
| Historical Arabic held-out, Claude Haiku 5.5, commit 1445bff, n=180, run once | E2E 81.1% [74.8,86.2]; observed unconfirmed debits 0/180 |
| Historical Sorani held-out, Claude Haiku 5.5, commit 49319bd, n=90, run once | E2E 92.2% [84.8,96.2]; observed unconfirmed debits 0/90 |
| Wallet concurrency stress, four processes | 1,000 requests / 50 keys → 50 debits, zero duplicates |
| Current software checks | 900 offline tests; typecheck; production build and 10 browser scenarios |
| Gemini 3.5 Flash-Lite, developer only | Arabic tools cache replay 101/120; Sorani 54/60; workflow 76.7% end-to-end with provider/quota errors. Not held-out; full limitations in docs/30 |

Historical labels are LLM-made, not human-reviewed. Scorer v1 did not fully check later queued actions or recipient-side effects, and mixed response states into card latency. Scorer v2 now checks these and separates must-not-execute safety from confirmation bypass. Current development/provider checks, failures and result links are in [docs/30](docs/30-readiness-execution.md). They are not fresh held-out evidence. Original held-out sets are spent; heldout2 remains unspent.

**Five real interviews:** Sulaymaniyah, ages 19–22, all native Kurdish speakers. All wanted automation/scheduling and preferred typing; 2/5 had sent to the wrong person; 3/5 would use this, 2/5 would not (reason not recorded). Language preference was not asked. Small, one-city sample; no invented quotes or broader impact claim.

## Remaining before submission

Native-speaker review/editing of requests and copy; observed usability tasks; consented task recordings for WER/CER and name/amount survival; hosting account and reachable laptop-ASR route if deployed remotely. The Claude key was removed; the supplied Google AI Studio key is configured for Gemini 3.5 Flash-Lite, with process-local pacing for the observed 15 RPM quota. Availability and latency remain demo constraints.

Review fresh labels → freeze dataset/prompt/code/scorer → run heldout2 once with the selected model. Rehearse the author's delivery with unseen human input, retain a backup recording, and confirm organiser/judge run permission under the proprietary licence. [Disclosure](DISCLOSURE.md) · [21 failure modes](FAILURE_MODES.md) · [hosting/API guide](docs/31-free-api-hosting-and-local-asr.md).
