import { describe, it, expect } from "vitest";
import { spawn } from "node:child_process";
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createApp } from "../src/app";
import { openDb } from "../src/db";
import { totalMoney, SEED_NOW, DEMO_USER } from "../src/seed";
import { makeWallet, exec, transferBody, transferPayload } from "./helpers";

const SEED_TX = 11;
const SEED_MONEY = (() => { const w = makeWallet(); return totalMoney(w.db); })();
const KEYS = 50;
const AMOUNT = 1000;
const CONTACTS = ["c_ahmed_ali", "c_ahmed_moh", "c_ali_karim", "c_mama", "c_husain"];

const txPerKey = (db: ReturnType<typeof openDb>, key: string) =>
  (db.prepare("SELECT COUNT(*) c FROM transactions WHERE idempotency_key=?").get(key) as { c: number }).c;
const negatives = (db: ReturnType<typeof openDb>) =>
  (db.prepare("SELECT COUNT(*) c FROM users WHERE balance_iqd < 0").get() as { c: number }).c +
  (db.prepare("SELECT COUNT(*) c FROM settlements WHERE balance_iqd < 0").get() as { c: number }).c;

describe("concurrency, in one process: 20 parallel same-key requests x 50 keys", () => {
  it("exactly one transaction per key, identical responses, money conserved", async () => {
    const w = makeWallet();
    const items = await Promise.all(Array.from({ length: KEYS }, async (_, i) => {
      const to = CONTACTS[i % CONTACTS.length] as string;
      return { key: `key-${i}`, to, token: await w.mint(`s${i}`, transferPayload(to, AMOUNT)), session: `s${i}` };
    }));
    const responses = await Promise.all(items.flatMap((it) => Array.from({ length: 20 }, () => exec(w, "/transfers", it.key, it.token, transferBody(it.session, it.to, AMOUNT)))));
    expect(responses).toHaveLength(KEYS * 20);
    expect(responses.every((r) => r.status === 200)).toBe(true);
    for (const it of items) {
      expect(txPerKey(w.db, it.key)).toBe(1);
      const mine = responses.filter((r) => r.json.transaction.counterparty.id === it.to && r.json.transaction.amount_iqd === AMOUNT);
      expect(mine.length).toBeGreaterThan(0);
    }
    const firsts = responses.filter((r) => r.headers.get("idempotent-replay") === null).length;
    expect(firsts).toBe(KEYS); // exactly one real execution per key, everything else is a replay
    expect(w.txCount()).toBe(SEED_TX + KEYS);
    expect(w.balance(DEMO_USER)).toBe(200_000 - KEYS * AMOUNT);
    expect(totalMoney(w.db)).toBe(SEED_MONEY);
    expect(negatives(w.db)).toBe(0);
  });

  it("one token cannot be spent twice even under 20 DIFFERENT keys in parallel", async () => {
    const w = makeWallet();
    const token = await w.mint("s", transferPayload("c_ahmed_ali", AMOUNT));
    const rs = await Promise.all(Array.from({ length: 20 }, (_, i) => exec(w, "/transfers", `k${i}`, token, transferBody("s", "c_ahmed_ali", AMOUNT))));
    expect(rs.filter((r) => r.status === 200)).toHaveLength(1);
    expect(rs.filter((r) => r.status === 403)).toHaveLength(19);
    expect(w.txCount()).toBe(SEED_TX + 1);
    expect(w.balance(DEMO_USER)).toBe(200_000 - AMOUNT);
  });
});

