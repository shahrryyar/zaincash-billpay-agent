# MVP update — Topic 04: Bill Pay & Transfer Agent

Shahryar Sabir Muhammed (RegaLabs), solo · updated 03/11/2026 · [repository](https://github.com/shahrryyar/zaincash-billpay-agent)

**One Iraqi-Arabic or Sorani sentence → an explicit, readable approval → one mock payment. The model understands; deterministic code moves money.**

**[Live demo](https://zc-billpay-agent.onrender.com)** · One free Render instance; open it a minute early.

## What works

Transfers, bills, balance and history questions, and one-off scheduled payments, in Iraqi Arabic (default) or Sorani. Duplicate names and close look-alikes get a question. Up to three actions are confirmed one at a time; a typed «الغي» cancels the whole plan. The card shows the saved recipient, masked number, amount, fee and balances, all from wallet data.

The model proposes JSON with read-only tools; it has no payment tool. Zod, then deterministic code, re-checks every output against the user's own words: the whole amount, a recipient the user actually wrote, and a time that was said. Paying needs a single-use, 120-second token bound to the payload and session; retries reuse an idempotency key. A typed or spoken "yes" cannot pay. Voice (hosted RegaLabs ASR) fills an editable draft; payment still needs the button. **Synthetic wallet only; no real rails.**

**Model:** Gemini 3.5 Flash-Lite (free tier). The design brief named Claude Haiku 5.5; that key was removed on 21/10, so Claude scores describe earlier commits. [What changed](DISCLOSURE.md#changes-since-the-design-brief).

## First results

| Check | Measured result (95% CI) |
|---|---|
| Gemini, Arabic dev (tuned on), commit ffdc8ad, n=120 | E2E 81.7% [73.8, 87.6]; 0/50 unsafe executions; 8 failures were provider timeouts at the old 8 s limit |
| Gemini, Sorani dev (tuned on), commit 389fb7f, n=60 | E2E 88.3% [77.8, 94.2]; 0/26 unsafe |
| Gemini, Arabic + English code-switch dev, 389fb7f, n=25 | E2E 92.0% [75.0, 97.8]; 0/12 unsafe |
| Historical Arabic held-out, Claude Haiku 5.5, 1445bff, n=180, run once | E2E 81.1% [74.8, 86.2]; payment rows 79.4%; 0/180 unconfirmed debits |
| Historical Sorani held-out, Claude Haiku 5.5, 49319bd, n=90, run once | E2E 92.2% [84.8, 96.2]; payment rows 91.1%; 0/90 |
| Wallet stress, four processes | 1,000 requests on 50 keys → 50 debits, 0 duplicates |
| Software | 1,180 tests, 23 browser scenarios, secret and dependency scans, green CI |

Labels are LLM-made, not human-reviewed; dev sets were tuned on. Re-scoring both spent held-out files with the stricter scorer flipped no case. Five interviews (Sulaymaniyah, ages 19–22): 2/5 had sent money to the wrong person; 3/5 would use this. [Full limits](docs/30-readiness-execution.md).

**Since 25/10:** a review of our own guards found the amount check was a substring match («50 الف» passed inside «250 الف») and Arabic recipients were not checked against the message, plus smaller time, ranking and hosting gaps. All fixed, failing tests first ([27 failure modes](FAILURE_MODES.md)). Chatting with the live demo found two more bugs; both fixed and re-checked live ([log](eval/results/live-check-render-2026-11-03.md)).

## What does not work yet

- **No held-out result for the live model.** Fresh heldout2 (180 cases) is frozen and unspent; it waits for native-speaker review.
- **No human-checked data.** Requests, labels and app copy have not been reviewed by native speakers.
- **Free-tier limits:** about 15 requests a minute and 500 a day per project. The app caps itself and says "busy, nothing was sent" rather than queueing. Demo wallets reset on restart.
- Voice accuracy is unmeasured. No physical-phone or observed usability tests yet.

## What comes next

1. Native review of a data sample and the copy; physical-phone check; rehearse with unseen input; book the MVP session.
2. After review and freeze: run heldout2 once on Gemini 3.5 Flash-Lite and report it with CIs, failures included.
3. Broader usability tests, then consented recordings before any voice claim. [Disclosure](DISCLOSURE.md).
