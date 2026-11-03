// Held-out access rules (docs/12): run once, in full, fresh, from a clean commit. Pure decisions + the two file effects,
// so the guard is unit-tested without starting a run.
import { appendFileSync, existsSync, readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

export type FrozenSet = { name: string; sha256: string; ids: ReadonlySet<string> };

/** Every eval/data/heldout*.sha256 with the case ids of its <name>.final.jsonl. */
export function loadFrozenSets(dataDir: string): FrozenSet[] {
  return readdirSync(dataDir).filter((p) => /^heldout.*\.sha256$/.test(p)).map((p) => {
    const name = p.replace(/\.sha256$/, ""), data = resolve(dataDir, `${name}.final.jsonl`);
    const ids = existsSync(data) ? new Set(readFileSync(data, "utf8").split("\n").filter(Boolean).map((l) => String((JSON.parse(l) as { id: unknown }).id))) : new Set<string>();
    return { name, sha256: readFileSync(resolve(dataDir, p), "utf8").split(/\s/)[0] as string, ids };
  });
}

export type GuardInput = {
  split: string; datasetSha: string; caseIds: string[]; frozen: FrozenSet[];
  allowHeldout: boolean; cacheOnly: boolean; llmCache: boolean; partial: boolean; dirty: boolean; spent: boolean;
};

export function heldoutGuard(i: GuardInput): { heldout: boolean; refuse: string | null } {
  const byHash = i.frozen.find((f) => f.sha256 === i.datasetSha);
  const heldout = i.split.startsWith("heldout") || i.frozen.some((f) => f.name === i.split);
  const no = (refuse: string) => ({ heldout, refuse });
  if (byHash && byHash.name !== i.split) return no(`Refusing: frozen ${byHash.name} data cannot be run under split ${i.split}.`);
  // an edited copy has a new hash: also refuse any frozen case id outside its own split
  for (const f of i.frozen) {
    if (f.name === i.split) continue;
    const k = i.caseIds.filter((id) => f.ids.has(id)).length;
    if (k > 0) return no(`Refusing: ${k} case id(s) overlap frozen ${f.name}; they can only run as --split ${f.name}.`);
  }
  if (!heldout) return { heldout, refuse: null };
  if (i.cacheOnly) return no("Refusing: offline cache replay is for development, never held-out.");
  if (!i.allowHeldout) return no("Refusing: held-out is run once. Pass --allow-heldout (and see docs/12).");
  if (i.frozen.find((f) => f.name === i.split)?.sha256 !== i.datasetSha) return no(`Refusing: held-out file does not match eval/data/${i.split}.sha256 (frozen hash).`);
  if (i.spent) return no(`Refusing: ${i.split} was already run once (a result or an attempt for this dataset is recorded).`);
  if (i.partial) return no("Refusing: no partial held-out runs.");
  if (i.llmCache) return no("Refusing: LLM_CACHE=1 could replay stored responses; a held-out run needs fresh provider requests.");
  if (i.dirty) return no("Refusing: held-out runs need a clean git tree (commit first) so the result maps to one commit.");
  return { heldout, refuse: null };
}

/** Spent = a stored result for this dataset hash, or any logged attempt (a crash after the first call still spends it). */
export function isSpent(resultsDir: string, logPath: string, datasetSha: string): boolean {
  if (existsSync(logPath) && readFileSync(logPath, "utf8").split("\n").some((l) => l.includes(`sha=${datasetSha} `) || l.endsWith(`sha=${datasetSha}`))) return true;
  return existsSync(resultsDir) && readdirSync(resultsDir).filter((f) => f.endsWith(".json")).some((f) => {
    try { return (JSON.parse(readFileSync(resolve(resultsDir, f), "utf8")) as { meta?: { dataset_sha256?: string } }).meta?.dataset_sha256 === datasetSha; } catch { return false; }
  });
}

/** Written BEFORE the first model call of a held-out run. */
export function logAttemptStarted(logPath: string, a: { date: string; tag: string; model: string; mode: string; sha: string; commit: string }): void {
  appendFileSync(logPath, `${a.date} ATTEMPT-STARTED ${a.tag} ${a.model} ${a.mode} sha=${a.sha} commit=${a.commit}\n`);
}
