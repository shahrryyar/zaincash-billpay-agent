# 23 — Judge Q&A Prep

**Q: Why not let the agent call the payment API directly as a tool?**
A: The agent *does* use tools, but read-only ones (search contacts, bills, balance, quote) plus `propose`, which only creates a pending card. Payment is not a tool: that is OWASP LLM06 (Excessive Agency) applied. A tool call to pay would be the model choosing to move money. We keep authority in code. Execution needs a server-issued, payload-bound confirmation token that only the user's explicit confirm can redeem. Even a fully wrong model output can't send money; at worst it shows a wrong card that the user cancels.

**Q: Isn't this just a form with extra steps?**
A: The agent investigates (calls tools, sees two Ahmeds, asks you), plus turning messy Iraqi dialect, Arabizi, relation words («أمي»), slang amounts («ربع مليون») and two-in-one requests into a structured plan, then running a clarification dialogue. The money path is deliberately boring.

**Q: Why not LangGraph / multi-agent?**
A: A fixed, auditable flow is a state machine. A framework adds nondeterminism and no evaluation gain. The brief rewards simple and reliable. (I maintain a LangGraph+Zod library, so this is a choice, not a gap.)

**Q: How do you prevent double payment?**
A: Idempotency key per confirmation card, stored atomically with the debit in one DB transaction. A retry replays the stored result. We tested 20 concurrent duplicates × 50 keys plus timeout-after-commit, and measured 0 duplicates. Shown live.

**Q: ASR makes mistakes on names and numbers. Isn't voice unsafe for payments?**
A: Voice never shortens the safety path. The RegaLabs API gives no confidence, so every voice request is read back («سمعتك تگول: … صح؟») and nothing reaches the model until the user taps «صح». Low confidence (if a provider gives one) → re-ask. Names only resolve against existing contacts, so ambiguity leads to a question. Amounts are double-parsed and shown in digits and words. The card is mandatory. WER and voice E2E are measured only on real consented recordings (eval/voice); if we have none, we say so.

**Q: You founded RegaLabs. Isn't using your own ASR unfair?**
A: Disclosed in full. The ASR is pre-existing and used as an external API, like any team using a cloud ASR. Everything built for this challenge is in the repo with commit history. Text works fully without it.

**Q: How do you know your test set isn't contaminated?**
A: The 300 candidates were split 40/60 per category before labelling, and the held-out hash was committed before its single run. Prompts were tuned on dev only. Labels were **not** made by hand: three LLM families labelled independently and a script adjudicated (eval/data/README.md). That is a real limitation, and we say it: numbers are against LLM-adjudicated labels, not human ground truth.

**Q: Did you talk to real users?**
A: Yes, five, small and narrow: students aged 19–22 in Sulaymaniyah. All five send money by app and wished it was automated; all five wanted scheduling and preferred typing. Two had sent money to the wrong person, which is why the card shows name, masked number and amount in words. Three would use it, two would not. All five speak Kurdish, so Kurdish support is the clearest next step. We also mined 500 App Store reviews: people fear failed or stuck money more than extra taps.

**Q: What happens if the LLM provider goes down?**
A: Timeout → one retry → honest "system busy, nothing was sent". Optional fallback to the second provider; both are benchmarked.

**Q: Could this go to production at ZainCash?**
A: The architecture maps directly: swap the mock wallet for ZainCash's internal APIs, add PIN/biometric at confirm, plug the existing fraud engine into the `/quotes` pre-check. Data minimisation already keeps contacts and balances away from the model provider.

**Q: Why Claude and not free or local models?**
A: The author had a paid Anthropic key; Haiku 5.5 is fast with tool use. Groq/Gemini/local adapters exist but were not benchmarked (no keys), so we make no claim about them. A fine-tune (or local model for data residency) is the documented next step if the API model fails, or if ZainCash requires on-prem.

**Q: What would you build next?**
A: Measured voice on real recordings; «same as last time» from history; WhatsApp voice notes; Kurdish (Sorani) requests for KRG users; recurring bills (one-off scheduling already works); integration with Topic 01 fraud signals at the confirmation step.
