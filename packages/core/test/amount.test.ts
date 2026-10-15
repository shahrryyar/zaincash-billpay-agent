import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { parseAmount } from "../src/amount";

const ok = (v: number) => ({ kind: "ok", value: v });

describe("parseAmount: digits", () => {
  it.each([
    ["50000", 50000],
    ["50,000", 50000],
    ["50٬000", 50000],
    ["٥٠٠٠٠", 50000],
    ["50.000", 50000],
    ["50 ألف", 50000],
    ["٥٠ ألف", 50000],
    ["50 الف", 50000],
    ["50k", 50000],
    ["50K", 50000],
    ["50 alf", 50000],
    ["1000", 1000],
    ["1 مليون", 1_000_000],
  ])("%s -> %i", (t, v) => expect(parseAmount(t)).toEqual(ok(v)));
});

describe("parseAmount: Iraqi words", () => {
  it.each([
    ["خمسين ألف", 50000],
    ["خمسين الف", 50000],
    ["ميت ألف", 100000],
    ["مية الف", 100000],
    ["مئة ألف", 100000],
    ["مائة ألف", 100000],
    ["ربع مليون", 250000],
    ["نص مليون", 500000],
    ["نصف مليون", 500000],
    ["مليون", 1_000_000],
    ["مليون ونص", 1_500_000],
    ["مليون وربع", 1_250_000],
    ["مليونين", 2_000_000],
    ["الفين", 2000],
    ["ثلاث الاف", 3000],
    ["تلاثة آلاف", 3000],
    ["عشرين ألف", 20000],
    ["خمسة وعشرين ألف", 25000],
    ["ميتين ألف", 200000],
    ["مية وخمسين ألف", 150000],
    ["ثلاثمية ألف", 300000],
    ["خمسين ألف دينار", 50000],
    ["نص ألف", 500],
    ["ربع ألف", 250],
  ])("%s -> %i", (t, v) => expect(parseAmount(t)).toEqual(ok(v)));
});

describe("parseAmount: ambiguity (ask, never guess)", () => {
  it.each([
    ["خمسة وعشرين", 25],
    ["عشرة", 10],
    ["25", 25],
    ["ميت", 100],
  ])("%s is ambiguous between %i and %i000", (t, v) => {
    const r = parseAmount(t);
    expect(r.kind).toBe("ambiguous");
    if (r.kind === "ambiguous") expect(r.candidates).toEqual([v, v * 1000]);
  });
});

describe("parseAmount: unsupported / invalid", () => {
  it.each(["ورقة", "دفتر", "100 دولار", "$100", "50 usd"])("%s is a non-IQD currency", (t) =>
    expect(parseAmount(t)).toMatchObject({ kind: "unsupported", reason: "currency" }),
  );
  it.each(["50.5", "50٫5", "12.75 ألف"])("%s has decimals", (t) =>
    expect(parseAmount(t)).toMatchObject({ kind: "invalid", reason: "decimal" }),
  );
  it.each(["", "   ", "أحمد", "شنو", "عشرة بلا بلا"])("%j has no amount", (t) =>
    expect(parseAmount(t).kind).toBe("none"),
  );
});

describe("parseAmount: properties", () => {
  it("never throws on arbitrary input", () => {
    fc.assert(fc.property(fc.string({ unit: "binary" }), (s) => { parseAmount(s); return true; }));
  });
  it("ASCII integers >= 1000 round-trip", () => {
    fc.assert(
      fc.property(fc.integer({ min: 1000, max: 99_999_999 }), (n) => {
        expect(parseAmount(String(n))).toEqual(ok(n));
        return true;
      }),
    );
  });
  it("N ألف round-trips for N in 1..999", () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 999 }), (n) => {
        expect(parseAmount(`${n} ألف`)).toEqual(ok(n * 1000));
        return true;
      }),
    );
  });
});
