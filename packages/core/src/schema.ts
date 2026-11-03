// The LLM <-> code contract (docs/05). Provider structured output is NOT trusted: always re-validate here.
import { z } from "zod";
import { normaliseArabic, normaliseDigits } from "./normalise";
import { isAmountToken, mentionsForeignCurrency, parseAmount } from "./amount";
import { hasKurdishLetters, isPreviousAmountKu, kurdishNameKey } from "./kurdish";
import { relationKey } from "./resolver";
import { mentionsWhen } from "./when";

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
  recipient: RecipientMention.nullable().default(null), // null (or missing) -> must clarify
  amount: Money.nullable().default(null), // null (or missing) -> must clarify
  // «نفس المبلغ مال اخر مرة»: the user's words only. Code takes the amount of the latest transfer to the resolved contact
  // from the wallet's history (no history -> it asks). Ignored when an amount was said.
  amount_ref: z.strictObject({ kind: z.literal("previous"), source_text: z.string().min(1).max(60) }).optional(),
  note: z.string().max(140).optional(),
  when_text: z.string().min(1).max(80).optional(), // the user's own words about WHEN («باچر الساعة 9»); code computes the instant
});

export const BILLERS = ["electricity", "generator", "internet", "water", "mobile_topup", "unknown"] as const;

export const BillPayAction = z.strictObject({
  type: z.literal("bill_pay"),
  biller: z.enum(BILLERS),
  biller_text: z.string(),
  account_ref: z.string().optional(),
  amount: Money.nullable().default(null), // null (or missing) -> use the outstanding bill amount from the wallet
  when_text: z.string().min(1).max(80).optional(),
});

export const InfoAction = z.strictObject({
  type: z.literal("info"),
  query: z.enum(["balance", "bill_amount", "last_transfer"]),
  biller: z.string().optional(),
});

export const Action = z.discriminatedUnion("type", [TransferAction, BillPayAction, InfoAction]);

export const Intent = z.strictObject({
  actions: z.array(Action).max(3),
  status: z.enum(["ok", "unclear", "out_of_scope", "cancel", "confirm_reply", "clarify_reply", "schedule_help"]),
  clarify_reply: z.strictObject({ choice_text: z.string() }).optional(),
  confidence: z.number().min(0).max(1), // self-estimate: logged, never trusted alone
  language: z.enum(["ar-iq", "ar-msa", "arabizi", "ku", "en", "mixed"]),
});

export type Intent = z.infer<typeof Intent>;
export type Action = z.infer<typeof Action>;

export type ValidateResult = { ok: true; intent: Intent } | { ok: false; error: string };

// Models often send `"note": null` for an optional field. That is "absent", not wrong. Only these optional keys are
// cleaned: `recipient: null` and `amount: null` are meaningful (they trigger a question) and are left alone.
const OPTIONAL_KEYS = new Set(["note", "qualifier", "account_ref", "biller", "clarify_reply", "when_text", "amount_ref"]);
function dropNullOptionals(v: unknown, key?: string): unknown {
  if (Array.isArray(v)) return v.map((x) => dropNullOptionals(x));
  if (v && typeof v === "object") {
    const o: Record<string, unknown> = {};
    for (const [k, x] of Object.entries(v)) { if (x === null && OPTIONAL_KEYS.has(k)) continue; o[k] = dropNullOptionals(x, k); }
    return o;
  }
  return v;
}

/** Zod gate. Invalid output means NEEDS_REPHRASE; it never reaches execution. */
export function validateIntent(raw: unknown): ValidateResult {
  const r = Intent.safeParse(dropNullOptionals(raw));
  return r.success ? { ok: true, intent: r.data } : { ok: false, error: r.error.message };
}

export type IssueCode =
  | "source_not_in_input"
  | "amount_mismatch"
  | "amount_ambiguous"
  | "currency_unsupported"
  | "amount_invalid"
  | "amount_unit"
  | "phone_invalid"
  | "when_not_in_input"
  | "amount_ref_invalid"
  | "recipient_not_in_input"
  | "amount_partial" // «50 الف» out of «250 الف», «مليون» out of «مليون ونص»: the span is not the whole amount
  | "when_missing"; // «باچر», «بعد ساعة» in the message but no when_text: never an immediate payment

export type Issue = { code: IssueCode; actionIndex: number; candidates?: [number, number] };
export type CrossCheckResult = { ok: true } | { ok: false; issues: Issue[] };

