# 15 — UX and User-Facing Copy

> "The confirmation step is designed, not bolted on. It shows the right information at the right moment."

## Layout (phone-shaped web app, RTL)
```
┌──────────────────────────────┐
│ زين كاش · مساعد الدفع (تجريبي)│  ← "Mock wallet · synthetic" badge
│ رصيدك: ٢٠٠٬٠٠٠ د.ع            │
├──────────────────────────────┤
│  chat bubbles (user / agent) │
│  candidate cards (tap)       │
│  CONFIRMATION CARD           │
├──────────────────────────────┤
│ [🎤 hold to talk] [ type… ] ↵│
└──────────────────────────────┘
```
- Arabic first, `dir="rtl"`, large base font (18px+), high contrast, tap targets ≥ 48px.
- Digits: pick one style and use it consistently for amounts. Default is Western digits with comma grouping (`50,000 د.ع`); the alternative is Arabic-Indic (`٥٠٬٠٠٠ د.ع`). <!-- VERIFY with interviewees which they read faster -->
- Font: one that renders Arabic well (e.g., IBM Plex Sans Arabic / Noto Sans Arabic).

## Confirmation card (the hero component)

```
┌ تأكيد التحويل ─────── ما انرسل شي بعد ┐
│ العملية     تحويل                     │
│ إلى         أحمد علي · ••••4471        │
│ المبلغ      50,000 د.ع   (خمسين ألف)   │
│ الرسوم      300 د.ع                    │
│ الرصيد      200,000 → 149,700 د.ع      │
│ ⏱ 1:58                                 │
│ [   أكّد ودز   ]   [ إلغاء ]           │
└───────────────────────────────────────┘
```
Rules:
- Header says **"nothing sent yet"** explicitly.
- Amount shown in digits **and** in words (catches a wrong zero).
- Recipient: full stored name **plus** masked number (2 Ahmeds are distinguishable).
- Balance before → after, computed by the wallet `/quotes`.
- The confirm button says what it does («أكّد ودز» / «أكّد وادفع»), not just "OK".
- Countdown visible. On expiry the card greys out.
- After the tap: spinner «جاي ندز…» → ✅ card with reference + new balance, or ⛔ card with the honest reason.

**Added from review mining (docs/research/01):**
- **First-time recipient** badge on the card when the recipient is not in history: «أول مرة تدز له» (users complain wallets leave them alone with scammers).
- **Reference on completed payments/schedules** is implemented. Some failures have a short diagnostic reference; a uniform support reference on every validation/provider failure remains a follow-up, not a fabricated wallet transaction.
- **Receipt must be screenshot-able** and show amount, recipient name, reference, time.
- **Large type + font scaling**; one digit style plus amount in words (digits flipping between sets is a reported annoyance).

## Candidate picker (ambiguity)
Cards show saved name, masked number and relation label when present. Last-transfer-date display is not implemented. Tap or say «الأول» / «اللي ينتهي 4471».

## Copy table (single source: `packages/core/src/copy.ts`) <!-- VERIFY-DIALECT all -->

