// Regressions: reserved scheduler key namespace, one bad due row never blocks the rest, daily limit enforced (docs/06, docs/14).
import { describe, it, expect } from "vitest";
import type { Payload } from "@zc/core";
import { DEMO_USER } from "../src/seed";
import { p2pFee } from "../src/fees";
import { makeWallet, exec, transferBody, transferPayload, billPayload, type Wallet } from "./helpers";

const S = "s-limits";
const ahmed = "c_ahmed_ali", ali = "c_ali_karim";
const HOUR = 3_600_000;
const runDue = (w: Wallet) => (w.app as any).runDueSchedules() as { executed: string[]; failed: { id: string; code: string }[] };
const status = (w: Wallet, id: string) => (w.db.prepare("SELECT status, failure_code FROM scheduled_payments WHERE id=?").get(id) as { status: string; failure_code: string | null });
const tPayload = (to: string, amount: number, runAt: number): Payload => ({ kind: "transfer", from: DEMO_USER, to_id: to, amount_iqd: amount, fee_iqd: p2pFee(amount), run_at: runAt });
async function schedule(w: Wallet, to: string, amount: number, key: string, inMs = HOUR): Promise<string> {
  const runAt = w.clock.now() + inMs, tok = await w.mint(S, tPayload(to, amount, runAt));
  const r = await w.call("POST", "/scheduled", { session_id: S, from: DEMO_USER, kind: "transfer", to_contact: to, amount_iqd: amount, run_at: runAt }, { "idempotency-key": key, "x-confirmation-token": tok });
  expect(r.status).toBe(201);
  return r.json.schedule.id as string;
}

describe("scheduler idempotency namespace", () => {
  it("a client key with the reserved sched: prefix is refused (400), nothing moves, the schedule still runs", async () => {
    const w = makeWallet();
    const id = await schedule(w, ahmed, 50_000, "sk1");
    const tok = await w.mint(S, transferPayload(ali, 5_000));
    const r = await exec(w, "/transfers", `sched:${id}`, tok, transferBody(S, ali, 5_000));
    expect(r.status).toBe(400); expect(r.json.error.code).toBe("IDEMPOTENCY_KEY_RESERVED");
    expect(w.txCount()).toBe(11);
    const b = await w.call("POST", "/bill-payments", { session_id: S, from: DEMO_USER, bill_account: "ba_gen" }, { "idempotency-key": "sched:x", "x-confirmation-token": tok });
    expect(b.status).toBe(400);
    const sch = await w.call("POST", "/scheduled", {}, { "idempotency-key": "sched:y" });
    expect(sch.status).toBe(400); expect(sch.json.error.code).toBe("IDEMPOTENCY_KEY_RESERVED");
    w.clock.advance(HOUR);
    expect(runDue(w).executed).toEqual([id]);
  });
  it("one row that throws is marked failed honestly; later due rows still run", async () => {
    const w = makeWallet();
    const bad = await schedule(w, ahmed, 50_000, "sk1"), good = await schedule(w, ali, 20_000, "sk2");
    // legacy collision (e.g. a key written before the prefix was reserved): settle's INSERT hits the UNIQUE key
    w.db.prepare("INSERT INTO transactions(id,owner_id,kind,counterparty,counterparty_id,amount_iqd,fee_iqd,status,idempotency_key,created_at) VALUES ('t_clash',?,'transfer','x',?,250,0,'completed',?,?)")
      .run(DEMO_USER, ali, `sched:${bad}`, w.clock.now() - 10 * 86_400_000);
    const before = w.balance(DEMO_USER);
    w.clock.advance(HOUR);
    const res = runDue(w);
    expect(res.executed).toEqual([good]);
    expect(res.failed).toEqual([{ id: bad, code: "EXECUTION_ERROR" }]);
    expect(status(w, bad)).toEqual({ status: "failed", failure_code: "EXECUTION_ERROR" });
    expect(w.balance(DEMO_USER)).toBe(before - 20_000 - p2pFee(20_000)); // the failed row rolled back: no partial debit
    expect(runDue(w)).toEqual({ executed: [], failed: [] }); // not retried forever
  });
});

