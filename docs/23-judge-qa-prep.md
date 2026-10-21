# 23 — Judge Q&A Prep

**Q: Why not let the agent call the payment API directly as a tool?**
A: The agent *does* use tools, but read-only ones (search contacts, bills, balance, quote) plus `propose`, which only creates a pending card. Payment is not a tool: that is OWASP LLM06 (Excessive Agency) applied. A tool call to pay would be the model choosing to move money. We keep authority in code. Execution needs a server-issued, payload-bound confirmation token that only the user's explicit confirm can redeem. A model cannot pay autonomously. A wrong proposal could still be approved by a user, so the card must be read; deterministic source checks and wrong-payload evaluation reduce that risk.

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
A: Yes, five, small and narrow: students aged 19–22 in Sulaymaniyah. All five send money by app and wished it was automated; all five wanted scheduling and preferred typing. Two had sent money to the wrong person, which is why the card shows name, masked number and amount in words. Three would use it, two would not. All five are native Kurdish speakers, and ZainCash serves the Kurdistan Region, so we built a Kurdish (Sorani) version: a language switch in the top bar, the same safety path, Kurdish numbers and time words read by code (historical Kurdish held-out 92.2%, 0/90 observed unconfirmed debits under scorer v1). We did not ask them about language, so their preference is the next thing to ask. We also mined 500 App Store reviews: people fear failed or stuck money more than extra taps.

**Q: What happens if the LLM provider goes down?**
A: Bounded timeout/retries → honest safe busy reply. Current Gemini uses process-local pacing for the observed 15 RPM quota; no fallback is configured locally. A quota/outage can still interrupt the demo. Historical and current checks are distinguished in docs/30.

**Q: Could this go to production at ZainCash?**
A: This is a synthetic sandbox, not a production payment product. Production would require ZainCash-owned authentication/authorisation, durable state and audit, risk controls and a reviewed integration. Masked read-only tool results, including synthetic balances, do reach the model provider; tokens and keys do not.

**Q: Why Claude and not free or local models?**
A: The author removed the paid Claude key and supplied Google AI Studio. Gemini 3.5 Flash-Lite is configured; dev verification and failures are in docs/30. Historical Haiku scores do not transfer to Gemini. Groq/local remain unmeasured. Fine-tuning is not currently justified or built; safety checks stay deterministic whichever model is selected.

**Q: What would you build next?**
A: Measured voice on consented recordings; broader human usability/dialect review; independent final evaluation. History-based amounts and Kurdish are already built. WhatsApp and recurring payments stay outside this MVP.
