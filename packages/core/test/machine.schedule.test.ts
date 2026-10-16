import { describe, it, expect } from "vitest";
import { initialState, transition, type MachineEvent, type MachineState, type Effect } from "../src/machine";
import { BAGHDAD_OFFSET_MS } from "../src/when";

const at = (y: number, m: number, d: number, h = 0, mi = 0) => Date.UTC(y, m - 1, d, h, mi) - BAGHDAD_OFFSET_MS;
const NOW = at(2026, 10, 16, 14, 5);
const transfer = (over: Record<string, unknown> = {}) => ({
  type: "transfer", recipient: { kind: "name", text: "أحمد علي" }, amount: { value: 50000, currency: "IQD", source_text: "خمسين ألف" }, ...over,
});
const bill = (over: Record<string, unknown> = {}) => ({ type: "bill_pay", biller: "generator", biller_text: "المولدة", amount: null, ...over });
const intent = (actions: unknown[], over: Record<string, unknown> = {}) => ({ actions, status: "ok", confidence: 0.9, language: "ar-iq", ...over });

function run(events: MachineEvent[], from: MachineState = initialState(), now = NOW) {
  let state = from; const effects: Effect[] = [];
  for (const e of events) { const r = transition(state, e, { now }); state = r.state; effects.push(...r.effects); }
  return { state, effects };
}
const asks = (fx: Effect[]) => fx.filter((e): e is Extract<Effect, { type: "ASK" }> => e.type === "ASK");

describe("scheduled payments in the state machine", () => {
  it("a complete schedule resolves like any request and remembers the exact instant", () => {
    const text = "دز خمسين ألف لأحمد علي باچر الساعة 9 الصبح";
    const r = run([{ type: "INPUT_RECEIVED", text }, { type: "LLM_OUTPUT", raw: intent([transfer({ when_text: "باچر الساعة 9 الصبح" })]), input: text }]);
    expect(r.state.phase).toBe("VALIDATED");
    expect(r.state.schedule).toEqual({ dueAt: at(2026, 10, 17, 9, 0) });
    expect(r.effects.some((e) => e.type === "RESOLVE")).toBe(true);
  });
  it("when_text that is not in what the user wrote is refused (the model cannot invent a time)", () => {
    const text = "دز خمسين ألف لأحمد علي";
    const r = run([{ type: "LLM_OUTPUT", raw: intent([transfer({ when_text: "باچر الساعة 9 الصبح" })]), input: text }]);
    expect(r.state.phase).toBe("NEEDS_REPHRASE");
    expect(r.state.schedule).toBeNull();
  });
  it("a date without an hour asks for the hour and remembers the date; the answer completes it", () => {
    const text = "دز خمسين ألف لأحمد علي باچر";
    const r1 = run([{ type: "LLM_OUTPUT", raw: intent([transfer({ when_text: "باچر" })]), input: text }]);
    expect(r1.state.phase).toBe("CLARIFYING");
    expect(r1.state.clarifySlot).toBe("time");
    expect(asks(r1.effects)[0]).toMatchObject({ slot: "time", key: "ask_time" });
    expect(r1.state.whenPrior?.date).toEqual({ y: 2026, m: 10, d: 17 });
    const r2 = run([{ type: "SLOT_ANSWER", slot: "time", filled: true, dueAt: at(2026, 10, 17, 21, 0) }], r1.state);
    expect(r2.state.phase).toBe("VALIDATED");
    expect(r2.state.schedule).toEqual({ dueAt: at(2026, 10, 17, 21, 0) });
  });
  it("«أجدولها» with no time asks when, with examples", () => {
    const text = "دز خمسين ألف لأحمد علي وأجدولها";
    const r = run([{ type: "LLM_OUTPUT", raw: intent([transfer({ when_text: "أجدولها" })]), input: text }]);
    expect(asks(r.effects)[0]).toMatchObject({ slot: "time", key: "ask_time_date" });
  });
  it("too soon / too far get their own question; two failed answers fail closed", () => {
    const text = "دز خمسين ألف لأحمد علي بعد دقيقة";
    const r1 = run([{ type: "LLM_OUTPUT", raw: intent([transfer({ when_text: "بعد دقيقة" })]), input: text }]);
    expect(asks(r1.effects)[0]).toMatchObject({ key: "ask_time_soon" });
    const r2 = run([{ type: "SLOT_ANSWER", slot: "time", filled: false, why: "unparsed" }], r1.state);
    expect(r2.state.phase).toBe("CLARIFYING");
    const r3 = run([{ type: "SLOT_ANSWER", slot: "time", filled: false, why: "unparsed" }], r2.state);
    expect(r3.state.phase).toBe("FAILED_SAFE");
  });
  it("schedule_help answers with guidance and creates nothing", () => {
    const r = run([{ type: "LLM_OUTPUT", raw: intent([], { status: "schedule_help" }), input: "اريد أجدول دفعة" }]);
    expect(r.state.phase).toBe("ANSWERED");
    expect(r.effects).toContainEqual({ type: "SAY", key: "schedule_help" });
  });
  it("two actions: each keeps its own time and the second is parsed when its turn comes", () => {
    const text = "ادفع المولدة باچر الساعة 9 الصبح ودز خمسين ألف لأحمد علي بعد ساعة";
    const r1 = run([{ type: "LLM_OUTPUT", raw: intent([bill({ when_text: "باچر الساعة 9 الصبح" }), transfer({ when_text: "بعد ساعة" })]), input: text }]);
    expect(r1.state.schedule).toEqual({ dueAt: at(2026, 10, 17, 9, 0) });
    expect(r1.state.queueWhen[0]).toEqual({ kind: "ok", dueAt: NOW + 3_600_000 });
    // finish the first (jump to a terminal phase), then the next action
    const done: MachineState = { ...r1.state, phase: "EXECUTED" };
    const r2 = run([{ type: "NEXT_ACTION" }], done);
    expect(r2.state.schedule).toEqual({ dueAt: NOW + 3_600_000 });
    expect(r2.state.current?.type).toBe("transfer");
  });
  it("an immediate payment has no schedule at all", () => {
    const text = "دز خمسين ألف لأحمد علي";
    const r = run([{ type: "LLM_OUTPUT", raw: intent([transfer()]), input: text }]);
    expect(r.state.schedule).toBeNull();
    expect(r.state.when).toBeNull();
  });
});
