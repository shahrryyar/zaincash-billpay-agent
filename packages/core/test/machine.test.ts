import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { initialState, transition, TERMINAL, type MachineEvent, type MachineState, type Effect, type Phase } from "../src/machine";

const T0 = 1_000_000;
const TTL = 120_000;

const transfer = (over: Record<string, unknown> = {}) => ({
  type: "transfer",
  recipient: { kind: "name", text: "أحمد" },
  amount: { value: 50000, currency: "IQD", source_text: "خمسين ألف" },
  ...over,
});
const intent = (actions: unknown[], over: Record<string, unknown> = {}) => ({ actions, status: "ok", confidence: 0.9, language: "ar-iq", ...over });
const HERO = "دز خمسين ألف لأحمد";

type Step = [MachineEvent, number?]; // event, optional "now"
function run(steps: Step[], from: MachineState = initialState()) {
  let state = from;
  const all: { event: MachineEvent; prev: MachineState; state: MachineState; effects: Effect[]; now: number }[] = [];
  let now = T0;
  for (const [event, at] of steps) {
    if (at !== undefined) now = at;
    const prev = state;
    const r = transition(state, event, { now });
    state = r.state;
    all.push({ event, prev, state, effects: r.effects, now });
  }
  return { state, trace: all, effects: all.flatMap((x) => x.effects) };
}
const types = (effects: Effect[]) => effects.map((e) => e.type);

// the happy path up to a live confirmation card
const toCard: Step[] = [
  [{ type: "INPUT_RECEIVED", text: HERO }],
  [{ type: "LLM_OUTPUT", raw: intent([transfer()]), input: HERO }],
  [{ type: "RESOLUTION", slot: "recipient", result: "resolved" }],
  [{ type: "PRECHECK", ok: true }],
  [{ type: "CARD_ISSUED", payloadHash: "h1", token: "ct_1", idempotencyKey: "k1" }],
];

describe("happy path (the demo chain)", () => {
  it("PARSED -> VALIDATED -> RESOLVED -> AWAITING_CONFIRM -> EXECUTING -> EXECUTED", () => {
    const r = run([...toCard, [{ type: "CONFIRM", token: "ct_1", payloadHash: "h1" }], [{ type: "EXEC_RESULT", outcome: "ok" }]]);
    expect(r.trace.map((x) => x.state.phase)).toEqual(["IDLE", "VALIDATED", "RESOLVED", "RESOLVED", "AWAITING_CONFIRM", "EXECUTING", "EXECUTED"]);
    expect(types(r.effects)).toContain("EXECUTE");
  });
  it("INPUT_RECEIVED asks the orchestrator to call the LLM", () =>
    expect(types(run([[{ type: "INPUT_RECEIVED", text: HERO }]]).effects)).toEqual(["CALL_LLM"]));
  it("the card expires 120 s after it is issued", () => {
    const r = run(toCard);
    expect(r.state.card?.expiresAt).toBe(T0 + TTL);
  });
});

describe("invalid / unsafe model output never reaches execution", () => {
  it.each([
    ["not JSON object", "دز خمسين ألف"],
    ["unknown action type", intent([{ type: "execute", amount: 1 }])],
    ["no actions with status ok", intent([])],
    ["status unclear", intent([], { status: "unclear" })],
  ])("%s -> NEEDS_REPHRASE", (_n, raw) => {
    const r = run([[{ type: "LLM_OUTPUT", raw, input: HERO }]]);
    expect(r.state.phase).toBe("NEEDS_REPHRASE");
    expect(types(r.effects)).not.toContain("EXECUTE");
  });
  it("hallucinated amount (source_text not in input) -> NEEDS_REPHRASE", () =>
    expect(run([[{ type: "LLM_OUTPUT", raw: intent([transfer()]), input: "دز لأحمد" }]]).state.phase).toBe("NEEDS_REPHRASE"));
  it("amount mismatch -> NEEDS_REPHRASE", () =>
    expect(run([[{ type: "LLM_OUTPUT", raw: intent([transfer({ amount: { value: 500000, currency: "IQD", source_text: "خمسين ألف" } })]), input: HERO }]]).state.phase).toBe("NEEDS_REPHRASE"));
  it("dollars -> FAILED_SAFE with usd copy", () => {
    const raw = intent([transfer({ amount: { value: 100000, currency: "IQD", source_text: "ورقة" } })]);
    const r = run([[{ type: "LLM_OUTPUT", raw, input: "دز ورقة لعلي" }]]);
    expect(r.state.phase).toBe("FAILED_SAFE");
    expect(r.effects).toContainEqual({ type: "SAY", key: "usd_unsupported" });
  });
  it("out_of_scope -> FAILED_SAFE (polite refusal)", () => {
    const r = run([[{ type: "LLM_OUTPUT", raw: intent([], { status: "out_of_scope" }), input: "احجزلي تكت" }]]);
    expect(r.state.phase).toBe("FAILED_SAFE");
    expect(r.effects).toContainEqual({ type: "SAY", key: "out_of_scope" });
  });
  it("NEEDS_REPHRASE accepts a new input", () => {
    const r = run([[{ type: "LLM_OUTPUT", raw: "junk", input: "x" }], [{ type: "INPUT_RECEIVED", text: "دز خمسين ألف لأحمد" }]]);
    expect(r.state.phase).toBe("IDLE");
    expect(types(r.effects)).toContain("CALL_LLM");
  });
});

