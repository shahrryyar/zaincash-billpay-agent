// Re-score a STORED results file with the current scorer (score.ts). Offline: no orchestrator, wallet or model is run.
// It can only tighten a stored verdict (rescored e2e = stored e2e AND every stage passes the current stage checks):
// wallet/ledger outcomes are taken from the file as recorded.
//   pnpm --filter @zc/eval rescore -- eval/results/<run>.json [--data eval/data/<split>.final.jsonl]
//   writes eval/results/<run>-rescored.json and .md (never overwrites)
import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, resolve } from "node:path";
import type { EvalCase } from "./case";
import { ambiguityMetrics, categoryTable, isAlternative } from "./metrics";
import { scoreStage, type Expected, type Observed } from "./score";
import { flag, positional, repoRoot, userPath } from "./cli-path";
import { fmtRate, wilson } from "./stats";

type StoredStage = { text: string; observed: Observed; stateOk?: boolean; fullOk: boolean; why?: string | null; reply?: string };
type StoredCase = { id: string; category: string; e2e: boolean; stages: StoredStage[] };
type Stored = { meta: Record<string, unknown> & { dataset_sha256?: string }; cases: StoredCase[] };
/** Stage replies were stored truncated (300 chars before scorer 2.0, 500 after): a leak past that point is invisible here. */
const TRUNCATION_AT = 300;

/** The label each stored stage was scored against: first message, then followups, «(confirm)» stages use after_confirm. */
export function stageExpectations(c: EvalCase, stages: { text: string }[]): (Expected | undefined)[] {
  let f = 0, a = 0;
  return stages.map((s, i) => (s.text === "(confirm)" ? c.after_confirm?.[a++] : i === 0 ? c.expected : c.followups?.[f++]?.expected));
}

export function rescoreStored(stored: Stored, data: EvalCase[]) {
  const byId = new Map(data.map((c) => [c.id, c]));
  const notes = { failure_code_checks_skipped: 0, stages_without_label: 0, stages_without_reply: 0, replies_possibly_truncated: 0, cases_missing_from_data: 0 };
  const changed: { id: string; category: string; why: string }[] = [];
  const rows = stored.cases.map((sc) => {
    const c = byId.get(sc.id);
    if (!c) { notes.cases_missing_from_data++; return { id: sc.id, category: sc.category, e2e: sc.e2e, exp: undefined, first: sc.stages[0] }; }
    const exps = stageExpectations(c, sc.stages);
    const why: string[] = [];
    sc.stages.forEach((s, i) => {
      let exp = exps[i];
      if (!exp) { notes.stages_without_label++; if (!s.fullOk) why.push(s.why ?? "stored stage failed"); return; }
      const reply = s.observed.reply ?? s.reply;
      if (reply === undefined) notes.stages_without_reply++;
      else if (reply.length >= TRUNCATION_AT) notes.replies_possibly_truncated++;
      // older files did not record the wallet's failure reason: skip that check rather than guess it
      if (exp.failure_code && !("failureCode" in s.observed)) { const { failure_code: _skip, ...rest } = exp; exp = rest; notes.failure_code_checks_skipped++; }
      const r = scoreStage(exp, { ...s.observed, ...(reply !== undefined ? { reply } : {}) });
      if (!r.fullOk) why.push(r.why ?? "stage failed");
    });
    const e2e = sc.e2e && why.length === 0;
    if (sc.e2e && !e2e) changed.push({ id: sc.id, category: sc.category, why: why.join("; ") });
    return { id: sc.id, category: sc.category, e2e, exp: c.expected, first: sc.stages[0] };
  });
  const known = rows.filter((r) => r.exp !== undefined) as (typeof rows[number] & { exp: Expected })[];
  const pay = known.filter((r) => !isAlternative(r.exp)), alt = known.filter((r) => isAlternative(r.exp));
  const rate = (rs: { e2e: boolean }[]) => wilson(rs.filter((r) => r.e2e).length, rs.length);
  const storedById = new Map(stored.cases.map((c) => [c.id, c.e2e]));
  return {
    metrics: {
      e2e_stored: wilson(stored.cases.filter((c) => c.e2e).length, stored.cases.length),
      e2e_rescored: rate(rows),
      e2e_payment_rows: rate(pay),
      e2e_payment_rows_stored: wilson(pay.filter((r) => storedById.get(r.id)).length, pay.length),
      e2e_alternative_rows: rate(alt),
      e2e_alternative_rows_stored: wilson(alt.filter((r) => storedById.get(r.id)).length, alt.length),
      ...ambiguityMetrics(pay.filter((r) => r.first).map((r) => ({ exp: r.exp, first: r.first as StoredStage }))),
    },
    categories: categoryTable(rows),
    changed, notes,
  };
}

