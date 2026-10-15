// All user-facing strings in ONE place (docs/15). Iraqi Arabic is the default.
// <!-- VERIFY-DIALECT --> every Arabic string must be read by a native Iraqi speaker before the demo.

type Entry = { ar: string; en: string };

export const COPY = {
  ask_which_contact: { ar: "عندك {n} باسم {name}، ياهو تقصد؟", en: "You have {n} contacts named {name}. Which one?" },
  ask_amount: { ar: "شكد تريد تدز لـ{name}؟", en: "How much do you want to send to {name}?" },
  ask_amount_thousands: { ar: "تقصد {value} ألف دينار؟", en: "Do you mean {value} thousand dinars?" },
  ask_rephrase: { ar: "ما فهمت عليك زين، تگدر تعيدها بطريقة ثانية؟", en: "I didn't quite get that, can you say it another way?" },
  ask_fuzzy_contact: { ar: "تقصد {name}؟", en: "Do you mean {name}?" },
  ask_recipient: { ar: "لمين تريد تدز؟", en: "Who do you want to send to?" },
  ask_biller: { ar: "أي فاتورة تريد تدفع؟", en: "Which bill do you want to pay?" },
  asr_low: { ar: "ما سمعتك زين، تعيدها؟", en: "I couldn't hear that well. Can you repeat?" },
  readback_asr: { ar: "سمعتك تگول: «{text}» — صح؟", en: "I heard: \"{text}\". Correct?" },
  contact_not_found: { ar: "ما لگيت {name} بجهات الاتصال. تريد تكتب رقمه؟", en: "I couldn't find {name} in your contacts. Want to type their number?" },
  biller_unknown: { ar: "ما أعرف هاي الفاتورة. أگدر أدفع: الكهرباء، المولدة، الانترنت، الماي، الرصيد.", en: "I don't know that bill. I can pay: electricity, generator, internet, water, mobile credit." },
  two_actions: { ar: "طلبت شغلتين، نبدي بالأولى:", en: "You asked for two things. Let's start with the first:" },
  first_time_recipient: { ar: "أول مرة تدز لهذا الشخص. تأكد من الاسم والرقم.", en: "First time sending to this person. Check name and number." },
  clarify_exhausted: { ar: "خلينا نبدي من جديد. شنو تريد؟ ما انرسل شي.", en: "Let's start again. What do you need? Nothing was sent." },
  insufficient: { ar: "رصيدك {balance} د.ع وما يكفي لـ{amount} د.ع. ما انرسل شي.", en: "Your balance {balance} isn't enough for {amount}. Nothing was sent." },
  contact_not_wallet: { ar: "{name} ما عنده محفظة زين كاش، ما أگدر أدز له. ما انرسل شي.", en: "{name} doesn't have a ZainCash wallet, so I can't send to them. Nothing was sent." },
  invalid_amount: { ar: "المبلغ مو صحيح. أصغر وحدة 250 د.ع. ما انرسل شي.", en: "That amount isn't valid. The smallest unit is 250 IQD. Nothing was sent." },
  limit_exceeded: { ar: "المبلغ أكبر من الحد المسموح. ما انرسل شي.", en: "That is above the allowed limit. Nothing was sent." },
  biller_down: { ar: "خدمة {biller} واگفة هسه. ما انخصم منك شي، جرب بعدين.", en: "{biller} is down right now. Nothing was charged." },
  bill_paid_already: { ar: "فاتورة {biller} مدفوعة من قبل. ما دفعنا شي.", en: "The {biller} bill is already paid. Nothing charged." },
  amount_changed: { ar: "مبلغ الفاتورة تغيّر. ما انرسل شي، هذا المبلغ الجديد:", en: "The bill amount changed. Nothing was sent. Here is the new amount:" },
  confirm_invalid: { ar: "التأكيد ما صحيح أو انتهى. ما انرسل شي.", en: "That confirmation is not valid. Nothing was sent." },
  success_transfer: { ar: "✅ انرسلت {amount} د.ع لـ{name}. رقم العملية {ref}. رصيدك هسه {balance}.", en: "Sent {amount} IQD to {name}. Ref {ref}. New balance {balance}." },
  success_bill: { ar: "✅ اندفعت فاتورة {biller} {amount} د.ع. رقم العملية {ref}.", en: "Paid the {biller} bill, {amount} IQD. Ref {ref}." },
  failed_safe: { ar: "ما انرسل شي، رصيدك نفسه ما تغيّر. رقم المرجع {ref}.", en: "Nothing was sent. Your balance is unchanged. Reference {ref}." },
  checking: { ar: "جاي نتأكد من العملية…", en: "Checking the transaction…" },
  unknown_outcome: { ar: "ما متأكدين إذا انرسلت. لا تعيد الإرسال، راح نتأكد ونبلغك.", en: "Not sure it went through. Don't resend; we'll check." },
  expired: { ar: "انتهى وقت التأكيد، نعيد الطلب؟", en: "Confirmation timed out. Start again?" },
  cancelled: { ar: "تمام، لغيتها. ما صار شي.", en: "OK, cancelled. Nothing happened." },
  out_of_scope: { ar: "أگدر أساعدك بالتحويل ودفع الفواتير بس.", en: "I can only help with transfers and bills." },
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
  SERVICE_UNAVAILABLE: "busy",
};

/** Map wallet error codes (docs/06) to copy keys. Unknown codes fail closed with the generic safe message. */
export function copyKeyForWalletError(code: string): CopyKey {
  return WALLET_ERROR_COPY[code] ?? "failed_safe";
}
