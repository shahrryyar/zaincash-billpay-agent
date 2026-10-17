import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { setup, text, transferIntent, SEED_TX } from "./helpers";

const HERO = "دز خمسين ألف لأحمد علي";
const script = { [HERO]: transferIntent("أحمد علي", 50_000, "خمسين ألف"), "دز ستين ألف لأحمد علي": transferIntent("أحمد علي", 60_000, "ستين ألف") };

describe("voice gate in the orchestrator (docs/09): voice can only add a step", () => {
  it("high confidence: same path as typing (card, nothing sent)", async () => {
    const e = setup({ script });
    const r = await e.orch.turn("s", { text: HERO, voice: true, asrConfidence: 0.95 });
    expect(r.phase).toBe("AWAITING_CONFIRM");
    expect(r.readback).toBeNull();
    expect(e.llm.calls).toBe(1);
    expect(e.txCount()).toBe(SEED_TX);
  });
  it("low confidence: ask to repeat, no model call, nothing changes", async () => {
    const e = setup({ script });
    const r = await e.orch.turn("s", { text: HERO, voice: true, asrConfidence: 0.2 });
    expect(text(r)).toContain("ما سمعتك زين");
    expect(e.llm.calls).toBe(0);
  });
  it("empty transcript: ask to repeat", async () => {
    const e = setup({ script });
    const r = await e.orch.turn("s", { text: "  ", voice: true, asrConfidence: 0.99 });
    expect(text(r)).toContain("ما سمعتك زين");
    expect(e.llm.calls).toBe(0);
  });
  it("mid confidence: read back first; the model is not called until the user taps «صح»", async () => {
    const e = setup({ script });
    const r1 = await e.orch.turn("s", { text: HERO, voice: true, asrConfidence: 0.6 });
    expect(r1.readback).toEqual({ text: HERO });
    expect(text(r1)).toContain("سمعتك تگول: «دز خمسين ألف لأحمد علي»");
    expect(r1.card).toBeNull();
    expect(e.llm.calls).toBe(0);
    const r2 = await e.orch.turn("s", { readback: "accept" });
    expect(r2.phase).toBe("AWAITING_CONFIRM");
    expect(r2.card?.amount_iqd).toBe(50_000);
    expect(e.llm.texts).toEqual([HERO]);
    expect(e.txCount()).toBe(SEED_TX); // still only a card: the Confirm button is the only way to pay
  });
  it("no confidence from the provider (RegaLabs returns text only): read back", async () => {
    const e = setup({ script });
    const r = await e.orch.turn("s", { text: HERO, voice: true });
    expect(r.readback).toEqual({ text: HERO });
    expect(e.llm.calls).toBe(0);
  });
  it("«لا» on a read-back drops it: nothing runs", async () => {
    const e = setup({ script });
    await e.orch.turn("s", { text: HERO, voice: true });
    const r = await e.orch.turn("s", { readback: "reject" });
    expect(text(r)).toContain("ما سويت شي");
    expect(e.llm.calls).toBe(0);
    const again = await e.orch.turn("s", { readback: "accept" }); // the pending transcript is gone
    expect(again.card).toBeNull();
    expect(e.llm.calls).toBe(0);
  });
  it("a new message replaces an unanswered read-back (a late «صح» cannot run the old transcript)", async () => {
    const e = setup({ script });
    await e.orch.turn("s", { text: "دز ستين ألف لأحمد علي", voice: true });
    await e.orch.turn("s", { text: HERO }); // typed instead
    const late = await e.orch.turn("s", { readback: "accept" });
    expect(text(late)).toContain("ما سويت شي");
    expect(e.llm.texts).toEqual([HERO]);
  });
  it("a read-back older than 2 minutes is dropped, not run", async () => {
    const e = setup({ script });
    await e.orch.turn("s", { text: HERO, voice: true });
    e.clock.advance(121_000);
    const r = await e.orch.turn("s", { readback: "accept" });
    expect(text(r)).toContain("ما سويت شي");
    expect(e.llm.calls).toBe(0);
  });
  it("a spoken «اي» at high confidence while a card is pending never confirms", async () => {
    const e = setup({ script });
    await e.orch.turn("s", { text: HERO });
    const r = await e.orch.turn("s", { text: "اي", voice: true, asrConfidence: 0.99 });
    expect(r.phase).toBe("AWAITING_CONFIRM");
    expect(text(r)).toContain("اضغط زر التأكيد");
    expect(e.txCount()).toBe(SEED_TX);
  });
  it("a spoken «الغي» at mid confidence cancels without a read-back (the safe direction)", async () => {
    const e = setup({ script });
    await e.orch.turn("s", { text: HERO });
    const r = await e.orch.turn("s", { text: "الغي", voice: true, asrConfidence: 0.6 });
    expect(r.readback).toBeNull();
    expect(r.phase).toBe("CANCELLED");
  });
  it("a mid-confidence voice edit of a pending card is read back, and the old card stays until «صح»", async () => {
    const e = setup({ script });
    const c1 = (await e.orch.turn("s", { text: HERO })).card!;
    const r = await e.orch.turn("s", { text: "دز ستين ألف لأحمد علي", voice: true, asrConfidence: 0.6 });
    expect(r.readback).not.toBeNull();
    expect(e.orch.inspect("s").card?.cardId).toBe(c1.card_id);
    const r2 = await e.orch.turn("s", { readback: "accept" });
    expect(r2.card?.amount_iqd).toBe(60_000);
    expect(r2.card?.card_id).not.toBe(c1.card_id);
  });
  it("control characters in the transcript are cleaned before the read-back is shown", async () => {
    const e = setup({ script });
    const r = await e.orch.turn("s", { text: "دز\u202e خمسين  ألف\nلأحمد علي", voice: true });
    expect(r.readback?.text).toBe("دز خمسين ألف لأحمد علي");
  });
  it("property: no sequence of voice turns and read-back taps ever moves money without the Confirm button", async () => {
    await fc.assert(fc.asyncProperty(
      fc.array(fc.oneof(
        fc.record({ t: fc.constant("voice" as const), text: fc.constantFrom(HERO, "دز ستين ألف لأحمد علي", "اي", "أكد", "دز", ""), c: fc.option(fc.double({ min: 0, max: 1, noNaN: true }), { nil: undefined }) }),
        fc.record({ t: fc.constant("tap" as const), v: fc.constantFrom("accept" as const, "reject" as const) }),
      ), { maxLength: 8 }),
      async (ops) => {
        const e = setup({ script });
        for (const op of ops) {
          if (op.t === "voice") await e.orch.turn("s", { text: op.text, voice: true, ...(op.c !== undefined ? { asrConfidence: op.c } : {}) });
          else await e.orch.turn("s", { readback: op.v });
        }
        return e.txCount() === SEED_TX;
      },
    ), { numRuns: 60 });
  });
});
