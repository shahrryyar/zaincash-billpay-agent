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
| `propose` an Intent for a pending card; code asks the questions | Produce, read or redeem a confirmation token |
| Output JSON intent; classify replies | Bypass the deterministic resolver or submit an arbitrary wallet id |

**Maps to OWASP LLM06 Excessive Agency:** minimal, granular tools; minimal permissions (read-only); human approval for the one high-impact action; authorisation enforced downstream, not by the model. Tool results are also an injection surface (a contact *name* can contain instructions): they are wrapped as data and masked, and the model still cannot execute.

Execution endpoints require a server-issued token that only the confirm action can redeem. A compromised model cannot pay autonomously. A user could still approve a wrong pending card; readable approval, source checks and wrong-payload evaluation remain necessary.

## Prompt injection
- User text, contact names and notes are wrapped as data in the prompt. The system prompt says data is never instructions.
- Structural defence matters more than prompt wording: no tool, Zod, resolver against real data, mandatory card.
- Injection cases are in the held-out set (docs/11) and reported (S1/S2).

## Privacy
- **Synthetic data only.** No real names, phone numbers or IDs. Phone numbers come from an obviously fictional range.
- Data minimisation: no full contact dump, unmasked stored phones, tokens or keys. Read-only tools can send selected synthetic names, masked phone suffixes, balances, bill amounts, fees and history to the provider. Raw user text also reaches the provider, including any phone number the user typed. Use synthetic account data only; logs/traces must redact credentials.
- Voice: one WAV per utterance goes from our server to the RegaLabs developer API (key server-side; the browser never
  talks to RegaLabs). This app stores audio only when `VOICE_CAPTURE_DIR` is set (consented eval collection, local,
  gitignored). RegaLabs' own retention for API audio: ask the author to state it before demo day.
- Recording consent for the voice eval subset: a written/recorded consent line from each speaker. Fictional content only.
- Session data lives in memory/SQLite locally; `/admin/reset` wipes it.

## Audit log
Two separate traces exist. The orchestrator keeps state transitions (`ts`, session, from/to, event, reason) in session memory and returns per-turn intent/tool traces for the Why panel. The wallet appends token issuance/revocation, execution/replay/rejection and scheduling events to SQLite; token values are never logged. The hosted wallet DB is in memory too. These are useful debugging/evaluation traces, not a persistent, complete audit-replay system across restarts. Full durable audit storage is not claimed.

## Secrets
- `.env` is never committed. `.env.example` lists the keys (docs/21).
- The RegaLabs ASR key stays on the server (`/api/voice` proxies the audio); the browser never sees it. No LiveKit.
- Standalone wallet admin/fault endpoints require DEMO_MODE=1 and a header secret. The web demo panel controls only the caller’s synthetic sandbox; it is not a production admin authentication system.

## Responsible-AI notes for the pitch
- The user stays in control: nothing is blocked or executed without their explicit act.
- Accessibility design: optional voice, large type and plain dialect. Benefits for elderly/low-literacy users remain a hypothesis pending usability evidence.
- Limits: a per-transaction and daily cap in the mock to show where real risk controls would plug in (Topic 01 territory).
- Known weakness: ASR errors cluster in names and numbers. Not yet measured on this task (docs/09). Mitigated by the
  voice gate + read-back, the resolver (existing contacts only) and the mandatory card.
