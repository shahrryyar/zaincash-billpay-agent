import { describe, it, expect } from "vitest";
import { openDb } from "../src/db";
import { applySeed, totalMoney, SEED_BALANCE, DEMO_USER, LOW_USER } from "../src/seed";

const fresh = () => { const db = openDb(); applySeed(db); return db; };

describe("seed (docs/11): deterministic synthetic world with deliberate traps", () => {
  it("demo user has 200,000 IQD and the low-balance user 15,000", () => {
    const db = fresh();
    const bal = (id: string) => (db.prepare("SELECT balance_iqd b FROM users WHERE id=?").get(id) as { b: number }).b;
    expect(bal(DEMO_USER)).toBe(SEED_BALANCE[DEMO_USER]);
    expect(bal(LOW_USER)).toBe(SEED_BALANCE[LOW_USER]);
  });
  it("has two Ahmeds, two Alis, three Mohammeds, similar names, kunya and relations", () => {
    const db = fresh();
    const n = (like: string) => (db.prepare("SELECT COUNT(*) c FROM contacts WHERE owner_id=? AND display_name LIKE ?").get(DEMO_USER, like) as { c: number }).c;
    expect(n("أحمد %")).toBe(2);
    expect(n("علي %")).toBe(2);
    expect(n("محمد %")).toBe(3);
    for (const name of ["حسن", "حسين", "محسن", "زينب", "زينة", "مصطفى", "مرتضى", "أبو علي"]) expect(n(name)).toBe(1);
    const rel = db.prepare("SELECT DISTINCT relation r FROM contacts WHERE relation IS NOT NULL ORDER BY r").all().map((x) => (x as { r: string }).r);
    expect(rel).toEqual(["ام", "اب", "اخ", "اخت", "خال", "زوجه"].sort());
  });
  it("has a contact that is NOT a wallet user", () => {
    const db = fresh();
    expect((db.prepare("SELECT wallet_user_id w FROM contacts WHERE id='c_nonwallet'").get() as { w: string | null }).w).toBeNull();
  });
  it("bills: electricity 37,500, generator 60,000, internet 35,000 unpaid; water already paid; top-up open amount", () => {
    const db = fresh();
    const amt = (acc: string) => db.prepare("SELECT amount_iqd a, status s FROM bills WHERE account_id=?").get(acc) as { a: number; s: string } | undefined;
    expect(amt("ba_elec")).toEqual({ a: 37_500, s: "unpaid" });
    expect(amt("ba_gen")).toEqual({ a: 60_000, s: "unpaid" });
    expect(amt("ba_net")).toEqual({ a: 35_000, s: "unpaid" });
    expect(amt("ba_water")).toEqual({ a: 12_000, s: "paid" });
    expect(amt("ba_topup")).toBeUndefined();
  });
  it("one biller is down (service-down case)", () => {
    const db = fresh();
    expect((db.prepare("SELECT status s FROM billers WHERE id='b_mobile_topup'").get() as { s: string }).s).toBe("down");
  });
  it("history lets «نفس المرة الفاتت» work: transfers to the same contact over ~80 days", () => {
    const db = fresh();
    const rows = db.prepare("SELECT COUNT(*) c FROM transactions WHERE owner_id=? AND counterparty_id='c_mama'").get(DEMO_USER) as { c: number };
    expect(rows.c).toBe(3);
  });
  it("all phone numbers are in the fictional 0770000xxxx range", () => {
    const db = fresh();
    const bad = db.prepare("SELECT COUNT(*) c FROM users WHERE phone NOT LIKE '0770000%'").get() as { c: number };
    expect(bad.c).toBe(0);
  });
  it("money is integers only and balances cannot go negative (DB constraint)", () => {
    const db = fresh();
    expect(() => db.prepare("UPDATE users SET balance_iqd = -1 WHERE id = ?").run(DEMO_USER)).toThrow();
  });
  it("is deterministic: seeding twice gives identical data and total money", () => {
    const a = fresh(), b = fresh();
    const dump = (d: ReturnType<typeof openDb>) => JSON.stringify(d.prepare("SELECT * FROM transactions ORDER BY seq").all());
    expect(dump(a)).toBe(dump(b));
    expect(totalMoney(a)).toBe(totalMoney(b));
  });
  it("re-applying the seed resets everything (used by /admin/reset)", () => {
    const db = fresh();
    db.prepare("UPDATE users SET balance_iqd = 1 WHERE id = ?").run(DEMO_USER);
    db.prepare("INSERT INTO idempotency_keys VALUES ('k','h','{}',200,0)").run();
    applySeed(db);
    expect((db.prepare("SELECT balance_iqd b FROM users WHERE id=?").get(DEMO_USER) as { b: number }).b).toBe(200_000);
    expect((db.prepare("SELECT COUNT(*) c FROM idempotency_keys").get() as { c: number }).c).toBe(0);
  });
});