describe("ask, never guess (ambiguity and missing slots)", () => {
  it("missing amount -> CLARIFYING amount", () => {
    const r = run([[{ type: "LLM_OUTPUT", raw: intent([transfer({ amount: null })]), input: "دز لأحمد" }]]);
    expect(r.state).toMatchObject({ phase: "CLARIFYING", clarifySlot: "amount" });
    expect(r.effects).toContainEqual({ type: "ASK", slot: "amount", key: "ask_amount", vars: { name: "أحمد" } });
  });
  it("missing recipient -> CLARIFYING recipient", () => {
    const r = run([[{ type: "LLM_OUTPUT", raw: intent([transfer({ recipient: null })]), input: HERO }]]);
    expect(r.state).toMatchObject({ phase: "CLARIFYING", clarifySlot: "recipient" });
  });
  it("dropped ألف (خمسة وعشرين) -> CLARIFYING amount with the thousands question", () => {
    const raw = intent([transfer({ amount: { value: 25, currency: "IQD", source_text: "خمسة وعشرين" } })]);
    const r = run([[{ type: "LLM_OUTPUT", raw, input: "دز خمسة وعشرين لعلي" }]]);
    expect(r.state).toMatchObject({ phase: "CLARIFYING", clarifySlot: "amount" });
    expect(r.effects).toContainEqual({ type: "ASK", slot: "amount", key: "ask_amount_thousands", vars: { value: 25 } });
  });
  it("unknown biller -> CLARIFYING biller", () => {
    const raw = intent([{ type: "bill_pay", biller: "unknown", biller_text: "الشي ذاك", amount: null }]);
    expect(run([[{ type: "LLM_OUTPUT", raw, input: "ادفع الشي ذاك" }]]).state).toMatchObject({ phase: "CLARIFYING", clarifySlot: "biller" });
  });
  it("two Ahmeds: ambiguous resolution asks which one", () => {
    const r = run([...toCard.slice(0, 2), [{ type: "RESOLUTION", slot: "recipient", result: "ambiguous", count: 2, name: "أحمد" }]]);
    expect(r.state).toMatchObject({ phase: "CLARIFYING", clarifySlot: "recipient" });
    expect(r.effects).toContainEqual({ type: "ASK", slot: "recipient", key: "ask_which_contact", vars: { n: 2, name: "أحمد" } });
    expect(types(r.effects)).not.toContain("PRECHECK");
  });
  it("fuzzy match asks «تقصد…؟», never resolves by itself", () => {
    const r = run([...toCard.slice(0, 2), [{ type: "RESOLUTION", slot: "recipient", result: "fuzzy", name: "حسين" }]]);
    expect(r.state.phase).toBe("CLARIFYING");
    expect(r.effects).toContainEqual({ type: "ASK", slot: "recipient", key: "ask_fuzzy_contact", vars: { name: "حسين" } });
  });
  it("unknown contact asks for the number", () => {
    const r = run([...toCard.slice(0, 2), [{ type: "RESOLUTION", slot: "recipient", result: "none", name: "زيدان" }]]);
    expect(r.effects).toContainEqual({ type: "ASK", slot: "recipient", key: "contact_not_found", vars: { name: "زيدان" } });
  });
  it("a valid phone number that is not a saved contact: says so (never creates a contact)", () => {
    const r = run([...toCard.slice(0, 2), [{ type: "RESOLUTION", slot: "recipient", result: "unknown_number", phone: "••••1234" }]]);
    expect(r.state).toMatchObject({ phase: "CLARIFYING", clarifySlot: "recipient" });
    expect(r.effects).toContainEqual({ type: "ASK", slot: "recipient", key: "number_not_saved", vars: { phone: "••••1234" } });
  });
  it("«نفس الشخص مال المرة الفاتت» as the recipient: asks who, not «ما لگيت نفس المرة»", () => {
    const r = run([...toCard.slice(0, 2), [{ type: "RESOLUTION", slot: "recipient", result: "history" }]]);
    expect(r.effects).toContainEqual({ type: "ASK", slot: "recipient", key: "ask_recipient", vars: {} });
  });
  it("a correct clarification answer goes back through validation and resolution", () => {
    const r = run([...toCard.slice(0, 2), [{ type: "RESOLUTION", slot: "recipient", result: "ambiguous", count: 2, name: "أحمد" }], [{ type: "RESOLUTION", slot: "recipient", result: "resolved" }]]);
    expect(r.state.phase).toBe("RESOLVED");
    expect(types(r.trace.at(-1)!.effects)).toEqual(["AUDIT", "PRECHECK"]);
  });
  it("SLOT_ANSWER filled for amount re-validates and re-resolves", () => {
    const r = run([[{ type: "LLM_OUTPUT", raw: intent([transfer({ amount: null })]), input: "دز لأحمد" }], [{ type: "SLOT_ANSWER", slot: "amount", filled: true }]]);
    expect(r.state.phase).toBe("VALIDATED");
    expect(r.effects).toContainEqual({ type: "RESOLVE", slot: "recipient" });
  });
  it("at most 2 questions per slot, then FAILED_SAFE (loop cannot run forever)", () => {
    const r = run([
      [{ type: "LLM_OUTPUT", raw: intent([transfer({ amount: null })]), input: "دز لأحمد" }],
      [{ type: "SLOT_ANSWER", slot: "amount", filled: false }],
      [{ type: "SLOT_ANSWER", slot: "amount", filled: false }],
    ]);
    expect(r.trace.map((x) => x.state.phase)).toEqual(["CLARIFYING", "CLARIFYING", "FAILED_SAFE"]);
    expect(r.effects).toContainEqual({ type: "SAY", key: "clarify_exhausted" });
  });
  it("two actions: the first is processed, the second is queued with its own chain", () => {
    const raw = intent([{ type: "bill_pay", biller: "electricity", biller_text: "الكهرباء", amount: null }, transfer({ recipient: { kind: "name", text: "علي" }, amount: { value: 10000, currency: "IQD", source_text: "عشرة آلاف" } })]);
    const input = "ادفع الكهرباء ودز لعلي عشرة آلاف";
    const r = run([[{ type: "LLM_OUTPUT", raw, input }]]);
    expect(r.state.queue).toHaveLength(1);
    expect(r.effects).toContainEqual({ type: "SAY", key: "two_actions" });
    expect(r.state.current?.type).toBe("bill_pay");
  });
  it("NEXT_ACTION after the first finishes starts the queued one with a fresh card", () => {
    const raw = intent([{ type: "info", query: "balance" }, transfer()]);
    const r = run([[{ type: "LLM_OUTPUT", raw, input: HERO }], [{ type: "NEXT_ACTION" }]]);
    expect(r.trace[0]!.state.phase).toBe("ANSWERED");
    expect(r.state.phase).toBe("VALIDATED");
    expect(r.state.card).toBeNull();
    expect(r.state.queue).toHaveLength(0);
  });
  it("info actions never create a card", () => {
    const r = run([[{ type: "LLM_OUTPUT", raw: intent([{ type: "info", query: "balance" }]), input: "شكد رصيدي" }]]);
    expect(r.state.phase).toBe("ANSWERED");
    expect(types(r.effects)).not.toContain("ISSUE_CARD");
  });
});

