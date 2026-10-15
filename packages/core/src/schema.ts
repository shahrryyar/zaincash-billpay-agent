// The LLM <-> code contract (docs/05). Provider structured output is NOT trusted: always re-validate here.
import { z } from "zod";
import { normaliseArabic, normaliseDigits } from "./normalise";
import { parseAmount } from "./amount";

/** Mock cap. ZainCash's own wallet balance cap is 10M IQD/month (docs/research/02). */
export const MAX_AMOUNT_IQD = 10_000_000;
export const SMALLEST_UNIT_IQD = 250;

export const Money = z.strictObject({
  value: z.number().int().positive().max(MAX_AMOUNT_IQD),
  currency: z.literal("IQD"),
  source_text: z.string().min(1), // exact span the model read, e.g. "خمسين ألف"
});

export const RecipientMention = z.strictObject({
  kind: z.enum(["name", "relation", "phone", "previous"]),
  text: z.string().min(1),
  qualifier: z.string().optional(),
});

export const TransferAction = z.strictObject({
  type: z.literal("transfer"),
  recipient: RecipientMention.nullable(), // null -> must clarify
  amount: Money.nullable(), // null -> must clarify
  note: z.string().max(140).optional(),
});

export const BILLERS = ["electricity", "generator", "internet", "water", "mobile_topup", "unknown"] as const;

export const BillPayAction = z.strictObject({
  type: z.literal("bill_pay"),
  biller: z.enum(BILLERS),
  biller_text: z.string(),
  account_ref: z.string().optional(),
  amount: Money.nullable(), // null -> use the outstanding bill amount from the wallet
});

export const InfoAction = z.strictObject({
  type: z.literal("info"),
  query: z.enum(["balance", "bill_amount", "last_transfer"]),
  biller: z.string().optional(),
});

export const Action = z.discriminatedUnion("type", [TransferAction, BillPayAction, InfoAction]);

export const Intent = z.strictObject({
  actions: z.array(Action).max(3),
  status: z.enum(["ok", "unclear", "out_of_scope", "cancel", "confirm_reply", "clarify_reply"]),
  clarify_reply: z.strictObject({ choice_text: z.string() }).optional(),
  confidence: z.number().min(0).max(1), // self-estimate: logged, never trusted alone
  language: z.enum(["ar-iq", "ar-msa", "arabizi", "ku", "en", "mixed"]),
});

export type Intent = z.infer<typeof Intent>;
export type Action = z.infer<typeof Action>;

export type ValidateResult = { ok: true; intent: Intent } | { ok: false; error: string };

/** Zod gate. Invalid output means NEEDS_REPHRASE; it never reaches execution. */
export function validateIntent(raw: unknown): ValidateResult {
  const r = Intent.safeParse(raw);
  return r.success ? { ok: true, intent: r.data } : { ok: false, error: r.error.message };
}

export type IssueCode =
  | "source_not_in_input"
  | "amount_mismatch"
  | "amount_ambiguous"
  | "currency_unsupported"
  | "amount_invalid"
  | "amount_unit"
  | "phone_invalid";

export type Issue = { code: IssueCode; actionIndex: number; candidates?: [number, number] };
export type CrossCheckResult = { ok: true } | { ok: false; issues: Issue[] };

const PHONE = /^07[3-9]\d{8}$/;

/**
 * Deterministic checks after Zod (docs/05): source_text must be in the input,
 * parseAmount(source_text) must equal the model's value, amount is a multiple of 250,
 * phone mentions are valid. Anything else is a question or a rephrase, never a guess.
 */
export function crossCheck(intent: Intent, inputText: string): CrossCheckResult {
  const input = normaliseArabic(inputText);
  const issues: Issue[] = [];

  intent.actions.forEach((a, actionIndex) => {
    if (a.type === "transfer" && a.recipient?.kind === "phone") {
      const digits = normaliseDigits(a.recipient.text).replace(/[\s\-()]/g, "");
      if (!PHONE.test(digits)) issues.push({ code: "phone_invalid", actionIndex });
    }
    if (a.type === "info" || !a.amount) return;

    const span = normaliseArabic(a.amount.source_text);
    if (!span || !input.includes(span)) {
      issues.push({ code: "source_not_in_input", actionIndex });
      return;
    }
    const p = parseAmount(a.amount.source_text);
    switch (p.kind) {
      case "ok":
        if (p.value !== a.amount.value) issues.push({ code: "amount_mismatch", actionIndex });
        else if (p.value % SMALLEST_UNIT_IQD !== 0) issues.push({ code: "amount_unit", actionIndex });
        break;
      case "ambiguous":
        issues.push({ code: "amount_ambiguous", actionIndex, candidates: p.candidates });
        break;
      case "unsupported":
        issues.push({ code: "currency_unsupported", actionIndex });
        break;
      default:
        issues.push({ code: "amount_invalid", actionIndex });
    }
  });

  return issues.length === 0 ? { ok: true } : { ok: false, issues };
}
