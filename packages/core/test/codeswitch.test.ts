// Mixed Arabic + English input (organiser resources guide: "check how your system copes with mixed Arabic and
// English"; docs/35 RS-04). These pin the deterministic layer: an English money word it does not know is never read as a
// value, so the model's number cannot reach a card unchecked; foreign currency in English still refuses a transfer.
import { describe, it, expect } from "vitest";
import { parseAmount, mentionsForeignCurrency } from "../src/amount";
import { crossCheck, validateIntent, type Intent } from "../src/schema";
import { resolveContact, type Contact } from "../src/resolver";

const transfer = (source_text: string, value: number, recipient = "أحمد") => ({
  type: "transfer", recipient: { kind: "name", text: recipient }, amount: { value, currency: "IQD", source_text },
});
const intentOf = (actions: unknown[]): Intent => {
  const r = validateIntent({ actions, status: "ok", confidence: 0.9, language: "ar-iq" });
  if (!r.ok) throw new Error(r.error);
  return r.intent;
};
const codes = (r: ReturnType<typeof crossCheck>) => (r.ok ? [] : r.issues.map((i) => i.code));

describe("code-switch amounts that the parser reads exactly", () => {
  it.each([
    ["50k", 50_000], ["50K", 50_000], ["50 k", 50_000], ["25k IQD", 25_000], ["50,000 IQD", 50_000],
    ["50 alf", 50_000], ["50 Alf", 50_000], ["2 million", 2_000_000],
  ])("%s -> %d", (span, value) => expect(parseAmount(span)).toEqual({ kind: "ok", value }));

  it("a model value that matches an English-digit span passes the cross-check", () => {
    expect(crossCheck(intentOf([transfer("50k", 50_000)]), "دز 50k لأحمد please").ok).toBe(true);
  });
});

describe("English money words the parser does not know: never a silent value (ask or rephrase)", () => {
  it.each(["50 thousand", "fifty thousand", "25 thousand IQD", "fifty alf"])("%s is not parsed", (span) =>
    expect(parseAmount(span).kind).toBe("none"));

  it("the model cannot turn «50 thousand» into a card: amount_invalid, so the machine asks to rephrase", () => {
    expect(codes(crossCheck(intentOf([transfer("50 thousand", 50_000)]), "send 50 thousand لأحمد"))).toEqual(["amount_invalid"]);
  });
  it("a bare English-context number under 1,000 is ambiguous (25 or 25,000), never assumed", () => {
    const r = crossCheck(intentOf([transfer("25", 25_000)]), "send 25 to أحمد");
    expect(r.ok ? [] : r.issues).toEqual([{ code: "amount_ambiguous", actionIndex: 0, candidates: [25, 25_000] }]);
  });
  it("a decimal million is refused, not rounded", () => expect(parseAmount("1.5 million")).toEqual({ kind: "invalid", reason: "decimal" }));
});

describe("foreign currency written in English refuses a transfer", () => {
  it.each(["send 50 dollars to Ahmed", "دز 50 Dollar لأحمد", "حول 100 USD لعلي", "حول $20 لعلي"])("%s", (text) =>
    expect(mentionsForeignCurrency(text)).toBe(true));

  it("even when the model wrote the amount as IQD", () =>
    expect(codes(crossCheck(intentOf([transfer("50", 50_000)]), "دز 50 dollars لأحمد"))).toContain("currency_unsupported"));

  // Limitation, recorded rather than fixed: euro / slang are not on the currency list. They still cannot pass as an
  // exact amount: «50 euro» is not parsed, and a bare «50» is ambiguous and needs an explicit IQD answer.
  it("euro is not detected as foreign currency, but its span is not a valid IQD amount either", () => {
    expect(mentionsForeignCurrency("transfer 50 EUR to ali")).toBe(false);
    expect(codes(crossCheck(intentOf([transfer("50 EUR", 50_000)]), "transfer 50 EUR to علي"))).toEqual(["amount_invalid"]);
    expect(codes(crossCheck(intentOf([transfer("50", 50_000)]), "transfer 50 EUR to علي"))).toEqual(["amount_ambiguous"]);
  });
});

describe("recipient names in mixed scripts still ask on ambiguity", () => {
  const book: Contact[] = [
    { id: "c_ahmed_ali", display_name: "أحمد علي", phone: "07700004471" },
    { id: "c_ahmed_moh", display_name: "أحمد محمد", phone: "07700009023" },
    { id: "c_ali_karim", display_name: "علي كريم", phone: "07700000101" },
  ];
  it("«أحمد» from a mixed sentence is two candidates, never one", () => {
    const r = resolveContact({ kind: "name", text: "أحمد" }, book);
    expect(r.status).toBe("ambiguous");
  });
  it("a Latin-letter name the model failed to transliterate is never resolved to a contact", () => {
    const r = resolveContact({ kind: "name", text: "Ahmed" }, book);
    expect(r.status).not.toBe("resolved");
  });
});
