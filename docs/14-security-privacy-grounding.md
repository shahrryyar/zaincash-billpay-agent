# 14 — Security, Privacy, Grounding (15% of score)

## Grounding: every output traceable to data
- Every name, masked number, amount, fee, balance and biller shown on a card comes from a **wallet DB read**, with record ids attached to the card model (`to_id`, `bill_id`). Model text is never shown as fact.
- The success message shows the **transaction id from the wallet** and the post-transaction balance read back from the wallet.
- A "Why?" toggle on the card (judge-facing) shows: user text → intent JSON → resolver candidates → checks passed. Traceability made visible.

## Model capability boundaries
| The model can | The model cannot |
|---|---|
| Read the user text + state summary + biller names | See the full contact list, unmasked phones, tokens or keys |
| Call **read-only tools** (masked results, session handles) | Call any wallet write/execute endpoint |
| `propose` a pending card, `ask_user` | Produce, read or redeem a confirmation token |
| Output JSON intent; classify replies | Invent a recipient (handles are server-issued) |

**Maps to OWASP LLM06 Excessive Agency:** minimal, granular tools; minimal permissions (read-only); human approval for the one high-impact action; authorisation enforced downstream, not by the model. Tool results are also an injection surface (a contact *name* can contain instructions): they are wrapped as data and masked, and the model still cannot execute.

Execution endpoints require a server-issued token that only the confirm action can redeem. **Even a fully compromised model output can't move money.** At worst it produces a wrong card, which the user sees and can cancel.

## Prompt injection
- User text, contact names and notes are wrapped as data in the prompt. The system prompt says data is never instructions.
- Structural defence matters more than prompt wording: no tool, Zod, resolver against real data, mandatory card.
- Injection cases are in the held-out set (docs/11) and reported (S1/S2).

## Privacy
- **Synthetic data only.** No real names, phone numbers or IDs. Phone numbers come from an obviously fictional range.
- Data minimisation to LLM providers: no contact list, no balances, no phone numbers unless the user typed one. Mask phone numbers in logs (`07••••••471`).
- Voice: one WAV per utterance goes from our server to the RegaLabs developer API (key server-side; the browser never
  talks to RegaLabs). This app stores audio only when `VOICE_CAPTURE_DIR` is set (consented eval collection, local,
  gitignored). RegaLabs' own retention for API audio: ask the author to state it before demo day.
- Recording consent for the voice eval subset: a written/recorded consent line from each speaker. Fictional content only.
- Session data lives in memory/SQLite locally; `/admin/reset` wipes it.

## Audit log
Append-only `audit_log` row for every state transition: `ts, session_id, from_state, to_state, event, intent_json (redacted), resolver_result, token_id (not value), idempotency_key, wallet_response_code, latency_ms, provider, model`.
Used for: debugging, the eval harness, and showing judges the trail of one transaction.

## Secrets
- `.env` is never committed. `.env.example` lists the keys (docs/21).
- The RegaLabs ASR key stays on the server (`/api/voice` proxies the audio); the browser never sees it. No LiveKit.
- Admin/fault endpoints only enabled with `DEMO_MODE=1` and a header secret.

## Responsible-AI notes for the pitch
- The user stays in control: nothing is blocked or executed without their explicit act.
- Accessibility: voice + large type + plain dialect for elderly/low-literacy users.
- Limits: a per-transaction and daily cap in the mock to show where real risk controls would plug in (Topic 01 territory).
- Known weakness: ASR errors cluster in names and numbers. Not yet measured on this task (docs/09). Mitigated by the
  voice gate + read-back, the resolver (existing contacts only) and the mandatory card.
