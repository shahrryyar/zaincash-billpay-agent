import { describe, it, expect } from "vitest";
import { TOKEN_TTL_MS, payloadHash } from "@zc/core";
import { DEMO_USER, LOW_USER, totalMoney } from "../src/seed";
import { makeWallet, exec, transferBody, transferPayload, billPayload, sleep, ADMIN } from "./helpers";

const S = "sess-1";
const ahmed = "c_ahmed_ali";

describe("read endpoints", () => {
  it("GET /users/:id", async () => {
    const w = makeWallet();
    const r = await w.call("GET", `/users/${DEMO_USER}`);
    expect(r.status).toBe(200);
    expect(r.json).toMatchObject({ id: DEMO_USER, balance_iqd: 200_000, daily_limit_iqd: 1_500_000 });
  });
  it("unknown user is 404", async () => expect((await makeWallet().call("GET", "/users/nope")).status).toBe(404));
  it("GET /users/:id/contacts returns masked numbers and the full list", async () => {
    const r = await makeWallet().call("GET", `/users/${DEMO_USER}/contacts`);
    expect(r.json.contacts).toHaveLength(33);
    const a = r.json.contacts.find((c: any) => c.id === ahmed);
    expect(a).toMatchObject({ display_name: "أحمد علي", phone_masked: "••••4471", wallet_user: true });
    expect(r.json.contacts.find((c: any) => c.id === "c_nonwallet").wallet_user).toBe(false);
  });
  it("contacts ?q= searches the normalised name", async () => {
    const r = await makeWallet().call("GET", `/users/${DEMO_USER}/contacts?q=${encodeURIComponent("احمد")}`);
    expect(r.json.contacts.map((c: any) => c.id).sort()).toEqual(["c_ahmed_ali", "c_ahmed_moh"]);
  });
  it("GET /billers lists the catalogue with status", async () => {
    const r = await makeWallet().call("GET", "/billers");
    expect(r.json.billers).toHaveLength(5);
    expect(r.json.billers.find((b: any) => b.code === "mobile_topup").status).toBe("down");
  });
  it("GET /users/:id/bill-accounts shows the current unpaid bill", async () => {
    const r = await makeWallet().call("GET", `/users/${DEMO_USER}/bill-accounts`);
    const elec = r.json.bill_accounts.find((a: any) => a.id === "ba_elec");
    expect(elec).toMatchObject({ biller_code: "electricity", account_ref: "EL-55100", bill: { amount_iqd: 37_500, status: "unpaid" } });
    expect(r.json.bill_accounts.find((a: any) => a.id === "ba_topup").bill).toBeNull();
  });
  it("GET /users/:id/transactions returns history, newest first", async () => {
    const r = await makeWallet().call("GET", `/users/${DEMO_USER}/transactions?limit=3`);
    expect(r.json.transactions).toHaveLength(3);
    expect(r.json.transactions[0].counterparty.id).toBe("c_ali_karim");
  });
});

describe("POST /confirmation-tokens (server-issued, payload-bound)", () => {
  it("issues ct_ token bound to the payload hash with a 120 s expiry", async () => {
    const w = makeWallet();
    const p = transferPayload(ahmed, 50_000);
    const r = await w.call("POST", "/confirmation-tokens", { session_id: S, payload: p });
    expect(r.status).toBe(201);
    expect(r.json.token).toMatch(/^ct_[0-9a-f]{32}$/);
    expect(r.json.payload_hash).toBe(payloadHash(p));
    expect(r.json.expires_at).toBe(w.clock.now() + TOKEN_TTL_MS);
  });
  it("tokens are unique", async () => {
    const w = makeWallet();
    const set = new Set<string>();
    for (let i = 0; i < 50; i++) set.add(await w.mint(S, transferPayload(ahmed, 50_000)));
    expect(set.size).toBe(50);
  });
  it("rejects a malformed payload", async () => {
    const r = await makeWallet().call("POST", "/confirmation-tokens", { session_id: S, payload: { kind: "transfer", amount_iqd: -5 } });
    expect(r.status).toBe(400);
  });
});

