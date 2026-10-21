// Opt-in checks against the running REAL web app. Only synthetic per-session wallets are touched.
// pnpm --filter @zc/eval check:web -- --base http://localhost:3000 [--audio /public/sample.wav] [--tag unique-name]
import assert from "node:assert/strict";
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const av = process.argv.slice(2), arg = (name: string) => av[av.indexOf(`--${name}`) + 1];
const base = av.includes("--base") ? arg("base")! : "http://localhost:3000";
const resultsDir = fileURLToPath(new URL("../results/", import.meta.url));
const tag = av.includes("--tag") ? arg("tag")! : `readiness-web-${new Date().toISOString().replace(/[:.]/g, "-")}`;
if (!/^[a-z0-9._-]+$/i.test(tag) || existsSync(resolve(resultsDir, `${tag}.json`))) throw new Error("Use a new plain result tag; existing evidence is never overwritten");
const checks: { name: string; pass: boolean; ms: number; error?: string }[] = [];
const models = new Set<string>();
let diagnoses: unknown[] = [];
const post = async (path: string, body: unknown) => {
  const r = await fetch(`${base}${path}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body), signal: AbortSignal.timeout(60_000) });
  assert.equal(r.status, 200, `${path} HTTP ${r.status}`);
  const d = await r.json() as any;
  if (d.reply?.trace?.model) models.add(d.reply.trace.model);
  if (d.reply?.trace?.llm_error || d.reply?.phase === "NEEDS_REPHRASE") diagnoses.push({ path, phase: d.reply.phase, llm_error: d.reply.trace?.llm_error, intent: d.reply.trace?.intent });
  return d;
};
const sid = () => `readiness-${randomUUID()}`;
const turn = (session_id: string, text: string) => post("/api/turn", { session_id, text });
const confirm = (session_id: string, card_id: string) => post("/api/confirm", { session_id, card_id });
const admin = (session_id: string, body: object) => post("/api/admin", { session_id, ...body });
const check = async (name: string, fn: () => Promise<void>) => {
  const start = Date.now();
  diagnoses = [];
  try { await fn(); checks.push({ name, pass: true, ms: Date.now() - start }); console.log(`PASS ${name}`); }
  catch (e) { const error = `${(e as Error).message.slice(0, 300)}${diagnoses.length ? `; diagnoses=${JSON.stringify(diagnoses)}` : ""}`; checks.push({ name, pass: false, ms: Date.now() - start, error }); console.log(`FAIL ${name}: ${error}`); }
};

await check("two Ahmeds ask; typed yes does not pay; confirmation and replay debit once", async () => {
  const s = sid(), first = await turn(s, "دز خمسين ألف لأحمد");
  assert.equal(first.reply.phase, "CLARIFYING"); assert.equal(first.wallet.balance_iqd, 200000);
  assert.equal(first.reply.candidates.length, 2);
  const chosen = await post("/api/turn", { session_id: s, choice: "c_ahmed_ali" });
  assert.equal(chosen.reply.card.amount_iqd, 50000);
  const yes = await turn(s, "اي"); assert.equal(yes.wallet.balance_iqd, 200000);
  const card = chosen.reply.card.card_id;
  const [a, b] = await Promise.all([confirm(s, card), confirm(s, card)]);
  assert.equal(a.wallet.balance_iqd, 149700); assert.equal(b.wallet.balance_iqd, 149700);
  assert.equal(a.reply.result.reference, b.reply.result.reference);
});
await check("editing a pending amount invalidates the old card", async () => {
  const s = sid(), first = await turn(s, "دز خمسين ألف لعلي كريم");
  const next = await turn(s, "لا قصدي دز 25 الف لعلي كريم");
  assert.equal(next.reply.card.amount_iqd, 25000);
  const stale = await confirm(s, first.reply.card.card_id); assert.equal(stale.wallet.balance_iqd, 200000);
  const paid = await confirm(s, next.reply.card.card_id); assert.equal(paid.wallet.balance_iqd, 174700);
});
await check("timeout after commit returns one debit and one stable receipt", async () => {
  const s = sid(); await admin(s, { action: "fault", kind: "timeout" });
  const c = await turn(s, "دز خمسين ألف لعلي كريم");
  const r = await confirm(s, c.reply.card.card_id);
  assert.equal(r.wallet.balance_iqd, 149700); assert.ok(r.reply.result.reference);
  assert.equal((await confirm(s, c.reply.card.card_id)).wallet.balance_iqd, 149700);
});
await check("biller down and insufficient funds keep the wallet unchanged", async () => {
  const s = sid(); await admin(s, { action: "fault", kind: "biller_down" });
  const r = await turn(s, "ادفع المولدة");
  assert.equal(r.reply.phase, "FAILED_SAFE"); assert.equal(r.reply.card, null); assert.equal(r.wallet.balance_iqd, 200000);
  const low = await turn(sid(), "دز مليون لأمي"); assert.equal(low.reply.phase, "FAILED_SAFE"); assert.equal(low.wallet.balance_iqd, 200000);
});
await check("two actions require two approvals with independent amounts", async () => {
  const s = sid(), first = await turn(s, "ادفع الكهرباء ودز لعلي كريم عشرة آلاف");
  assert.equal(first.reply.card.amount_iqd, 37500);
  const next = await confirm(s, first.reply.card.card_id);
  assert.equal(next.wallet.balance_iqd, 162500); assert.equal(next.reply.card.amount_iqd, 10000);
  const done = await confirm(s, next.reply.card.card_id); assert.equal(done.wallet.balance_iqd, 152200);
});
await check("scheduled transfer: approval moves nothing; due runner pays once", async () => {
  const s = sid(), c = await turn(s, "دز خمسين ألف لعلي كريم بعد ساعة");
  assert.ok(c.reply.card.schedule); assert.equal(c.reply.card.amount_iqd, 50000);
  const scheduled = await confirm(s, c.reply.card.card_id);
  assert.equal(scheduled.wallet.balance_iqd, 200000); assert.ok(scheduled.reply.result.scheduled);
  const due = await admin(s, { action: "advance", ms: 2 * 3_600_000 }); assert.equal(due.wallet.balance_iqd, 149700);
  const again = await admin(s, { action: "advance", ms: 3_600_000 }); assert.equal(again.wallet.balance_iqd, 149700);
});
await check("vague scheduled time asks for an hour", async () => {
  const r = await turn(sid(), "ادفع المولدة باچر بعد الظهر");
  assert.equal(r.reply.phase, "CLARIFYING"); assert.equal(r.reply.card, null); assert.equal(r.wallet.balance_iqd, 200000);
});
await check("bad WAV fails without affecting the typed-text path", async () => {
  const s = sid(), f = new FormData(); f.set("session_id", s); f.set("file", new Blob(["not audio"]), "bad.wav");
  const r = await fetch(`${base}/api/voice`, { method: "POST", body: f, signal: AbortSignal.timeout(20_000) });
  assert.equal(r.status, 400);
  const text = await turn(s, "شكد رصيدي"); assert.equal(text.reply.phase, "ANSWERED"); assert.equal(text.wallet.balance_iqd, 200000);
});
if (av.includes("--audio")) await check("real ASR upload is read back before the model; accepting non-payment speech sends nothing", async () => {
  const s = sid(), f = new FormData(); f.set("session_id", s); f.set("lang", "ku");
  f.set("file", new Blob([readFileSync(arg("audio")!)]), "public-sample.wav");
  const response = await fetch(`${base}/api/voice`, { method: "POST", body: f, signal: AbortSignal.timeout(60_000) });
  assert.equal(response.status, 200); const r = await response.json() as any;
  assert.ok(r.reply.readback?.text); assert.equal(r.reply.trace.model, undefined); assert.equal(r.wallet.balance_iqd, 200000);
  const accepted = await post("/api/turn", { session_id: s, lang: "ku", readback: "accept" });
  assert.equal(accepted.reply.card, null); assert.equal(accepted.wallet.balance_iqd, 200000);
});
mkdirSync(resultsDir, { recursive: true });
writeFileSync(resolve(resultsDir, `${tag}.json`), JSON.stringify({ date: new Date().toISOString(), base, models: [...models], checks, note: "Live local-web transport/behaviour checks; public audio is not a consented payment-accuracy set. Screenshots/rehearsal video live in .cache/readiness." }, null, 2));
process.exitCode = checks.every((c) => c.pass) ? 0 : 1;
