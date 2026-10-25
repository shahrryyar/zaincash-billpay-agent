// Upstream model requests per model turn: the number a free-tier daily limit is spent in (docs/35 FA-03, FA-15).
import { describe, it, expect } from "vitest";
import { runCase, type EvalCase } from "../src/case";
import { requestsPerTurn } from "../src/stats";
import type { Understander } from "@zc/llm";

const transfer = { type: "transfer", recipient: { kind: "name", text: "علي كريم" }, amount: { value: 50000, currency: "IQD", source_text: "50 الف" } };
const intent = { actions: [transfer], status: "ok", confidence: 0.9, language: "ar-iq" };
const runner = (requests?: number) => ({ understanderFor: (): Understander => ({ async understand() {
  return { raw: intent, toolCalls: [], usage: { input: 0, output: 0 }, model: "fake", mode: "tools", turns: 1, ...(requests === undefined ? {} : { requests }) };
} }) });
const c: EvalCase = { id: "q", category: "test", text: "دز 50 الف لعلي كريم", expected: { final_state: "AWAITING_CONFIRM", to: "c_ali_karim", amount_iqd: 50000 } };

describe("model requests in eval results", () => {
  it("a case records the requests its model turns used", async () => {
    const r = await runCase(c, runner(2));
    expect(r.model_requests).toBe(2);
    expect(r.model_turns).toBe(1);
  });
  it("an understander that does not count leaves the case unmeasured, not zero", async () => {
    const r = await runCase(c, runner());
    expect(r.model_requests).toBeNull();
    expect(r.model_turns).toBe(0);
  });
  it("summarises per model turn over measured cases only", () => {
    expect(requestsPerTurn([{ model_requests: 2, model_turns: 1 }, { model_requests: 5, model_turns: 2 }, { model_requests: null, model_turns: 0 }]))
      .toEqual({ cases: 2, turns: 3, requests: 7, mean: 7 / 3, max_per_case: 5 });
    expect(requestsPerTurn([{ model_requests: null, model_turns: 0 }])).toBeNull();
  });
});
