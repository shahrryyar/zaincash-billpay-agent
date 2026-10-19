import { describe, it, expect } from "vitest";
import { createScriptedUnderstander } from "@zc/orchestrator";
import { cleanSessionId, createSandboxes } from "../server/sandboxes";

const make = (o: Partial<Parameters<typeof createSandboxes>[0]> = {}) => {
  let t = Date.UTC(2026, 9, 20, 9, 0);
  const s = createSandboxes({ understanderFor: (() => createScriptedUnderstander()) as never, clock: () => t, ...o });
  return { s, advance: (ms: number) => { t += ms; } };
};
const balance = async (b: ReturnType<ReturnType<typeof createSandboxes>["get"]>) => (await b.wallet.user("u_001")).json.balance_iqd as number;

describe("hosted demo: one sandbox per browser session", () => {
  it("a payment in one session never shows in another", async () => {
    const { s } = make();
    const a = s.get("judge-a"), b = s.get("judge-b");
    const card = (await a.orch.turn("judge-a", { text: "دز خمسين ألف لعلي كريم" })).card!;
    expect((await a.orch.confirm("judge-a", card.card_id)).phase).toBe("EXECUTED");
    expect(await balance(a)).toBe(149_700);
    expect(await balance(b)).toBe(200_000);
  });
  it("faults, the demo clock and reset only touch the caller's sandbox", async () => {
    const { s } = make();
    const a = s.get("a"), b = s.get("b");
    await a.arm("biller_down");
    a.advance(3_600_000);
    expect(a.fault()).toBe("biller_down");
    expect(b.fault()).toBeNull();
    expect(a.now() - b.now()).toBe(3_600_000);
    expect((await b.orch.turn("b", { text: "ادفع المولدة" })).card?.amount_iqd).toBe(60_000); // b's generator is up
    await a.reset();
    expect(a.fault()).toBeNull();
    expect(a.now()).toBe(b.now());
  });
  it("idle sandboxes are dropped; a full house drops the least recently used", () => {
    const { s, advance } = make({ idleMs: 60_000, maxSandboxes: 2 });
    s.get("x"); advance(1000); s.get("y"); advance(1000); s.get("x");
    s.get("z"); // full: y is the least recently used
    expect([s.has("x"), s.has("y"), s.has("z")]).toEqual([true, false, true]);
    advance(120_000);
    s.get("w");
    expect(s.size()).toBe(1);
  });
  it("rate limit per session, per window", () => {
    const { s, advance } = make({ rate: { limit: 2, windowMs: 60_000 } });
    expect([s.allow("a"), s.allow("a"), s.allow("a"), s.allow("b")]).toEqual([true, true, false, true]);
    advance(61_000);
    expect(s.allow("a")).toBe(true);
  });
  it("session ids from the browser are cleaned", () => {
    expect(cleanSessionId("abc-DEF_1")).toBe("abc-DEF_1");
    expect(cleanSessionId("../../etc")).toBe("etc");
    expect(cleanSessionId(undefined)).toBe("web");
    expect(cleanSessionId("x".repeat(200))).toHaveLength(80);
  });
});
