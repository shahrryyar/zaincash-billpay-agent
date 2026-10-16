import { describe, it, expect } from "vitest";
import type { Payload } from "@zc/core";
import { DEMO_USER, totalMoney } from "../src/seed";
import { p2pFee } from "../src/fees";
import { makeWallet, ADMIN, type Wallet } from "./helpers";

const S = "s1";
const ahmed = "c_ahmed_ali";
const HOUR = 3_600_000;

const tPayload = (amount: number, runAt: number, to = ahmed): Payload => ({ kind: "transfer", from: DEMO_USER, to_id: to, amount_iqd: amount, fee_iqd: p2pFee(amount), run_at: runAt });
const bPayload = (amount: number, runAt: number): Payload => ({ kind: "bill_pay", from: DEMO_USER, biller_id: "b_generator", account_ref: "GN-20311", amount_iqd: amount, fee_iqd: 0, run_at: runAt });
const tBody = (amount: number, runAt: number, to = ahmed) => ({ session_id: S, from: DEMO_USER, kind: "transfer", to_contact: to, amount_iqd: amount, run_at: runAt });
const bBody = (amount: number, runAt: number) => ({ session_id: S, from: DEMO_USER, kind: "bill_pay", bill_account: "ba_gen", amount_iqd: amount, run_at: runAt });
const post = (w: Wallet, key: string | null, token: string | null, body: unknown) =>
  w.call("POST", "/scheduled", body, { ...(key ? { "idempotency-key": key } : {}), ...(token ? { "x-confirmation-token": token } : {}) });
const runDue = (w: Wallet) => (w.app as any).runDueSchedules() as { executed: string[]; failed: { id: string; code: string }[] };
const rows = (w: Wallet) => w.db.prepare("SELECT id, status, failure_code, transaction_id FROM scheduled_payments ORDER BY rowid").all() as { id: string; status: string; failure_code: string | null; transaction_id: string | null }[];

async function schedule(w: Wallet, amount = 50_000, inMs = 2 * HOUR, key = "sk1") {
  const runAt = w.clock.now() + inMs;
  const tok = await w.mint(S, tPayload(amount, runAt));
  const r = await post(w, key, tok, tBody(amount, runAt));
  return { r, runAt, tok };
}

describe("creating a schedule needs the same confirmation as paying now", () => {
  it("no token: 403, nothing stored", async () => {
    const w = makeWallet();
    const runAt = w.clock.now() + HOUR;
    const r = await post(w, "k", null, tBody(50_000, runAt));
    expect(r.status).toBe(403);
    expect(rows(w)).toHaveLength(0);
  });
  it("a token approved for a different time is refused (the time is part of the approved hash)", async () => {
    const w = makeWallet();
    const runAt = w.clock.now() + HOUR;
    const tok = await w.mint(S, tPayload(50_000, runAt));
    const r = await post(w, "k", tok, tBody(50_000, runAt + 60_000));
    expect(r.status).toBe(403);
    expect(rows(w)).toHaveLength(0);
  });
  it("a token for an immediate payment (no run_at) cannot create a schedule", async () => {
    const w = makeWallet();
    const runAt = w.clock.now() + HOUR;
    const tok = await w.mint(S, { kind: "transfer", from: DEMO_USER, to_id: ahmed, amount_iqd: 50_000, fee_iqd: p2pFee(50_000) });
    expect((await post(w, "k", tok, tBody(50_000, runAt))).status).toBe(403);
  });
  it("valid token: 201, nothing debited, token spent", async () => {
    const w = makeWallet();
    const { r, runAt, tok } = await schedule(w);
    expect(r.status).toBe(201);
    expect(r.json.schedule).toMatchObject({ status: "scheduled", run_at: runAt, amount_iqd: 50_000, fee_iqd: 300, counterparty: "أحمد علي" });
    expect(r.json.schedule.reference).toMatch(/^SCH-\d{7}$/);
    expect(w.balance(DEMO_USER)).toBe(200_000);
    expect(w.txCount()).toBe(11);
    expect((await post(w, "k2", tok, tBody(50_000, runAt))).status).toBe(403); // single-use
  });
  it("same idempotency key replays the stored answer: one row", async () => {
    const w = makeWallet();
    const { r, runAt, tok } = await schedule(w);
    const again = await post(w, "sk1", tok, tBody(50_000, runAt));
    expect(again.status).toBe(201);
    expect(again.headers.get("idempotent-replay")).toBe("true");
    expect(again.json).toEqual(r.json);
    expect(rows(w)).toHaveLength(1);
  });
  it("past, too far, bad contact, non-wallet contact, paid bill, changed bill amount are refused", async () => {
    const w = makeWallet();
    const now = w.clock.now();
    const fail = async (payload: Payload, body: object, code: string, status: number) => {
      const tok = await w.mint(S, payload);
      const r = await post(w, `k-${code}`, tok, body);
      expect(r.status).toBe(status); expect(r.json.error.code).toBe(code);
    };
    await fail(tPayload(50_000, now + 1000), tBody(50_000, now + 1000), "SCHEDULE_TOO_SOON", 422);
    await fail(tPayload(50_000, now + 200 * 86_400_000), tBody(50_000, now + 200 * 86_400_000), "SCHEDULE_TOO_FAR", 422);
    await fail(tPayload(50_000, now + HOUR, "c_nope"), tBody(50_000, now + HOUR, "c_nope"), "CONTACT_NOT_FOUND", 404);
    await fail(tPayload(50_000, now + HOUR, "c_nonwallet"), tBody(50_000, now + HOUR, "c_nonwallet"), "CONTACT_NOT_WALLET_USER", 422);
    await fail(tPayload(50_100, now + HOUR), tBody(50_100, now + HOUR), "INVALID_AMOUNT", 422);
    await fail(bPayload(55_000, now + HOUR), bBody(55_000, now + HOUR), "AMOUNT_CHANGED", 409);
    expect(rows(w)).toHaveLength(0);
  });
});

