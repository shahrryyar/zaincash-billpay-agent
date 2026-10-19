# R1 — What real users complain about (App Store reviews, Iraq)

**Raw data:** `raw/appstore-iq-reviews-2026-10-15.json` (1,000 reviews; fetch script `fetch_reviews.py`).
**Sample:** 500 most recent reviews each for **ZainCash Iraq** (id 1176557130, 4.53★ / 8,716 ratings, reviews dated 2023-06 → 2026-09) and **SuperQi** (id 6450545056, 2.85★ / 4,441 ratings). iOS only. Google Play was not retrievable (blocked).

## Honest limits
- Self-selected, iOS-only, most-recent-500 sample. Not representative of all users.
- Keyword coding is crude (regex on Arabic stems; one review can hit several themes; many reviews are one word like «فاشل»). Counts are indicative, not measured prevalence.
- SuperQi has a visible burst of 1★ reviews around 2025-11-27/29, so possibly a promo incident or review wave. Treat its counts with care.
- Nobody here is a "less smartphone-comfortable" user by definition; they are people who left reviews.

## Themes (ZainCash: 124 of 500 reviews are ≤3★)

| Theme | ZC ≤3★ hits | Verbatim evidence (original Arabic) | Meaning for us |
|---|---|---|---|
| Failed transfer, money stuck | 21 | «حولت مره من البطاقه مالتي لزين كاش انسحبت وما خلولي المبلغ وحرفياً 10 ايام يلا رجعولي» (2025-02-12) | Failure message must state **whether balance changed**, read from wallet (already FM-03). Never promise refund times. |
| Reliability / "maintenance" | 15 | «كل ما اريد ادخل على ويستر يونيون يكون تحت الصيانة» (2026-08-06); «للأسف أغلب الخدمات تحت الصيانة» (2024-03-03) | Biller/service-down is the **normal** case, not an edge case. Honest "down, nothing charged" copy (FM-03, FM-11). |
| KYC / registration friction | 12 | «ترسل جوازك مئة مرة ما يضبط يحمل» (2025-03-11); «لازم تروح على وكيل» (2024-05-03) | Out of scope (Topic 05). Don't claim to fix it. |
| Support unreachable | 9 | «ترسل للواتس الخاص بالدعم محد يجاوب» (2025-03-11); «بطئ في الرد … قد تتجاوز ال ١٥ يوماً» (2023-08-21) | Failure cards need a **reference id** to quote to support. |
| Fees | 8 | «يأخذون 7 ع مليون» (2025-04-11); «رسوم التحويل الداخلي مرتفعة» (2024-04-07) | Show **fee on every card**, even 0 (already in docs/15). |
| Missing integrations | 8 | «لماذا تم الغاء الربط مع المصرف الاهلي العراقي» (2024-04-11) | Out of scope. |
| Security / fraud | 5 | «الشركة لا تحمي المستخدمين من الاحتيال وتضع المستخدم مع المحتال مباشرة» (2023-12-18); «الكثير من الاصدقاء سرقت اموالهم» (2024-04-06) | Card should flag **first-time recipient**; trust signal (name + masked number). |
| Login / security code | 5 | «ادخلت الرمز صحيح لا يسمح لك بالدخول» (2026-07-19); «يكلي مسجل من هاتف جديد» (2024-08-17) | Real app uses PIN/OTP. We must not weaken it; say production adds PIN at confirm. |
| Ads / pop-ups | 4 | «اعلانات تطلع ٣ اول متنصب» (2024-02-01) | Keep the UI clean. Low priority. |

Other single-review signals worth keeping:
- **Digits:** «اريد احول مبلغ يصير خلل والأرقام تتحول عربي من حاله» (2024-07-25) → numerals flipping is a real annoyance. Support both digit sets in input; show **one** style plus amount in words.
- **Balance check throttled:** «لا يمكنك الاستعلام عن الرصيد الا مره واحدة كل ٣٠ دقيقة» (2024-02-05) → our `get_balance` should be instant (mock), noted as a UX win, not a claim about the real system.
- **Name mismatch rejects (Western Union):** «يصير اختلاف بسيط بالاسم وينرفض» (2024-05-06) → strict name matching causes pain; our resolver asks instead of rejecting.
- **Receipt (SuperQi):** «يمنع باخذ سكرين للحوالة» (2025-07-19) → success card should be **screenshot-able** and carry the reference.
- **Font size (SuperQi):** «لايمكن التحكم بحجم الخط» (2025-08-07) → large type is a real need (Haji Kareem persona).
- **Mixed language (SuperQi):** «changed the language to english and there are still some things written in Arabic» → one copy file, one language per session.

## The finding that matters most (and may hurt)
**No review in this sample complains about "too many taps" or asks for voice or chat input.** The dominant complaints are **reliability, failed/slow money, support, fees, KYC friction and fraud**. Our brief's premise ("many taps across several screens") is therefore **unsupported by this data**. It may still be true for older/low-literacy users, who are unlikely to leave app-store reviews.

**Implications**
1. Lead the pitch with what the data does support: **safe, honest, recoverable**. Confirmation, no double-pay, honest failure, reference id.
2. Treat "fewer taps / voice for the less comfortable" as a hypothesis to test in interviews, not a fact. Say so openly.
3. Interviews must include people who **don't** leave reviews (55+, agents). Ask about delegation («ابني يدفع عني»).