const PHONE = /^07[3-9]\d{8}$/;
/** What «same as last time» sounds like (after normaliseArabic). A closed list: anything else is not a reference. <!-- VERIFY-DIALECT --> */
const PREVIOUS = /نفس (?:المبلغ|الشي|المبلغ اللي)|مثل (?:المره|اخر مره|ذيج المره|كل مره)|المره الفاتت|المره الماضيه|اخر مره|ذيج المره|مثل ما دزيت/;

const SEP = /[.,،٬:;!?؟"'“”()«»]/;
const isSpace = (c: string | undefined) => c === undefined || /\s/.test(c) || SEP.test(c);
const isDigit = (c: string | undefined) => c !== undefined && /\d/.test(c);
/** Kurdish endings glued to an amount word («هەزارێک», «هەزاری») after normaliseArabic. */
const KU_SUFFIX = /^(?:ێك|يك|ي|يەك|يهك)$/;

/** The neighbour word, skipping a standalone «و» («مليون و نص»). */
function neighbour(tokens: string[], from: number, step: 1 | -1): string | undefined {
  for (let i = from; i >= 0 && i < tokens.length; i += step) if (!/^(?:و|w|u)$/.test(tokens[i] as string)) return tokens[i];
  return undefined;
}

/**
 * The span sits on word boundaries of the input AND is the whole amount there: «حول لأحمد 250 الف» with «50 الف», «1,500,000»
 * with «500,000», «خمسة وعشرين الف» with «عشرين الف», «مليون ونص» with «مليون» all fail. Glued in front only «ب» / «ل» / «و»
 * («بخمسين ألف», «وعشرة آلاف لعلي»); then the word before must not be a number. Any clean occurrence is enough.
 */
function wholeAmountIn(input: string, span: string): boolean {
  for (let at = input.indexOf(span); at >= 0; at = input.indexOf(span, at + 1)) {
    const end = at + span.length;
    // left: walk back over a glued prefix to the start of the word
    let ws = at;
    while (ws > 0 && !isSpace(input[ws - 1])) ws--;
    const prefix = input.slice(ws, at);
    if (prefix && !/^[وبل]{1,2}$/.test(prefix)) continue; // «1250», «ستة» etc.
    if (isDigit(input[at - 1]) || (SEP.test(input[at - 1] ?? "") && isDigit(input[at - 2]))) continue; // «1,500,000»
    // right: the word must end here (a Kurdish ending is part of the word, not another number)
    let we = end;
    while (we < input.length && !isSpace(input[we])) we++;
    const suffix = input.slice(end, we);
    if (suffix && !KU_SUFFIX.test(suffix)) continue;
    if (SEP.test(input[end] ?? "") && isDigit(input[end + 1])) continue; // «500,000» out of «500,000,000»
    const before = input.slice(0, ws).split(/\s+/).filter(Boolean);
    const after = input.slice(we).split(/\s+/).filter(Boolean);
    const prev = neighbour(before, before.length - 1, -1), next = neighbour(after, 0, 1);
    if ((prev !== undefined && isAmountToken(prev)) || (next !== undefined && isAmountToken(next))) continue;
    return true;
  }
  return false;
}

/** «عبد الله» == «عبدالله», punctuation off, one space. */
const nameKey = (s: string): string => normaliseArabic(s).replace(/[.,،!؟?:;"'«»()]/g, " ").replace(/\s+/g, " ").trim().replace(/(^| )([ول]{0,2}عبد) (?=\S)/g, "$1$2");
/** What may be glued to the first word of a name in the message: «لأحمد», «للحجي», «ولعلي», «الحجي». */
const NAME_PREFIXES = ["", "ل", "لل", "ال", "و", "ول", "ولل", "وال"];

/**
 * An Arabic-script recipient («أحمد علي», «أمي») is words the user wrote, in order, on word boundaries. The first word may
 * carry «ل»/«لل»/«ال»; a relation word may be the user's synonym («لماما» for «أمي», «خوي» for «أخوي»). A model that adds a
 * surname («أحمد» -> «أحمد علي») or "fixes" a typo («حسينن» -> «حسين») fails: the resolver must see the user's own words.
 */
function recipientSaid(name: string, input: string): boolean {
  const want = nameKey(name).split(" ").filter(Boolean);
  const have = nameKey(input).split(" ").filter(Boolean);
  if (!want.length) return false;
  const same = (h: string, w: string, first: boolean): boolean =>
    (first ? NAME_PREFIXES : [""]).some((p) => {
      if (p && !h.startsWith(p)) return false;
      const bare = h.slice(p.length);
      if (bare === w || (p.endsWith("لل") && `ال${bare}` === w)) return true; // «للحجي» = ل + «الحجي»
      const rw = relationKey(w);
      return rw !== undefined && relationKey(bare) === rw;
    });
  for (let i = 0; i + want.length <= have.length; i++)
    if (want.every((w, j) => same(have[i + j] as string, w, j === 0))) return true;
  return false;
}

export type CrossCheckOptions = {
  /** Recipient texts of the request still pending (already checked against the message that introduced them). */
  knownRecipients?: readonly string[];
};

/**
 * Deterministic checks after Zod (docs/05): source_text must be in the input,
 * parseAmount(source_text) must equal the model's value, amount is a multiple of 250,
 * phone mentions are valid. Anything else is a question or a rephrase, never a guess.
 */
export function crossCheck(intent: Intent, inputText: string, opts: CrossCheckOptions = {}): CrossCheckResult {
  const input = normaliseArabic(inputText);
  const kurdishInput = hasKurdishLetters(inputText);
  const latinInput = /[a-z]/i.test(inputText);
  const known = new Set((opts.knownRecipients ?? []).map(nameKey));
  const issues: Issue[] = [];
  // the model saw no time at all, yet the message has one («دز لأحمد خمسين الف باچر»): ask, never pay now.
  // Any when_text on any action means it did see the time (which action it belongs to is the model's reading, checked below).
  const sawWhen = intent.actions.some((a) => a.type !== "info" && a.when_text);
  const missedWhen = !sawWhen && intent.actions.some((a) => a.type !== "info") && mentionsWhen(inputText);

  intent.actions.forEach((a, actionIndex) => {
    if (a.type === "transfer" && a.recipient?.kind === "phone") {
      const digits = normaliseDigits(a.recipient.text).replace(/[\s\-()]/g, "");
      if (!PHONE.test(digits)) issues.push({ code: "phone_invalid", actionIndex });
    }
    // A Kurdish message: the person must be someone the user actually wrote («ئەحمەد» covers «أحمد»), never a name the
    // model brought in. (Arabic-script Iraqi messages keep the old rule: Arabizi names are rewritten in Arabic letters.)
    const named = a.type === "transfer" && a.recipient && (a.recipient.kind === "name" || a.recipient.kind === "relation") ? a.recipient.text : undefined;
    if (named !== undefined && !known.has(nameKey(named))) {
      if (kurdishInput) {
        const who = kurdishNameKey(named);
        if (!who || !kurdishNameKey(inputText).includes(who)) issues.push({ code: "recipient_not_in_input", actionIndex });
      } else if (!latinInput && !recipientSaid(named, inputText)) {
        // Arabic script: same rule. Latin letters (Arabizi «l ahmad») are skipped: the model writes those names in Arabic.
        issues.push({ code: "recipient_not_in_input", actionIndex });
      }
    }
    if (missedWhen && a.type !== "info") issues.push({ code: "when_missing", actionIndex });
    if (a.type !== "info" && a.when_text) {
      const w = normaliseArabic(a.when_text);
      if (!w || !input.includes(w)) issues.push({ code: "when_not_in_input", actionIndex });
    }
    if (a.type === "transfer" && mentionsForeignCurrency(inputText)) {
      issues.push({ code: "currency_unsupported", actionIndex }); // «حول ورقة لأحمد»: refuse even with no amount
      return;
    }
    if (a.type === "transfer" && !a.amount && a.amount_ref) {
      const span = normaliseArabic(a.amount_ref.source_text);
      if (!span || !input.includes(span) || !(PREVIOUS.test(span) || isPreviousAmountKu(a.amount_ref.source_text))) issues.push({ code: "amount_ref_invalid", actionIndex });
      return;
    }
    if (a.type === "info" || !a.amount) return;

    const span = normaliseArabic(a.amount.source_text);
    if (!span || !input.includes(span)) {
      issues.push({ code: "source_not_in_input", actionIndex });
      return;
    }
    if (!wholeAmountIn(input, span)) {
      issues.push({ code: "amount_partial", actionIndex });
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
