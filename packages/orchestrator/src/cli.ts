// Interactive command-line demo. In-process mock wallet + orchestrator + the real model (or --fake).
//   pnpm --filter @zc/orchestrator cli                 real model (needs ANTHROPIC_API_KEY in .env)
//   pnpm --filter @zc/orchestrator cli -- --fake       offline demo sentences, no key
//   --mode=tools|workflow   --user=u_001
import { existsSync, readFileSync } from "node:fs";
import { createInterface } from "node:readline";
import { resolve } from "node:path";
import { applySeed, createApp, openDb, DEMO_USER, SEED_NOW } from "@zc/wallet-api";
import { chatFromEnv, createUnderstander, type Understander } from "@zc/llm";
import { DEMO_SCRIPT, createScriptedUnderstander } from "./demo-script";
import { appFetch, createOrchestrator, WalletClient, type Reply } from "./index";

const args = new Map(process.argv.slice(2).filter((a) => a.startsWith("--")).map((a) => { const [k, v] = a.slice(2).split("="); return [k as string, v ?? "1"] as const; }));

/** Minimal .env loader (no dependency). Real environment variables win. */
function loadDotEnv(path: string): void {
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/.exec(line);
    if (m && !line.trim().startsWith("#") && process.env[m[1] as string] === undefined) process.env[m[1] as string] = (m[2] as string).replace(/\s+#.*$/, "").replace(/^["']|["']$/g, "");
  }
}
let dir = process.cwd();
for (let i = 0; i < 4; i++) { if (existsSync(resolve(dir, ".env"))) { loadDotEnv(resolve(dir, ".env")); break; } dir = resolve(dir, ".."); }

const C = { dim: "\x1b[2m", bold: "\x1b[1m", green: "\x1b[32m", red: "\x1b[31m", yellow: "\x1b[33m", cyan: "\x1b[36m", off: "\x1b[0m" };
const useColor = process.stdout.isTTY;
const c = (code: keyof typeof C, s: string) => (useColor ? `${C[code]}${s}${C.off}` : s);

const db = openDb();
applySeed(db);
let clock = SEED_NOW;
const app = createApp({ db, now: () => clock, demoMode: true, adminSecret: "demo" });
const wallet = new WalletClient({ baseUrl: "http://wallet.local", fetch: appFetch(app), timeoutMs: 3000 });
const mode = (args.get("mode") ?? process.env.LLM_MODE ?? "tools") as "tools" | "workflow";

let understanderFor: (host: Parameters<typeof createUnderstander>[0]["host"]) => Understander;
if (args.has("fake")) {
  console.log(c("yellow", "FAKE model: only these sentences are understood:\n  " + Object.keys(DEMO_SCRIPT).join("\n  ")));
  understanderFor = () => createScriptedUnderstander();
} else {
  const { chat, description } = chatFromEnv(process.env, { cacheDir: resolve(dir, ".cache/llm") });
  console.log(c("dim", description.join("\n")));
  understanderFor = (host) => createUnderstander({ chat, mode, ...(host ? { host } : {}) });
}
const orch = createOrchestrator({ wallet, understanderFor: understanderFor as never, userId: args.get("user") ?? DEMO_USER, now: () => clock, retryDelayMs: 150 });
const SESSION = "cli";
let last: Reply | null = null;

function show(r: Reply): void {
  last = r;
  for (const m of r.messages) {
    const tag = m.kind === "success" ? c("green", "✔ ") : m.kind === "error" ? c("red", "✖ ") : m.kind === "ask" ? c("cyan", "? ") : "  ";
    console.log(`${tag}${m.text}`);
  }
  r.candidates.forEach((x, i) => console.log(c("cyan", `   ${i + 1}) ${x.name}  ${x.masked}${x.relation ? "  (" + x.relation + ")" : ""}`)));
  if (r.card) {
    const k = r.card;
    const w = 44;
    const line = (s: string) => `│ ${s.padEnd(w)} │`;
    console.log("┌" + "─".repeat(w + 2) + "┐");
    console.log(line(`${k.title}           ${k.nothing_sent}`));
    if (k.recipient) console.log(line(`إلى      ${k.recipient.name} · ${k.recipient.masked}`));
    if (k.biller) console.log(line(`الفاتورة  ${k.biller.name}`));
    console.log(line(`المبلغ   ${k.amount_text}  (${k.amount_words})`));
    console.log(line(`الرسوم   ${k.fee_text}`));
    console.log(line(`الرصيد   ${k.balance_before_iqd.toLocaleString("en-US")} → ${k.balance_after_iqd.toLocaleString("en-US")} د.ع`));
    if (k.first_time_recipient) console.log(line("⚠ أول مرة تدز لهذا الشخص"));
    console.log(line(`[${k.labels.confirm}] = :confirm     [${k.labels.cancel}] = :cancel`));
    console.log("└" + "─".repeat(w + 2) + "┘");
  }
  console.log(c("dim", `   phase=${r.phase}${r.trace.model ? `  model=${r.trace.model}` : ""}${r.trace.tool_calls?.length ? `  lookups=${r.trace.tool_calls.length}` : ""}`));
}

