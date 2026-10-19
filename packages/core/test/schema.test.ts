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
    const i = parse(intent([transfer({ amount: { value: 25, currency: "IQD", source_text: "خمسة وعشرين" } })]));
    const r = crossCheck(i, "دز خمسة وعشرين لعلي");
    expect(r).toMatchObject({ ok: false, issues: [{ code: "amount_ambiguous", candidates: [25, 25000] }] });
  });
  it("rejects non-IQD slang (ورقة)", () => {
    const i = parse(intent([transfer({ amount: { value: 100000, currency: "IQD", source_text: "ورقة" } })]));
    expect(crossCheck(i, "دز ورقة لعلي")).toMatchObject({ ok: false, issues: [{ code: "currency_unsupported" }] });
  });
  it.each([
    ["حول لي ورقة لأحمد علي فدوة"], ["دز دفتر لاخوي كرار"], ["حول 100 دولار لعلي"], ["dez 50$ l ali"], ["حول ورقتين لعلي كريم"],
  ])("a transfer with dollars / «ورقة» / «دفتر» in the message is refused even when the model left the amount empty: %s", (text) => {
    const i = parse(intent([transfer({ amount: null })]));
    expect(crossCheck(i, text)).toMatchObject({ ok: false, issues: [{ code: "currency_unsupported" }] });
  });
  it("those words do not block a bill payment («ورقة الكهرباء» is the bill slip)", () => {
    const i = parse(intent([{ type: "bill_pay", biller: "electricity", biller_text: "الكهرباء", amount: null }]));
    expect(crossCheck(i, "ادفع ورقة الكهرباء")).toEqual({ ok: true });
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
