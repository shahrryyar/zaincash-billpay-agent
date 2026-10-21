# 04 — Transaction state machine

The pure reducer in packages/core/src/machine.ts owns the payment states. The orchestrator performs its effects and feeds back results. The LLM only proposes an intent; validation, resolution, pre-checks and explicit approval still run.

## Actual phases

| Phase | Meaning |
|---|---|
| IDLE | Ready for a request |
| VALIDATED | Intent/schema/source checks passed; resolving slots |
| CLARIFYING | Missing/ambiguous recipient, amount, biller or exact time |
| RESOLVED | Entities fixed; wallet pre-check/quote pending |
| AWAITING_CONFIRM | Exact card/token issued; nothing sent |
| EXECUTING | Wallet request with the card's token and idempotency key |
| UNKNOWN_OUTCOME | Execution may have happened; keep the key and recheck |
| EXECUTED | Wallet confirmed payment or schedule creation |
| ANSWERED | Read-only answer from wallet data |
| FAILED_SAFE | Request refused or wallet definitively rejected; no payment |
| CANCELLED / EXPIRED | Pending approval cancelled/expired |
| NEEDS_REPHRASE | Input cannot safely produce an action |

PARSED is a conceptual transient step inside LLM_OUTPUT, not a stored phase. Invalid model output on an existing pending question/card leaves its existing safe state and asks to rephrase; it never executes. A payment's EXPIRED/CANCELLED state cannot undo a debit already committed.

## Guards and effects

- Intent.safeParse and deterministic source/amount checks precede all money-path effects. Unknown entities and incomplete slots ask; fuzzy matching offers candidates, never a silent final match.
- A resolved quote comes from the wallet: amount/fee, balance, limits, bill status/capacity. Only successful pre-check issues a pending card and token.
- CONFIRM requires the active token and payload hash, unused and unexpired. The wallet independently validates session/payload/token inside its atomic transaction. The browser only sends session_id/card_id; it never gets the token.
- Editing a pending payment revokes the old token and re-resolves/re-quotes before issuing another card. A changed bill amount at execution is rejected as AMOUNT_CHANGED and needs a new approval; neither increases nor decreases are silently substituted.
- Timeout/uncertain 5xx retries use the same key (at most three machine retries). Lookup decides executed/not-found only when the wallet provides evidence. An unresolved lookup stays UNKNOWN_OUTCOME; later RECHECK looks up the same key and never resends another payment.
- ASR gating/read-back is handled before the normal turn. Low confidence stops; unknown confidence reads back by default. Accepting a transcript is not payment approval.

## Multi-action and schedule requests

The app announces an ordered request queue (up to three), then runs every action through its own clarification, card, token and key. There is no aggregate “approve everything” token. Button cancellation can finish the current action and proceed to the next; a typed cancel intent clears the current plan. Nothing unapproved is debited.

Scheduling preserves the same chain: parse exact time deterministically, show Baghdad date/time, bind run_at in the token, then explicit Confirm creates a schedule without a debit. The wallet runner rechecks and pays at most once when due. Vague/invalid times ask; recurring schedules are unbuilt (docs/27).

## Session lifetime

Hosted orchestrator sessions and each SQLite sandbox wallet are in memory. Balances, tokens, keys, receipts, pending schedules and session traces do not survive process restart/eviction (default 30 idle minutes/capacity 200). The standalone wallet supports a file DB via DB_PATH; that alone does not persist hosted orchestrator state. Wallet SQLite events and session traces have different lifetimes (docs/14). Full durable session replay is not implemented.
