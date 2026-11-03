import { describe, it, expect } from "vitest";
import { Intent, validateIntent, crossCheck, MAX_AMOUNT_IQD } from "../src/schema";

const transfer = (over: Record<string, unknown> = {}) => ({
  type: "transfer",
  recipient: { kind: "name", text: "أحمد" },
  amount: { value: 50000, currency: "IQD", source_text: "خمسين ألف" },
  ...over,
});
const intent = (actions: unknown[], over: Record<string, unknown> = {}) => ({
  actions, status: "ok", confidence: 0.9, language: "ar-iq", ...over,
});

describe("Intent schema (docs/05 examples)", () => {
  it("accepts the hero transfer", () => expect(validateIntent(intent([transfer()])).ok).toBe(true));
  it("accepts bill_pay with null amount (wallet supplies it)", () =>
    expect(validateIntent(intent([{ type: "bill_pay", biller: "generator", biller_text: "المولدة", amount: null }])).ok).toBe(true));
  it("accepts transfer with null amount and null recipient (must clarify later)", () =>
    expect(validateIntent(intent([transfer({ amount: null, recipient: null })])).ok).toBe(true));
  it("accepts info and out_of_scope", () => {
    expect(validateIntent(intent([{ type: "info", query: "balance" }])).ok).toBe(true);
    expect(validateIntent(intent([], { status: "out_of_scope" })).ok).toBe(true);
  });
});

describe("Intent schema rejects (fail closed)", () => {
  const bad: [string, unknown][] = [
    ["not an object", "دز خمسين ألف"],
    ["null", null],
    ["no actions key", { status: "ok", confidence: 0.9, language: "ar-iq" }],
    ["unknown action type", intent([{ type: "execute", amount: 1 }])],
    ["extra key on action", intent([transfer({ execute: true })])],
    ["zero amount", intent([transfer({ amount: { value: 0, currency: "IQD", source_text: "x" } })])],
    ["negative amount", intent([transfer({ amount: { value: -5, currency: "IQD", source_text: "x" } })])],
    ["float amount", intent([transfer({ amount: { value: 50000.5, currency: "IQD", source_text: "x" } })])],
    ["string amount", intent([transfer({ amount: { value: "50000", currency: "IQD", source_text: "x" } })])],
    [`amount above ${MAX_AMOUNT_IQD}`, intent([transfer({ amount: { value: MAX_AMOUNT_IQD + 1, currency: "IQD", source_text: "x" } })])],
    ["USD currency", intent([transfer({ amount: { value: 100, currency: "USD", source_text: "x" } })])],
    ["empty source_text", intent([transfer({ amount: { value: 50000, currency: "IQD", source_text: "" } })])],
    ["4 actions", intent([transfer(), transfer(), transfer(), transfer()])],
    ["confidence > 1", intent([transfer()], { confidence: 1.5 })],
    ["bad status", intent([transfer()], { status: "done" })],
    ["bad language", intent([transfer()], { language: "fr" })],
    ["bad biller", intent([{ type: "bill_pay", biller: "casino", biller_text: "x", amount: null }])],
  ];
  it.each(bad)("%s", (_n, v) => expect(validateIntent(v).ok).toBe(false));
});

