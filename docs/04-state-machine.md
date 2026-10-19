# 04 — Transaction State Machine

The state machine owns every step. The LLM proposes, the machine disposes.

## States

| State | Meaning | Exits |
|---|---|---|
| `IDLE` | Waiting for a request | `PARSED`, `REJECTED_INPUT` |
| `PARSED` | LLM returned JSON | `VALIDATED`, `NEEDS_REPHRASE` |
| `VALIDATED` | Zod passed, amount cross-check passed | `RESOLVED`, `CLARIFYING`, `FAILED_SAFE` |
| `CLARIFYING` | Missing or ambiguous slot; question asked | `VALIDATED` (on answer), `CANCELLED` |
| `RESOLVED` | Every entity maps to exactly one wallet record | `AWAITING_CONFIRM`, `FAILED_SAFE` |
| `AWAITING_CONFIRM` | Card shown, token issued, nothing sent | `EXECUTING`, `CANCELLED`, `EXPIRED` |
| `EXECUTING` | Wallet API called with idempotency key | `EXECUTED`, `FAILED_SAFE`, `UNKNOWN_OUTCOME` |
| `UNKNOWN_OUTCOME` | Timeout; retrying with the same key | `EXECUTED`, `FAILED_SAFE` |
| `EXECUTED` ✅ | Wallet confirmed | terminal |
| `FAILED_SAFE` ⛔ | Nothing was sent (or provably reversed) | terminal |
| `CANCELLED` | User cancelled | terminal |
| `EXPIRED` | Token expired before confirm | terminal (offer restart) |
| `NEEDS_REPHRASE` | Model output invalid or low confidence | `IDLE` |

Simplified chain shown in the demo:
`PARSED → VALIDATED → RESOLVED → AWAITING_CONFIRM → EXECUTED | FAILED_SAFE`

## Guards (pure functions, unit-tested)

| Transition | Guard |
|---|---|
| PARSED → VALIDATED | `intentSchema.safeParse(out).success` AND `amountAgrees(llmAmount, parseAmount(text))` when an amount is present |
| VALIDATED → CLARIFYING | any required slot missing, OR `candidates.length > 1`, OR `actions.length > 1` not yet split, OR ASR confidence < threshold |
| VALIDATED → FAILED_SAFE | intent `out_of_scope` / `unsupported` (polite refusal) |
| RESOLVED → FAILED_SAFE | `balance < amount + fee`, limit exceeded, biller inactive, bill already paid |
| AWAITING_CONFIRM → VALIDATED (new card) | bill's outstanding amount **increased** since the card was issued (PSD2-style: higher final amount ⇒ re-authorise) → revoke token, re-quote, new card |
| RESOLVED → AWAITING_CONFIRM | all checks pass → issue token bound to `hash(payload)` |
| AWAITING_CONFIRM → EXECUTING | `token valid && !used && !expired && hash(payload) === token.hash` |
| EXECUTING → UNKNOWN_OUTCOME | network timeout / 5xx |
| UNKNOWN_OUTCOME → * | retry ≤ 3 with **same** idempotency key; still unknown → query `GET /transactions?idempotencyKey=` → decide; still unknown → `FAILED_SAFE` with "we're checking, don't resend" message |

## Multi-action requests
«ادفع الكهرباء ودز لعلي عشرة آلاف» → the LLM returns `actions: [billPay, transfer]`. The machine queues them and runs **each through the full chain separately**: its own card, token and key. Cancelling one does not cancel the other unless the user says so.

## Tool loop sits inside PARSED
`PARSED` may involve up to 4 read-only tool calls (docs/05 §Tools). The machine only sees the **final** intent or a `propose`d draft. A `propose` never moves state past `VALIDATED` by itself: Zod, cross-checks and resolver provenance still run.

## Clarification loop
- At most **2 clarification turns per slot**. Then `FAILED_SAFE` with "let's start again" copy, so the loop can't run forever.
- Clarification answers can be a tap (choose a candidate card) or text/voice («الأول», «أحمد علي», «اللي رقمه ينتهي 4471»).
- The resolver re-runs against the **original candidate set only**. A clarification answer can't introduce a new recipient silently.

## Changes after confirmation card
If the user edits the amount or recipient while in `AWAITING_CONFIRM`, the old token is **revoked**, the machine returns to `VALIDATED`, and a new card and token are issued. A token never covers a payload it wasn't issued for.

## Session storage
In-memory map keyed by `sessionId` for the demo (plus SQLite for tokens and keys, so state survives a server restart). Every transition is appended to `audit_log` (docs/14).

## Implementation note
Write it as a plain reducer, `transition(state, event, ctx) → {state, effects[]}`, with no side effects inside. The orchestrator performs the effects (call LLM, call wallet). This makes the machine 100% unit-testable and replayable from the audit log.
