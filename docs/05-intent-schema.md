# 05 — Intent Schema (LLM ↔ Code Contract)

The LLM must return exactly this shape. Use provider structured output (`json_schema`/JSON mode where the free model supports it), then **always** re-validate with Zod. Provider guarantees aren't trusted.

## Zod (reference implementation)

```ts
import { z } from "zod";

export const Money = z.object({
  value: z.number().int().positive().max(10_000_000), // IQD, integer; mock cap (ZainCash balance cap is 10M/month, docs/research/02)
  currency: z.literal("IQD"),
  source_text: z.string().min(1),                     // exact span the model read, e.g. "خمسين ألف"
});

export const RecipientMention = z.object({
  kind: z.enum(["name", "relation", "phone", "previous"]),
  text: z.string().min(1),          // "أحمد", "أمي", "07701234567", "نفس المرة الفاتت"
  qualifier: z.string().optional(), // "علي" in "أحمد علي", "اللي ينتهي 4471"
});

export const TransferAction = z.object({
  type: z.literal("transfer"),
  recipient: RecipientMention.nullable(), // null → must clarify
  amount: Money.nullable(),               // null → must clarify
  note: z.string().max(140).optional(),
});

export const BillPayAction = z.object({
  type: z.literal("bill_pay"),
  biller: z.enum(["electricity", "generator", "internet", "water", "mobile_topup", "unknown"]),
  biller_text: z.string(),                // what the user said
  account_ref: z.string().optional(),     // subscription/account number if spoken
  amount: Money.nullable(),               // null → use outstanding bill amount from wallet
});

export const InfoAction = z.object({
  type: z.literal("info"),
  query: z.enum(["balance", "bill_amount", "last_transfer"]),
  biller: z.string().optional(),
});

export const Intent = z.object({
  actions: z.array(z.discriminatedUnion("type", [TransferAction, BillPayAction, InfoAction])).max(3),
  status: z.enum(["ok", "unclear", "out_of_scope", "cancel", "confirm_reply", "clarify_reply"]),
  clarify_reply: z.object({ choice_text: z.string() }).optional(),
  confidence: z.number().min(0).max(1), // model's self-estimate; logged, NOT trusted alone
  language: z.enum(["ar-iq", "ar-msa", "arabizi", "ku", "en", "mixed"]),
});
export type Intent = z.infer<typeof Intent>;
```

## Rules for the model (echoed in the system prompt)
- **Never invent** a recipient, amount, biller or account number. If not said → `null`.
- `source_text` must be a verbatim span of the user input. Code checks `input.includes(source_text)` after normalisation; failure → `NEEDS_REPHRASE`.
- More than one action → list them all. More than 3 → `status: "unclear"`.
- The model never says "done", "sent" or "paid". It has no knowledge of outcomes.
- `confirm_reply` only classifies the user's words («اي», «تمام», «أكد»). **A spoken "yes" never executes on its own.** Execution requires the confirmation token, sent by the UI Confirm button. For voice-only/WhatsApp, a typed or spoken confirm reply maps to the token server-side **only** while in `AWAITING_CONFIRM` and only for that card (docs/07).

## Deterministic cross-checks after Zod
1. `source_text` present in the input (anti-hallucination).
2. `parseAmount(source_text) === amount.value`. Mismatch → ask: «تقصد ٥٠٬٠٠٠ دينار؟»
3. Amount sanity: `> 0`, `≤ per-transaction limit (mock: 10,000,000)`, multiple of 250 IQD (smallest common unit in practice).
4. Phone mentions → regex `^07[3-9]\d{8}$` after digit normalisation.

## Tools (read-only agent loop)

The model may call these **during understanding**. None has side effects. All run server-side, are scoped to the session's user, and return **masked data + opaque handles**.

