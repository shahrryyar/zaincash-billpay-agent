// Mock ZainCash wallet (docs/06). NOT the real ZainCash API: synthetic data only.
// The money path is ONE SQLite transaction (BEGIN IMMEDIATE): idempotency check, confirmation-token check,
// business checks, debit/credit, token consumption and the stored response all commit together or not at all.
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { Hono, type Context } from "hono";
import { z } from "zod";
import { SMALLEST_UNIT_IQD, MAX_AMOUNT_IQD, TOKEN_TTL_MS, canonicalJSON, checkToken, normaliseArabic, type Payload } from "@zc/core";
import type { Db } from "./db";
import { applySeed } from "./seed";

const DAY = 86_400_000;
const sha = (s: string) => createHash("sha256").update(s).digest("hex");
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export type AppOptions = { db: Db; now?: () => number; demoMode?: boolean; adminSecret?: string };

type Row = Record<string, any>;
type Outcome = { status: number; body: unknown; store: boolean; replay: boolean };
type Fault = { mode: "latency_ms" | "timeout_after_commit" | "error_5xx_before_commit" | "biller_down"; remaining: number; ms?: number; sleep_ms?: number; biller?: string };

const fail = (status: number, code: string, message: string, store: boolean, extra: Record<string, unknown> = {}): Outcome => ({
  status, body: { error: { code, message, ...extra } }, store, replay: false,
});

// ---- request schemas (strict: unknown keys are rejected)
const Money = z.number().int().positive();
const TransferBody = z.strictObject({ session_id: z.string().min(1).max(128), from: z.string().min(1), to_contact: z.string().min(1), amount_iqd: Money });
const BillBody = z.strictObject({ session_id: z.string().min(1).max(128), from: z.string().min(1), bill_account: z.string().min(1), amount_iqd: Money.nullable().optional() });
const QuoteBody = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("transfer"), from: z.string().min(1), to_contact: z.string().min(1), amount_iqd: Money }),
  z.strictObject({ kind: z.literal("bill_pay"), from: z.string().min(1), bill_account: z.string().min(1), amount_iqd: Money.nullable().optional() }),
]);
const TokenBody = z.strictObject({
  session_id: z.string().min(1).max(128),
  payload: z.strictObject({
    kind: z.enum(["transfer", "bill_pay"]), from: z.string().min(1), to_id: z.string().optional(), biller_id: z.string().optional(),
    account_ref: z.string().optional(), amount_iqd: Money, fee_iqd: z.number().int().min(0),
  }),
});
const FaultBody = z.strictObject({
  mode: z.enum(["latency_ms", "timeout_after_commit", "error_5xx_before_commit", "biller_down"]),
  count: z.number().int().positive().optional(), ms: z.number().int().min(0).optional(), sleep_ms: z.number().int().min(0).optional(), biller: z.string().optional(),
});

const mask = (phone: string) => `••••${phone.slice(-4)}`;
const reference = (seq: number) => `ZC-${String(seq).padStart(8, "0")}`;

