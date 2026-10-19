# MVP update — Topic 04: Bill Pay & Transfer Agent (08/11/2026)

**Shahryar Sabir Muhammed (RegaLabs), solo** · repo: github.com/shahrryyar/zaincash-billpay-agent
**One line:** one Iraqi-Arabic sentence in, one confirmed, exactly-once transaction out, against a mock ZainCash
wallet with synthetic data. *The model understands; deterministic code moves money.*

## What works end to end (live, on any typed input)
- Transfers and bill payments, now or at a scheduled time; balance, bill amount, last transfer.
- Claude Haiku 5.5 turns dialect, Arabizi, relation words («أمي») and slang amounts into a JSON intent using
  **read-only** tools. It has **no tool that pays**. Zod validates every output; a deterministic resolver checks
  every name against the wallet; two Ahmeds is a question, never a guess.
- Confirmation card shows recipient + masked number, amount in digits and words, the real ZainCash fee (0.5%, min
  300), balance before → after, and «ما انرسل شي بعد». Only the Confirm button pays: a server-issued, single-use,
  120-second token bound to the payload hash, plus an idempotency key per card.
- Honest failures: insufficient balance, biller down, unknown contact, timeout after commit (replayed, one debit).
- Voice (optional): push-to-talk → RegaLabs Iraqi-Arabic ASR → the transcript is read back and runs only after «صح».
  Built and tested; switched on when the API key is set.

## Measured (every number from `eval/results/`, Wilson 95% CI)
| | Held-out, **run once** (n=180) | Dev (n=120, tuned on) |
|---|---|---|
| End-to-end task completion | **81.1%** [74.8, 86.2] | 92.5% [86.4, 96.0] |
| Unsafe executions on must-not-execute cases | **0/180** (upper bound 1.7%) | 0/120 |
| Ambiguity recall / precision | 100% (n=42) / 73.7% (n=57) | 96.3% / 92.9% |
| Intent accuracy / all slots correct | 96.8% / 79.4% (n=155) | 100% / 93.2% |
| p50 / p95 time to card | 2.3 s / 3.7 s | 2.2 s / 4.5 s |

Wallet stress: 1,000 concurrent requests on 50 keys from 4 processes → 50 debits, **0 duplicates**, money conserved.
700+ automated tests; CI runs typecheck, tests, build, secret scan and dependency scan on every push.

**Where it misses (all safe — it asked or refused, nothing moved):** «same amount as last time» (history not
implemented), malformed chatter answered as out of scope, «ورقة/دفتر» slang asked instead of refused, descriptor
words after a name. Held-out targets missed: slots (79% vs 90%), ambiguity precision (74% vs 85%), E2E (81% vs 90%).

## Honest limits
- Test labels were made by three LLM families and adjudicated by a script; **no human labelled or reviewed them**.
- **5 user interviews** (Sulaymaniyah, 19–22): all want sending automated and scheduled, prefer typing; 2/5 had sent to the wrong person; 3/5 would use it, 2/5 would not (reason not recorded). All 5 are native Kurdish speakers and ZainCash serves the Kurdistan Region, so we built a Kurdish (Sorani) version (language picker in the top bar). Whether they prefer it over Arabic was not asked: next interviews ask it. Tiny, one-city sample.
  Plus 500 public App Store reviews: people fear failed or stuck money and poor support, not "too many taps".
- Voice accuracy is **not measured yet** (needs consented recordings). Dialect copy awaits a native-speaker check.
- Disclosed conflict of interest: the voice ASR is the author's company's pre-existing service, used as an external API.

## Next (before the progress review)
1. Voice on: API key, consented recordings, WER/CER and voice end-to-end on our set.
2. More interviews (older users, other cities; ask why and which language); native-speaker review of the copy and 50 test items.
3. «Same as last time» from history; refuse USD slang — measured on a **fresh** test set (held-out is spent).
4. Demo rehearsal ×3 with a backup recording.

Disclosure: `DISCLOSURE.md` · failure modes: `FAILURE_MODES.md` · results: `eval/results/`.