describe("crossCheck: deterministic checks after Zod", () => {
  const parse = (v: unknown) => {
    const r = Intent.safeParse(v);
    if (!r.success) throw new Error("fixture invalid");
    return r.data;
  };
  it("passes the hero case", () =>
    expect(crossCheck(parse(intent([transfer()])), "دز خمسين ألف لأحمد")).toEqual({ ok: true }));
  it("tolerates spelling variants between source_text and input (ألف/الف)", () =>
    expect(crossCheck(parse(intent([transfer()])), "دز خمسين الف لاحمد")).toEqual({ ok: true }));
  it("tolerates digit style (٥٠ ألف vs 50 ألف)", () => {
    const i = parse(intent([transfer({ amount: { value: 50000, currency: "IQD", source_text: "50 ألف" } })]));
    expect(crossCheck(i, "دز ٥٠ ألف لأحمد")).toEqual({ ok: true });
  });
  it("flags source_text not present in the input (hallucination)", () => {
    const r = crossCheck(parse(intent([transfer()])), "دز لأحمد");
    expect(r).toMatchObject({ ok: false, issues: [{ code: "source_not_in_input", actionIndex: 0 }] });
  });
  it("flags amount mismatch between model value and parser", () => {
    const i = parse(intent([transfer({ amount: { value: 500000, currency: "IQD", source_text: "خمسين ألف" } })]));
    expect(crossCheck(i, "دز خمسين ألف لأحمد")).toMatchObject({ ok: false, issues: [{ code: "amount_mismatch" }] });
  });
  it("asks when the amount is ambiguous (dropped ألف)", () => {
    const i = parse(intent([transfer({ recipient: { kind: "name", text: "علي" }, amount: { value: 25, currency: "IQD", source_text: "خمسة وعشرين" } })]));
    const r = crossCheck(i, "دز خمسة وعشرين لعلي");
    expect(r).toMatchObject({ ok: false, issues: [{ code: "amount_ambiguous", candidates: [25, 25000] }] });
  });
  it("rejects non-IQD slang (ورقة)", () => {
    const i = parse(intent([transfer({ recipient: { kind: "name", text: "علي" }, amount: { value: 100000, currency: "IQD", source_text: "ورقة" } })]));
    expect(crossCheck(i, "دز ورقة لعلي")).toMatchObject({ ok: false, issues: [{ code: "currency_unsupported" }] });
  });
  it.each([
    ["حول لي ورقة لأحمد علي فدوة"], ["دز دفتر لاخوي كرار"], ["حول 100 دولار لعلي"], ["dez 50$ l ali"], ["حول ورقتين لعلي كريم"],
  ])("a transfer with dollars / «ورقة» / «دفتر» in the message is refused even when the model left the amount empty: %s", (text) => {
    const i = parse(intent([transfer({ recipient: null, amount: null })]));
    expect(crossCheck(i, text)).toMatchObject({ ok: false, issues: [{ code: "currency_unsupported" }] });
  });
  it("those words do not block a bill payment («ورقة الكهرباء» is the bill slip)", () => {
    const i = parse(intent([{ type: "bill_pay", biller: "electricity", biller_text: "الكهرباء", amount: null }]));
    expect(crossCheck(i, "ادفع ورقة الكهرباء")).toEqual({ ok: true });
  });
  it.each(["نفس المبلغ مال اخر مرة", "مثل المرة الفاتت", "نفس المبلغ مال ذيج المرة", "نفس الشي مال اخر مرة"])("«%s» is accepted as a reference to the previous amount", (phrase) => {
    const i = parse(intent([transfer({ recipient: { kind: "name", text: "علي كريم" }, amount: null, amount_ref: { kind: "previous", source_text: phrase } })]));
    expect(crossCheck(i, `دز لعلي كريم ${phrase}`)).toEqual({ ok: true });
  });
  it("a previous-amount reference must be the user's own words", () => {
    const i = parse(intent([transfer({ recipient: { kind: "name", text: "علي كريم" }, amount: null, amount_ref: { kind: "previous", source_text: "نفس المبلغ" } })]));
    expect(crossCheck(i, "دز لعلي كريم")).toMatchObject({ ok: false, issues: [{ code: "amount_ref_invalid" }] });
  });
  it("a previous-amount reference must actually say «same as last time»", () => {
    const i = parse(intent([transfer({ recipient: { kind: "name", text: "علي كريم" }, amount: null, amount_ref: { kind: "previous", source_text: "لعلي" } })]));
    expect(crossCheck(i, "دز لعلي كريم")).toMatchObject({ ok: false, issues: [{ code: "amount_ref_invalid" }] });
  });
  it("rejects amounts that are not a multiple of 250 IQD", () => {
    const i = parse(intent([transfer({ amount: { value: 50100, currency: "IQD", source_text: "50100" } })]));
    expect(crossCheck(i, "دز 50100 لأحمد")).toMatchObject({ ok: false, issues: [{ code: "amount_unit" }] });
  });
  it("validates phone mentions (07[3-9]xxxxxxxx) after digit normalisation", () => {
    const good = parse(intent([transfer({ recipient: { kind: "phone", text: "٠٧٧٠١٢٣٤٥٦٧" } })]));
    expect(crossCheck(good, "دز خمسين ألف للرقم ٠٧٧٠١٢٣٤٥٦٧")).toEqual({ ok: true });
    const bad = parse(intent([transfer({ recipient: { kind: "phone", text: "0701234567" } })]));
    expect(crossCheck(bad, "دز خمسين ألف للرقم 0701234567")).toMatchObject({ ok: false, issues: [{ code: "phone_invalid" }] });
  });
  it("checks every action and reports its index", () => {
    const i = parse(intent([transfer(), transfer({ amount: { value: 10000, currency: "IQD", source_text: "عشرة آلاف" } })]));
    const r = crossCheck(i, "دز خمسين ألف لأحمد ودز لعلي");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.issues.map((x) => x.actionIndex)).toEqual([1]);
  });
  it("ignores actions without an amount", () => {
    const i = parse(intent([{ type: "bill_pay", biller: "generator", biller_text: "المولدة", amount: null }]));
    expect(crossCheck(i, "ادفع المولدة")).toEqual({ ok: true });
  });
});

