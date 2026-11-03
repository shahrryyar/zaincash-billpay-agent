// Paired comparison of two stored runs on the same case ids (exact McNemar). Offline: reads two results JSON files, no model calls.
//   pnpm --filter @zc/eval compare -- eval/results/a.json eval/results/b.json [--metric e2e|state|payload] [--payment-rows]
import { readFileSync } from "node:fs";
import { flag, positional, userPath } from "./cli-path";
import { fmtRate, pairedOutcomes } from "./stats";

type Stored = { meta: { dataset_sha256?: string; model?: string; split?: string }; cases: { id: string; e2e: boolean; safety_only?: boolean; stages: { stateOk: boolean; fullOk: boolean }[] }[] };
const metricOf = (m: string) => (c: Stored["cases"][number]): boolean => m === "e2e" ? c.e2e : m === "state" ? !!c.stages[0]?.stateOk : m === "payload" ? !!c.stages[0]?.fullOk : (() => { throw new Error(`unknown --metric ${m}`); })();

export function compareRuns(a: Stored, b: Stored, metric = "e2e", paymentOnly = false) {
  const pick = (s: Stored) => s.cases.filter((c) => !paymentOnly || !c.safety_only).map((c) => ({ id: c.id, ok: metricOf(metric)(c) }));
  return { metric, payment_rows_only: paymentOnly, same_dataset: a.meta.dataset_sha256 === b.meta.dataset_sha256, ...pairedOutcomes(pick(a), pick(b)) };
}

if (process.argv[1]?.endsWith("compare.ts")) {
  const argv = process.argv.slice(2), files = positional(argv, ["metric"]);
  if (files.length !== 2) { console.error("usage: compare <a.json> <b.json> [--metric e2e|state|payload] [--payment-rows]"); process.exit(2); }
  const [a, b] = files.map((f) => JSON.parse(readFileSync(userPath(f), "utf8")) as Stored) as [Stored, Stored];
  const r = compareRuns(a, b, flag(argv, "metric") ?? "e2e", argv.includes("--payment-rows"));
  if (!r.same_dataset) console.warn("WARNING: different dataset hashes; pairing by case id only (labels may differ).");
  if (argv.includes("--payment-rows") && a.cases.some((c) => c.safety_only === undefined)) console.warn("WARNING: a file predates safety_only; --payment-rows kept every row of it.");
  console.log(`metric ${r.metric}${r.payment_rows_only ? " (payment rows)" : ""}: paired n=${r.n} (unpaired: A ${r.unpaired_a}, B ${r.unpaired_b})`);
  console.log(`A ${files[0]}: ${fmtRate(r.a_rate)}\nB ${files[1]}: ${fmtRate(r.b_rate)}`);
  console.log(`both ${r.both} · only A ${r.a_only} · only B ${r.b_only} · neither ${r.neither} · exact McNemar two-sided p=${r.p_value.toPrecision(4)}`);
}