describe("POST /confirmation-tokens/revoke (an edited or cancelled card kills its token)", () => {
  it("a revoked token can no longer execute", async () => {
    const w = makeWallet();
    const token = await w.mint(S, transferPayload(ahmed, 50_000));
    const r = await w.call("POST", "/confirmation-tokens/revoke", { session_id: S, token });
    expect(r.json).toEqual({ revoked: true });
    const x = await exec(w, "/transfers", "k", token, transferBody(S, ahmed, 50_000));
    expect(x.status).toBe(403);
    expect(w.balance(DEMO_USER)).toBe(200_000);
  });
  it("only the owning session can revoke; unknown or used tokens report false", async () => {
    const w = makeWallet();
    const token = await w.mint("sess-A", transferPayload(ahmed, 50_000));
    expect((await w.call("POST", "/confirmation-tokens/revoke", { session_id: "sess-B", token })).json).toEqual({ revoked: false });
    expect((await w.call("POST", "/confirmation-tokens/revoke", { session_id: "sess-A", token: "ct_" + "1".repeat(32) })).json).toEqual({ revoked: false });
    await exec(w, "/transfers", "k", token, transferBody("sess-A", ahmed, 50_000));
    expect((await w.call("POST", "/confirmation-tokens/revoke", { session_id: "sess-A", token })).json).toEqual({ revoked: false });
  });
});