describe("validateIntent: null optionals are absent, null recipient/amount stay meaningful", () => {
  const base = { status: "ok", confidence: 0.9, language: "ar-iq" };
  it("accepts note: null and qualifier: null", () => {
    const r = validateIntent({ ...base, actions: [{ type: "transfer", recipient: { kind: "name", text: "أحمد", qualifier: null }, amount: { value: 50000, currency: "IQD", source_text: "خمسين ألف" }, note: null }] });
    expect(r.ok).toBe(true);
  });
  it("keeps recipient: null and amount: null", () => {
    const r = validateIntent({ ...base, actions: [{ type: "transfer", recipient: null, amount: null }] });
    expect(r.ok && r.intent.actions[0]).toMatchObject({ recipient: null, amount: null });
  });
  it("still rejects a null where a value is required", () => {
    expect(validateIntent({ ...base, actions: [{ type: "transfer", recipient: { kind: "name", text: null }, amount: null }] }).ok).toBe(false);
  });
});

describe("validateIntent: a missing amount or recipient means null (ask), not invalid", () => {
  const base = { status: "ok", confidence: 0.9, language: "ar-iq" };
  it("bill_pay without an amount key", () => {
    const r = validateIntent({ ...base, actions: [{ type: "bill_pay", biller: "electricity", biller_text: "الكهرباء", when_text: "بعد دقيقة" }] });
    expect(r.ok && r.intent.actions[0]).toMatchObject({ amount: null });
  });
  it("transfer without recipient or amount keys", () => {
    const r = validateIntent({ ...base, actions: [{ type: "transfer" }] });
    expect(r.ok && r.intent.actions[0]).toMatchObject({ recipient: null, amount: null });
  });
});

describe("crossCheck: the amount span must be the WHOLE amount the user said (no sub-span)", () => {
  const parse = (v: unknown) => { const r = Intent.safeParse(v); if (!r.success) throw new Error("fixture invalid"); return r.data; };
  const withAmount = (value: number, source_text: string, over: Record<string, unknown> = {}) =>
    parse(intent([transfer({ amount: { value, currency: "IQD", source_text }, ...over })]));
  it.each([
    ["حول لأحمد 250 الف", "50 الف", 50_000],
    ["دز لأحمد 1,500,000", "500,000", 500_000],
    ["دز لأحمد خمسة وعشرين الف", "عشرين الف", 20_000],
    ["حول لأحمد مليون ونص", "مليون", 1_000_000],
    ["حول لأحمد مليون و نص", "مليون", 1_000_000],
    ["دز لأحمد 1250 ألف", "250 ألف", 250_000],
    ["دز لأحمد مية وخمسين ألف", "خمسين ألف", 50_000],
    ["دز لأحمد 50 ألف", "50", 50],
  ])("«%s» with source «%s» is a partial amount", (input, span, value) => {
    expect(crossCheck(withAmount(value, span), input)).toMatchObject({ ok: false, issues: [{ code: "amount_partial", actionIndex: 0 }] });
  });
  it.each([
    ["دز 50 الف دينار لأحمد", "50 الف", 50_000],
    ["حول لأحمد ربع مليون", "ربع مليون", 250_000],
    ["حول لأحمد مليون ونص", "مليون ونص", 1_500_000],
    ["دز لأحمد بخمسين ألف", "خمسين ألف", 50_000],
    ["دز خمسين ألف لأحمد وعشرة آلاف لعلي", "خمسين ألف", 50_000],
    ["دز لأحمد 1,500,000", "1,500,000", 1_500_000],
    ["dz 25 alf l ahmad", "25 alf", 25_000],
    ["دز خمسين ألف لأحمد، شكراً", "خمسين ألف", 50_000],
  ])("«%s» with source «%s» is the whole amount", (input, span, value) => {
    expect(crossCheck(withAmount(value, span), input)).toEqual({ ok: true });
  });
  it("the second of two amounts joined to its own recipient by «و» is fine", () => {
    const i = parse(intent([transfer(), transfer({ recipient: { kind: "name", text: "علي" }, amount: { value: 10_000, currency: "IQD", source_text: "عشرة آلاف" } })]));
    expect(crossCheck(i, "دز خمسين ألف لأحمد وعشرة آلاف لعلي")).toEqual({ ok: true });
  });
  it("Kurdish words pass; a Kurdish sub-span does not", () => {
    const ku = (span: string, v: number) => parse(intent([transfer({ recipient: { kind: "name", text: "ئەحمەد" }, amount: { value: v, currency: "IQD", source_text: span } })], { language: "ku" }));
    expect(crossCheck(ku("پەنجا هەزار", 50_000), "پەنجا هەزار بنێرە بۆ ئەحمەد")).toEqual({ ok: true });
    expect(crossCheck(ku("بیست هەزار", 20_000), "سەد و بیست هەزار بنێرە بۆ ئەحمەد")).toMatchObject({ ok: false, issues: [{ code: "amount_partial" }] });
  });
});

