import { describe, it, expect } from "vitest";
import { mcnemarExact, pairedOutcomes } from "../src/stats";

describe("exact McNemar (two-sided binomial on discordant pairs)", () => {
  it("matches hand-computed values", () => {
    expect(mcnemarExact(0, 0)).toBe(1);
    expect(mcnemarExact(0, 5)).toBeCloseTo(2 / 32, 12);
    expect(mcnemarExact(1, 9)).toBeCloseTo((2 * 11) / 1024, 12);
    expect(mcnemarExact(9, 1)).toBeCloseTo(mcnemarExact(1, 9), 12);
    expect(mcnemarExact(5, 5)).toBe(1);
    expect(mcnemarExact(3, 12)).toBeCloseTo(0.03515625, 8); // 2 * sum_{i<=3} C(15,i) / 2^15 = 2 * 576 / 32768
  });
  it("is stable for large n", () => { const p = mcnemarExact(400, 520); expect(p).toBeGreaterThan(0); expect(p).toBeLessThan(0.001); });
  it("rejects non-integers", () => expect(() => mcnemarExact(1.5, 2)).toThrow());
});

describe("paired outcomes", () => {
  it("pairs by id and counts discordant cells", () => {
    const a = [{ id: "1", ok: true }, { id: "2", ok: true }, { id: "3", ok: false }, { id: "4", ok: true }];
    const b = [{ id: "1", ok: true }, { id: "2", ok: false }, { id: "3", ok: true }, { id: "5", ok: true }];
    expect(pairedOutcomes(a, b)).toMatchObject({ n: 3, both: 1, a_only: 1, b_only: 1, neither: 0, unpaired_a: 1, unpaired_b: 1, p_value: 1 });
  });
  it("refuses duplicate ids", () => expect(() => pairedOutcomes([{ id: "1", ok: true }, { id: "1", ok: false }], [])).toThrow());
});
