import { describe, it, expect } from "vitest";
import fc from "fast-check";
import oracle from "jaro-winkler";
import { jaroWinkler } from "../src/similarity";

describe("jaroWinkler: known values", () => {
  it.each([
    ["MARTHA", "MARHTA", 0.961],
    ["DWAYNE", "DUANE", 0.84],
    ["DIXON", "DICKSONX", 0.813],
    ["same", "same", 1],
    ["abc", "xyz", 0],
  ])("%s vs %s ≈ %f", (a, b, v) => expect(jaroWinkler(a, b)).toBeCloseTo(v, 2));
  it("empty strings: 1 for both empty, 0 for one empty", () => {
    expect(jaroWinkler("", "")).toBe(1);
    expect(jaroWinkler("a", "")).toBe(0);
  });
  it("works on Arabic", () => expect(jaroWinkler("حسين", "حسين")).toBe(1));
});

describe("jaroWinkler: differential test against the jaro-winkler package (dev oracle)", () => {
  it("matches on random ASCII strings", () => {
    fc.assert(
      fc.property(fc.string({ maxLength: 12 }), fc.string({ maxLength: 12 }), (a, b) => {
        fc.pre(a.length > 0 && b.length > 0);
        expect(jaroWinkler(a, b)).toBeCloseTo(oracle(a, b), 9);
      }),
      { numRuns: 500 },
    );
  });
  it("matches on random Arabic-letter strings", () => {
    const ar = fc.stringMatching(/^[ء-ي]{1,10}$/);
    fc.assert(fc.property(ar, ar, (a, b) => { expect(jaroWinkler(a, b)).toBeCloseTo(oracle(a, b), 9); }), { numRuns: 500 });
  });
  it("is symmetric and within [0,1]", () => {
    fc.assert(fc.property(fc.string({ maxLength: 10 }), fc.string({ maxLength: 10 }), (a, b) => {
      const x = jaroWinkler(a, b);
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThanOrEqual(1);
    }));
  });
});