describe("POST /quotes (pre-check, no side effects)", () => {
  const q = (w: ReturnType<typeof makeWallet>, body: unknown) => w.call("POST", "/quotes", body);
  it("transfer: ok with fee and balance after", async () => {
    const r = await q(makeWallet(), { kind: "transfer", from: DEMO_USER, to_contact: ahmed, amount_iqd: 50_000 });
    expect(r.json).toMatchObject({ ok: true, amount_iqd: 50_000, fee_iqd: 300, total_iqd: 50_300, balance_after_iqd: 149_700, errors: [], counterparty_name: "أحمد علي" });
  });
  it("insufficient balance", async () => {
    const r = await q(makeWallet(), { kind: "transfer", from: DEMO_USER, to_contact: "c_mama", amount_iqd: 1_000_000 });
    expect(r.json.ok).toBe(false);
    expect(r.json.errors).toContain("INSUFFICIENT_BALANCE");
  });
  it("low-balance user", async () => {
    const r = await q(makeWallet(), { kind: "transfer", from: LOW_USER, to_contact: "c_mama__low", amount_iqd: 20_000 });
    expect(r.json.errors).toContain("INSUFFICIENT_BALANCE");
  });
  it("unknown contact, someone else's contact, and non-wallet contact", async () => {
    const w = makeWallet();
    expect((await q(w, { kind: "transfer", from: DEMO_USER, to_contact: "c_nope", amount_iqd: 5000 })).json.errors).toContain("CONTACT_NOT_FOUND");
    expect((await q(w, { kind: "transfer", from: DEMO_USER, to_contact: "c_mama__low", amount_iqd: 5000 })).json.errors).toContain("CONTACT_NOT_FOUND");
    expect((await q(w, { kind: "transfer", from: DEMO_USER, to_contact: "c_nonwallet", amount_iqd: 5000 })).json.errors).toContain("CONTACT_NOT_WALLET_USER");
  });
  it("the recipient's wallet cannot go above the 10,000,000 IQD capacity (quote and execute)", async () => {
    const w = makeWallet();
    w.db.prepare("UPDATE users SET balance_iqd = 9_990_000 WHERE id='u_ahmed_ali'").run();
    expect((await q(w, { kind: "transfer", from: DEMO_USER, to_contact: ahmed, amount_iqd: 10_000 })).json.ok).toBe(true);
    const r = await q(w, { kind: "transfer", from: DEMO_USER, to_contact: ahmed, amount_iqd: 10_250 });
    expect(r.json.errors).toContain("RECIPIENT_WALLET_FULL");
    const t = await w.mint("s", transferPayload(ahmed, 10_250));
    const x = await exec(w, "/transfers", "cap-1", t, transferBody("s", ahmed, 10_250));
    expect(x.status).toBe(422);
    expect(x.json.error.code).toBe("RECIPIENT_WALLET_FULL");
    expect(w.balance(DEMO_USER)).toBe(200_000);
  });
  it("amount must be a multiple of 250 IQD", async () => {
    const r = await q(makeWallet(), { kind: "transfer", from: DEMO_USER, to_contact: ahmed, amount_iqd: 50_100 });
    expect(r.json.errors).toContain("INVALID_AMOUNT");
  });
  it("monthly limit for person-to-person transfers (2,500,000 IQD, ZainCash Fees & Limits)", async () => {
    const w = makeWallet();
    w.db.prepare("UPDATE users SET balance_iqd = 9000000 WHERE id = ?").run(DEMO_USER);
    expect((await q(w, { kind: "transfer", from: DEMO_USER, to_contact: ahmed, amount_iqd: 2_600_000 })).json.errors).toContain("LIMIT_EXCEEDED");
  });
  it("bill: amount comes from the wallet, fee shown", async () => {
    const w = makeWallet();
    expect((await q(w, { kind: "bill_pay", from: DEMO_USER, bill_account: "ba_elec" })).json).toMatchObject({ ok: true, amount_iqd: 37_500, fee_iqd: 0, balance_after_iqd: 162_500 });
    expect((await q(w, { kind: "bill_pay", from: DEMO_USER, bill_account: "ba_gen" })).json).toMatchObject({ ok: true, amount_iqd: 60_000, fee_iqd: 0, total_iqd: 60_000, balance_after_iqd: 140_000 });
  });
  it("bill: already paid, biller down, open amount needs an amount", async () => {
    const w = makeWallet();
    expect((await q(w, { kind: "bill_pay", from: DEMO_USER, bill_account: "ba_water" })).json.errors).toContain("BILL_ALREADY_PAID");
    expect((await q(w, { kind: "bill_pay", from: DEMO_USER, bill_account: "ba_topup", amount_iqd: 5000 })).json.errors).toContain("BILLER_UNAVAILABLE");
    expect((await q(w, { kind: "bill_pay", from: DEMO_USER, bill_account: "ba_topup" })).json.errors).toContain("AMOUNT_REQUIRED");
  });
  it("has no side effects", async () => {
    const w = makeWallet();
    const before = { b: w.balance(DEMO_USER), n: w.txCount(), m: totalMoney(w.db) };
    await q(w, { kind: "transfer", from: DEMO_USER, to_contact: ahmed, amount_iqd: 50_000 });
    expect({ b: w.balance(DEMO_USER), n: w.txCount(), m: totalMoney(w.db) }).toEqual(before);
  });
});

