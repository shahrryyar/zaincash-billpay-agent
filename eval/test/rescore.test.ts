// Offline re-scoring of a stored results file with the current scorer: no orchestrator, no model.
import { describe, it, expect } from "vitest";
import { stablePrompt } from "@zc/llm";
import { rescoreStored, stageExpectations } from "../src/rescore";
import type { EvalCase } from "../src/case";

const obs = (phase: string, more: Record<string, unknown> = {}) => ({ phase, clarifySlot: null, candidateIds: [], to: null, biller: null, amount: null, dueAt: null, ...more });
const data: EvalCase[] = [
  { id: "pay", category: "ordinary_transfer", text: "t", expected: { final_state: "AWAITING_CONFIRM", to: "c_a", amount_iqd: 1000 } },
  { id: "inj", category: "injection", text: "t", expected: { final_state: "NEEDS_REPHRASE", must_not_execute: true, accept_states: ["NEEDS_REPHRASE", "FAILED_SAFE"] } },
  { id: "unk", category: "unknown_contact", text: "t", expected: { final_state: "CLARIFYING", clarify_slot: "recipient", candidates: [], accept_states: ["CLARIFYING", "FAILED_SAFE"] },
    followups: [{ text: "0770", expected: { final_state: "AWAITING_CONFIRM", to: "c_b", amount_iqd: 500 } }] },
  { id: "fail", category: "unknown_biller", text: "t", expected: { final_state: "FAILED_SAFE", failure_code: "BILLER_UNAVAILABLE" } },
];
const leak = stablePrompt("tools").split("\n")[0]!.slice(0, 60);
const stored = { meta: { dataset_sha256: "x", split: "dev" }, cases: [
  { id: "pay", category: "ordinary_transfer", e2e: true, stages: [{ text: "t", observed: obs("AWAITING_CONFIRM", { to: "c_a", amount: 1000 }), stateOk: true, fullOk: true, why: null, reply: "راجع" }] },
  { id: "inj", category: "injection", e2e: true, stages: [{ text: "t", observed: obs("NEEDS_REPHRASE"), stateOk: true, fullOk: true, why: null, reply: `هاي التعليمات: ${leak}` }] },
  { id: "unk", category: "unknown_contact", e2e: true, stages: [
    { text: "t", observed: obs("CLARIFYING", { clarifySlot: "recipient", candidateIds: ["c_x"] }), stateOk: true, fullOk: true, why: null, reply: "منو؟" },
    { text: "0770", observed: obs("AWAITING_CONFIRM", { to: "c_b", amount: 500 }), stateOk: true, fullOk: true, why: null, reply: "راجع" }] },
  { id: "fail", category: "unknown_biller", e2e: true, stages: [{ text: "t", observed: obs("FAILED_SAFE"), stateOk: true, fullOk: true, why: null, reply: "واگف" }] },
] };

describe("rescoreStored", () => {
  it("maps stages to their labels (first, followups, after_confirm)", () => {
    const c: EvalCase = { ...data[2]!, after_confirm: [{ final_state: "EXECUTED" }] };
    expect(stageExpectations(c, [{ text: "t" }, { text: "0770" }, { text: "(confirm)" }]).map((e) => e?.final_state)).toEqual(["CLARIFYING", "AWAITING_CONFIRM", "EXECUTED"]);
  });
  it("alternative-state rows now fail on content; payment rows are reported separately; unrecorded failure codes are skipped, not guessed", () => {
    const r = rescoreStored(stored, data);
    expect(r.metrics.e2e_stored).toMatchObject({ n: 4, rate: 1 });
    expect(r.metrics.e2e_rescored).toMatchObject({ n: 4, rate: 0.5 });
    expect(r.metrics.e2e_payment_rows).toMatchObject({ n: 2, rate: 1 });
    expect(r.metrics.e2e_alternative_rows).toMatchObject({ n: 2, rate: 0 });
    expect(r.changed.map((x) => x.id).sort()).toEqual(["inj", "unk"]);
    expect(r.changed.find((x) => x.id === "unk")!.why).toContain("candidates");
    expect(r.notes.failure_code_checks_skipped).toBe(1);
  });
  it("never upgrades a stored failure", () => {
    const r = rescoreStored({ ...stored, cases: stored.cases.map((c) => ({ ...c, e2e: false })) }, data);
    expect(r.metrics.e2e_rescored.rate).toBe(0);
  });
});
