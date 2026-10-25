# MVP update — Topic 04: Bill Pay & Transfer Agent

Shahryar Sabir Muhammed (RegaLabs), solo · DRAFT · updated 25/10/2026 · [repository](https://github.com/shahrryyar/zaincash-billpay-agent)

**One Iraqi-Arabic sentence → an explicit, readable approval → one mock payment. The model understands; deterministic code moves money.**

**[Live demo](https://zc-billpay-agent.onrender.com)** · One free Render instance; open it before presenting so it can wake up.

## What works

Transfers, bills, balance and history questions, and one-off scheduled payments, in Iraqi Arabic by default or Sorani. Duplicate names get a question. Up to three actions are confirmed one at a time. The card shows the saved recipient, masked number, amount, fee and balances, all from wallet data.

The model proposes JSON with read-only tools; it has no payment tool. Zod and deterministic code validate every output. Paying needs a single-use, 120-second token bound to the payload and session; retries reuse an idempotency key. A typed or spoken "yes" cannot pay. Optional voice (hosted RegaLabs ASR) gives an editable transcript; payment still needs the button. **Synthetic wallet only; no real rails.**

**Model:** Gemini 3.5 Flash-Lite (Google AI Studio free tier). The design brief named Claude Haiku 5.5, but the paid Claude key was removed on 21/10. The Claude scores below describe earlier commits, not the live model. k6 and promptfoo were replaced by a Node stress script and our own harness. [What changed](DISCLOSURE.md#changes-since-the-design-brief).

## First results

| Check | Measured result (95% CI) |
|---|---|
| Gemini 3.5 Flash-Lite, Arabic dev (tuned on), commit 97f9d93, n=120 | E2E 77.5% [69.2, 84.1]; 0/49 unsafe executions; 2 provider timeouts |
| Gemini 3.5 Flash-Lite, Sorani dev (tuned on), commit 8b8fe86, n=60 | E2E 90.0% [79.9, 95.3]; 0/25 unsafe executions |
| Historical Arabic held-out, Claude Haiku 5.5, commit 1445bff, n=180, run once | E2E 81.1% [74.8, 86.2]; 0/180 unconfirmed debits |
| Historical Sorani held-out, Claude Haiku 5.5, commit 49319bd, n=90, run once | E2E 92.2% [84.8, 96.2]; 0/90 unconfirmed debits |
| Wallet stress, four processes | 1,000 requests on 50 keys → 50 debits, 0 duplicates |
| Software checks on deployed commit 648e368 | 943 tests, 20 browser scenarios, green CI |

Labels are LLM-made, not human-reviewed; dev numbers were tuned on. Five interviews (Sulaymaniyah, ages 19–22): 2/5 had sent money to the wrong person; 3/5 would use this. [Full limits](docs/30-readiness-execution.md).

## What does not work yet

- **No held-out result for the live model.** Fresh heldout2 (180 cases) is frozen and unspent. It waits for human review.
- **No human-checked data.** Requests, labels and Sorani/Arabic copy have not been reviewed by native speakers.
- **Mixed Arabic and English** is only partly handled. "50k" and "50 الف" work. "fifty thousand" gets a rephrase request instead of a value, and euros are not named as unsupported. A 25-row code-switch dev set exists but has not been run on Gemini yet.
- **Free-tier limits:** about 15 requests a minute and 500 a day per project. A busy demo can exhaust them. Demo wallets reset on restart; Render sleeps when idle.
- Voice accuracy is unmeasured. There are no physical-phone or observed usability tests yet.

## What comes next

1. **Before 08/11:** run the code-switch dev set and measure model requests per turn on Gemini; human review of a data sample and the copy; physical-phone check; rehearse with unseen input; submit and book the session.
2. **After review and freeze:** run heldout2 once on Gemini 3.5 Flash-Lite and report it with CIs, failures included.
3. **For the progress review:** at least three documented failure modes are already in place ([21](FAILURE_MODES.md)). Next come broader usability tests, plus consented recordings before any voice claim. [Disclosure](DISCLOSURE.md).
