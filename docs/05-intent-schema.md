# 05 — Intent contract and read-only tools

Updated 2026-10-21. The executable contract is `packages/core/src/schema.ts`; tool input schemas are in `packages/llm/src/tools.ts`. Do not maintain a second, divergent schema in prose.

## Intent

`actions` holds at most three ordered transfer, bill_pay or info actions. `status` is ok, unclear, out_of_scope, cancel, confirm_reply, clarify_reply or schedule_help. `confidence` is logged but never authorises execution. Languages: ar-iq, ar-msa, arabizi, ku, en, mixed.

| Action | Fields |
|---|---|
| transfer | recipient (name/relation/phone/previous mention, optional qualifier) or null; amount or null; optional note; optional amount_ref `{kind: previous, source_text}`; optional when_text |
| bill_pay | biller catalogue code or unknown; biller_text; optional account_ref; amount or null; optional when_text |
| info | query balance, bill_amount or last_transfer; optional biller |

Money is positive integer IQD up to the mock 10,000,000 schema ceiling, with an exact source_text. Wallet business limits are separate and may be lower. Missing recipient/amount defaults to null; selected optional null fields are removed before strict Zod parsing. Unknown fields and invalid shapes fail closed.

## Deterministic gates

1. Zod validates every model result, including a proposed Intent.
2. Amount source_text must be present in normalised input, agree with parseAmount, and be a multiple of 250. A bare dropped-thousands amount asks for the unit; non-IQD currency is refused.
3. when_text must occur in the input. Code alone parses the time; a vague/invalid time asks instead of acquiring false precision.
4. References to a previous amount must be recognised user words; the amount comes from wallet history for the resolved recipient. No history means ask. A previous recipient is not silently guessed.
5. Iraqi phone numbers match `^07[3-9]\d{8}$` after normalisation. Only saved contacts can be paid; a valid unsaved number produces an honest clarification.
6. Kurdish recipient words are cross-checked against input. All names/billers are resolved against wallet records and ambiguous/fuzzy matches ask. Model-selected ids have no authority.
7. Pre-checks and the state machine must pass before a card is created. Only the user's Confirm button can redeem its payload-bound token. Spoken/typed yes never executes.

## Actual tool loop

The tools are search_contacts, list_bills, get_balance, get_history, quote and propose. There is **no ask_user tool**: questions use deterministic copy selected by the state machine. There is no tool that executes, confirms, creates/runs/cancels schedules, or reads/mints tokens.

Lookup results carry masked synthetic display data and session handles (c1, b1) for later lookups/quotes. They are wrapped as data, not instructions. The model may receive selected names, masked phones, balances, bills, fees and history; disclose that accurately.

`propose` carries the full Intent, not a handle-selected recipient. The orchestrator re-resolves the user's words against the real seed, so a model cannot select one Ahmed to bypass a two-Ahmed question. At most four read-only lookups are allowed, then propose is forced. Workflow mode disables lookup tools and uses the same downstream validation.

Example: «دز خمسين ألف لأحمد» gives a transfer mentioning أحمد and 50000 from «خمسين ألف». Two matching contacts produce CLARIFYING; the user's choice produces a card. The browser posts `{session_id, card_id}` to `/api/confirm`; token and idempotency key stay on the server.

Two actions are announced and processed separately, with every missing/ambiguous slot clarified and a separate card/token/key/approval per payment. Nothing executes simply because the sentence contains multiple actions.