| Key | ar-IQ | English |
|---|---|---|
| ask_which_contact | عندك {n} باسم {name}، ياهو تقصد؟ | You have {n} contacts named {name}. Which one? |
| ask_amount | شكد تريد تدز لـ{name}؟ | How much do you want to send to {name}? |
| ask_amount_thousands | تقصد {value} ألف دينار؟ | Do you mean {value} thousand dinars? |
| ask_rephrase | ما فهمت عليك زين، تگدر تعيدها بطريقة ثانية؟ | I didn't quite get that, can you say it another way? |
| readback_asr | سمعتك تگول: «{text}» — صح؟ | I heard: "{text}". Correct? |
| contact_not_found | ما لگيت {name} بجهات الاتصال. تريد تكتب رقمه؟ | I couldn't find {name}. Want to type their number? |
| biller_unknown | ما أعرف هاي الفاتورة. أگدر أدفع: الكهرباء، المولدة، الانترنت، الماي، الرصيد. | I don't know that bill. I can pay: … |
| two_actions | طلبت شغلتين، نبدي بالأولى: | You asked for two things. Let's start with the first: |
| insufficient | رصيدك {balance} د.ع وما يكفي لـ{amount} د.ع. ما انرسل شي. | Your balance {balance} isn't enough for {amount}. Nothing was sent. |
| biller_down | خدمة {biller} واگفة هسه. ما انخصم منك شي، جرب بعدين. | {biller} is down right now. Nothing was charged. |
| bill_paid_already | فاتورة {biller} مدفوعة من قبل. ما دفعنا شي. | {biller} bill is already paid. Nothing charged. |
| success_transfer | ✅ انرسلت {amount} د.ع لـ{name}. رقم العملية {ref}. رصيدك هسه {balance}. | Sent. Ref … New balance … |
| success_bill | ✅ اندفعت فاتورة {biller} {amount} د.ع. رقم العملية {ref}. | Bill paid. Ref … |
| failed_safe | ما انرسل شي، رصيدك نفسه ما تغيّر. رقم المرجع {ref}. | Nothing was sent. Your balance is unchanged. Reference {ref}. |
| first_time_recipient | أول مرة تدز لهذا الشخص. تأكد من الاسم والرقم. | First time sending to this person. Check name and number. |
| checking | جاي نتأكد من العملية… | Checking the transaction… |
| unknown_outcome | ما متأكدين إذا انرسلت. لا تعيد الإرسال، راح نتأكد ونبلغك. | Not sure it went through. Don't resend; we'll check. |
| expired | انتهى وقت التأكيد، نعيد الطلب؟ | Confirmation timed out. Start again? |
| cancelled | تمام، لغيتها. ما صار شي. | OK, cancelled. Nothing happened. |
| out_of_scope | أگدر أساعدك بالتحويل ودفع الفواتير بس. | I can only help with transfers and bills. |
| busy | النظام مشغول هسه، جرب بعد شوية. ما صار أي تحويل. | System busy, try again shortly. No transfer happened. |
| usd_unsupported | التحويل بالدولار مو متوفر، بس بالدينار. | USD isn't supported, only IQD. |

## Voice copy (as built, in `packages/core/src/copy.ts`) <!-- VERIFY-DIALECT -->
`readback_asr` «سمعتك تگول: «{text}» — صح؟» · `readback_yes` «صح، كمّل» · `readback_no` «لا، أعيدها» ·
`readback_edit` «عدّلها بالكتابة» · `readback_dropped` «تمام، ما سويت شي. گولها مرة ثانية لو اكتبها.» ·
`asr_low` «ما سمعتك زين، تعيدها؟» · `asr_unavailable` «الصوت ما يشتغل هسه. اكتب طلبك، وما انرسل شي.» ·
`asr_too_long` · `mic_hold` «اضغط وخليك ضاغط وتكلم» · `mic_listening` · `mic_transcribing` · `mic_denied` · `voice_off`.
The mic sits next to the send button (only when voice is configured and the text box is empty).

2026-10-23 composer update: after recording, show the transcript in the editable input with `voice_review`, an expandable `voice_raw`, `voice_discard`, and a separate `voice_send` (“أرسل الطلب”). This explicit request submission precedes the existing payment approval. Do not auto-submit high-confidence recordings. Block sending while capturing/transcribing, preserve edits against stale callbacks, and leave typing available after microphone/provider failures. New Arabic/Sorani wording is marked `VERIFY-DIALECT` in the shared copy file. Partial words while recording remain future work.

## Accessibility checklist
- [ ] Screen reader labels in Arabic.
- [x] Phone 390×844 at 200%: controls/card/input fit; browser regression.
- [ ] Voice and text reach identical cards.
- [ ] No colour-only meaning (✅/⛔ icons + text).

## Readiness checks (2026-10-21)

The completed receipt now includes the wallet-provided counterparty, fee and creation time in Baghdad time, so a receipt screenshot identifies the payment without relying on a preceding chat bubble. Automated browser coverage checks recipient and timestamp labels. Arabic/Sorani copy still needs native review; no screen-reader user study is claimed. An axe scan of the real-ASR read-back page found zero WCAG 2 A/AA rule violations (21 passed rules); that is one automated state, not full accessibility certification.

Provider requests can exceed the old 25-second browser deadline when free-tier pacing and multiple read-only calls apply; the browser now allows 60 seconds and retains existing honest error/recheck handling. This is an availability allowance, not a claim that the latency target is met.
