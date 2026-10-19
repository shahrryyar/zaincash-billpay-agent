# 13 — Failure Modes and Handling

Gate requirement: **≥ 3 documented failure modes with handling.** We document 12. The first three are demoed live.

| # | Failure mode | Detection | Handling | User sees (ar-IQ) | Test |
|---|---|---|---|---|---|
| **FM-01** | **Ambiguous recipient** (2 Ahmeds) | resolver returns >1 candidate | State can't reach RESOLVED → CLARIFYING with candidate cards | «عندك اثنين أحمد، ياهو تقصد؟» | ambiguous_recipient category |
| **FM-02** | **Network timeout after the wallet executed** | client timeout / 5xx | Retry with the **same idempotency key** → server replays → executes once | «جاي نتأكد…» then a normal success | fault `timeout_after_commit` |
| **FM-03** | **Insufficient balance / invalid bill / service down** | `/quotes` pre-check before the card; API error after confirm | Fail closed. Nothing sent | «ما انرسل شي، رصيدك نفسه ما تغيّر.» + reason | insufficient_balance, biller_down |
| FM-04 | Malformed / unintelligible dialect | Zod fails, or status `unclear`, or low confidence | NEEDS_REPHRASE | «ما فهمت عليك زين، تگدر تعيدها بطريقة ثانية؟» | malformed |
| FM-05 | Two actions in one request | `actions.length > 1` | Split, confirm each separately | «طلبت شغلتين، نبدي بالأولى:» | two_actions |
| FM-06 | ASR uncertainty | confidence < τ | Read back / ask, never execute from a mid-confidence transcript without the card | «سمعتك تگول: "…" صح؟» | voice subset |
| FM-07 | Invalid model output / hallucinated slot | Zod reject; `source_text` not in input; amount mismatch | Never reaches execution → ask | «تقصد ٥٠٬٠٠٠ دينار؟» | S4 metric |
| FM-08 | Missing amount | `amount: null` (transfer) | CLARIFYING amount | «شكد تريد تدز لـ{name}؟» | missing_amount |
| FM-09 | Unknown contact / biller | 0 candidates | Ask; offer a phone-number path. Never create a contact silently | «ما لگيت {name} بجهات الاتصال. تريد تكتب رقمه؟» | unknown_* |
| FM-10 | Prompt injection in input/notes | n/a (structural) | Model has no execute tool; card + token required; notes rendered as plain text | normal card or refusal | injection category |
| FM-11 | LLM provider down / slow | timeout 8 s | One retry → honest message. Optional fallback to the other provider | «النظام مشغول هسه، جرب بعد شوية. ما صار أي تحويل.» | provider fault test |
| FM-12 | Token expired / user idle | `expires_at` | EXPIRED → offer restart; old token is dead | «انتهى وقت التأكيد، نعيد الطلب؟» | unit test |
| FM-13 | Ambiguous amount (dropped «ألف») | parseAmount < 1000 in money context | Ask | «تقصد ٢٥ ألف دينار؟» | ambiguous_amount |
| FM-14 | Outcome truly unknown after retries | retries exhausted, lookup fails | Keep the key; honest "don't resend" message; reconcile later | «ما متأكدين إذا انرسلت. لا تعيد الإرسال، راح نتأكد ونبلغك.» | chaos test |

## Added 2026-10-17
| # | Failure mode | Handling |
|---|---|---|
| FM-15 | Voice: misheard names/numbers | gate: below τ_low repeat (no model call); otherwise read-back, runs only after «صح»; card still mandatory (docs/09) |
| FM-16 | Voice: ASR down / bad key / unsupported language / bad audio | fail closed, «الصوت ما يشتغل هسه. اكتب طلبك، وما انرسل شي.»; typing works |
| FM-17 | Scheduled payment cannot run | re-checked at run time; fails once, honestly (docs/27) |

Held-out misses (all safe): «نفس المبلغ مال اخر مرة» asks (history not implemented); malformed chatter answered as
out of scope; «ورقة/دفتر» asked instead of refused; descriptor words after a name prevent a match. The public,
committed version of this file is `FAILURE_MODES.md` (repo root), since `docs/` is local.

## Principles
1. **Fail closed.** When in doubt, nothing moves.
2. **Honest message.** Say what happened and what didn't («ما انرسل شي»), never a generic "error".
3. **Balance truth.** Every failure message after confirm states whether the balance changed, read from the wallet, not assumed.
