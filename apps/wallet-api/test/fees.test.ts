import { describe, it, expect } from "vitest";
import { p2pFee, MONTHLY_LIMIT_IQD, FEE_SOURCE } from "../src/fees";

// Schedule copied from ZainCash's public "Fees & Limits (Individual Wallet)" page; see src/fees.ts.
describe("p2pFee: 0.5%, min 300 IQD, max 2,500 IQD", () => {
  it.each([
    [10_000, 300],     // 0.5% = 50  -> minimum
    [50_000, 300],     // 0.5% = 250 -> minimum
    [60_000, 300],     // exactly 300
    [61_000, 305],     // 305
    [100_000, 500],
    [199_000, 995],
    [500_000, 2_500],  // exactly the cap
    [1_000_000, 2_500],// 5,000 -> cap
    [2_500_000, 2_500],
  ])("fee on %i is %i", (amount, fee) => expect(p2pFee(amount)).toBe(fee));
  it("is an integer for every multiple of 250 up to the monthly limit", () => {
    for (let a = 250; a <= MONTHLY_LIMIT_IQD.transfer; a += 250) {
      const f = p2pFee(a);
      expect(Number.isInteger(f)).toBe(true);
      expect(f).toBeGreaterThanOrEqual(300);
      expect(f).toBeLessThanOrEqual(2_500);
    }
  });
  it("names its source and the date it was read", () => {
    expect(FEE_SOURCE.url).toBe("https://www.zaincash.iq/individual-wallet");
    expect(FEE_SOURCE.read).toBe("2026-10-16");
  });
});
