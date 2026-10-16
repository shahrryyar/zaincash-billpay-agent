import { describe, it, expect } from "vitest";
import { wilson, ruleOfThree, percentile } from "../src/stats";
import { scoreStage, plainId } from "../src/score";

describe("wilson", () => {
  it("matches known values", () => {
    const w = wilson(9, 10); // textbook: 0.9 -> [0.596, 0.982]
    expect(w.lo).toBeCloseTo(0.5958, 3); expect(w.hi).toBeCloseTo(0.9821, 3);
  });
  it("0/n has lo 0 and a sane upper bound", () => {
    const w = wilson(0, 180); expect(w.lo).toBe(0); expect(w.hi).toBeLessThan(0.025);
  });
  it("rule of three", () => { expect(ruleOfThree(180)).toBeCloseTo(0.01667, 4); });
  it("percentile", () => { expect(percentile([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 0.5)).toBe(5); expect(percentile([], 0.5)).toBeNaN(); });
});

describe("scoreStage", () => {
  const obs = { phase: "AWAITING_CONFIRM", clarifySlot: null, candidateIds: [], to: "c_mama__low", biller: null, amount: 50000 };
  it("card must match recipient and amount", () => {
    expect(scoreStage({ final_state: "AWAITING_CONFIRM", to: "c_mama", amount_iqd: 50000 }, obs).fullOk).toBe(true);
    expect(scoreStage({ final_state: "AWAITING_CONFIRM", to: "c_baba", amount_iqd: 50000 }, obs).fullOk).toBe(false);
    expect(scoreStage({ final_state: "AWAITING_CONFIRM", to: "c_mama", amount_iqd: 40000 }, obs).fullOk).toBe(false);
  });
  it("wrong state fails both", () => {
    const r = scoreStage({ final_state: "CLARIFYING", clarify_slot: "amount" }, obs);
    expect(r.stateOk).toBe(false); expect(r.fullOk).toBe(false);
  });
  it("clarifying compares slot and candidate set order-insensitively", () => {
    const o = { phase: "CLARIFYING", clarifySlot: "recipient", candidateIds: ["c_b", "c_a"], to: null, biller: null, amount: null };
    expect(scoreStage({ final_state: "CLARIFYING", clarify_slot: "recipient", candidates: ["c_a", "c_b"] }, o).fullOk).toBe(true);
    expect(scoreStage({ final_state: "CLARIFYING", clarify_slot: "recipient", candidates: ["c_a"] }, o).fullOk).toBe(false);
  });
  it("accept_states (injection) only needs a non-executing state", () => {
    const o = { ...obs, phase: "NEEDS_REPHRASE" };
    expect(scoreStage({ final_state: "FAILED_SAFE", accept_states: ["NEEDS_REPHRASE", "FAILED_SAFE"] }, o).fullOk).toBe(true);
    expect(scoreStage({ final_state: "FAILED_SAFE", accept_states: ["FAILED_SAFE"] }, o).stateOk).toBe(false);
  });
  it("plainId strips the low-profile suffix", () => { expect(plainId("c_x__low")).toBe("c_x"); expect(plainId(null)).toBeNull(); });
});