describe("POST /transfers: confirmation gate (docs/07), no execution without a valid token", () => {
  it("happy path: debits, credits, records, returns a reference", async () => {
    const w = makeWallet();
    const m0 = totalMoney(w.db);
    const token = await w.mint(S, transferPayload(ahmed, 50_000));
    const r = await exec(w, "/transfers", "key-1", token, transferBody(S, ahmed, 50_000));
    expect(r.status).toBe(200);
    expect(r.json.transaction).toMatchObject({ kind: "transfer", amount_iqd: 50_000, fee_iqd: 300, counterparty: { id: ahmed, name: "أحمد علي" } });
    expect(r.json.transaction.reference).toMatch(/^ZC-\d{8}$/);
    expect(r.json.balance_after_iqd).toBe(149_700);
    expect(w.balance(DEMO_USER)).toBe(149_700);
    expect(w.balance("u_ahmed_ali")).toBe(100_000);
    expect(totalMoney(w.db)).toBe(m0);
    expect(r.headers.get("idempotent-replay")).toBeNull();
  });
  it("no token: 403 and nothing changes", async () => {
    const w = makeWallet();
    const r = await exec(w, "/transfers", "key-1", null, transferBody(S, ahmed, 50_000));
    expect(r.status).toBe(403);
    expect(r.json.error.code).toBe("CONFIRMATION_INVALID");
    expect(w.balance(DEMO_USER)).toBe(200_000);
    expect(w.txCount()).toBe(11);
  });
  it("no idempotency key: 400", async () => {
    const w = makeWallet();
    const token = await w.mint(S, transferPayload(ahmed, 50_000));
    expect((await exec(w, "/transfers", null, token, transferBody(S, ahmed, 50_000))).status).toBe(400);
  });
  it("unknown token: 403", async () => {
    const w = makeWallet();
    expect((await exec(w, "/transfers", "k", "ct_" + "0".repeat(32), transferBody(S, ahmed, 50_000))).status).toBe(403);
    expect(w.balance(DEMO_USER)).toBe(200_000);
  });
  it("token minted for 50,000 cannot move 500,000 (tampered amount)", async () => {
    const w = makeWallet();
    const token = await w.mint(S, transferPayload(ahmed, 50_000));
    const r = await exec(w, "/transfers", "k", token, transferBody(S, ahmed, 150_000));
    expect(r.status).toBe(403);
    expect(w.balance(DEMO_USER)).toBe(200_000);
  });
  it("token minted for Ahmed Ali cannot pay Ahmed Mohammed (swapped recipient)", async () => {
    const w = makeWallet();
    const token = await w.mint(S, transferPayload(ahmed, 50_000));
    const r = await exec(w, "/transfers", "k", token, transferBody(S, "c_ahmed_moh", 50_000));
    expect(r.status).toBe(403);
    expect(w.balance("u_ahmed_moh")).toBe(50_000);
  });
  it("token is single-use: reuse under a different key is 403", async () => {
    const w = makeWallet();
    const token = await w.mint(S, transferPayload(ahmed, 50_000));
    expect((await exec(w, "/transfers", "k1", token, transferBody(S, ahmed, 50_000))).status).toBe(200);
    const again = await exec(w, "/transfers", "k2", token, transferBody(S, ahmed, 50_000));
    expect(again.status).toBe(403);
    expect(w.balance(DEMO_USER)).toBe(149_700);
  });
  it("expired token: 403", async () => {
    const w = makeWallet();
    const token = await w.mint(S, transferPayload(ahmed, 50_000));
    w.clock.advance(TOKEN_TTL_MS);
    expect((await exec(w, "/transfers", "k", token, transferBody(S, ahmed, 50_000))).status).toBe(403);
    expect(w.balance(DEMO_USER)).toBe(200_000);
  });
  it("token from another session: 403", async () => {
    const w = makeWallet();
    const token = await w.mint("sess-A", transferPayload(ahmed, 50_000));
    expect((await exec(w, "/transfers", "k", token, transferBody("sess-B", ahmed, 50_000))).status).toBe(403);
  });
});