describe("running due schedules: exactly once, with the same safety as paying now", () => {
  it("not due: nothing happens. Due: one transaction, money moves once, key sched:<id>", async () => {
    const w = makeWallet();
    const { r } = await schedule(w, 50_000, 2 * HOUR);
    expect(runDue(w)).toEqual({ executed: [], failed: [] });
    w.clock.advance(2 * HOUR);
    const res = runDue(w);
    expect(res.executed).toEqual([r.json.schedule.id]);
    expect(w.balance(DEMO_USER)).toBe(200_000 - 50_300);
    expect(w.txCount()).toBe(12);
    const tx = w.db.prepare("SELECT idempotency_key k, amount_iqd a, fee_iqd f FROM transactions ORDER BY rowid DESC LIMIT 1").get() as any;
    expect(tx).toEqual({ k: `sched:${r.json.schedule.id}`, a: 50_000, f: 300 });
    expect(rows(w)[0]).toMatchObject({ status: "executed" });
    // running again, many times, changes nothing
    for (let i = 0; i < 20; i++) runDue(w);
    expect(w.txCount()).toBe(12);
    expect(w.balance(DEMO_USER)).toBe(200_000 - 50_300);
  });
  it("money is conserved", async () => {
    const w = makeWallet();
    const m0 = totalMoney(w.db);
    await schedule(w);
    w.clock.advance(3 * HOUR); runDue(w);
    expect(totalMoney(w.db)).toBe(m0);
  });
  it("a bill schedule pays the bill once", async () => {
    const w = makeWallet();
    const runAt = w.clock.now() + HOUR;
    const tok = await w.mint(S, bPayload(60_000, runAt));
    expect((await post(w, "kb", tok, bBody(60_000, runAt))).status).toBe(201);
    w.clock.advance(HOUR); expect(runDue(w).executed).toHaveLength(1);
    expect(w.balance(DEMO_USER)).toBe(140_000);
    expect((w.db.prepare("SELECT status FROM bills WHERE account_id='ba_gen'").get() as any).status).toBe("paid");
    runDue(w); expect(w.txCount()).toBe(12);
  });
  it("insufficient balance at the time: failed, nothing debited, honest code", async () => {
    const w = makeWallet();
    await schedule(w, 150_000);
    w.db.prepare("UPDATE users SET balance_iqd = 10000 WHERE id=?").run(DEMO_USER);
    w.clock.advance(3 * HOUR);
    expect(runDue(w).failed).toEqual([{ id: rows(w)[0]!.id, code: "INSUFFICIENT_BALANCE" }]);
    expect(w.balance(DEMO_USER)).toBe(10_000);
    expect(w.txCount()).toBe(11);
    expect(rows(w)[0]).toMatchObject({ status: "failed", failure_code: "INSUFFICIENT_BALANCE" });
  });
  it("the bill amount changed after approval: failed, never silently paying more", async () => {
    const w = makeWallet();
    const runAt = w.clock.now() + HOUR;
    const tok = await w.mint(S, bPayload(60_000, runAt));
    await post(w, "kb", tok, bBody(60_000, runAt));
    w.db.prepare("UPDATE bills SET amount_iqd = 70000 WHERE account_id='ba_gen'").run();
    w.clock.advance(HOUR);
    const res = runDue(w);
    expect(res.failed[0]!.code).toMatch(/AMOUNT_CHANGED|AUTHORIZATION_MISMATCH/);
    expect(w.balance(DEMO_USER)).toBe(200_000);
  });
  it("biller down at the time: failed, nothing debited", async () => {
    const w = makeWallet();
    const runAt = w.clock.now() + HOUR;
    const tok = await w.mint(S, bPayload(60_000, runAt));
    await post(w, "kb", tok, bBody(60_000, runAt));
    await w.call("POST", "/admin/faults", { mode: "biller_down", biller: "b_generator" }, ADMIN);
    w.clock.advance(HOUR);
    expect(runDue(w).failed[0]!.code).toBe("BILLER_UNAVAILABLE");
    expect(w.balance(DEMO_USER)).toBe(200_000);
  });
  it("the monthly limit is enforced when it runs (2.5M for person-to-person)", async () => {
    const w = makeWallet();
    w.db.prepare("UPDATE users SET balance_iqd = 9000000 WHERE id=?").run(DEMO_USER);
    await schedule(w, 1_500_000, HOUR, "a");
    await schedule(w, 1_500_000, HOUR, "b");
    w.clock.advance(HOUR);
    const res = runDue(w);
    expect(res.executed).toHaveLength(1);
    expect(res.failed.map((f) => f.code)).toEqual(["LIMIT_EXCEEDED"]);
  });
  it("more than a day late: failed as missed, never paid stale", async () => {
    const w = makeWallet();
    await schedule(w, 50_000, HOUR);
    w.clock.advance(HOUR + 25 * HOUR);
    expect(runDue(w).failed[0]!.code).toBe("SCHEDULE_MISSED");
    expect(w.balance(DEMO_USER)).toBe(200_000);
  });
  it("the stored approval is checked again: a tampered row does not run", async () => {
    const w = makeWallet();
    await schedule(w, 50_000, HOUR);
    w.db.prepare("UPDATE scheduled_payments SET body_json = replace(body_json, '50000', '150000')").run();
    w.clock.advance(HOUR);
    expect(runDue(w).failed[0]!.code).toBe("AUTHORIZATION_MISMATCH");
    expect(w.balance(DEMO_USER)).toBe(200_000);
  });
});