describe("pre-checks fail closed", () => {
  it.each(["INSUFFICIENT_BALANCE", "LIMIT_EXCEEDED", "BILLER_UNAVAILABLE", "BILL_ALREADY_PAID"])("%s -> FAILED_SAFE, no card", (code) => {
    const r = run([...toCard.slice(0, 3), [{ type: "PRECHECK", ok: false, code }]]);
    expect(r.state).toMatchObject({ phase: "FAILED_SAFE", reason: code, card: null });
    expect(types(r.effects)).not.toContain("ISSUE_CARD");
  });
  it("PRECHECK ok asks for a card", () => expect(types(run(toCard.slice(0, 4)).effects)).toContain("ISSUE_CARD"));
});

describe("confirmation gate: no execution without a valid token (invariant 1)", () => {
  const cardState = () => run(toCard).state;
  const confirm = (token: string, payloadHash: string, at?: number): Step => [{ type: "CONFIRM", token, payloadHash }, at];

  it("wrong token: rejected, still awaiting, nothing executed", () => {
    const r = run([confirm("ct_bad", "h1")], cardState());
    expect(r.state.phase).toBe("AWAITING_CONFIRM");
    expect(types(r.effects)).toEqual(["REJECT"]);
  });
  it("token for a different payload: rejected", () => {
    const r = run([confirm("ct_1", "h_other")], cardState());
    expect(r.state.phase).toBe("AWAITING_CONFIRM");
    expect(types(r.effects)).toEqual(["REJECT"]);
  });
  it("expired: EXPIRED, token revoked, nothing executed", () => {
    const r = run([confirm("ct_1", "h1", T0 + TTL)], cardState());
    expect(r.state.phase).toBe("EXPIRED");
    expect(types(r.effects)).toContain("REVOKE_TOKEN");
    expect(types(r.effects)).not.toContain("EXECUTE");
  });
  it("valid token executes exactly once; a double tap is ignored", () => {
    const r = run([confirm("ct_1", "h1"), confirm("ct_1", "h1")], cardState());
    expect(types(r.effects).filter((t) => t === "EXECUTE")).toHaveLength(1);
    expect(r.state.phase).toBe("EXECUTING");
  });
  it("defence in depth: a restored/corrupt state whose card was already sent cannot execute again", () => {
    const sent = cardState();
    const corrupt: MachineState = { ...sent, card: { ...sent.card!, executeSent: true } };
    const r = run([confirm("ct_1", "h1")], corrupt);
    expect(types(r.effects)).not.toContain("EXECUTE");
    expect(types(r.effects)).toEqual(["REJECT"]);
  });
  it("a confirm with no card at all is rejected", () => {
    const r = run([[{ type: "CONFIRM", token: "ct_1", payloadHash: "h1" }]]);
    expect(r.state.phase).toBe("IDLE");
    expect(types(r.effects)).not.toContain("EXECUTE");
  });
  it("a spoken/typed «yes» (confirm_reply from the model) never executes", () => {
    const r = run([[{ type: "LLM_OUTPUT", raw: intent([], { status: "confirm_reply" }), input: "اي دز" }]], cardState());
    expect(r.state.phase).toBe("AWAITING_CONFIRM");
    expect(types(r.effects)).not.toContain("EXECUTE");
    expect(r.effects).toContainEqual({ type: "SAY", key: "press_confirm_button" });
  });
  it("the model cannot confirm by returning any JSON in AWAITING_CONFIRM", () => {
    for (const raw of [intent([transfer()]), intent([], { status: "ok" }), { confirm: true, token: "ct_1" }, "yes"]) {
      const r = run([[{ type: "LLM_OUTPUT", raw, input: "اي" }]], cardState());
      expect(types(r.effects)).not.toContain("EXECUTE");
    }
  });
  it("TICK after expiry expires the card; before expiry does nothing", () => {
    expect(run([[{ type: "TICK" }, T0 + 1000]], cardState()).state.phase).toBe("AWAITING_CONFIRM");
    const r = run([[{ type: "TICK" }, T0 + TTL]], cardState());
    expect(r.state).toMatchObject({ phase: "EXPIRED", card: null });
    expect(types(r.effects)).toContain("REVOKE_TOKEN");
  });
  it("EDIT revokes the token and returns to VALIDATED; the old token is dead", () => {
    const r = run([[{ type: "EDIT" }], [{ type: "CONFIRM", token: "ct_1", payloadHash: "h1" }]], cardState());
    expect(r.trace[0]!.state).toMatchObject({ phase: "VALIDATED", card: null });
    expect(r.trace[0]!.effects).toContainEqual({ type: "REVOKE_TOKEN", token: "ct_1" });
    expect(types(r.effects)).not.toContain("EXECUTE");
  });
  it("CANCEL revokes and ends with the cancelled copy", () => {
    const r = run([[{ type: "CANCEL" }]], cardState());
    expect(r.state.phase).toBe("CANCELLED");
    expect(r.effects).toContainEqual({ type: "REVOKE_TOKEN", token: "ct_1" });
    expect(r.effects).toContainEqual({ type: "SAY", key: "cancelled" });
  });
  it("cancel cannot undo a payment already sent", () => {
    const r = run([[{ type: "CONFIRM", token: "ct_1", payloadHash: "h1" }], [{ type: "CANCEL" }]], cardState());
    expect(r.state.phase).toBe("EXECUTING");
  });
  it("model asking for cancel in AWAITING_CONFIRM cancels", () =>
    expect(run([[{ type: "LLM_OUTPUT", raw: intent([], { status: "cancel" }), input: "لا الغي" }]], cardState()).state.phase).toBe("CANCELLED"));
  it("a bill amount that changed after the card was issued needs a new card", () => {
    const r = run([[{ type: "EDIT" }]], cardState());
    expect(r.state.phase).toBe("VALIDATED");
  });
});