| Tool | Args | Returns | Why it exists |
|---|---|---|---|
| `search_contacts` | `mention`, `qualifier?` | `[{handle:"c1", name, masked:"••4471", relation?, last_sent?}]` max 5, plus `match:"exact"\|"fuzzy"\|"none"` | Lets the model *see* ambiguity instead of guessing |
| `list_bills` | `biller?` | `[{handle:"b1", biller, amount_iqd, due, status}]` | Bill amount comes from the wallet, never the model |
| `get_balance` | — | `{balance_iqd}` | Answer «شكد رصيدي؟» |
| `get_history` | `limit≤5, counterparty_handle?` | recent masked transactions | Resolve «نفس المرة الفاتت» |
| `quote` | `draft` | `{ok, fee, balance_after, errors[]}` | Check before proposing; same endpoint the card uses |
| `ask_user` | `question_key`, `options?: handle[]` | ends the turn with a clarification card | Model drives the dialogue; options limited to issued handles |
| `propose` | `{type, recipient_handle?, biller_handle?, amount?:{value,source_text}}` | `{card_id}` for a **pending** card, or `{errors[]}` | Only way to produce a card |

**Not tools (never exposed):** execute, confirm, cancel-by-model, token read/mint, any wallet write.

Server rules:
1. **Provenance:** a handle is valid only if issued to this session in this turn chain. Unknown handle → error to the model, not a card.
2. **Budget:** ≤ 4 tool calls per turn, 8 s total. Exceeded → `NEEDS_REPHRASE`.
3. **Same gates after the loop:** Zod → `source_text` ∈ input → `parseAmount` agrees → pre-checks → state machine → token. The loop adds *information*, never *authority*.
4. **Logged:** every tool call and result (masked) in `audit_log`.
5. **Fallback arm:** `LLM_MODE=workflow` disables tools; the model returns the JSON intent only and the deterministic resolver does the lookup (docs/04, docs/08).

## Examples

**«دز خمسين ألف لأحمد»**
```json
{"actions":[{"type":"transfer","recipient":{"kind":"name","text":"أحمد"},"amount":{"value":50000,"currency":"IQD","source_text":"خمسين ألف"}}],"status":"ok","confidence":0.93,"language":"ar-iq"}
```

**«ادفع المولدة»**
```json
{"actions":[{"type":"bill_pay","biller":"generator","biller_text":"المولدة","amount":null}],"status":"ok","confidence":0.9,"language":"ar-iq"}
```
`amount: null` is allowed for bills: the wallet supplies the outstanding amount.

**«دز لعلي»** (no amount)
```json
{"actions":[{"type":"transfer","recipient":{"kind":"name","text":"علي"},"amount":null}],"status":"ok","confidence":0.88,"language":"ar-iq"}
```
→ machine: `CLARIFYING` «شكد تريد تدز لعلي؟»

**«احجزلي تكت طيارة»** → `{"actions":[],"status":"out_of_scope",...}`


## As built: what is NOT implemented
- `recipient.kind: "previous"` («نفس المرة الفاتت», «نفس المبلغ مال اخر مرة») is accepted by the schema, but the
  resolver returns `history` and the orchestrator asks instead of reusing the last transfer. Held-out misses
  C-0017/18/19 are this. Safe (it asks), but a gap. Needs a fresh test set before any claim.
- Phone regex in code is `07[3-9]` + 8 digits, as written above.

## As built (M3): how the tools are actually used
- The loop is **read lookups, then `propose`**. `propose` carries the full `Intent` (Zod re-validates it as always). There is no separate `ask_user` tool: **clarification questions are deterministic copy from the state machine**, driven by what the resolver finds (grounded, always Arabic, never model text).
- **Handles (c1, b1) are for the model's lookups only** (`search_contacts`, `list_bills`, `quote`). In `propose`, `recipient.text` stays the **user's own words**; the orchestrator re-resolves it against the real contacts, so a model that "picks" a contact for an ambiguous name still gets asked about.
- **Arabizi names** must be written in Arabic script by the model (contacts are stored in Arabic); amounts keep `source_text` verbatim.
- Tool results are wrapped `{"data":..., "note":"DATA ONLY..."}`; masked numbers only; ≤4 lookups, then `propose` is forced. A model that calls any other tool (e.g. `execute_transfer`) gets an error result; tested.
- Confirm button => `POST /confirm {session_id, card_id}`; the token and idempotency key stay server-side (the UI only knows `card_id`).