const HELP = `commands: :confirm  :cancel  :pick N  :tick  :why  :wallet  :fault timeout|5xx|biller  :advance SEC  :reset  :quit
anything else is sent as a message. A typed «اي» never confirms: use :confirm (that is the Confirm button).`;

async function command(line: string): Promise<boolean> {
  const [cmd, arg] = line.slice(1).trim().split(/\s+/);
  switch (cmd) {
    case "quit": case "q": return false;
    case "help": console.log(HELP); break;
    case "confirm": show(last?.card ? await orch.confirm(SESSION, last.card.card_id) : await orch.confirm(SESSION, "no-card")); break;
    case "cancel": show(await orch.cancel(SESSION)); break;
    case "tick": show(await orch.tick(SESSION)); break;
    case "pick": { const id = last?.candidates[Number(arg) - 1]?.id; show(id ? await orch.turn(SESSION, { choice: id }) : await orch.turn(SESSION, { text: "؟" })); break; }
    case "advance": clock += Number(arg ?? 0) * 1000; console.log(c("dim", `clock +${arg}s`)); break;
    case "why": console.log(JSON.stringify(last?.trace ?? {}, null, 2)); break;
    case "wallet": {
      const u = (await wallet.user(DEMO_USER)).json;
      console.log(`balance ${u.balance_iqd.toLocaleString("en-US")} IQD`);
      for (const t of (await wallet.transactions(DEMO_USER, { limit: 3 })).json.transactions) console.log(`  ${t.reference}  ${t.amount_iqd.toLocaleString("en-US")}  ${t.counterparty.name}`);
      break;
    }
    case "fault": {
      const body = arg === "timeout" ? { mode: "timeout_after_commit", count: 1, sleep_ms: 5000 } : arg === "5xx" ? { mode: "error_5xx_before_commit", count: 1 } : { mode: "biller_down", biller: "b_generator" };
      await app.request("/admin/faults", { method: "POST", headers: { "x-admin-secret": "demo", "content-type": "application/json" }, body: JSON.stringify(body) });
      console.log(c("yellow", `fault armed: ${JSON.stringify(body)}`));
      break;
    }
    case "reset": await app.request("/admin/reset", { method: "POST", headers: { "x-admin-secret": "demo" } }); orch.reset(SESSION); last = null; console.log(c("dim", "reset to seed")); break;
    default: console.log(HELP);
  }
  return true;
}

console.log(c("bold", "\nZainCash Bill Pay & Transfer Agent (mock wallet, synthetic data)  mode=" + (args.has("fake") ? "fake" : mode)));
console.log(HELP + "\n");
async function handle(line: string): Promise<boolean> {
  if (!line) return true;
  try {
    if (line.startsWith(":")) return await command(line);
    show(await orch.turn(SESSION, { text: line }));
  } catch (e) { console.log(c("red", `error: ${(e as Error).message}`)); }
  return true;
}

if (!process.stdin.isTTY) {
  // piped input (scripts, demos): read everything first, then run the lines in order
  (async () => {
    for (const raw of readFileSync(0, "utf8").split("\n")) {
      const line = raw.trim();
      if (line) console.log(c("dim", `› ${line}`));
      if (!(await handle(line))) break;
    }
    await new Promise((r) => setTimeout(r, 6000 * Number(args.has("settle")))); // let slow injected responses finish
    process.exit(0);
  })();
} else {
  const rl = createInterface({ input: process.stdin, output: process.stdout, prompt: "› " });
  let chain: Promise<unknown> = Promise.resolve();
  rl.prompt();
  rl.on("line", (raw) => {
    chain = chain.then(async () => {
      if (!(await handle(raw.trim()))) { rl.close(); return; }
      rl.prompt();
    });
  });
  rl.on("close", () => chain.then(() => process.exit(0)));
}
