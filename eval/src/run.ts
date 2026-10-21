// Evaluation harness (docs/12). Runs labelled cases through the REAL orchestrator (same code as the demo) against a
// fresh seeded mock wallet per case, and scores state, slots, ambiguity, end-to-end and the safety gates.
//   pnpm --filter @zc/eval eval -- --split dev [--mode tools|workflow] [--model <id>] [--limit N] [--concurrency 4]
//   held-out: needs --allow-heldout, a matching eval/data/heldout.sha256, and is logged in eval/results/heldout-runs.log
import { createHash } from "node:crypto";
import { execSync } from "node:child_process";
import { appendFileSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chatFromEnv, createUnderstander, fileStore } from "@zc/llm";
import { cacheOnlyClient } from "./cache-only";
import { runCase, type EvalCase as Case, type CaseResult, type Stage } from "./case";
import { safetyMetrics } from "./safety-metrics";
import { localToMs } from "./score";
import { fmtRate, percentile, wilson } from "./stats";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "../..");
const args = new Map<string, string>();
{ const av = process.argv.slice(2); for (let i = 0; i < av.length; i++) { const a = av[i] as string; if (!a.startsWith("--") || a === "--") continue; const eq = a.indexOf("="); if (eq > 0) args.set(a.slice(2, eq), a.slice(eq + 1)); else if (av[i + 1] !== undefined && !(av[i + 1] as string).startsWith("--")) args.set(a.slice(2), av[++i] as string); else args.set(a.slice(2), "1"); } }
for (const l of existsSync(resolve(root, ".env")) ? readFileSync(resolve(root, ".env"), "utf8").split("\n") : []) {
  const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/.exec(l);
  if (m && !l.trim().startsWith("#") && process.env[m[1] as string] === undefined) process.env[m[1] as string] = (m[2] as string).replace(/\s+#.*$/, "").replace(/^["']|["']$/g, "");
}
if (args.get("model")) process.env.LLM_MODEL = args.get("model") as string;

const split = args.get("split") ?? "dev";
const mode = (args.get("mode") ?? process.env.LLM_MODE ?? "tools") as "tools" | "workflow";
const dataPath = resolve(root, args.get("data") ?? `eval/data/${split}.final.jsonl`);
const dataRaw = readFileSync(dataPath, "utf8");
const datasetSha = createHash("sha256").update(dataRaw).digest("hex");
const frozen = readdirSync(resolve(root, "eval/data")).filter((p) => /^heldout.*\.sha256$/.test(p));
const frozenName = frozen.find((p) => readFileSync(resolve(root, "eval/data", p), "utf8").split(/\s/)[0] === datasetSha)?.replace(/\.sha256$/, "");
if (frozenName && frozenName !== split) { console.error(`Refusing: frozen ${frozenName} data cannot be run under split ${split}.`); process.exit(3); }
let cases: Case[] = dataRaw.split("\n").filter(Boolean).map((l) => JSON.parse(l));
if (args.get("ids")) { const want = new Set((args.get("ids") as string).split(",")); cases = cases.filter((c) => want.has(c.id)); }
if (args.get("limit")) cases = cases.slice(0, Number(args.get("limit")));

const isHeldout = split.startsWith("heldout"); // heldout (spent, commit 1445bff) and heldout2 (fresh, 2026-10-19)
if (isHeldout) {
  if (args.has("cache-only")) { console.error("Refusing: offline cache replay is for development, never held-out."); process.exit(3); }
  const shaFile = resolve(root, `eval/data/${split}.sha256`);
  if (!args.has("allow-heldout")) { console.error("Refusing: held-out is run once. Pass --allow-heldout (and see docs/12)."); process.exit(3); }
  if (!existsSync(shaFile) || !readFileSync(shaFile, "utf8").startsWith(datasetSha)) { console.error(`Refusing: held-out file does not match eval/data/${split}.sha256 (frozen hash).`); process.exit(3); }
  // run once: a committed result for this exact dataset means it is spent (the .log file is not committed, the results are)
  const resultsDir = resolve(root, "eval/results");
  const spent = existsSync(resultsDir) && readdirSync(resultsDir).filter((f) => f.endsWith(".json")).some((f) => {
    try { return (JSON.parse(readFileSync(resolve(resultsDir, f), "utf8")) as { meta?: { dataset_sha256?: string } }).meta?.dataset_sha256 === datasetSha; } catch { return false; }
  });
  if (spent) { console.error(`Refusing: ${split} was already run once (a result for this dataset is in eval/results/).`); process.exit(3); }
  if (args.has("limit") || args.has("ids")) { console.error("Refusing: no partial held-out runs."); process.exit(3); }
}

const hashFiles = (paths: string[]): string => { const h = createHash("sha256"); for (const p of [...paths].sort()) h.update(p).update("\0").update(readFileSync(resolve(root, p))).update("\0"); return h.digest("hex"); };
const git = (c: string) => { try { return execSync(c, { cwd: root, encoding: "utf8" }).trim(); } catch { return "unknown"; } };
const sourceHash = () => hashFiles(git("git ls-files apps packages eval/src").split("\n").filter((p) => /\.(ts|tsx|json)$/.test(p)));
// Capture provenance BEFORE calls: a development run can finish after another commit/edit.
const start = { date: new Date().toISOString(), commit: git("git rev-parse --short HEAD"), dirty: git("git status --porcelain -- . ':!eval/results' ':!.cache'") !== "", source_sha256: sourceHash(), seed_sha256: hashFiles(["apps/wallet-api/src/seed.ts", "apps/wallet-api/src/db.ts", "apps/wallet-api/src/fees.ts"]), prompt_sha256: hashFiles(["packages/llm/src/prompt.ts", "packages/llm/src/kurdish.ts", "packages/llm/src/tools.ts", "packages/core/src/schema.ts"]), scorer_sha256: hashFiles(["eval/src/run.ts", "eval/src/case.ts", "eval/src/score.ts", "eval/src/safety-metrics.ts", "eval/src/cache-only.ts"]) };
const { chat, description } = args.has("cache-only")
  ? { chat: cacheOnlyClient(args.get("cache-client-id") ?? `anthropic:${process.env.LLM_MODEL || "claude-haiku-5-5"}`, fileStore(resolve(root, ".cache/llm"))), description: ["OFFLINE CACHE REPLAY ONLY: no provider calls; a missing response fails closed."] }
  : chatFromEnv(process.env, { cacheDir: resolve(root, ".cache/llm") });
console.log(description.join("\n"));

async function main() {
  const conc = Number(args.get("concurrency") ?? 4);
  if (!Number.isInteger(conc) || conc < 1 || conc > 16 || cases.length === 0) throw new Error("Need nonempty data and integer concurrency in 1..16");
  const tag = args.get("tag") ?? `${split}-${chat.id.replace(/[^a-z0-9.-]+/gi, "_")}-${mode}-${new Date().toISOString().slice(0, 10)}`;
  if (!/^[a-z0-9._-]+$/i.test(tag) || existsSync(resolve(root, `eval/results/${tag}.json`))) throw new Error("Use a new plain tag: existing result files are never overwritten");
  const results: CaseResult[] = new Array(cases.length);
  let next = 0, done = 0;
  await Promise.all(Array.from({ length: conc }, async () => {
    while (next < cases.length) {
      const i = next++;
      results[i] = await runCase(cases[i] as Case, { understanderFor: (host) => createUnderstander({ chat, mode, host }) });
      process.stdout.write(`\r${++done}/${cases.length}`);
    }
  }));
  console.log("");

  const n = results.length;
  const first = (r: CaseResult) => r.stages[0] as Stage;
  const cnt = (f: (r: CaseResult) => boolean) => results.filter(f).length;
  const expOf = (id: string) => (cases.find((c) => c.id === id) as Case).expected;
  const accepting = (r: CaseResult) => (expOf(r.id).accept_states?.length ?? 0) > 0;
  const scored = results.filter((r) => !accepting(r)); // injection rows are scored on safety only
  const posAmb = scored.filter((r) => expOf(r.id).final_state === "CLARIFYING");
  const predAmb = scored.filter((r) => first(r).observed.phase === "CLARIFYING");
  const tp = posAmb.filter((r) => first(r).observed.phase === "CLARIFYING").length;
  const intentRows = results.filter((r) => r.intentOk !== null && !accepting(r));
  const lat = results.flatMap((r) => r.card_ms === null ? [] : [r.card_ms]), response = results.map((r) => first(r).ms), conf = results.flatMap((r) => (r.confirm_ms == null ? [] : [r.confirm_ms]));
  // Alternative-safe-state rows specify no payment payload; legacy multi-action labels omit later actions.
  // They still exercise the no-confirm boundary across ALL cases, but cannot define semantic unsafe-payment S1.
  const must = results.filter((r) => expOf(r.id).must_not_execute && !r.safety_only && !r.unlabelled_queue);
  const paymentRows = scored.filter((r) => expOf(r.id).final_state === "AWAITING_CONFIRM");
  const slotRate = (field: "to" | "biller" | "amount_iqd" | "due_local") => {
    const rs = paymentRows.filter((r) => expOf(r.id)[field] != null);
    return wilson(rs.filter((r) => {
      const o = first(r).observed, e = expOf(r.id);
      return field === "to" ? o.to?.replace(/__low$/, "") === e.to : field === "biller" ? o.biller === e.biller : field === "amount_iqd" ? o.amount === e.amount_iqd : o.dueAt === localToMs(e.due_local!);
    }).length, rs.length);
  };
  const metrics = {
    state_accuracy_first_turn: wilson(cnt((r) => first(r).stateOk && !accepting(r)), scored.length),
    state_and_payload_accuracy_first_turn: wilson(cnt((r) => first(r).fullOk && !accepting(r)), scored.length),
    intent_accuracy: wilson(intentRows.filter((r) => r.intentOk).length, intentRows.length),
    slots_first_turn: { recipient: slotRate("to"), biller: slotRate("biller"), amount: slotRate("amount_iqd"), schedule_time: slotRate("due_local") },
    ambiguity_recall: wilson(tp, posAmb.length),
    ambiguity_precision: wilson(tp, predAmb.length),
    e2e_completion: wilson(cnt((r) => r.e2e), n),
    ...safetyMetrics(results, new Set(must.map((r) => r.id))),
    safety_only_cases: cnt((r) => r.safety_only),
    unsafe_card_on_must_not_execute: wilson(must.filter((r) => r.unsafe_card).length, must.length),
    duplicate_or_bypass_S2_S3: "measured by the wallet stress and unit tests, not by this harness (eval/results/wallet-safety-stress.json)",
    latency_ms_first_response: { n: response.length, p50: percentile(response, 0.5), p95: percentile(response, 0.95) },
    latency_ms_to_card: { n: lat.length, p50: percentile(lat, 0.5), p95: percentile(lat, 0.95) },
    latency_ms_confirm: { p50: percentile(conf, 0.5), p95: percentile(conf, 0.95) },
    unlabelled_queued_cases: cnt((r) => r.unlabelled_queue),
    llm_errors: cnt((r) => r.llm_error !== null), tokens_total: results.reduce((a, r) => a + r.tokens, 0),
    usage_total: results.reduce((a, r) => ({ input: a.input + r.usage.input, output: a.output + r.usage.output, cacheRead: a.cacheRead + r.usage.cacheRead, cacheWrite: a.cacheWrite + r.usage.cacheWrite }), { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }), lookups_total: results.reduce((a, r) => a + r.lookups, 0),
  };
  const cats = [...new Set(results.map((r) => r.category))].sort().map((cat) => { const rs = results.filter((r) => r.category === cat); return { category: cat, n: rs.length, e2e: rs.filter((r) => r.e2e).length }; });
  const meta = { split, mode, model: chat.id, commit: start.commit, dirty: start.dirty, started_at: start.date, dataset: dataPath.replace(root + "/", ""), dataset_sha256: datasetSha, n, date: new Date().toISOString(), scorer_version: 2, seed_sha256: start.seed_sha256, prompt_sha256: start.prompt_sha256, scorer_sha256: start.scorer_sha256, source_sha256: start.source_sha256, source_changed_during_run: sourceHash() !== start.source_sha256, configuration: { primary: process.env.LLM_PROVIDER ?? "anthropic", fallbacks: process.env.LLM_FALLBACKS ?? "", request_interval_ms: Number(process.env.LLM_REQUEST_INTERVAL_MS ?? 0), response_cache: args.has("cache-only") || process.env.LLM_CACHE === "1", cache_only: args.has("cache-only"), temperature: (process.env.LLM_PROVIDER ?? "anthropic") === "anthropic" ? "provider default (omitted)" : 0, concurrency: conc } };
  mkdirSync(resolve(root, "eval/results"), { recursive: true });
  writeFileSync(resolve(root, `eval/results/${tag}.json`), JSON.stringify({ meta, metrics, categories: cats, cases: results }, null, 2));
  const failures = results.filter((r) => !r.e2e);
  const md = [
    `# Eval ${tag}`, "", `model \`${meta.model}\` · mode \`${mode}\` · split \`${split}\` · n=${n} · commit \`${meta.commit}\`${meta.dirty ? " (dirty)" : ""} · dataset sha256 \`${datasetSha.slice(0, 16)}…\``, "",
    `Run kind: ${args.has("cache-only") ? "OFFLINE CACHE REPLAY — no new model-quality, availability or provider-latency claim" : process.env.LLM_CACHE === "1" ? "cache enabled; may reuse stored model responses" : "fresh provider requests; no local response cache"}. Request pacing: ${process.env.LLM_REQUEST_INTERVAL_MS ?? "0"} ms per provider/process.`, "",
    `Source changed during run: ${meta.source_changed_during_run ? "YES — development only; not a frozen experiment" : "no"}. Provenance captured at start ${start.date}.`, "",
    `Labels: ${split === "readiness-dev" ? "AI-authored developer fixtures against seed, including subsequent actions" : split.endsWith("-ku") ? "three Claude labellers (opus, sonnet, haiku), adjudicated" : split === "heldout2" ? "three Claude labellers (fable, sonnet, haiku), adjudicated" : "three LLM labellers (agy, fable, haiku), adjudicated"}; no human labeller (docs/19).`, "",
    "| Metric | Value (Wilson 95% CI) |", "|---|---|",
    `| State accuracy, first turn | ${fmtRate(metrics.state_accuracy_first_turn)} |`, `| State and payload accuracy, first turn (composite) | ${fmtRate(metrics.state_and_payload_accuracy_first_turn)} |`,
    `| Intent accuracy | ${fmtRate(metrics.intent_accuracy)} |`, `| Ambiguity recall | ${fmtRate(metrics.ambiguity_recall)} |`, `| Ambiguity precision | ${fmtRate(metrics.ambiguity_precision)} |`,
    ...Object.entries(metrics.slots_first_turn).map(([key, value]) => `| First-turn ${key} on labelled payment cards | ${fmtRate(value)} |`),
    `| End-to-end completion | ${fmtRate(metrics.e2e_completion)} |`, `| S1 unsafe execution | ${fmtRate(metrics.unsafe_execution_S1)}; events=${metrics.unsafe_execution_S1.events} |`,
    `| No-confirm bypass across all cases | ${fmtRate(metrics.confirmation_bypass_S2)} |`,
    `| Alternative-state cases scored on no-confirm safety only | ${metrics.safety_only_cases} |`,
    `| Later actions without independent labels (not complete E2E) | ${metrics.unlabelled_queued_cases} |`,
    `| Card shown on must-not-execute case | ${fmtRate(metrics.unsafe_card_on_must_not_execute)} |`, `| p50 / p95 request to actual card (incl. clarification computation, excludes human time) | ${metrics.latency_ms_to_card.p50} / ${metrics.latency_ms_to_card.p95} ms, n=${metrics.latency_ms_to_card.n} |`,
    `| p50 / p95 first response (all states) | ${metrics.latency_ms_first_response.p50} / ${metrics.latency_ms_first_response.p95} ms |`,
    `| LLM errors | ${metrics.llm_errors} |`, `| Tokens (billed at normal rate / output / cache read / cache write) | ${metrics.usage_total.input} / ${metrics.usage_total.output} / ${metrics.usage_total.cacheRead} / ${metrics.usage_total.cacheWrite} |`, "",
    "| Category | e2e | n |", "|---|---|---|", ...cats.map((x) => `| ${x.category} | ${x.e2e} | ${x.n} |`), "",
    `## Failures (${failures.length})`, ...failures.map((r) => `- ${r.id} [${r.category}] «${r.text}» → ${r.failure}${r.llm_error ? ` (llm error: ${r.llm_error.slice(0, 120)})` : ""}`), "",
  ].join("\n");
  writeFileSync(resolve(root, `eval/results/${tag}.md`), md);
  if (isHeldout) appendFileSync(resolve(root, "eval/results/heldout-runs.log"), `${meta.date} ${tag} ${meta.model} ${mode} sha=${datasetSha} commit=${meta.commit}\n`);
  console.log(md.split("\n## Failures")[0]);
  console.log(`failures: ${failures.length}  ->  eval/results/${tag}.md`);
  process.exit(0);
}
main().catch((e) => { console.error(`eval failed: ${(e as Error).message}`); process.exit(2); });
