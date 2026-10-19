// All user-facing strings in ONE place (docs/15). Iraqi Arabic is the default.
// <!-- VERIFY-DIALECT --> every Arabic string must be read by a native Iraqi speaker before the demo.

type Entry = { ar: string; en: string };

export const COPY = {
  ask_which_contact: { ar: "عندك {n} باسم {name}، ياهو تقصد؟", en: "You have {n} contacts named {name}. Which one?" },
  ask_amount: { ar: "شكد تريد تدز ل{name}؟", en: "How much do you want to send to {name}?" },
  ask_amount_thousands: { ar: "تقصد {value} ألف دينار؟", en: "Do you mean {value} thousand dinars?" },
  ask_rephrase: { ar: "ما فهمت عليك زين، تگدر تعيدها بطريقة ثانية؟", en: "I didn't quite get that, can you say it another way?" },
  ask_fuzzy_contact: { ar: "تقصد {name}؟", en: "Do you mean {name}?" },
  ask_recipient: { ar: "لمين تريد تدز؟", en: "Who do you want to send to?" },
  ask_biller: { ar: "أي فاتورة تريد تدفع؟", en: "Which bill do you want to pay?" },
  asr_low: { ar: "ما سمعتك زين، تعيدها؟", en: "I couldn't hear that well. Can you repeat?" },
  readback_asr: { ar: "سمعتك تگول: «{text}» — صح؟", en: "I heard: \"{text}\". Correct?" },
  readback_yes: { ar: "صح، كمّل", en: "Yes, continue" },
  readback_no: { ar: "لا، أعيدها", en: "No, I'll say it again" },
  readback_edit: { ar: "عدّلها بالكتابة", en: "Edit it as text" },
  readback_dropped: { ar: "تمام، ما سويت شي. گولها مرة ثانية لو اكتبها.", en: "OK, I did nothing. Say it again or type it." },
  asr_unavailable: { ar: "الصوت ما يشتغل هسه. اكتب طلبك، وما انرسل شي.", en: "Voice isn't working right now. Please type your request. Nothing was sent." },
  asr_too_long: { ar: "التسجيل طويل. گول طلبك بجملة وحدة (أقل من 30 ثانية).", en: "That recording is too long. Say your request in one sentence (under 30 seconds)." },
  mic_hold: { ar: "اضغط وخليك ضاغط وتكلم", en: "Press and hold to talk" },
  mic_listening: { ar: "دا أسمعك… شيل إصبعك من تخلص", en: "Listening… release when you finish" },
  mic_transcribing: { ar: "دا أكتب اللي گلته…", en: "Transcribing…" },
  mic_denied: { ar: "ما عندي إذن أستعمل المايك. اكتب طلبك.", en: "No microphone permission. Please type your request." },
  voice_off: { ar: "الصوت مو مفعّل بهاي النسخة. اكتب طلبك.", en: "Voice is not enabled in this build. Please type your request." },
  number_not_saved: { ar: "الرقم {phone} مو محفوظ بجهات اتصالك. ضيفه بالتطبيق أول وبعدين دز له، لو گول اسم واحد من جهاتك. ما انرسل شي.", en: "The number {phone} is not in your contacts. Add it in the app first, or tell me a saved contact's name. Nothing was sent." }, // VERIFY-DIALECT
  recipient_full: { ar: "محفظة {name} ما تستوعب هذا المبلغ (حد المحفظة 10,000,000 د.ع). ما انرسل شي.", en: "{name}'s wallet cannot hold that amount (wallet limit 10,000,000 IQD). Nothing was sent." }, // VERIFY-DIALECT
  contact_not_found: { ar: "ما لگيت {name} بجهات الاتصال. تريد تكتب رقمه؟", en: "I couldn't find {name} in your contacts. Want to type their number?" },
  biller_unknown: { ar: "ما أعرف هاي الفاتورة. أگدر أدفع: الكهرباء، المولدة، الانترنت، الماي، الرصيد.", en: "I don't know that bill. I can pay: electricity, generator, internet, water, mobile credit." },
  two_actions: { ar: "طلبت شغلتين، نبدي بالأولى:", en: "You asked for two things. Let's start with the first:" },
  first_time_recipient: { ar: "أول مرة تدز لهذا الشخص. تأكد من الاسم والرقم.", en: "First time sending to this person. Check name and number." },
  clarify_exhausted: { ar: "خلينا نبدي من جديد. شنو تريد؟ ما انرسل شي.", en: "Let's start again. What do you need? Nothing was sent." },
  insufficient: { ar: "رصيدك {balance} د.ع وما يكفي لـ{amount} د.ع. ما انرسل شي.", en: "Your balance {balance} isn't enough for {amount}. Nothing was sent." },
  contact_not_wallet: { ar: "{name} ما عنده محفظة زين كاش، ما أگدر أدز له. ما انرسل شي.", en: "{name} doesn't have a ZainCash wallet, so I can't send to them. Nothing was sent." },
  invalid_amount: { ar: "المبلغ مو صحيح. أصغر وحدة 250 د.ع. ما انرسل شي.", en: "That amount isn't valid. The smallest unit is 250 IQD. Nothing was sent." },
  confirm_prompt: { ar: "راجع التفاصيل وكبس أكّد. ما انرسل شي بعد.", en: "Check the details and press confirm. Nothing has been sent yet." },
  card_title_transfer: { ar: "تأكيد التحويل", en: "Confirm transfer" },
  card_title_bill: { ar: "تأكيد دفع الفاتورة", en: "Confirm bill payment" },
  card_nothing_sent: { ar: "ما انرسل شي بعد", en: "Nothing sent yet" },
  confirm_button_transfer: { ar: "أكّد ودز", en: "Confirm and send" },
  confirm_button_bill: { ar: "أكّد وادفع", en: "Confirm and pay" },
  cancel_button: { ar: "إلغاء", en: "Cancel" },
  ask_time: { ar: "الساعة شكد بالضبط؟ مثلاً: «9 الصبح» أو «9 المساء».", en: "What time exactly? For example «9 AM» or «9 PM»." },
  ask_meridiem: { ar: "الساعة {hour} الصبح لو المساء؟", en: "{hour} in the morning or in the evening?" },
  ask_time_date: { ar: "متى تريد أجدولها؟ مثلاً: «باچر الساعة 9 الصبح» أو «يوم 25 الساعة 8 المساء» أو «بعد ساعة».", en: "When should I schedule it? For example «tomorrow 9 AM», «on the 25th at 8 PM» or «in an hour»." },
  ask_time_soon: { ar: "الموعد لازم يكون بعد دقيقتين على الأقل. متى تريد؟", en: "The time must be at least 2 minutes ahead. When do you want it?" },
  ask_time_far: { ar: "أگدر أجدول لحد 90 يوم بس. متى تريد؟", en: "I can schedule up to 90 days ahead. When do you want it?" },
  card_title_schedule_transfer: { ar: "تأكيد جدولة التحويل", en: "Confirm scheduled transfer" },
  card_title_schedule_bill: { ar: "تأكيد جدولة دفع الفاتورة", en: "Confirm scheduled bill payment" },
  card_nothing_sent_scheduled: { ar: "ما راح ينرسل شي هسه", en: "Nothing is sent now" },
  confirm_button_schedule: { ar: "أكّد وجدول", en: "Confirm and schedule" },
  schedule_note: { ar: "المبلغ ما ينحجز هسه. بالموعد نتأكد من الرصيد، وإذا ما يكفي ما ينرسل شي.", en: "The amount is not reserved now. At the time we check your balance; if it is not enough, nothing is sent." },
  scheduled_ok_transfer: { ar: "✅ انجدول تحويل {amount} د.ع لـ{name} {when}. رقم الجدولة {ref}. ما انرسل شي هسه.", en: "Scheduled: {amount} IQD to {name} {when}. Schedule {ref}. Nothing is sent now." },
  scheduled_ok_bill: { ar: "✅ انجدول دفع فاتورة {biller} {amount} د.ع {when}. رقم الجدولة {ref}. ما انرسل شي هسه.", en: "Scheduled: {biller} bill {amount} IQD {when}. Schedule {ref}. Nothing is sent now." },
  schedule_help: { ar: "أكيد، أجدول لك دفعة أو تحويل. گول لي شنو ومتى، مثلاً: «ادفع المولدة يوم 25 الساعة 9 الصبح» أو «دز 50 ألف لأحمد علي باچر الساعة 8 المساء». المبلغ ينرسل بالموعد بعد ما تأكد هسه.", en: "Sure. Tell me what and when, for example «pay the generator on the 25th at 9 AM». You confirm once now; it is sent at the time." },
  schedule_ran_transfer: { ar: "✅ انرسل التحويل المجدول: {amount} د.ع لـ{name}. رقم العملية {ref}.", en: "Scheduled transfer sent: {amount} IQD to {name}. Ref {ref}." },
  schedule_ran_bill: { ar: "✅ اندفعت الفاتورة المجدولة: {biller} {amount} د.ع. رقم العملية {ref}.", en: "Scheduled bill paid: {biller} {amount} IQD. Ref {ref}." },
  schedule_failed: { ar: "⛔ ما تنفذت الدفعة المجدولة ({what}): {reason}. ما انخصم منك شي.", en: "The scheduled payment ({what}) did not run: {reason}. Nothing was charged." },
  schedule_low_balance: { ar: "⚠ رصيدك هسه ما يكفي. لازم يتوفر المبلغ قبل الموعد وإلا ما ينرسل شي.", en: "Your balance is not enough right now. The amount must be there before the time, otherwise nothing is sent." },
  schedule_cancelled: { ar: "تمام، لغيت الجدولة. ما صار شي.", en: "OK, the schedule was cancelled. Nothing happened." },
  info_balance: { ar: "رصيدك {balance} د.ع.", en: "Your balance is {balance} IQD." },
  info_bill: { ar: "فاتورة {biller}: {amount} د.ع.", en: "{biller} bill: {amount} IQD." },
  info_bills_none: { ar: "ما عندك فواتير مستحقة هسه.", en: "You have no outstanding bills right now." },
  info_bill_none: { ar: "ما عندك فاتورة مستحقة لـ{biller}.", en: "You have no outstanding {biller} bill." },
  info_last_transfer: { ar: "آخر تحويل: {amount} د.ع ل{name}.", en: "Last transfer: {amount} IQD to {name}." },
  info_last_transfer_none: { ar: "ما عندك تحويلات سابقة.", en: "You have no previous transfers." },
  limit_exceeded: { ar: "المبلغ أكبر من الحد المسموح. ما انرسل شي.", en: "That is above the allowed limit. Nothing was sent." },
  biller_down: { ar: "خدمة {biller} واگفة هسه. ما انخصم منك شي، جرب بعدين.", en: "{biller} is down right now. Nothing was charged." },
  bill_paid_already: { ar: "فاتورة {biller} مدفوعة من قبل. ما دفعنا شي.", en: "The {biller} bill is already paid. Nothing charged." },
  amount_changed: { ar: "مبلغ فاتورة {biller} هسه {bill} د.ع، مو {amount} د.ع. ما انرسل شي. اطلبها مرة ثانية حتى أطلعلك بطاقة بالمبلغ الصحيح.", en: "The {biller} bill is now {bill} IQD, not {amount} IQD. Nothing was sent. Ask again and I'll show a card with the right amount." }, // VERIFY-DIALECT
  confirm_invalid: { ar: "التأكيد ما صحيح أو انتهى. ما انرسل شي.", en: "That confirmation is not valid. Nothing was sent." },
  success_transfer: { ar: "✅ انرسلت {amount} د.ع ل{name}. رقم العملية {ref}. رصيدك هسه {balance}.", en: "Sent {amount} IQD to {name}. Ref {ref}. New balance {balance}." },
  success_bill: { ar: "✅ اندفعت فاتورة {biller} {amount} د.ع. رقم العملية {ref}.", en: "Paid the {biller} bill, {amount} IQD. Ref {ref}." },
  failed_safe: { ar: "ما انرسل شي، رصيدك نفسه ما تغيّر. رقم المرجع {ref}.", en: "Nothing was sent. Your balance is unchanged. Reference {ref}." },
  checking: { ar: "جاي نتأكد من العملية…", en: "Checking the transaction…" },
  unknown_outcome: { ar: "ما متأكدين إذا انرسلت. لا تعيد الإرسال، راح نتأكد ونبلغك.", en: "Not sure it went through. Don't resend; we'll check." },
  expired: { ar: "انتهى وقت التأكيد، نعيد الطلب؟", en: "Confirmation timed out. Start again?" },
  cancelled: { ar: "تمام، لغيتها. ما صار شي.", en: "OK, cancelled. Nothing happened." },
  out_of_scope: { ar: "أنا مساعد زين كاش: أحوّل فلوس، أدفع فواتير (كهرباء، مولدة، انترنت، ماي)، أگولك رصيدك، وأجدول دفعاتك. شنو تريد؟", en: "I am the ZainCash assistant: I send money, pay bills, tell you your balance and schedule payments. What would you like?" }, // VERIFY-DIALECT
  busy: { ar: "النظام مشغول هسه، جرب بعد شوية. ما صار أي تحويل.", en: "System busy, try again shortly. No transfer happened." },
  usd_unsupported: { ar: "التحويل بالدولار مو متوفر، بس بالدينار.", en: "USD isn't supported, only IQD." },
  press_confirm_button: { ar: "اضغط زر التأكيد حتى أكمل.", en: "Press the confirm button to continue." },
} as const satisfies Record<string, Entry>;

