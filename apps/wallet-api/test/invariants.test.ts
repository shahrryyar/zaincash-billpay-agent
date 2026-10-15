import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { TOKEN_TTL_MS } from "@zc/core";
import { totalMoney, DEMO_USER } from "../src/seed";
import { makeWallet, exec, transferBody, transferPayload, billPayload } from "./helpers";

// Random sequences of mints, executes (with duplicate keys, reused/tampered tokens), bills, clock jumps and faults.
// After EVERY operation the ledger invariants must hold.
type Op =
  | { t: "mint"; contact: number; amount: number }
  | { t: "transfer"; key: number; tok: number; contact: number; amount: number }
  | { t: "bill"; key: number; acct: number; amountMode: "omit" | "exact" | "wrong" }
  | { t: "advance"; ms: number }
  | { t: "fault"; mode: "error_5xx_before_commit" | "latency_ms" };

const CONTACTS = ["c_ahmed_ali", "c_ahmed_moh", "c_ali_karim", "c_mama", "c_nonwallet", "c_nope", "c_mama__low"];
const ACCOUNTS = [["ba_elec", "b_electricity", "EL-55100", 37_500, 0], ["ba_gen", "b_generator", "GN-20311", 60_000, 250], ["ba_water", "b_water", "WT-7781", 12_000, 0], ["ba_topup", "b_mobile_topup", "07700000001", 5_000, 250]] as const;
const opArb: fc.Arbitrary<Op> = fc.oneof(
  { weight: 5, arbitrary: fc.record({ t: fc.constant("mint" as const), contact: fc.nat(CONTACTS.length - 1), amount: fc.integer({ min: 1, max: 1200 }).map((n) => n * 250) }) },
  { weight: 8, arbitrary: fc.record({ t: fc.constant("transfer" as const), key: fc.nat(6), tok: fc.nat(9), contact: fc.nat(CONTACTS.length - 1), amount: fc.integer({ min: 1, max: 1200 }).map((n) => n * 250) }) },
  { weight: 4, arbitrary: fc.record({ t: fc.constant("bill" as const), key: fc.nat(6), acct: fc.nat(ACCOUNTS.length - 1), amountMode: fc.constantFrom("omit" as const, "exact" as const, "wrong" as const) }) },
  { weight: 2, arbitrary: fc.record({ t: fc.constant("advance" as const), ms: fc.constantFrom(1_000, 60_000, TOKEN_TTL_MS + 1) }) },
  { weight: 1, arbitrary: fc.record({ t: fc.constant("fault" as const), mode: fc.constantFrom("error_5xx_before_commit" as const, "latency_ms" as const) }) },
);

describe("property: ledger invariants hold after every operation of any random sequence", () => {
  it("money is conserved, balances never negative, one transaction per successful key, one used token per transaction", async () => {
    await fc.assert(
      fc.asyncProperty(fc.array(opArb, { minLength: 1, maxLength: 30 }), async (ops) => {
        const w = makeWallet();
        const money0 = totalMoney(w.db);
        const tokens: { token: string; session: string }[] = [];
        const seedTx = w.txCount();
        const storedBefore = new Map<string, string>();

        for (const op of ops) {
          if (op.t === "mint") {
            const to = CONTACTS[op.contact] as string;
            tokens.push({ token: await w.mint(`s${tokens.length}`, transferPayload(to, op.amount)), session: `s${tokens.length}` });
          } else if (op.t === "transfer") {
            const tk = tokens[op.tok % Math.max(tokens.length, 1)] ?? { token: "ct_" + "0".repeat(32), session: "s0" };
            const to = CONTACTS[op.contact] as string;
            await exec(w, "/transfers", `key-${op.key}`, tk.token, transferBody(tk.session, to, op.amount));
          } else if (op.t === "bill") {
            const [acct, biller, ref, amt, fee] = ACCOUNTS[op.acct] as (typeof ACCOUNTS)[number];
            const body = { session_id: "sb", from: DEMO_USER, bill_account: acct, ...(op.amountMode === "omit" ? {} : { amount_iqd: op.amountMode === "exact" ? amt : amt + 250 }) };
            const token = await w.mint("sb", billPayload(biller, ref, op.amountMode === "wrong" ? amt + 250 : amt, fee));
            await exec(w, "/bill-payments", `key-${op.key}`, token, body);
          } else if (op.t === "advance") w.clock.advance(op.ms);
          else await w.call("POST", "/admin/faults", { mode: op.mode, count: 1, ms: 1 }, { "x-admin-secret": "s3cret" });

          // ---- invariants, checked after every single operation
          expect(totalMoney(w.db)).toBe(money0);
          expect((w.db.prepare("SELECT COUNT(*) c FROM users WHERE balance_iqd < 0").get() as any).c).toBe(0);
          expect((w.db.prepare("SELECT COUNT(*) c FROM settlements WHERE balance_iqd < 0").get() as any).c).toBe(0);
          const dupKeys = (w.db.prepare("SELECT COUNT(*) c FROM (SELECT idempotency_key FROM transactions GROUP BY idempotency_key HAVING COUNT(*) > 1)").get() as any).c;
          expect(dupKeys).toBe(0);
          const newTx = w.txCount() - seedTx;
          expect((w.db.prepare("SELECT COUNT(*) c FROM confirmation_tokens WHERE used_at IS NOT NULL").get() as any).c).toBe(newTx); // one consumed token per transaction
          const stored200 = (w.db.prepare("SELECT COUNT(*) c FROM idempotency_keys WHERE status_code = 200").get() as any).c;
          expect(stored200).toBe(newTx); // every executed transaction has exactly one stored success
          const sum = (w.db.prepare("SELECT COALESCE(SUM(amount_iqd + fee_iqd),0) s FROM transactions WHERE owner_id=? AND idempotency_key NOT LIKE 'seed-key-%'").get(DEMO_USER) as any).s;
          expect(w.balance(DEMO_USER)).toBe(200_000 - sum); // balance == opening balance - everything sent
          // stored responses are immutable once written
          for (const r of w.db.prepare("SELECT key, response_json j FROM idempotency_keys").all() as { key: string; j: string }[]) {
            const was = storedBefore.get(r.key);
            if (was !== undefined) expect(r.j).toBe(was);
            storedBefore.set(r.key, r.j);
          }
        }
        return true;
      }),
      { numRuns: 150 },
    );
  }, 120_000);
});
