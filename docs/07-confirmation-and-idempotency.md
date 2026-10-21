# 07 — Confirmation Token & Idempotency

Two hard safety gates, both targeting **0**:
- **0 transactions without explicit confirmation**
- **0 duplicate payments under retries**

## Confirmation token

**Issued** when the machine enters `AWAITING_CONFIRM`:
```
payload = canonicalJSON({kind, from, to_id, biller_id?, account_ref?, amount_iqd, fee_iqd, run_at?})
token   = "ct_" + random(128 bit)
store   { token, session_id, payload_hash: sha256(payload), expires_at: now + 120s, used_at: null }
```

**Design basis:** PSD2 RTS Art. 5 *dynamic linking*: the payer sees amount and payee; the authorisation is specific to them; any change invalidates it; a higher final amount needs re-authorisation (EBA Q&A 2020_5133). See docs/research/02.

**Properties**
- **Bound to payload.** Changing amount, recipient or biller means a new hash, so the old token is useless.
- **Single-use.** `used_at` is set inside the execute transaction.
- **Short-lived.** 120 s. The card shows a countdown. Expiry → «انتهى الوقت، نعيد؟» ("time ran out, try again?").
- **Never produced by the LLM.** The model has no path to read or mint tokens.
- **Redeemed only by the Confirm button.** Web text and voice both require a tap on the exact active card. Typed/spoken yes, including «أكد», never executes. The browser sends only session_id and card_id; the token and idempotency key remain on the server. WhatsApp is unbuilt and adds no alternate confirmation path.

**Why not just a boolean "confirmed"?** A boolean can be set by a bug, a replayed request, or a model hallucinating «تم». A payload-bound token turns "the user saw *this exact* card and pressed confirm" into something the server can check.

## Idempotency key

- Generated **when the confirmation card is created** (UUIDv4), stored with the session, sent on every execute attempt for that card.
- Server stores `key → (request_hash, response)` atomically with the debit (docs/06).
- Retries (client timeout, double tap, network flap, page refresh) reuse the key → replay the stored result.
- A new card means a new key. Two genuinely separate payments of the same amount to the same person are both allowed, because each has its own card, confirmation and key.

## The retry sequence (demo this live)

```
try 1  key=K  → server debits, commits, response lost (timeout_after_commit)
client → UNKNOWN_OUTCOME, show «جاي نتأكد…» ("checking…")
try 2  key=K  → server finds K → replays original result (Idempotent-Replay: true)
client → EXECUTED, single debit, same reference number
balance check → debited once ✅
```

If all retries fail: `GET /transactions?idempotencyKey=K` decides. If still unknown, show the honest message «ما متأكدين إذا انرسلت. لا تعيد الإرسال، راح نتأكد ونبلغك» ("Not sure if it went through. Don't resend; we'll check and tell you") and keep the key, so any later retry is still safe.

## Double-tap protection in UI
The Confirm button disables on first tap, but **don't rely on UI**. The server key is the real guarantee. The eval fires parallel duplicate requests to prove it.

## Tests that must exist
- Execute without token → 403, balance unchanged.
- Execute with a token for a different payload → 403.
- Reuse a used token → 403.
- Expired token → 403.
- Same key twice → 1 transaction, identical responses.
- Same key, different payload → **422** (IETF idempotency-key draft-07; it is a draft, not an RFC).
- Same key while the first request is in flight: **not an error state in our design**. Check+execute is one atomic transaction, so duplicates are serialised and replayed (no 409 is ever emitted). Proved by the multi-process stress test.
- Idempotency keys are retained for the lifetime of the wallet database; there is no 24-hour expiry/cleanup. Hosted in-memory wallets disappear at sandbox eviction/restart. Do not delete keys while their payments can be retried.
- Bill amount rises between card and execute → `AMOUNT_CHANGED`, nothing debited, new card.
- 20 concurrent requests with the same key → exactly 1 transaction.
- `timeout_after_commit` + retry → 1 transaction.