describe("concurrency, across connections: two SQLite connections to the same database file", () => {
  it("exactly one transaction per key when requests are interleaved over both connections", async () => {
    const dir = mkdtempSync(join(tmpdir(), "zc-wallet-"));
    try {
      const a = makeWallet({ dbPath: join(dir, "w.db") });
      const dbB = openDb(join(dir, "w.db"));
      const appB = createApp({ db: dbB, now: a.clock.now, demoMode: false });
      const items = await Promise.all(Array.from({ length: KEYS }, async (_, i) => ({ key: `k${i}`, to: CONTACTS[i % 5] as string, token: await a.mint(`s${i}`, transferPayload(CONTACTS[i % 5] as string, AMOUNT)), session: `s${i}` })));
      const send = (app: { request: typeof a.app.request }, it: (typeof items)[number]) =>
        app.request("/transfers", { method: "POST", headers: { "content-type": "application/json", "idempotency-key": it.key, "x-confirmation-token": it.token }, body: JSON.stringify(transferBody(it.session, it.to, AMOUNT)) });
      const rs = await Promise.all(items.flatMap((it) => Array.from({ length: 20 }, (_, n) => send(n % 2 ? appB : a.app, it))));
      expect(rs.every((r) => r.status === 200)).toBe(true);
      for (const it of items) expect(txPerKey(a.db, it.key)).toBe(1);
      expect(a.txCount()).toBe(SEED_TX + KEYS);
      expect(totalMoney(a.db)).toBe(SEED_MONEY);
      dbB.close();
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
});

describe("concurrency, across real OS processes: 4 processes, each with its own connection, same keys", () => {
  it("exactly one transaction per key, no negative balance, money conserved", async () => {
    const dir = mkdtempSync(join(tmpdir(), "zc-wallet-"));
    try {
      const dbPath = join(dir, "w.db");
      const w = makeWallet({ dbPath });
      const items = await Promise.all(Array.from({ length: KEYS }, async (_, i) => {
        const to = CONTACTS[i % 5] as string;
        return { key: `k${i}`, token: await w.mint(`s${i}`, transferPayload(to, AMOUNT)), body: transferBody(`s${i}`, to, AMOUNT) };
      }));
      const PROCS = 4, REPEATS = 5;
      const planFile = join(dir, "plan.json");
      writeFileSync(planFile, JSON.stringify({ dbPath, now: SEED_NOW, repeats: REPEATS, items }));
      const started = Date.now();
      const results = await Promise.all(Array.from({ length: PROCS }, () => new Promise<any>((res, rej) => {
        const p = spawn(process.execPath, ["--import", "tsx", join(__dirname, "fixtures", "hammer.ts"), planFile], { cwd: resolve(__dirname, ".."), stdio: ["ignore", "pipe", "pipe"] });
        let out = "", errOut = "";
        p.stdout.on("data", (d) => (out += d));
        p.stderr.on("data", (d) => (errOut += d));
        p.on("close", (code) => (code === 0 ? res(JSON.parse(out.trim().split("\n").pop() as string)) : rej(new Error(`child exited ${code}: ${errOut}`))));
      })));
      const elapsedMs = Date.now() - started;

      const requests = results.reduce((s, r) => s + r.requests, 0);
      const firsts = results.reduce((s, r) => s + r.firsts, 0);
      const replays = results.reduce((s, r) => s + r.replays, 0);
      const non200 = results.reduce((s, r) => s + Object.entries(r.statuses as Record<string, number>).filter(([k]) => k !== "200").reduce((a, [, v]) => a + v, 0), 0);

      expect(requests).toBe(PROCS * REPEATS * KEYS);
      expect(non200).toBe(0);
      expect(firsts).toBe(KEYS); // exactly one real execution per key across ALL processes
      expect(firsts + replays).toBe(requests);
      const verify = openDb(dbPath);
      let duplicates = 0;
      for (const it of items) duplicates += Math.max(0, txPerKey(verify, it.key) - 1);
      expect(duplicates).toBe(0);
      for (const it of items) expect(txPerKey(verify, it.key)).toBe(1);
      expect((verify.prepare("SELECT COUNT(*) c FROM transactions").get() as { c: number }).c).toBe(SEED_TX + KEYS);
      const moneyConserved = totalMoney(verify) === SEED_MONEY;
      const negativeBalances = negatives(verify);
      const tokensConsumed = (verify.prepare("SELECT COUNT(*) c FROM confirmation_tokens WHERE used_at IS NOT NULL").get() as { c: number }).c;
      expect(moneyConserved).toBe(true);
      expect(negativeBalances).toBe(0);
      expect(tokensConsumed).toBe(KEYS);
      verify.close();

      if (process.env.SAFETY_REPORT) {
        const out = resolve(__dirname, "../../../eval/results");
        mkdirSync(out, { recursive: true });
        writeFileSync(join(out, "wallet-safety-stress.json"), JSON.stringify({
          generated_by: "apps/wallet-api/test/concurrency.test.ts (SAFETY_REPORT=1)",
          processes: PROCS, keys: KEYS, repeats_per_process: REPEATS, requests, elapsed_ms: elapsedMs,
          real_executions: firsts, replays, non_200_responses: non200,
          transactions_created: KEYS, duplicate_transactions: duplicates,
          money_conserved: moneyConserved, negative_balances: negativeBalances, tokens_consumed: tokensConsumed,
          node: process.version, note: "measured, not estimated; rerun with `pnpm stress`",
        }, null, 2) + "\n");
      }
    } finally { rmSync(dir, { recursive: true, force: true }); }
  }, 120_000);
});
