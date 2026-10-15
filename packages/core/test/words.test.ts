import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { amountInWords, formatIQD } from "../src/words";
import { parseAmount } from "../src/amount";

describe("amountInWords (shown on the confirmation card next to the digits)", () => {
  it.each([
    [1000, "الف"],
    [2000, "الفين"],
    [3000, "ثلاثة الاف"],
    [10_000, "عشرة الاف"],
    [25_000, "خمسة وعشرين الف"],
    [50_000, "خمسين الف"],
    [100_000, "مية الف"],
    [150_000, "مية وخمسين الف"],
    [250_000, "ميتين وخمسين الف"],
    [1_000_000, "مليون"],
    [1_500_000, "مليون وخمسمية الف"],
    [2_000_000, "مليونين"],
  ])("%i -> %s", (n, w) => expect(amountInWords(n)).toBe(w));

  it("round-trips through parseAmount for every multiple of 250 from 1,000 to 200,000", () => {
    for (let n = 1000; n <= 200_000; n += 250) {
      const r = parseAmount(amountInWords(n));
      expect(r, `${n} -> ${amountInWords(n)}`).toEqual({ kind: "ok", value: n });
    }
  });
  it("round-trips for random multiples of 250 up to 10M (property)", () => {
    fc.assert(
      fc.property(fc.integer({ min: 4, max: 40_000 }), (k) => {
        const n = k * 250;
        const r = parseAmount(amountInWords(n));
        return r.kind === "ok" && r.value === n;
      }),
      { numRuns: 2000 },
    );
  });
  it("rejects non-positive, non-integer or non-multiples of 250", () => {
    for (const bad of [0, -250, 1000.5, 1001, Number.NaN]) expect(() => amountInWords(bad)).toThrow();
  });
});

describe("formatIQD", () => {
  it("Western digits with grouping by default", () => expect(formatIQD(50_000)).toBe("50,000 د.ع"));
  it("Arabic-Indic digits when asked", () => expect(formatIQD(50_000, "arabic-indic")).toBe("٥٠٬٠٠٠ د.ع"));
  it("small amounts", () => expect(formatIQD(250)).toBe("250 د.ع"));
  it("millions", () => expect(formatIQD(1_250_000)).toBe("1,250,000 د.ع"));
});