describe("daily limit (users.daily_limit_iqd, Baghdad calendar day UTC+3)", () => {
  const rich = (w: Wallet, daily = 1_500_000) => w.db.prepare("UPDATE users SET balance_iqd=9000000, daily_limit_iqd=? WHERE id=?").run(daily, DEMO_USER);
  it("transfers: today's debits + this amount above the daily limit is LIMIT_EXCEEDED (quote and execute)", async () => {
    const w = makeWallet(); rich(w);
    const t1 = await w.mint(S, transferPayload(ahmed, 1_000_000));
    expect((await exec(w, "/transfers", "k1", t1, transferBody(S, ahmed, 1_000_000))).status).toBe(200);
    const q = await w.call("POST", "/quotes", { kind: "transfer", from: DEMO_USER, to_contact: ahmed, amount_iqd: 600_000 });
    expect(q.json.ok).toBe(false); expect(q.json.errors).toEqual(["LIMIT_EXCEEDED"]);
    expect(q.json.limit_iqd).toBe(1_500_000); // the smaller of the daily and monthly limit
    const t2 = await w.mint(S, transferPayload(ahmed, 600_000));
    const before = w.balance(DEMO_USER);
    const r = await exec(w, "/transfers", "k2", t2, transferBody(S, ahmed, 600_000));
    expect(r.status).toBe(422); expect(r.json.error.code).toBe("LIMIT_EXCEEDED");
    expect(w.balance(DEMO_USER)).toBe(before);
    const t3 = await w.mint(S, transferPayload(ahmed, 500_000)); // exactly at the limit is allowed
    expect((await exec(w, "/transfers", "k3", t3, transferBody(S, ahmed, 500_000))).status).toBe(200);
  });
  it("a single amount above the daily limit is refused even with no history", async () => {
    const w = makeWallet(); rich(w, 100_000);
    const q = await w.call("POST", "/quotes", { kind: "transfer", from: DEMO_USER, to_contact: ahmed, amount_iqd: 100_250 });
    expect(q.json.errors).toContain("LIMIT_EXCEEDED");
  });
  it("the day rolls over at Baghdad midnight (21:00 UTC), not UTC midnight", async () => {
    const w = makeWallet(); rich(w, 100_000); // SEED_NOW is 12:00 UTC = 15:00 Baghdad
    const t1 = await w.mint(S, transferPayload(ahmed, 100_000));
    expect((await exec(w, "/transfers", "k1", t1, transferBody(S, ahmed, 100_000))).status).toBe(200);
    w.clock.advance(9 * HOUR - 1); // 20:59:59.999 UTC: still the same Baghdad day
    let q = await w.call("POST", "/quotes", { kind: "transfer", from: DEMO_USER, to_contact: ahmed, amount_iqd: 1_000 });
    expect(q.json.errors).toContain("LIMIT_EXCEEDED");
    w.clock.advance(1); // 00:00 Baghdad
    q = await w.call("POST", "/quotes", { kind: "transfer", from: DEMO_USER, to_contact: ahmed, amount_iqd: 1_000 });
    expect(q.json.ok).toBe(true);
  });
  it("bill payments count toward the same daily limit, together with transfers", async () => {
    const w = makeWallet(); rich(w, 80_000);
    const t1 = await w.mint(S, transferPayload(ahmed, 30_000));
    expect((await exec(w, "/transfers", "k1", t1, transferBody(S, ahmed, 30_000))).status).toBe(200);
    const q = await w.call("POST", "/quotes", { kind: "bill_pay", from: DEMO_USER, bill_account: "ba_gen" }); // 60,000
    expect(q.json.errors).toEqual(["LIMIT_EXCEEDED"]); expect(q.json.limit_iqd).toBe(80_000);
    const tok = await w.mint(S, billPayload("b_generator", "GN-20311", 60_000, 0));
    const r = await w.call("POST", "/bill-payments", { session_id: S, from: DEMO_USER, bill_account: "ba_gen" }, { "idempotency-key": "kb", "x-confirmation-token": tok });
    expect(r.status).toBe(422); expect(r.json.error.code).toBe("LIMIT_EXCEEDED");
  });
  it("a due schedule is checked against the daily limit when it runs", async () => {
    const w = makeWallet(); rich(w, 100_000);
    const id = await schedule(w, ahmed, 80_000, "sk1");
    const t1 = await w.mint(S, transferPayload(ali, 50_000));
    expect((await exec(w, "/transfers", "k1", t1, transferBody(S, ali, 50_000))).status).toBe(200);
    w.clock.advance(HOUR);
    expect(runDue(w).failed).toEqual([{ id, code: "LIMIT_EXCEEDED" }]);
  });
});