describe("crossCheck: an Arabic-script recipient must be someone the user wrote", () => {
  const parse = (v: unknown) => { const r = Intent.safeParse(v); if (!r.success) throw new Error("fixture invalid"); return r.data; };
  const who = (kind: string, text: string) => parse(intent([transfer({ recipient: { kind, text } })]));
  it.each([
    ["زيدان", "دز خمسين ألف لأحمد"],
    ["أحمد علي", "دز خمسين ألف لأحمد"], // the model added a surname: that would silently pick one of two Ahmeds
    ["حسين", "دز خمسين ألف لحسينن"], // the model "fixed" a typo: the resolver must propose instead
    ["علي", "دز خمسين ألف لأحمد"],
  ])("«%s» for «%s» is not in the input", (name, input) => {
    expect(crossCheck(who("name", name), input)).toMatchObject({ ok: false, issues: [{ code: "recipient_not_in_input" }] });
  });
  it.each([
    ["name", "أحمد", "دز خمسين ألف لأحمد"],
    ["name", "أحمد", "دز خمسين ألف لـ أحمد"],
    ["name", "أحمد علي", "دز خمسين ألف لأحمد علي"],
    ["name", "عبدالله", "دز خمسين ألف لعبد الله"],
    ["name", "عبد الله", "دز خمسين ألف لعبدالله"],
    ["name", "زينة", "دز خمسين ألف لزينه"],
    ["name", "الحجي", "دز خمسين ألف للحجي"],
    ["relation", "أمي", "حول لأمي خمسين ألف"],
    ["relation", "أمي", "حول لماما خمسين ألف"],
    ["name", "أخوي كرار", "دز لخوي كرار خمسين ألف"],
    ["name", "أحمد", "dz khamseen alf l ahmad خمسين ألف"], // Latin letters: Arabizi names are rewritten in Arabic, skip
  ])("%s «%s» for «%s» passes", (kind, name, input) => {
    expect(crossCheck(who(kind, name), input)).toEqual({ ok: true });
  });
  it("a recipient carried over from the pending request (already checked) passes on a follow-up message", () => {
    const i = who("name", "أحمد علي");
    expect(crossCheck(i, "خليها خمسين ألف")).toMatchObject({ ok: false, issues: [{ code: "recipient_not_in_input" }] });
    expect(crossCheck(i, "خليها خمسين ألف", { knownRecipients: ["احمد علي"] })).toEqual({ ok: true });
  });
});

describe("crossCheck: time words without when_text are not an immediate payment", () => {
  const parse = (v: unknown) => { const r = Intent.safeParse(v); if (!r.success) throw new Error("fixture invalid"); return r.data; };
  it.each([
    "دز خمسين ألف لأحمد باچر", "دز خمسين ألف لأحمد بكرة الصبح", "دز خمسين ألف لأحمد بعد ساعة", "دز خمسين ألف لأحمد الساعة 9 بالليل",
    "دز خمسين ألف لأحمد الليلة", "دز خمسين ألف لأحمد العصر", "دز خمسين ألف لأحمد يوم الجمعة", "دز خمسين ألف لأحمد اليوم بالليل",
  ])("«%s» without when_text is flagged", (input) => {
    expect(crossCheck(parse(intent([transfer()])), input)).toMatchObject({ ok: false, issues: [{ code: "when_missing", actionIndex: 0 }] });
  });
  it.each(["دز خمسين ألف لأحمد", "دز خمسين ألف لأحمد اليوم", "دز خمسين ألف لأحمد هسه", "صباح الخير، دز خمسين ألف لأحمد"])("«%s» is immediate", (input) => {
    expect(crossCheck(parse(intent([transfer()])), input)).toEqual({ ok: true });
  });
  it("a when_text on any action means the model saw the time", () => {
    const i = parse(intent([transfer({ when_text: "باچر" })]));
    expect(crossCheck(i, "دز خمسين ألف لأحمد باچر")).toEqual({ ok: true });
  });
  it("a bill payment too", () => {
    const i = parse(intent([{ type: "bill_pay", biller: "generator", biller_text: "المولدة", amount: null }]));
    expect(crossCheck(i, "ادفع المولدة باچر الساعة 9 الصبح")).toMatchObject({ ok: false, issues: [{ code: "when_missing" }] });
    expect(crossCheck(i, "ادفع فاتورة المولدة مال هذا الشهر")).toEqual({ ok: true });
  });
});