describe("execution, retries and unknown outcomes (invariant 2: no duplicate debit)", () => {
  const executing = () => run([...toCard, [{ type: "CONFIRM", token: "ct_1", payloadHash: "h1" }]]).state;
  const retryEffects = (effects: Effect[]) => effects.filter((e) => e.type === "RETRY");

  it("wallet rejects -> FAILED_SAFE with its code", () => {
    const r = run([[{ type: "EXEC_RESULT", outcome: "rejected", code: "INSUFFICIENT_BALANCE" }]], executing());
    expect(r.state).toMatchObject({ phase: "FAILED_SAFE", reason: "INSUFFICIENT_BALANCE" });
  });
  it("timeout -> UNKNOWN_OUTCOME and a retry with the SAME idempotency key and payload", () => {
    const r = run([[{ type: "EXEC_RESULT", outcome: "timeout" }]], executing());
    expect(r.state.phase).toBe("UNKNOWN_OUTCOME");
    expect(r.effects).toContainEqual({ type: "SAY", key: "checking" });
    expect(retryEffects(r.effects)).toEqual([{ type: "RETRY", idempotencyKey: "k1", payloadHash: "h1", token: "ct_1" }]);
    expect(types(r.effects)).not.toContain("EXECUTE");
  });
  it("retries are capped at 3, then the outcome is looked up by key", () => {
    const r = run(Array.from({ length: 4 }, () => [{ type: "EXEC_RESULT", outcome: "timeout" }] as Step), executing());
    expect(retryEffects(r.effects)).toHaveLength(3);
    expect(r.effects).toContainEqual({ type: "LOOKUP_OUTCOME", idempotencyKey: "k1" });
  });
  it("a late success after a timeout is EXECUTED once", () => {
    const r = run([[{ type: "EXEC_RESULT", outcome: "timeout" }], [{ type: "EXEC_RESULT", outcome: "ok" }]], executing());
    expect(r.state.phase).toBe("EXECUTED");
  });
  it("lookup finds it executed -> EXECUTED", () => {
    const r = run([[{ type: "EXEC_RESULT", outcome: "timeout" }], [{ type: "LOOKUP_RESULT", found: "executed" }]], executing());
    expect(r.state.phase).toBe("EXECUTED");
  });
  it("lookup says not executed -> FAILED_SAFE", () => {
    const r = run([[{ type: "EXEC_RESULT", outcome: "timeout" }], [{ type: "LOOKUP_RESULT", found: "not_found" }]], executing());
    expect(r.state).toMatchObject({ phase: "FAILED_SAFE", reason: "not_executed" });
  });
  it("still unknown -> stays UNKNOWN_OUTCOME with the 'do not resend' message and the key kept", () => {
    const r = run([[{ type: "EXEC_RESULT", outcome: "timeout" }], [{ type: "LOOKUP_RESULT", found: "unknown" }]], executing());
    expect(r.state).toMatchObject({ phase: "UNKNOWN_OUTCOME", reason: "unknown_outcome" });
    expect(r.state.card?.idempotencyKey).toBe("k1");
    expect(r.effects).toContainEqual({ type: "SAY", key: "unknown_outcome" });
  });
  it("RECHECK looks the outcome up again by the SAME key, and never executes or retries", () => {
    const stuck = run([[{ type: "EXEC_RESULT", outcome: "timeout" }], [{ type: "LOOKUP_RESULT", found: "unknown" }]], executing()).state;
    const r = run([[{ type: "RECHECK" }]], stuck);
    expect(r.state.phase).toBe("UNKNOWN_OUTCOME");
    expect(r.effects).toContainEqual({ type: "LOOKUP_OUTCOME", idempotencyKey: "k1" });
    expect(types(r.effects).filter((t) => t === "EXECUTE" || t === "RETRY")).toEqual([]);
    expect(run([[{ type: "RECHECK" }], [{ type: "LOOKUP_RESULT", found: "executed" }]], stuck).state.phase).toBe("EXECUTED");
    expect(run([[{ type: "RECHECK" }], [{ type: "LOOKUP_RESULT", found: "not_found" }]], stuck).state.phase).toBe("FAILED_SAFE");
  });
  it("RECHECK outside UNKNOWN_OUTCOME does nothing", () => {
    for (const phase of ["IDLE", "AWAITING_CONFIRM", "EXECUTED", "FAILED_SAFE"] as Phase[]) {
      const r = run([[{ type: "RECHECK" }]], { ...initialState(), phase });
      expect(r.state.phase).toBe(phase);
      expect(types(r.effects)).not.toContain("LOOKUP_OUTCOME");
    }
  });
  it("EXEC_RESULT outside EXECUTING/UNKNOWN_OUTCOME is ignored (cannot fake a success)", () => {
    for (const phase of ["IDLE", "AWAITING_CONFIRM", "CLARIFYING"] as Phase[]) {
      const base = { ...initialState(), phase };
      const r = run([[{ type: "EXEC_RESULT", outcome: "ok" }]], base);
      expect(r.state.phase).toBe(phase);
    }
  });
});

