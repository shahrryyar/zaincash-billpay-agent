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

## OWASP LLM Top 10 (2025) walk-through (2026-10-25)

The organisers' resources guide points to this list for the risks section (docs/35 RS-11). Each row names the control and its evidence. "Not applicable" means the design has no such component. This is a design walk-through, not a penetration test or a red-team result.

| Risk | How this system handles it | Evidence | Residual risk |
|---|---|---|---|
| LLM01 Prompt injection | Structural: the model has no payment tool. User text and tool results are wrapped as data. Zod, the source-span cross-check and the resolver run on every output, and a card needs a human tap | FM-09; `injection` rows in dev, heldout and code-switch sets; `packages/llm/test/understand.test.ts` (hostile contact name passed as data) | A user can still approve a wrong pending card; it is readable and cancellable |
| LLM02 Sensitive information disclosure | Synthetic data only. Tools return masked phones and session handles. Tokens and keys are never in the prompt. ASR key is server-side | §Privacy below; `packages/orchestrator/src/tool-host.ts` | Raw user text, including any number typed, goes to the provider; free tiers may train on it, which is why data is synthetic |
| LLM03 Supply chain | Pinned lockfile; OSV-Scanner and gitleaks in CI; few runtime dependencies on the money path | `.github/workflows/ci.yml`; DISCLOSURE.md libraries | Hosted model behaviour can change without notice; the model id is recorded with every result |
| LLM04 Data and model poisoning | No fine-tuning. The Kurdish retrieval bank is a static file, tested against both Kurdish test sets | `eval/test/ku-bank.test.ts` | Not applicable to a fine-tuned model; provider-side training is out of our control |
| LLM05 Improper output handling | Every model output passes Zod, then deterministic checks: amount re-parsed from the user's words, recipient and biller resolved from wallet data, time re-parsed. Failure means ask or rephrase, never execute | `packages/core/src/schema.ts`; FM-06; `packages/core/test/schema.test.ts`, `codeswitch.test.ts` | None known on the money path |
| LLM06 Excessive agency | Read-only tools plus `propose`; no execute, confirm, schedule-write or cancel tool. Token issuance and redemption happen outside the model | §Model capability boundaries above; docs/07; wallet invariant tests | As LLM01 |
| LLM07 System prompt leakage | The prompt holds no secrets, keys or user data beyond the current session's synthetic context. The prompt source is public in this repo | `packages/llm/src/prompt.ts` | None material |
| LLM08 Vector and embedding weaknesses | Not applicable: there is no vector database or embedding store. Kurdish retrieval is a local lexical match | AGENTS.md stack rules | — |
| LLM09 Misinformation | Every fact on a card or receipt comes from the wallet, not model text. Failures say plainly that nothing was sent; unknown outcomes are rechecked, never guessed | §Grounding above; FM-03, FM-12 | Read-only answers phrase wallet data. Copy has not been reviewed by a native speaker |
| LLM10 Unbounded consumption | At most 4 tool calls per turn; bounded output tokens; one cut-off retry; per-session turn limit (`TURNS_PER_10_MIN`, default 60); sandbox cap (`SANDBOX_MAX`); per-process daily token cap (`LLM_DAILY_TOKEN_CAP`); request pacing; voice clips at most 30 s. Upstream requests per turn are recorded (`model_requests`) | `packages/llm/src/understand.ts`, `apps/web/server/engine.ts`, `packages/llm/src/wrappers.ts` | The free Gemini quota (about 500 requests a day per project) is shared by all judges and processes. It can run out mid-demo (docs/35 FA-15) |

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
