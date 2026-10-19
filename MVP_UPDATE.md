# MVP update — Topic 04: Bill Pay & Transfer Agent

Shahryar Sabir Muhammed (RegaLabs) · repo: github.com/shahrryyar/zaincash-billpay-agent · <!-- date of submission -->

**One sentence in Iraqi Arabic → one confirmed transaction, sent exactly once. The model understands; code moves money.**

## What works (end to end, in the repo)
- **The flow:** «دز خمسين ألف لأحمد» → the model fills a strict JSON intent (Zod-checked) → code resolves it against the
  mock wallet → **two Ahmeds is a question, not a guess** → confirmation card (who, amount in digits and words, fee,
  balance before → after, 120 s timer, "nothing sent yet") → one tap → receipt with a reference.
- **No double payment:** server-issued, single-use token bound to the exact payload, plus an idempotency key per card.
  Stress test: 1,000 concurrent requests on 50 keys, 4 processes → **50 debits, 0 duplicates**.
- **Fails safe and says so:** insufficient balance, unknown contact, paid bill, biller down, timeouts, unknown outcome
  («ما متأكدين… لا تعيد الإرسال», rechecked by the same key), prompt injection, two requests in one sentence.
  **20 documented failure modes, each with an automated test** (FAILURE_MODES.md).
- **Also:** scheduled payments ("pay the generator tomorrow 9 AM"), optional voice (read-back before anything happens),
  a demo panel to break it on purpose, one sandboxed wallet per browser session, a Docker image.
- **Tests:** 775 unit/property tests + 8 browser tests, run in CI on every push.

## First results (measured by the harness; labels LLM-made, not human-checked)
| Set | Model | End-to-end | Unsafe executions |
|---|---|---|---|
| Held-out, 180 cases, run once (commit `1445bff`) | Claude Haiku 5.5 | **81.1%** [74.8, 86.2] | **0/180** |
| Dev, 120 cases (tuned on) | Claude Haiku 5.5 | 92.5% | 0/120 |

Ambiguity recall 100% (n=42), p50 / p95 time to card 2.3 s / 3.7 s. Every miss was safe (it asked or refused).

## What does not work yet
- **No live model key right now** → only the scripted demo sentences run. Fix: a free Groq / Gemini key (our code
  already supports both).
- Fixes made after the held-out run (same-amount-as-last-time, words after names, «ورقة/دفتر», chatter) are **not
  measured yet**. A fresh frozen set (`heldout2`, 180 new cases) waits for its single run.
- No human has checked the test labels or interviewed users yet. Voice needs its ASR key and real recordings.
- Known miss: «بعد الظهر» is read as 12:00 instead of asking the hour.

## Next (to the progress review)
1. Free model key → dev run → **`heldout2` run once** with the model we will demo; publish the numbers as measured.
2. Hand review of a 58-row sample of the test set; fix wording, re-freeze, disclose.
3. Talk to 5+ real wallet users (bill pay / transfers); log what they say.
4. Voice: record 40–60 consented utterances, measure WER and name/amount survival.
5. Host the demo (Render / VPS) and rehearse with unexpected judge input.