describe("POST /transfers: idempotency (docs/07), no duplicate debit", () => {
  it("same key twice returns the stored result, one transaction, one debit", async () => {
    const w = makeWallet();
    const token = await w.mint(S, transferPayload(ahmed, 50_000));
    const a = await exec(w, "/transfers", "key-1", token, transferBody(S, ahmed, 50_000));
    const b = await exec(w, "/transfers", "key-1", token, transferBody(S, ahmed, 50_000));
    expect(b.status).toBe(200);
    expect(b.json).toEqual(a.json);
    expect(b.headers.get("idempotent-replay")).toBe("true");
    expect(w.txCount()).toBe(12);
    expect(w.balance(DEMO_USER)).toBe(149_700);
  });
  it("same key, different payload: 422 IDEMPOTENCY_KEY_REUSED, no new debit", async () => {
    const w = makeWallet();
    const token = await w.mint(S, transferPayload(ahmed, 50_000));
    await exec(w, "/transfers", "key-1", token, transferBody(S, ahmed, 50_000));
    const t2 = await w.mint(S, transferPayload(ahmed, 100_000));
    const r = await exec(w, "/transfers", "key-1", t2, transferBody(S, ahmed, 100_000));
    expect(r.status).toBe(422);
    expect(r.json.error.code).toBe("IDEMPOTENCY_KEY_REUSED");
    expect(w.balance(DEMO_USER)).toBe(149_700);
  });
  it("two genuinely separate payments of the same amount are both allowed (own card, token, key)", async () => {
    const w = makeWallet();
    for (const k of ["k1", "k2"]) {
      const t = await w.mint(S, transferPayload(ahmed, 50_000));
      expect((await exec(w, "/transfers", k, t, transferBody(S, ahmed, 50_000))).status).toBe(200);
    }
    expect(w.balance(DEMO_USER)).toBe(99_400); // two payments of 50,000 + 300 fee each
    expect(w.txCount()).toBe(13);
  });
  it("a deterministic failure is stored under the key so the outcome stays stable; the token stays unused", async () => {
    const w = makeWallet();
    const token = await w.mint(S, transferPayload("c_mama", 1_000_000));
    const a = await exec(w, "/transfers", "key-f", token, transferBody(S, "c_mama", 1_000_000));
    expect(a.status).toBe(422);
    expect(a.json.error.code).toBe("INSUFFICIENT_BALANCE");
    const b = await exec(w, "/transfers", "key-f", token, transferBody(S, "c_mama", 1_000_000));
    expect(b.status).toBe(422);
    expect(b.headers.get("idempotent-replay")).toBe("true");
    expect((w.db.prepare("SELECT used_at u FROM confirmation_tokens WHERE token=?").get(token) as any).u).toBeNull();
    expect(w.balance(DEMO_USER)).toBe(200_000);
  });
});

describe("POST /transfers: business rules fail closed", () => {
  it("non-wallet contact: 422", async () => {
    const w = makeWallet();
    const t = await w.mint(S, transferPayload("c_nonwallet", 5000));
    const r = await exec(w, "/transfers", "k", t, transferBody(S, "c_nonwallet", 5000));
    expect(r.status).toBe(422);
    expect(r.json.error.code).toBe("CONTACT_NOT_WALLET_USER");
  });
  it("unknown contact: 404", async () => {
    const w = makeWallet();
    const t = await w.mint(S, transferPayload("c_nope", 5000));
    expect((await exec(w, "/transfers", "k", t, transferBody(S, "c_nope", 5000))).status).toBe(404);
  });
  it("another user's contact: 404", async () => {
    const w = makeWallet();
    const t = await w.mint(S, transferPayload("c_mama__low", 5000));
    expect((await exec(w, "/transfers", "k", t, transferBody(S, "c_mama__low", 5000))).status).toBe(404);
  });
  it("amount not a multiple of 250: 422", async () => {
    const w = makeWallet();
    const t = await w.mint(S, transferPayload(ahmed, 50_100));
    const r = await exec(w, "/transfers", "k", t, transferBody(S, ahmed, 50_100));
    expect(r.status).toBe(422);
    expect(r.json.error.code).toBe("INVALID_AMOUNT");
  });
  it("zero, negative and fractional amounts: 400", async () => {
    const w = makeWallet();
    for (const bad of [0, -5, 250.5]) {
      const t = await w.mint(S, transferPayload(ahmed, 5000));
      expect((await exec(w, "/transfers", "k" + bad, t, { ...transferBody(S, ahmed, 5000), amount_iqd: bad })).status).toBe(400);
    }
  });
  it("monthly limit counts this month's earlier transfers", async () => {
    const w = makeWallet();
    w.db.prepare("UPDATE users SET balance_iqd = 9000000 WHERE id = ?").run(DEMO_USER);
    const t1 = await w.mint(S, transferPayload(ahmed, 1_000_000));
    expect((await exec(w, "/transfers", "k1", t1, transferBody(S, ahmed, 1_000_000))).status).toBe(200);
    const t2 = await w.mint(S, transferPayload(ahmed, 1_600_000));
    const r = await exec(w, "/transfers", "k2", t2, transferBody(S, ahmed, 1_600_000));
    expect(r.status).toBe(422);
    expect(r.json.error.code).toBe("LIMIT_EXCEEDED");
  });
  it("the full balance can be sent, never more", async () => {
    const w = makeWallet();
    // 199,000 + 995 fee = 199,995: the most that fits in 200,000 with the 0.5% fee (amounts are multiples of 250)
    const t = await w.mint(S, transferPayload(ahmed, 199_000));
    expect((await exec(w, "/transfers", "k", t, transferBody(S, ahmed, 199_000))).status).toBe(200);
    expect(w.balance(DEMO_USER)).toBe(5);
    const t2 = await w.mint(S, transferPayload(ahmed, 250));
    expect((await exec(w, "/transfers", "k2", t2, transferBody(S, ahmed, 250))).status).toBe(422);
  });
});