describe("terminal states are absorbing", () => {
  it.each([...TERMINAL])("%s ignores everything except NEXT_ACTION", (phase) => {
    const base: MachineState = { ...initialState(), phase };
    const events: MachineEvent[] = [
      { type: "INPUT_RECEIVED", text: "x" }, { type: "CONFIRM", token: "ct_1", payloadHash: "h1" }, { type: "EXEC_RESULT", outcome: "ok" },
      { type: "CANCEL" }, { type: "EDIT" }, { type: "TICK" }, { type: "PRECHECK", ok: true },
      { type: "CARD_ISSUED", payloadHash: "h", token: "t", idempotencyKey: "k" },
    ];
    for (const e of events) {
      const r = run([[e]], base);
      expect(r.state.phase, e.type).toBe(phase);
      expect(types(r.effects), e.type).not.toContain("EXECUTE");
    }
  });
});

describe("ASR confidence gate", () => {
  it("low confidence: ask to repeat, no LLM call", () => {
    const r = run([[{ type: "INPUT_RECEIVED", text: "دز", asrConfidence: 0.2 }]]);
    expect(r.state.phase).toBe("NEEDS_REPHRASE");
    expect(r.effects).toContainEqual({ type: "SAY", key: "asr_low" });
    expect(types(r.effects)).not.toContain("CALL_LLM");
  });
  it("high confidence proceeds", () => expect(types(run([[{ type: "INPUT_RECEIVED", text: HERO, asrConfidence: 0.95 }]]).effects)).toContain("CALL_LLM"));
});

