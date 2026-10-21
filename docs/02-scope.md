# 02 — Scope Control

## In scope
- **P2P transfers** to existing contacts, including a saved contact selected by a valid Iraqi mobile number. Unsaved numbers are refused with an explanation; the demo never creates contacts.
- **Bill payments** to billers in the mock catalogue.
- Read-only helpers: balance, bill amount, last transfer.
- Text input (first-class, never cut).
- Voice input via the RegaLabs Iraqi-Arabic ASR developer API (stretch; built, local Stage-11 API configured for laptop tests: docs/09).
- One-off **scheduled** transfers and bill payments (added 2026-10-16 at the author's request: docs/27).
- Mock ZainCash wallet API.
- Evaluation harness and held-out test set.

## Out of scope (say "no" fast)
- Real payment rails, real ZainCash APIs, real customer data.
- Loans, merchant payments, QR, cash-out, card management, top-up from bank.
- Recurring payments («كل شهر» asks for one time). One-off scheduling is in scope (docs/27).
- Fraud scoring (that is Topic 01). Basic limits only.
- Account creation / KYC (Topic 05).
- Multi-turn small talk. The agent stays on task.
- Fine-tuning, unless the API model fails the eval (docs/10).

## Never cut 🔒
1. Text interaction
2. Safety state machine
3. Ambiguity handling
4. Explicit confirmation
5. Idempotency
6. Mock wallet API
7. Failure handling + evaluation

## Cut first, in order
1. TTS read-back
2. Fine-tuned model (if the API model already passes)
3. Visual polish (non-essential UI)
4. Voice (only if absolutely necessary — it is a differentiator, so protect it after the core)
5. WhatsApp channel (docs/16) — only if everything else is done

## Scope rule of thumb
> Flawless execution before extra features. If a feature cannot be evaluated on the held-out set, it is a nice-to-have.