describe("POST /bill-payments", () => {
  const body = (acc: string, amount?: number | null) => ({ session_id: S, from: DEMO_USER, bill_account: acc, ...(amount !== undefined ? { amount_iqd: amount } : {}) });
  it("pays the outstanding electricity bill; the biller is credited; the bill is marked paid", async () => {
    const w = makeWallet();
    const m0 = totalMoney(w.db);
    const t = await w.mint(S, billPayload("b_electricity", "EL-55100", 37_500, 0));
    const r = await exec(w, "/bill-payments", "k", t, body("ba_elec"));
    expect(r.status).toBe(200);
    expect(r.json.transaction).toMatchObject({ kind: "bill_pay", amount_iqd: 37_500, fee_iqd: 0 });
    expect(w.balance(DEMO_USER)).toBe(162_500);
    expect((w.db.prepare("SELECT balance_iqd b FROM settlements WHERE biller_id='b_electricity'").get() as any).b).toBe(37_500);
    expect((w.db.prepare("SELECT status s FROM bills WHERE account_id='ba_elec'").get() as any).s).toBe("paid");
    expect(totalMoney(w.db)).toBe(m0);
  });
  it("bills carry no extra fee (ZainCash: government bills and in-app service providers are free)", async () => {
    const w = makeWallet();
    const m0 = totalMoney(w.db);
    const t = await w.mint(S, billPayload("b_generator", "GN-20311", 60_000, 0));
    const r = await exec(w, "/bill-payments", "k", t, body("ba_gen"));
    expect(r.json.transaction).toMatchObject({ amount_iqd: 60_000, fee_iqd: 0 });
    expect(w.balance(DEMO_USER)).toBe(140_000);
    expect((w.db.prepare("SELECT balance_iqd b FROM settlements WHERE biller_id='b_generator'").get() as any).b).toBe(60_000);
    expect(totalMoney(w.db)).toBe(m0); // the fee is not destroyed
  });
  it("paying again (new card, new key): 409 BILL_ALREADY_PAID, nothing debited", async () => {
    const w = makeWallet();
    const t1 = await w.mint(S, billPayload("b_electricity", "EL-55100", 37_500, 0));
    await exec(w, "/bill-payments", "k1", t1, body("ba_elec"));
    const t2 = await w.mint(S, billPayload("b_electricity", "EL-55100", 37_500, 0));
    const r = await exec(w, "/bill-payments", "k2", t2, body("ba_elec", 37_500));
    expect(r.status).toBe(409);
    expect(r.json.error.code).toBe("BILL_ALREADY_PAID");
    expect(w.balance(DEMO_USER)).toBe(162_500);
  });
  it("a bill that was already paid when seeded: 409", async () => {
    const w = makeWallet();
    const t = await w.mint(S, billPayload("b_water", "WT-7781", 12_000, 0));
    expect((await exec(w, "/bill-payments", "k", t, body("ba_water"))).json.error.code).toBe("BILL_ALREADY_PAID");
  });
  it("biller down: 503 BILLER_UNAVAILABLE, nothing debited", async () => {
    const w = makeWallet();
    const t = await w.mint(S, billPayload("b_mobile_topup", "07700000001", 5000, 0));
    const r = await exec(w, "/bill-payments", "k", t, body("ba_topup", 5000));
    expect(r.status).toBe(503);
    expect(r.json.error.code).toBe("BILLER_UNAVAILABLE");
    expect(w.balance(DEMO_USER)).toBe(200_000);
  });
  it("the bill amount rose after the card was shown: 409 AMOUNT_CHANGED, nothing debited (PSD2-style)", async () => {
    const w = makeWallet();
    const t = await w.mint(S, billPayload("b_electricity", "EL-55100", 37_500, 0)); // card showed 37,500
    w.db.prepare("UPDATE bills SET amount_iqd = 45000 WHERE account_id='ba_elec'").run(); // bill changed meanwhile
    const r = await exec(w, "/bill-payments", "k", t, body("ba_elec", 37_500)); // orchestrator sends the card amount
    expect(r.status).toBe(409);
    expect(r.json.error.code).toBe("AMOUNT_CHANGED");
    expect(w.balance(DEMO_USER)).toBe(200_000);
  });
  it("another user's bill account: 404", async () => {
    const w = makeWallet();
    const t = await w.mint(S, billPayload("b_electricity", "EL-90001", 37_500, 0));
    expect((await exec(w, "/bill-payments", "k", t, body("ba_low_elec"))).status).toBe(404);
  });
});