export function createApp(opts: AppOptions) {
  const { db } = opts;
  const now = opts.now ?? Date.now;
  const faults: Fault[] = [];
  const app = new Hono();

  const audit = (event: string, sessionId: string | null, data: Record<string, unknown>) =>
    db.prepare("INSERT INTO audit_log(ts,session_id,event,data_json) VALUES (?,?,?,?)").run(now(), sessionId, event, JSON.stringify(data));

  const takeFault = (mode: Fault["mode"]): Fault | undefined => {
    const f = faults.find((x) => x.mode === mode && x.remaining > 0);
    if (f) f.remaining--;
    return f;
  };
  const billerDown = (billerId: string) => faults.some((f) => f.mode === "biller_down" && f.biller === billerId);
  const billerStatus = (b: Row): string => (billerDown(b.id) ? "down" : b.status);
  const err = (c: Context, status: number, code: string, message: string) => c.json({ error: { code, message } }, status as 400);

  // ------------------------------------------------------------------ reads
  app.get("/health", (c) => c.json({ ok: true, service: "mock-zaincash-wallet (synthetic)" }));

  app.get("/users/:id", (c) => {
    const u = db.prepare("SELECT id,name,phone,balance_iqd,daily_limit_iqd FROM users WHERE id=?").get(c.req.param("id")) as Row | undefined;
    return u ? c.json({ ...u, phone_masked: mask(u.phone), phone: undefined }) : err(c, 404, "USER_NOT_FOUND", "unknown user");
  });

  app.get("/users/:id/contacts", (c) => {
    const q = normaliseArabic(c.req.query("q") ?? "");
    const rows = db.prepare("SELECT * FROM contacts WHERE owner_id=? ORDER BY display_name, id").all(c.req.param("id")) as Row[];
    const contacts = rows
      .filter((r) => !q || (r.name_normalised as string).includes(q))
      .map((r) => ({ id: r.id, display_name: r.display_name, phone: r.phone, phone_masked: mask(r.phone), relation: r.relation, wallet_user: r.wallet_user_id !== null, last_used_at: r.last_used_at }));
    return c.json({ contacts });
  });

  app.get("/billers", (c) => {
    const rows = db.prepare("SELECT * FROM billers ORDER BY id").all() as Row[];
    return c.json({ billers: rows.map((b) => ({ id: b.id, code: b.code, name_ar: b.name_ar, name_en: b.name_en, aliases: JSON.parse(b.aliases), fee_iqd: b.fee_iqd, status: billerStatus(b) })) });
  });

  app.get("/users/:id/bill-accounts", (c) => {
    const rows = db.prepare(
      `SELECT a.id, a.biller_id, a.account_ref, a.nickname, b.code biller_code, b.name_ar biller_name_ar, b.fee_iqd, bl.id bill_id, bl.amount_iqd bill_amount, bl.due_date, bl.status bill_status
       FROM bill_accounts a JOIN billers b ON b.id=a.biller_id LEFT JOIN bills bl ON bl.account_id=a.id WHERE a.owner_id=? ORDER BY a.id`,
    ).all(c.req.param("id")) as Row[];
    return c.json({
      bill_accounts: rows.map((r) => ({
        id: r.id, biller_id: r.biller_id, biller_code: r.biller_code, biller_name_ar: r.biller_name_ar, account_ref: r.account_ref, nickname: r.nickname, fee_iqd: r.fee_iqd,
        bill: r.bill_id ? { id: r.bill_id, amount_iqd: r.bill_amount, due_date: r.due_date, status: r.bill_status } : null,
      })),
    });
  });

  app.get("/users/:id/transactions", (c) => {
    const limit = Math.min(Math.max(Number(c.req.query("limit") ?? 20) || 20, 1), 100);
    const key = c.req.query("idempotencyKey");
    const rows = (key
      ? db.prepare("SELECT * FROM transactions WHERE owner_id=? AND idempotency_key=?").all(c.req.param("id"), key)
      : db.prepare("SELECT * FROM transactions WHERE owner_id=? ORDER BY created_at DESC, seq DESC LIMIT ?").all(c.req.param("id"), limit)) as Row[];
    return c.json({
      transactions: rows.map((t) => ({ id: t.id, reference: reference(t.seq), kind: t.kind, amount_iqd: t.amount_iqd, fee_iqd: t.fee_iqd, counterparty: { id: t.counterparty_id, name: t.counterparty }, created_at: t.created_at, idempotency_key: t.idempotency_key })),
    });
  });

  // ------------------------------------------------------------------ business rules (shared by quote and execute)
  const dailyTotal = (userId: string): number => {
    const start = now() - (now() % DAY);
    return (db.prepare("SELECT COALESCE(SUM(amount_iqd + fee_iqd),0) s FROM transactions WHERE owner_id=? AND created_at>=?").get(userId, start) as Row).s;
  };

  /** Ordered business checks. Returns the first failing code or null. `all` collects every failing code (for quotes). */
  function transferChecks(user: Row, contactId: string, amount: number, all: boolean): { codes: string[]; contact?: Row } {
    const codes: string[] = [];
    const push = (c: string): boolean => { codes.push(c); return !all; };
    const contact = db.prepare("SELECT * FROM contacts WHERE id=? AND owner_id=?").get(contactId, user.id) as Row | undefined;
    if (!contact) { codes.push("CONTACT_NOT_FOUND"); return { codes }; }
    if (contact.wallet_user_id === null && push("CONTACT_NOT_WALLET_USER")) return { codes, contact };
    if ((amount % SMALLEST_UNIT_IQD !== 0 || amount > MAX_AMOUNT_IQD) && push("INVALID_AMOUNT")) return { codes, contact };
    if (dailyTotal(user.id) + amount > user.daily_limit_iqd && push("LIMIT_EXCEEDED")) return { codes, contact };
    if (user.balance_iqd < amount && push("INSUFFICIENT_BALANCE")) return { codes, contact };
    return { codes, contact };
  }

  function billChecks(user: Row, account: Row, biller: Row, bill: Row | undefined, amount: number | null, all: boolean): { codes: string[]; amount: number } {
    const codes: string[] = [];
    const push = (c: string): boolean => { codes.push(c); return !all; };
    if (billerStatus(biller) !== "active" && push("BILLER_UNAVAILABLE")) return { codes, amount: amount ?? 0 };
    if (bill && bill.status === "paid" && push("BILL_ALREADY_PAID")) return { codes, amount: bill.amount_iqd };
    if (!bill && amount === null && push("AMOUNT_REQUIRED")) return { codes, amount: 0 };
    if (bill && amount !== null && amount !== bill.amount_iqd && push("AMOUNT_CHANGED")) return { codes, amount };
    const final = amount ?? bill?.amount_iqd ?? 0;
    const total = final + biller.fee_iqd;
    if (final % SMALLEST_UNIT_IQD !== 0 && push("INVALID_AMOUNT")) return { codes, amount: final };
    if (dailyTotal(user.id) + total > user.daily_limit_iqd && push("LIMIT_EXCEEDED")) return { codes, amount: final };
    if (user.balance_iqd < total && push("INSUFFICIENT_BALANCE")) return { codes, amount: final };
    return { codes, amount: final };
  }

  const loadBill = (accountId: string, ownerId: string) => {
    const account = db.prepare("SELECT * FROM bill_accounts WHERE id=? AND owner_id=?").get(accountId, ownerId) as Row | undefined;
    if (!account) return null;
    const biller = db.prepare("SELECT * FROM billers WHERE id=?").get(account.biller_id) as Row;
    const bill = db.prepare("SELECT * FROM bills WHERE account_id=?").get(accountId) as Row | undefined;
    return { account, biller, bill };
  };

  // ------------------------------------------------------------------ quotes
  app.post("/quotes", async (c) => {
    const parsed = QuoteBody.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return err(c, 400, "BAD_REQUEST", "invalid quote request");
    const q = parsed.data;
    const user = db.prepare("SELECT * FROM users WHERE id=?").get(q.from) as Row | undefined;
    if (!user) return err(c, 404, "USER_NOT_FOUND", "unknown user");
    if (q.kind === "transfer") {
      const r = transferChecks(user, q.to_contact, q.amount_iqd, true);
      return c.json({ ok: r.codes.length === 0, kind: "transfer", amount_iqd: q.amount_iqd, fee_iqd: 0, total_iqd: q.amount_iqd, balance_after_iqd: user.balance_iqd - q.amount_iqd, errors: r.codes, counterparty_name: r.contact?.display_name ?? null });
    }
    const loaded = loadBill(q.bill_account, user.id);
    if (!loaded) return c.json({ ok: false, kind: "bill_pay", errors: ["BILL_ACCOUNT_NOT_FOUND"] });
    const r = billChecks(user, loaded.account, loaded.biller, loaded.bill, q.amount_iqd ?? null, true);
    const fee = loaded.biller.fee_iqd;
    return c.json({ ok: r.codes.length === 0, kind: "bill_pay", amount_iqd: r.amount, fee_iqd: fee, total_iqd: r.amount + fee, balance_after_iqd: user.balance_iqd - r.amount - fee, errors: r.codes, counterparty_name: loaded.biller.name_ar });
  });

  // ------------------------------------------------------------------ confirmation tokens (server-issued, payload-bound)
  app.post("/confirmation-tokens", async (c) => {
    const parsed = TokenBody.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return err(c, 400, "BAD_REQUEST", "invalid token request");
    const { session_id, payload } = parsed.data;
    // sha256(canonicalJSON(payload)): identical to @zc/core payloadHash (undefined keys are dropped by both)
    const payload_hash = sha(canonicalJSON(payload));
    const token = `ct_${randomBytes(16).toString("hex")}`;
    const expires_at = now() + TOKEN_TTL_MS;
    db.transaction(() => {
      db.prepare("INSERT INTO confirmation_tokens(token,session_id,payload_hash,expires_at,used_at) VALUES (?,?,?,?,NULL)").run(token, session_id, payload_hash, expires_at);
      audit("token.issued", session_id, { payload_hash, expires_at, kind: payload.kind }); // never log the token itself
    }).immediate();
    return c.json({ token, payload_hash, expires_at }, 201);
  });

  // ------------------------------------------------------------------ execution (the money path)
  function executeTxn(kind: "transfer" | "bill_pay", path: string, body: Row, key: string, tokenValue: string | undefined): Outcome {
    const sessionId = body.session_id as string;
    const reqHash = sha(canonicalJSON({ path, body }));

    // 1. idempotency: same key -> stored result (replay) or a 422 if the payload differs
    const prior = db.prepare("SELECT request_hash, response_json, status_code FROM idempotency_keys WHERE key=?").get(key) as Row | undefined;
    if (prior) {
      if (prior.request_hash === reqHash) {
        audit(`${kind}.replayed`, sessionId, { idempotency_key: key });
        return { status: prior.status_code, body: JSON.parse(prior.response_json), store: false, replay: true };
      }
      audit(`${kind}.rejected`, sessionId, { idempotency_key: key, code: "IDEMPOTENCY_KEY_REUSED" });
      return fail(422, "IDEMPOTENCY_KEY_REUSED", "this idempotency key was used with a different request", false);
    }

    const reject = (o: Outcome): Outcome => { audit(`${kind}.rejected`, sessionId, { idempotency_key: key, code: (o.body as any).error.code }); return o; };

    // 2. build the payload the token must be bound to
    const user = db.prepare("SELECT * FROM users WHERE id=?").get(body.from) as Row | undefined;
    if (!user) return reject(fail(404, "USER_NOT_FOUND", "unknown user", false));
    let payload: Payload;
    let bill: ReturnType<typeof loadBill> = null;
    if (kind === "transfer") {
      payload = { kind: "transfer", from: user.id, to_id: body.to_contact, amount_iqd: body.amount_iqd, fee_iqd: 0 };
    } else {
      bill = loadBill(body.bill_account, user.id);
      if (!bill) return reject(fail(404, "BILL_ACCOUNT_NOT_FOUND", "unknown bill account", false));
      const amount = body.amount_iqd ?? bill.bill?.amount_iqd;
      if (amount === undefined || amount === null) return reject(fail(400, "AMOUNT_REQUIRED", "this bill has no outstanding amount; amount_iqd is required", false));
      payload = { kind: "bill_pay", from: user.id, biller_id: bill.biller.id, account_ref: bill.account.account_ref, amount_iqd: amount, fee_iqd: bill.biller.fee_iqd };
    }

    // 3. confirmation token: exists, same session, same payload, unused, unexpired
    const tok = tokenValue ? (db.prepare("SELECT * FROM confirmation_tokens WHERE token=?").get(tokenValue) as Row | undefined) : undefined;
    const check = tok
      ? checkToken({ presented: tokenValue as string, sessionId, payload, now: now() }, { token: tok.token, sessionId: tok.session_id, payloadHash: tok.payload_hash, expiresAt: tok.expires_at, usedAt: tok.used_at })
      : ({ ok: false, reason: "unknown_token" } as const);
    if (!check.ok) return reject(fail(403, "CONFIRMATION_INVALID", "a valid confirmation for this exact request is required", false, { reason: check.reason }));

    // 4. business checks (deterministic failures are stored under the key so the outcome stays stable)
    let amount: number, fee: number, counterpartyId: string, counterpartyName: string, walletRecipient: string | null = null;
    if (kind === "transfer") {
      const r = transferChecks(user, body.to_contact, body.amount_iqd, false);
      const code = r.codes[0];
      if (code) return reject(fail(code === "CONTACT_NOT_FOUND" ? 404 : 422, code, code, true));
      amount = body.amount_iqd; fee = 0;
      counterpartyId = r.contact!.id; counterpartyName = r.contact!.display_name; walletRecipient = r.contact!.wallet_user_id;
    } else {
      const b = bill!;
      const r = billChecks(user, b.account, b.biller, b.bill, body.amount_iqd ?? null, false);
      const code = r.codes[0];
      if (code) {
        const status = code === "BILLER_UNAVAILABLE" ? 503 : code === "AMOUNT_REQUIRED" ? 400 : code === "BILL_ALREADY_PAID" || code === "AMOUNT_CHANGED" ? 409 : 422;
        return reject(fail(status, code, code, status !== 503 && status !== 400));
      }
      amount = r.amount; fee = b.biller.fee_iqd; counterpartyId = b.account.id; counterpartyName = b.biller.name_ar;
    }

    // 5. consume the token FIRST (single-use is enforced by the UPDATE itself), then move money
    const used = db.prepare("UPDATE confirmation_tokens SET used_at=? WHERE token=? AND used_at IS NULL").run(now(), tokenValue);
    if (used.changes !== 1) return reject(fail(403, "CONFIRMATION_INVALID", "confirmation already used", false, { reason: "already_used" }));

    db.prepare("UPDATE users SET balance_iqd = balance_iqd - ? WHERE id=?").run(amount + fee, user.id);
    if (kind === "transfer") {
      db.prepare("UPDATE users SET balance_iqd = balance_iqd + ? WHERE id=?").run(amount, walletRecipient);
      db.prepare("UPDATE contacts SET last_used_at=? WHERE id=?").run(now(), counterpartyId);
    } else {
      db.prepare("UPDATE settlements SET balance_iqd = balance_iqd + ? WHERE biller_id=?").run(amount + fee, bill!.biller.id);
      db.prepare("UPDATE bills SET status='paid' WHERE account_id=?").run(bill!.account.id);
    }
    const txId = `t_${randomUUID()}`;
    const ins = db.prepare("INSERT INTO transactions(id,owner_id,kind,counterparty,counterparty_id,amount_iqd,fee_iqd,status,idempotency_key,created_at) VALUES (?,?,?,?,?,?,?,?,?,?)")
      .run(txId, user.id, kind, counterpartyName, counterpartyId, amount, fee, "completed", key, now());
    const balanceAfter = (db.prepare("SELECT balance_iqd b FROM users WHERE id=?").get(user.id) as Row).b;
    const ref = reference(Number(ins.lastInsertRowid));
    audit(`${kind}.executed`, sessionId, { idempotency_key: key, reference: ref, amount_iqd: amount, fee_iqd: fee });
    return {
      status: 200, store: true, replay: false,
      body: { transaction: { id: txId, reference: ref, kind, amount_iqd: amount, fee_iqd: fee, counterparty: { id: counterpartyId, name: counterpartyName }, created_at: now() }, balance_after_iqd: balanceAfter },
    };
  }

  async function handleExecute(c: Context, kind: "transfer" | "bill_pay", path: string, schema: z.ZodType<Row>) {
    const key = c.req.header("idempotency-key");
    if (!key || key.length > 128) return err(c, 400, "IDEMPOTENCY_KEY_REQUIRED", "Idempotency-Key header (1-128 chars) is required");
    const parsed = schema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return err(c, 400, "BAD_REQUEST", "invalid request body");
    const body = parsed.data;

    const lat = takeFault("latency_ms");
    if (lat) await sleep(lat.ms ?? 0);
    if (takeFault("error_5xx_before_commit")) return err(c, 503, "SERVICE_UNAVAILABLE", "injected outage (nothing was processed)");

    const run = db.transaction((): Outcome => {
      const out = executeTxn(kind, path, body, key, c.req.header("x-confirmation-token"));
      if (out.store) {
        db.prepare("INSERT INTO idempotency_keys(key,request_hash,response_json,status_code,created_at) VALUES (?,?,?,?,?)")
          .run(key, sha(canonicalJSON({ path, body })), JSON.stringify(out.body), out.status, now());
      }
      return out;
    });
    const out = run.immediate(); // BEGIN IMMEDIATE: one writer at a time, across connections and processes

    const tc = out.status === 200 && !out.replay ? takeFault("timeout_after_commit") : undefined;
    if (tc) await sleep(tc.sleep_ms ?? 3000); // the debit is committed; the client will have timed out
    return c.json(out.body as object, out.status as 200, out.replay ? { "Idempotent-Replay": "true" } : {});
  }

  app.post("/transfers", (c) => handleExecute(c, "transfer", "/transfers", TransferBody));
  app.post("/bill-payments", (c) => handleExecute(c, "bill_pay", "/bill-payments", BillBody));

  // ------------------------------------------------------------------ admin (demo / eval only)
  const adminOk = (c: Context): Response | null => {
    if (!opts.demoMode) return err(c, 404, "NOT_FOUND", "not found");
    if (!opts.adminSecret || c.req.header("x-admin-secret") !== opts.adminSecret) return err(c, 403, "FORBIDDEN", "admin secret required");
    return null;
  };

  app.post("/admin/faults", async (c) => {
    const denied = adminOk(c);
    if (denied) return denied;
    const p = FaultBody.safeParse(await c.req.json().catch(() => null));
    if (!p.success) return err(c, 400, "BAD_REQUEST", "invalid fault");
    const f = p.data;
    faults.push({ mode: f.mode, remaining: f.mode === "biller_down" ? Number.POSITIVE_INFINITY : (f.count ?? 1), ...(f.ms !== undefined ? { ms: f.ms } : {}), ...(f.sleep_ms !== undefined ? { sleep_ms: f.sleep_ms } : {}), ...(f.biller ? { biller: f.biller } : {}) });
    return c.json({ ok: true, active: faults.filter((x) => x.remaining > 0).length });
  });

  app.post("/admin/reset", (c) => {
    const denied = adminOk(c);
    if (denied) return denied;
    applySeed(db);
    faults.length = 0;
    return c.json({ ok: true });
  });

  app.get("/admin/audit", (c) => {
    const denied = adminOk(c);
    if (denied) return denied;
    const limit = Math.min(Math.max(Number(c.req.query("limit") ?? 50) || 50, 1), 500);
    const rows = db.prepare("SELECT * FROM audit_log ORDER BY id DESC LIMIT ?").all(limit) as Row[];
    return c.json({ events: rows.map((r) => ({ id: r.id, ts: r.ts, session_id: r.session_id, event: r.event, data: JSON.parse(r.data_json) })) });
  });

  return app;
}