describe("ASR confidence gate during a pending card", () => {
  it("low confidence while a card is live: ask to repeat, keep the card, revoke nothing", () => {
    const base = run(toCard).state;
    const r = run([[{ type: "INPUT_RECEIVED", text: "x", asrConfidence: 0.1 }]], base);
    expect(r.state.phase).toBe("AWAITING_CONFIRM");
    expect(r.state.card).toEqual(base.card);
    expect(r.effects).toEqual([{ type: "SAY", key: "asr_low" }]);
  });
});

describe("audit trail", () => {
  it("every phase change emits an AUDIT effect with from/to/event", () => {
    const r = run(toCard);
    for (const x of r.trace) {
      if (x.prev.phase !== x.state.phase)
        expect(x.effects).toContainEqual(expect.objectContaining({ type: "AUDIT", from: x.prev.phase, to: x.state.phase, event: x.event.type }));
    }
  });
});

// ---------------------------------------------------------------- model-based invariants
describe("model-based: invariants hold for ANY event sequence", () => {
  const tokens = ["ct_1", "ct_2"], hashes = ["h1", "h2"];
  const intents = [
    intent([transfer()]), intent([transfer({ amount: null })]), intent([transfer({ recipient: null })]),
    intent([], { status: "out_of_scope" }), intent([], { status: "cancel" }), intent([], { status: "confirm_reply" }),
    intent([], { status: "clarify_reply", clarify_reply: { choice_text: "الأول" } }),
    intent([{ type: "info", query: "balance" }]), intent([{ type: "info", query: "balance" }, transfer()]),
    "garbage", null, 42, { actions: "x" },
  ];
  const codes = ["INSUFFICIENT_BALANCE", "LIMIT_EXCEEDED", "SERVICE_UNAVAILABLE", undefined];
  const eventArb: fc.Arbitrary<MachineEvent> = fc.oneof(
    { weight: 3, arbitrary: fc.record({ type: fc.constant("INPUT_RECEIVED" as const), text: fc.constant(HERO), asrConfidence: fc.option(fc.double({ min: 0, max: 1, noNaN: true }), { nil: undefined }) }) },
    { weight: 4, arbitrary: fc.record({ type: fc.constant("LLM_OUTPUT" as const), raw: fc.constantFrom(...intents), input: fc.constantFrom(HERO, "دز لأحمد", "x") }) },
    { weight: 4, arbitrary: fc.record({ type: fc.constant("RESOLUTION" as const), slot: fc.constantFrom("recipient" as const, "biller" as const), result: fc.constantFrom("resolved" as const, "ambiguous" as const, "fuzzy" as const, "none" as const, "unknown_number" as const, "history" as const) }) },
    { weight: 2, arbitrary: fc.record({ type: fc.constant("SLOT_ANSWER" as const), slot: fc.constantFrom("recipient" as const, "amount" as const, "biller" as const), filled: fc.boolean() }) },
    { weight: 4, arbitrary: fc.record({ type: fc.constant("PRECHECK" as const), ok: fc.boolean(), code: fc.constantFrom(...codes) }) },
    { weight: 4, arbitrary: fc.record({ type: fc.constant("CARD_ISSUED" as const), payloadHash: fc.constantFrom(...hashes), token: fc.constantFrom(...tokens), idempotencyKey: fc.constant("k") }) },
    { weight: 6, arbitrary: fc.record({ type: fc.constant("CONFIRM" as const), token: fc.constantFrom(...tokens, "bad"), payloadHash: fc.constantFrom(...hashes) }) },
    { weight: 2, arbitrary: fc.constant({ type: "EDIT" as const }) },
    { weight: 2, arbitrary: fc.constant({ type: "CANCEL" as const }) },
    { weight: 2, arbitrary: fc.constant({ type: "TICK" as const }) },
    { weight: 4, arbitrary: fc.record({ type: fc.constant("EXEC_RESULT" as const), outcome: fc.constantFrom("ok" as const, "rejected" as const, "timeout" as const), code: fc.constantFrom(...codes) }) },
    { weight: 2, arbitrary: fc.record({ type: fc.constant("LOOKUP_RESULT" as const), found: fc.constantFrom("executed" as const, "not_found" as const, "unknown" as const) }) },
    { weight: 2, arbitrary: fc.constant({ type: "NEXT_ACTION" as const }) },
    { weight: 2, arbitrary: fc.constant({ type: "RECHECK" as const }) },
  );

  // Guided generation: the happy path (and its retry/timeout variants) with random events spliced in.
  const script = (tail: MachineEvent[]): MachineEvent[] => [
    { type: "INPUT_RECEIVED", text: HERO }, { type: "LLM_OUTPUT", raw: intent([transfer()]), input: HERO },
    { type: "RESOLUTION", slot: "recipient", result: "resolved" }, { type: "PRECHECK", ok: true },
    { type: "CARD_ISSUED", payloadHash: "h1", token: "ct_1", idempotencyKey: "k" },
    { type: "CONFIRM", token: "ct_1", payloadHash: "h1" }, ...tail,
  ];
  const tails: MachineEvent[][] = [
    [{ type: "EXEC_RESULT", outcome: "ok" }],
    [{ type: "EXEC_RESULT", outcome: "timeout" }, { type: "EXEC_RESULT", outcome: "timeout" }, { type: "EXEC_RESULT", outcome: "ok" }],
    Array.from({ length: 4 }, () => ({ type: "EXEC_RESULT", outcome: "timeout" }) as MachineEvent).concat([{ type: "LOOKUP_RESULT", found: "unknown" }]),
    [{ type: "EXEC_RESULT", outcome: "rejected", code: "INSUFFICIENT_BALANCE" }],
    [{ type: "CONFIRM", token: "ct_1", payloadHash: "h1" }, { type: "CANCEL" }, { type: "EXEC_RESULT", outcome: "ok" }],
  ];
  const guidedArb: fc.Arbitrary<[MachineEvent, number][]> = fc.constantFrom(...tails).chain((tail) => {
    const base = script(tail);
    return fc.tuple(...base.map((ev) => fc.tuple(fc.array(fc.tuple(eventArb, fc.integer({ min: 0, max: 80_000 })), { maxLength: 1 }), fc.constantFrom(0, 1_000, 30_000, 130_000), fc.constantFrom(true, true, true, false)))).map((parts) => {
      const out: [MachineEvent, number][] = [];
      parts.forEach(([noise, dt, keep], i) => {
        for (const n of noise) out.push(n);
        if (keep || i === 0) out.push([base[i] as MachineEvent, dt]);
      });
      return out;
    });
  });

  const visited = new Map<string, number>();

  function checkInvariants(steps: [MachineEvent, number][]): boolean {
    let state = initialState();
    let now = T0;
    let n = 0;
    const executesPerCard = new Map<string, number>();
    for (const [rawEvent, dt] of steps) {
      now += dt;
      const event = rawEvent.type === "CARD_ISSUED" ? { ...rawEvent, idempotencyKey: `k${n++}` } : rawEvent; // unique key per card
      const prev = state;
      const r = transition(prev, event, { now });
      state = r.state;
      visited.set(state.phase, (visited.get(state.phase) ?? 0) + 1);

      // I1: EXECUTE only from a valid CONFIRM against a live, matching, unsent card
      for (const e of r.effects) {
        if (e.type !== "EXECUTE") continue;
        expect(event.type).toBe("CONFIRM");
        expect(prev.phase).toBe("AWAITING_CONFIRM");
        expect(prev.card).not.toBeNull();
        if (event.type === "CONFIRM" && prev.card) {
          expect(event.token).toBe(prev.card.token);
          expect(event.payloadHash).toBe(prev.card.payloadHash);
          expect(now).toBeLessThan(prev.card.expiresAt);
          expect(prev.card.executeSent).toBe(false);
          expect(e.idempotencyKey).toBe(prev.card.idempotencyKey);
          executesPerCard.set(prev.card.idempotencyKey, (executesPerCard.get(prev.card.idempotencyKey) ?? 0) + 1);
        }
      }
      // I2: at most one EXECUTE per card, ever
      for (const c of executesPerCard.values()) expect(c).toBeLessThanOrEqual(1);
      // I3: EXECUTING only entered from AWAITING_CONFIRM (or already executing)
      if (state.phase === "EXECUTING") expect(["AWAITING_CONFIRM", "EXECUTING"]).toContain(prev.phase);
      // I4: RETRY always reuses the card's key and payload
      for (const e of r.effects) {
        if (e.type !== "RETRY") continue;
        expect(prev.card).not.toBeNull();
        expect(e.idempotencyKey).toBe(prev.card!.idempotencyKey);
        expect(e.payloadHash).toBe(prev.card!.payloadHash);
      }
      // I5: terminal states are absorbing (except NEXT_ACTION)
      if (TERMINAL.has(prev.phase) && event.type !== "NEXT_ACTION") {
        expect(state.phase).toBe(prev.phase);
        expect(r.effects.some((e) => e.type === "EXECUTE" || e.type === "RETRY" || e.type === "ISSUE_CARD")).toBe(false);
      }
      // I6: clarification and retry caps
      for (const v of Object.values(state.clarifyTurns)) expect(v ?? 0).toBeLessThanOrEqual(2);
      expect(state.retries).toBeLessThanOrEqual(3);
      // I7: cards exist exactly when they should; leaving AWAITING_CONFIRM revokes the token
      if (state.phase === "AWAITING_CONFIRM") expect(state.card).not.toBeNull();
      if (state.phase === "EXECUTING") expect(state.card?.executeSent).toBe(true);
      if (prev.phase === "AWAITING_CONFIRM" && state.phase !== "AWAITING_CONFIRM" && state.phase !== "EXECUTING")
        expect(r.effects).toContainEqual({ type: "REVOKE_TOKEN", token: prev.card!.token });
      // I8: model output alone never executes or retries
      if (event.type === "LLM_OUTPUT") expect(r.effects.some((e) => e.type === "EXECUTE" || e.type === "RETRY")).toBe(false);
      // I10: a recheck only ever looks up, it never sends
      if (event.type === "RECHECK") expect(r.effects.some((e) => e.type === "EXECUTE" || e.type === "RETRY")).toBe(false);
      // I9: an unsent card is never executed twice via CONFIRM replay after EXECUTING
      if (prev.phase === "EXECUTING" && event.type === "CONFIRM") expect(r.effects.some((e) => e.type === "EXECUTE")).toBe(false);
    }
    return true;
  }

  it("holds for 5,000 fully random sequences", () => {
    fc.assert(fc.property(fc.array(fc.tuple(eventArb, fc.integer({ min: 0, max: 80_000 })), { minLength: 1, maxLength: 40 }), checkInvariants), { numRuns: 5000 });
  });

  it("holds for 5,000 guided sequences (happy path + timeouts + noise) and actually reaches the dangerous states", () => {
    visited.clear();
    fc.assert(fc.property(guidedArb, checkInvariants), { numRuns: 5000 });
    // anti-vacuity: the property is meaningless if it never gets here
    for (const phase of ["AWAITING_CONFIRM", "EXECUTING", "UNKNOWN_OUTCOME", "EXECUTED", "EXPIRED", "FAILED_SAFE", "CLARIFYING"])
      expect(visited.get(phase) ?? 0, `${phase} visits`).toBeGreaterThan(200);
  });
});