describe("listing and cancelling", () => {
  it("lists upcoming first; cancel stops it; cancelling twice or after it ran is a 409", async () => {
    const w = makeWallet();
    const a = await schedule(w, 50_000, HOUR, "a");
    const b = await schedule(w, 25_000, 2 * HOUR, "b");
    const list = await w.call("GET", `/users/${DEMO_USER}/scheduled`);
    expect(list.json.scheduled.map((x: any) => x.status)).toEqual(["scheduled", "scheduled"]);
    expect((await w.call("POST", `/users/${DEMO_USER}/scheduled/${a.r.json.schedule.id}/cancel`)).json).toEqual({ cancelled: true });
    expect((await w.call("POST", `/users/${DEMO_USER}/scheduled/${a.r.json.schedule.id}/cancel`)).status).toBe(409);
    w.clock.advance(3 * HOUR);
    expect(runDue(w).executed).toEqual([b.r.json.schedule.id]); // the cancelled one did not run
    expect(w.balance(DEMO_USER)).toBe(200_000 - 25_300);
    expect((await w.call("POST", `/users/${DEMO_USER}/scheduled/${b.r.json.schedule.id}/cancel`)).status).toBe(409);
  });
  it("another user's schedule is not found", async () => {
    const w = makeWallet();
    const a = await schedule(w);
    expect((await w.call("POST", `/users/u_low/scheduled/${a.r.json.schedule.id}/cancel`)).status).toBe(404);
  });
});

describe("admin run-due and audit", () => {
  it("run-due needs the admin secret", async () => {
    const w = makeWallet();
    expect((await w.call("POST", "/admin/run-due")).status).toBe(403);
    expect((await w.call("POST", "/admin/run-due", undefined, ADMIN)).status).toBe(200);
  });
  it("audit records created and executed, never the token", async () => {
    const w = makeWallet();
    const { tok } = await schedule(w);
    w.clock.advance(3 * HOUR); runDue(w);
    const log = JSON.stringify(w.db.prepare("SELECT event, data_json FROM audit_log").all());
    expect(log).toContain("schedule.created"); expect(log).toContain("schedule.executed"); expect(log).not.toContain(tok);
  });
});
