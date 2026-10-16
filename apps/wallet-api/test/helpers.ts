import { payloadHash, type Payload } from "@zc/core";
import { createApp } from "../src/app";
import { p2pFee } from "../src/fees";
import { openDb, type Db } from "../src/db";
import { applySeed, SEED_NOW, DEMO_USER } from "../src/seed";

export const ADMIN = { "x-admin-secret": "s3cret" };
export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export type Res = { status: number; headers: Headers; json: any };

export function makeWallet(opts: { dbPath?: string; seed?: boolean } = {}) {
  const db: Db = openDb(opts.dbPath ?? ":memory:");
  if (opts.seed !== false) applySeed(db);
  let t = SEED_NOW;
  const clock = { now: () => t, advance: (ms: number) => { t += ms; } };
  const app = createApp({ db, now: clock.now, demoMode: true, adminSecret: "s3cret" });
  const call = async (method: string, path: string, body?: unknown, headers: Record<string, string> = {}): Promise<Res> => {
    const res = await app.request(path, {
      method,
      headers: { "content-type": "application/json", ...headers },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await res.text();
    return { status: res.status, headers: res.headers, json: text ? JSON.parse(text) : null };
  };
  const balance = (id: string) => (db.prepare("SELECT balance_iqd b FROM users WHERE id=?").get(id) as { b: number }).b;
  const txCount = () => (db.prepare("SELECT COUNT(*) c FROM transactions").get() as { c: number }).c;
  const mint = async (session: string, payload: Payload): Promise<string> => {
    const r = await call("POST", "/confirmation-tokens", { session_id: session, payload });
    if (r.status !== 201) throw new Error(`mint failed: ${r.status} ${JSON.stringify(r.json)}`);
    return r.json.token as string;
  };
  return { db, app, clock, call, balance, txCount, mint };
}
export type Wallet = ReturnType<typeof makeWallet>;

export const transferPayload = (to: string, amount: number, from = DEMO_USER): Payload => ({ kind: "transfer", from, to_id: to, amount_iqd: amount, fee_iqd: p2pFee(amount) });
export const billPayload = (biller: string, ref: string, amount: number, fee: number, from = DEMO_USER): Payload => ({ kind: "bill_pay", from, biller_id: biller, account_ref: ref, amount_iqd: amount, fee_iqd: fee });

export const transferBody = (session: string, to: string, amount: number, from = DEMO_USER) => ({ session_id: session, from, to_contact: to, amount_iqd: amount });
export const exec = (w: Wallet, path: "/transfers" | "/bill-payments", key: string | null, token: string | null, body: unknown) =>
  w.call("POST", path, body, { ...(key ? { "idempotency-key": key } : {}), ...(token ? { "x-confirmation-token": token } : {}) });

export { payloadHash };