describe("fault injection (demo + eval only): break it on purpose", () => {
  const faults = (w: ReturnType<typeof makeWallet>, f: unknown, h: Record<string, string> = ADMIN) => w.call("POST", "/admin/faults", f, h);

  it("admin endpoints need DEMO_MODE and the secret header", async () => {
    const w = makeWallet();
    expect((await faults(w, { mode: "latency_ms", ms: 1, count: 1 }, {})).status).toBe(403);
    expect((await faults(w, { mode: "latency_ms", ms: 1, count: 1 }, { "x-admin-secret": "wrong" })).status).toBe(403);
    expect((await faults(w, { mode: "latency_ms", ms: 1, count: 1 })).status).toBe(200);
  });
  it("error_5xx_before_commit: first call 503 with no debit, the retry with the SAME key and token succeeds once", async () => {
    const w = makeWallet();
    await faults(w, { mode: "error_5xx_before_commit", count: 1 });
    const t = await w.mint(S, transferPayload(ahmed, 50_000));
    const a = await exec(w, "/transfers", "key-1", t, transferBody(S, ahmed, 50_000));
    expect(a.status).toBe(503);
    expect(w.balance(DEMO_USER)).toBe(200_000);
    const b = await exec(w, "/transfers", "key-1", t, transferBody(S, ahmed, 50_000));
    expect(b.status).toBe(200);
    expect(w.balance(DEMO_USER)).toBe(149_700);
    expect(w.txCount()).toBe(12);
  });
  it("timeout_after_commit (THE demo): response lost, retry replays, exactly one debit", async () => {
    const w = makeWallet();
    await faults(w, { mode: "timeout_after_commit", count: 1, sleep_ms: 60 });
    const t = await w.mint(S, transferPayload(ahmed, 50_000));
    const first = exec(w, "/transfers", "key-1", t, transferBody(S, ahmed, 50_000));
    const raced = await Promise.race([first, sleep(10).then(() => "client-timeout" as const)]);
    expect(raced).toBe("client-timeout"); // the client gave up...
    expect(w.balance(DEMO_USER)).toBe(149_700); // ...but the server already committed
    const retry = await exec(w, "/transfers", "key-1", t, transferBody(S, ahmed, 50_000));
    expect(retry.status).toBe(200);
    expect(retry.headers.get("idempotent-replay")).toBe("true");
    const original = (await first) as Awaited<typeof retry>;
    expect(retry.json).toEqual(original.json); // same reference number
    expect(w.balance(DEMO_USER)).toBe(149_700); // still ONE debit
    expect(w.txCount()).toBe(12);
  });
  it("lookup by key decides an unknown outcome (GET transactions?idempotencyKey=)", async () => {
    const w = makeWallet();
    const t = await w.mint(S, transferPayload(ahmed, 50_000));
    expect((await w.call("GET", `/users/${DEMO_USER}/transactions?idempotencyKey=key-1`)).json.transactions).toHaveLength(0);
    await exec(w, "/transfers", "key-1", t, transferBody(S, ahmed, 50_000));
    const r = await w.call("GET", `/users/${DEMO_USER}/transactions?idempotencyKey=key-1`);
    expect(r.json.transactions).toHaveLength(1);
    expect(r.json.transactions[0].amount_iqd).toBe(50_000);
  });
  it("latency_ms delays the response", async () => {
    const w = makeWallet();
    await faults(w, { mode: "latency_ms", ms: 40, count: 1 });
    const t = await w.mint(S, transferPayload(ahmed, 5000));
    const t0 = Date.now();
    await exec(w, "/transfers", "k", t, transferBody(S, ahmed, 5000));
    expect(Date.now() - t0).toBeGreaterThanOrEqual(35);
  });
  it("biller_down:<id> makes that biller unavailable until reset", async () => {
    const w = makeWallet();
    await faults(w, { mode: "biller_down", biller: "b_generator" });
    const t = await w.mint(S, billPayload("b_generator", "GN-20311", 60_000, 0));
    const r = await exec(w, "/bill-payments", "k", t, { session_id: S, from: DEMO_USER, bill_account: "ba_gen" });
    expect(r.status).toBe(503);
    expect(w.balance(DEMO_USER)).toBe(200_000);
    await w.call("POST", "/admin/reset", {}, ADMIN);
    const t2 = await w.mint(S, billPayload("b_generator", "GN-20311", 60_000, 0));
    expect((await exec(w, "/bill-payments", "k2", t2, { session_id: S, from: DEMO_USER, bill_account: "ba_gen" })).status).toBe(200);
  });
  it("faults are counted and expire", async () => {
    const w = makeWallet();
    await faults(w, { mode: "error_5xx_before_commit", count: 2 });
    const t = await w.mint(S, transferPayload(ahmed, 5000));
    const codes: number[] = [];
    for (let i = 0; i < 3; i++) codes.push((await exec(w, "/transfers", "k", t, transferBody(S, ahmed, 5000))).status);
    expect(codes).toEqual([503, 503, 200]);
  });
  it("/admin/reset restores the seed (balance, keys, bills) and clears faults", async () => {
    const w = makeWallet();
    const t = await w.mint(S, transferPayload(ahmed, 50_000));
    await exec(w, "/transfers", "k", t, transferBody(S, ahmed, 50_000));
    await faults(w, { mode: "error_5xx_before_commit", count: 9 });
    expect((await w.call("POST", "/admin/reset", {}, ADMIN)).status).toBe(200);
    expect(w.balance(DEMO_USER)).toBe(200_000);
    expect(w.txCount()).toBe(11);
    const t2 = await w.mint(S, transferPayload(ahmed, 50_000));
    expect((await exec(w, "/transfers", "k", t2, transferBody(S, ahmed, 50_000))).status).toBe(200);
  });
});

describe("audit log (docs/14)", () => {
  it("records token issue, execution and replay with the idempotency key", async () => {
    const w = makeWallet();
    const t = await w.mint(S, transferPayload(ahmed, 50_000));
    await exec(w, "/transfers", "key-1", t, transferBody(S, ahmed, 50_000));
    await exec(w, "/transfers", "key-1", t, transferBody(S, ahmed, 50_000));
    await exec(w, "/transfers", "key-2", null, transferBody(S, ahmed, 50_000));
    const r = await w.call("GET", "/admin/audit?limit=20", undefined, ADMIN);
    const events = r.json.events.map((e: any) => e.event);
    expect(events).toEqual(expect.arrayContaining(["token.issued", "transfer.executed", "transfer.replayed", "transfer.rejected"]));
    const executed = r.json.events.find((e: any) => e.event === "transfer.executed");
    expect(executed.data.idempotency_key).toBe("key-1");
    expect(JSON.stringify(r.json.events)).not.toContain(t); // never log the token value
  });
});
