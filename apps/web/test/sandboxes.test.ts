import { describe, it, expect } from "vitest";
import { createScriptedUnderstander } from "@zc/orchestrator";
import { cleanSessionId, createSandboxes, SandboxBusyError } from "../server/sandboxes";

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

describe("hosted demo: nobody can evict an active judge's sandbox", () => {
  const HOUR = 3_600_000;
  it("60 fresh session ids cannot evict a sandbox that was just used: never-used ones go first", async () => {
    const { s } = make({ maxSandboxes: 3 });
    await s.use("victim", "ip-v", async (b) => { const card = (await b.orch.turn("victim", { text: "دز خمسين ألف لعلي كريم" })).card!; await b.orch.confirm("victim", card.card_id); });
    for (let i = 0; i < 60; i++) { try { s.get(`attacker-${i}`, `ip-${i}`); } catch { /* refused is fine */ } }
    expect(s.has("victim")).toBe(true);
    expect(await balance(s.peek("victim")!)).toBe(149_700);
  });
  it("a full house of active sandboxes refuses a new one (busy) instead of evicting", async () => {
    const { s } = make({ maxSandboxes: 2 });
    await s.use("a", "1", async () => {}); await s.use("b", "2", async () => {});
    expect(() => s.get("c", "3")).toThrow(SandboxBusyError);
    expect([s.has("a"), s.has("b"), s.has("c")]).toEqual([true, true, false]);
  });
  it("a pending confirmation card protects a sandbox after the activity window; a stale one without a card goes", async () => {
    const { s, advance } = make({ maxSandboxes: 2, protectMs: 60_000, idleMs: HOUR });
    await s.use("card", "1", async (b) => { expect((await b.orch.turn("card", { text: "دز خمسين ألف لعلي كريم" })).card).toBeTruthy(); });
    await s.use("plain", "2", async () => {});
    advance(120_000);
    s.get("new", "3");
    expect([s.has("card"), s.has("plain"), s.has("new")]).toEqual([true, false, true]);
  });
  it("a sandbox with a turn in flight is never dropped, not even by the idle sweep", async () => {
    const { s, advance } = make({ maxSandboxes: 1, idleMs: 60_000, protectMs: 1 });
    let release!: () => void;
    const running = s.use("busy", "1", () => new Promise<void>((r) => { release = r; }));
    advance(10 * 60_000);
    expect(() => s.get("other", "2")).toThrow(SandboxBusyError);
    expect(s.has("busy")).toBe(true);
    release(); await running;
    advance(10);
    s.get("other", "2"); // free now: idle and nothing pending
    expect(s.has("busy")).toBe(false);
  });
  it("peek never creates (a reply is never paired with a freshly seeded wallet)", () => {
    const { s } = make();
    expect(s.peek("ghost")).toBeUndefined();
    expect(s.has("ghost")).toBe(false);
    const b = s.get("real");
    expect(s.live(b)).toBe(true);
  });
  it("live() is false once a sandbox object was replaced by a new one", () => {
    const { s, advance } = make({ idleMs: 1000 });
    const old = s.get("x");
    advance(5000); s.get("y"); // idle sweep drops x
    const fresh = s.get("x");
    expect([s.live(old), s.live(fresh)]).toEqual([false, true]);
  });
  it("rotating session ids does not bypass the per-IP turn limit", () => {
    const { s } = make({ rate: { limit: 60, windowMs: 60_000 }, ipRate: { limit: 3, windowMs: 60_000 } });
    const got = Array.from({ length: 5 }, (_, i) => s.allow(`rot-${i}`, "1.2.3.4"));
    expect(got).toEqual([true, true, true, false, false]);
    expect(s.allow("other", "5.6.7.8")).toBe(true);
  });
  it("a process-wide turn limit holds across sessions and IPs", () => {
    const { s, advance } = make({ globalRate: { limit: 2, windowMs: 60_000 } });
    expect([s.allow("a", "1"), s.allow("b", "2"), s.allow("c", "3")]).toEqual([true, true, false]);
    advance(61_000);
    expect(s.allow("c", "3")).toBe(true);
  });
  it("a refused turn does not use up anybody's budget", () => {
    const { s } = make({ rate: { limit: 1, windowMs: 60_000 }, globalRate: { limit: 2, windowMs: 60_000 } });
    expect([s.allow("a", "1"), s.allow("a", "1"), s.allow("a", "1"), s.allow("b", "2")]).toEqual([true, false, false, true]);
  });
  it("one IP cannot create more than its share of new sandboxes", () => {
    const { s } = make({ newPerIp: { limit: 2, windowMs: 60_000 } });
    s.get("a", "9.9.9.9"); s.get("b", "9.9.9.9");
    expect(() => s.get("c", "9.9.9.9")).toThrow(SandboxBusyError);
    s.get("a", "9.9.9.9"); // an existing one is fine
    s.get("d", "8.8.8.8");
    expect(s.size()).toBe(3);
  });
});