export type CopyKey = keyof typeof COPY;
export type Lang = "ar" | "en";

/** Render a copy string. Throws if a {placeholder} has no value, so raw braces never reach the user. */
export function t(key: CopyKey, vars: Record<string, string | number> = {}, lang: Lang = "ar"): string {
  return COPY[key][lang].replace(/\{(\w+)\}/g, (_m, name: string) => {
    const v = vars[name];
    if (v === undefined) throw new Error(`copy "${key}" needs variable "${name}"`);
    return String(v);
  });
}

const WALLET_ERROR_COPY: Record<string, CopyKey> = {
  INSUFFICIENT_BALANCE: "insufficient",
  LIMIT_EXCEEDED: "limit_exceeded",
  CONTACT_NOT_FOUND: "contact_not_found",
  CONTACT_NOT_WALLET_USER: "contact_not_wallet",
  INVALID_AMOUNT: "invalid_amount",
  BILLER_UNAVAILABLE: "biller_down",
  BILL_ALREADY_PAID: "bill_paid_already",
  CONFIRMATION_INVALID: "confirm_invalid",
  AMOUNT_CHANGED: "amount_changed",
  RECIPIENT_WALLET_FULL: "recipient_full",
  SERVICE_UNAVAILABLE: "busy",
};

/** Map wallet error codes (docs/06) to copy keys. Unknown codes fail closed with the generic safe message. */
export function copyKeyForWalletError(code: string): CopyKey {
  return WALLET_ERROR_COPY[code] ?? "failed_safe";
}