if (process.argv[1]?.endsWith("rescore.ts")) {
  const argv = process.argv.slice(2), files = positional(argv, ["data"]);
  if (files.length !== 1) { console.error("usage: rescore <results.json> [--data <dataset.jsonl>]"); process.exit(2); }
  const src = userPath(files[0] as string);
  const stored = JSON.parse(readFileSync(src, "utf8")) as Stored;
  const dataPath = flag(argv, "data") ? userPath(flag(argv, "data") as string) : resolve(repoRoot, String(stored.meta.dataset ?? ""));
  if (!existsSync(dataPath)) { console.error(`Refusing: dataset ${dataPath} not found.`); process.exit(3); }
  const raw = readFileSync(dataPath, "utf8"), sha = createHash("sha256").update(raw).digest("hex");
  if (stored.meta.dataset_sha256 !== sha) { console.error("Refusing: the dataset does not match the hash recorded in the results file."); process.exit(3); }
  const out = resolve(dirname(src), `${basename(src, ".json")}-rescored`);
  if (existsSync(`${out}.json`) || existsSync(`${out}.md`)) { console.error(`Refusing: ${out}.json/.md exists (never overwritten).`); process.exit(3); }
  const r = rescoreStored(stored, raw.split("\n").filter(Boolean).map((l) => JSON.parse(l) as EvalCase));
  const meta = { source: src.replace(repoRoot + "/", ""), source_meta: stored.meta, dataset_sha256: sha, rescored_at: new Date().toISOString(), scorer_version: "2.2",
    method: "offline re-score of stored stage observations and replies with the current score.ts; stored wallet outcomes kept; can only lower a stored e2e; no model or orchestrator was run" };
  writeFileSync(`${out}.json`, JSON.stringify({ meta, ...r }, null, 2));
  const m = r.metrics;
  const md = [`# Re-scored ${basename(src)}`, "", meta.method + ".", "",
    "| Metric | Value (Wilson 95% CI) |", "|---|---|",
    `| E2E all rows, as stored | ${fmtRate(m.e2e_stored)} |`, `| E2E all rows, re-scored | ${fmtRate(m.e2e_rescored)} |`,
    `| E2E payment rows (alternative-safe-state rows excluded), re-scored | ${fmtRate(m.e2e_payment_rows)} |`, `| E2E payment rows, as stored | ${fmtRate(m.e2e_payment_rows_stored)} |`,
    `| E2E alternative-safe-state rows, re-scored / as stored | ${fmtRate(m.e2e_alternative_rows)} / ${fmtRate(m.e2e_alternative_rows_stored)} |`,
    `| Ambiguity recall / precision, labelled slot (payment rows) | ${fmtRate(m.ambiguity_recall)} / ${fmtRate(m.ambiguity_precision)} |`,
    `| Ambiguity recall / precision, any slot (payment rows) | ${fmtRate(m.ambiguity_recall_any_slot)} / ${fmtRate(m.ambiguity_precision_any_slot)} |`, "",
    `Notes: ${Object.entries(r.notes).map(([k, v]) => `${k}=${v}`).join(", ")}.`, "",
    "| Category | e2e | n | rate (Wilson 95% CI) |", "|---|---|---|---|", ...r.categories.map((x) => `| ${x.category} | ${x.e2e} | ${x.n} | ${fmtRate(x.ci)} |`), "",
    `## Newly failing (${r.changed.length})`, ...r.changed.map((x) => `- ${x.id} [${x.category}] → ${x.why}`), ""].join("\n");
  writeFileSync(`${out}.md`, md);
  console.log(md);
}
