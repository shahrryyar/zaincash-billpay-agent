// Voice evaluation (docs/09, docs/12): WER/CER (raw and normalised), slot survival, voice-gate decisions and latency
// on a manifest of consented recordings. Then writes a derived case file with the ASR transcripts as input, so the
// SAME harness (run.ts) measures end-to-end completion on voice vs on the original text.
//   pnpm --filter @zc/eval eval:voice -- [--manifest eval/voice/manifest.jsonl] [--limit N]
// Uses the ASR provider from .env (ASR_PROVIDER / REGALABS_*). Transcripts are cached by audio hash in .cache/asr.
import { createHash } from "node:crypto";
import { execSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { AsrError, asrFromEnv, inspectWav, type Transcript } from "@zc/asr";
import { asrDecision, asrPolicyFrom } from "@zc/core";
import { percentile, wilson, fmtRate } from "./stats";
import { amountSurvived, corpusRate, nameSurvived, scoreUtterance, type UtteranceScore } from "./wer";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "../..");
const args = new Map<string, string>();
{ const av = process.argv.slice(2); for (let i = 0; i < av.length; i++) { const a = av[i] as string; if (!a.startsWith("--") || a === "--") continue; if (av[i + 1] !== undefined && !(av[i + 1] as string).startsWith("--")) args.set(a.slice(2), av[++i] as string); else args.set(a.slice(2), "1"); } }
for (const l of existsSync(resolve(root, ".env")) ? readFileSync(resolve(root, ".env"), "utf8").split("\n") : []) {
  const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/.exec(l);
  if (m && !l.trim().startsWith("#") && process.env[m[1] as string] === undefined) process.env[m[1] as string] = (m[2] as string).replace(/\s+#.*$/, "").replace(/^["']|["']$/g, "");
}

/** One recording. `audio` is relative to the manifest. `case_id` links it to a labelled text case (dev or held-out). */
type Row = { id: string; audio: string; reference: string; speaker: string; consent: boolean; case_id?: string; amount_iqd?: number; names?: string[]; noise?: string };

const manifestPath = resolve(root, args.get("manifest") ?? "eval/voice/manifest.jsonl");
if (!existsSync(manifestPath)) { console.error(`No manifest at ${manifestPath}. See eval/voice/README.md.`); process.exit(2); }
let rows: Row[] = readFileSync(manifestPath, "utf8").split("\n").filter((l) => l.trim()).map((l) => JSON.parse(l));
const unconsented = rows.filter((r) => r.consent !== true);
if (unconsented.length) { console.error(`Refusing: ${unconsented.length} row(s) without consent: true (${unconsented.map((r) => r.id).join(", ")}).`); process.exit(2); }
if (args.get("limit")) rows = rows.slice(0, Number(args.get("limit")));

const asr = asrFromEnv(process.env);
if (!asr.transcriber || asr.provider === "fake") { console.error(`No real ASR provider: ${asr.description}`); process.exit(2); }
const policy = asrPolicyFrom(process.env);
const modelRevision = process.env.ASR_MODEL_REVISION?.trim() || "unspecified";
const cacheNamespace = `${asr.description}|${modelRevision}`;
const cacheDir = resolve(root, ".cache/asr");
mkdirSync(cacheDir, { recursive: true });

type Result = { id: string; speaker: string; noise: string | null; reference: string; hypothesis: string | null; error: string | null; confidence: number | null; latency_ms: number | null; cached: boolean; gate: string | null; score: UtteranceScore | null; amount_ok: boolean | null; names_ok: boolean | null; case_id: string | null };
const results: Result[] = [];

for (const r of rows) {
  const wav = new Uint8Array(readFileSync(resolve(dirname(manifestPath), r.audio)));
  const info = inspectWav(wav);
  const base: Result = { id: r.id, speaker: r.speaker, noise: r.noise ?? null, reference: r.reference, hypothesis: null, error: null, confidence: null, latency_ms: null, cached: false, gate: null, score: null, amount_ok: null, names_ok: null, case_id: r.case_id ?? null };
  if (!info.ok) { results.push({ ...base, error: `audio:${info.error}` }); continue; }
  const key = createHash("sha256").update(asr.transcriber.id).update(cacheNamespace).update(wav).digest("hex");
  const cachePath = resolve(cacheDir, `${key}.json`);
  let t: Transcript | null = null, cached = false;
  if (existsSync(cachePath)) { t = JSON.parse(readFileSync(cachePath, "utf8")); cached = true; }
  else {
    try { t = await asr.transcriber.transcribe(wav, { requestId: `zc-eval-${key.slice(0, 32)}` }); writeFileSync(cachePath, JSON.stringify(t)); }
    catch (e) { results.push({ ...base, error: e instanceof AsrError ? `asr:${e.code}` : String(e) }); continue; }
  }
  if (!t) continue;
  const tr: Transcript = t;
  const s = scoreUtterance(r.reference, tr.text);
  results.push({
    ...base, hypothesis: tr.text, confidence: tr.confidence ?? null, latency_ms: cached ? null : tr.latencyMs, cached,
    gate: asrDecision(tr.text, tr.confidence, policy), score: s,
    amount_ok: r.amount_iqd !== undefined ? amountSurvived(tr.text, r.amount_iqd) : null,
    names_ok: r.names?.length ? r.names.every((n) => nameSurvived(tr.text, n)) : null,
  });
  process.stdout.write(".");
}
console.log("");

const ok = results.filter((r) => r.score);
const pct = (x: number) => `${(x * 100).toFixed(1)}%`;
const corpus = {
  wer: corpusRate(ok.map((r) => r.score!.w)), cer: corpusRate(ok.map((r) => r.score!.c)),
  wer_norm: corpusRate(ok.map((r) => r.score!.wN)), cer_norm: corpusRate(ok.map((r) => r.score!.cN)),
};
const amounts = ok.filter((r) => r.amount_ok !== null), names = ok.filter((r) => r.names_ok !== null);
const gates = { repeat: 0, readback: 0, accept: 0 } as Record<string, number>;
for (const r of ok) gates[r.gate as string] = (gates[r.gate as string] ?? 0) + 1;
const speakers = [...new Set(ok.map((r) => r.speaker))];
const lat = ok.map((r) => r.latency_ms).filter((x): x is number => x !== null);
const git = (c: string) => { try { return execSync(c, { cwd: root, encoding: "utf8" }).trim(); } catch { return "unknown"; } };
const stamp = new Date().toISOString().slice(0, 10);
const tag = args.get("tag") ?? `${asr.transcriber.id.replace(/[^a-z0-9]+/gi, "-")}-${stamp}`;
const meta = { provider: asr.transcriber.id, endpoint_description: asr.description, model_revision: modelRevision, policy, manifest: manifestPath.replace(root + "/", ""), manifest_sha256: createHash("sha256").update(readFileSync(manifestPath)).digest("hex"), commit: git("git rev-parse --short HEAD"), n: rows.length, scored: ok.length, failed: results.length - ok.length, speakers: speakers.length };

mkdirSync(resolve(root, "eval/results"), { recursive: true });
writeFileSync(resolve(root, `eval/results/voice-${tag}.json`), JSON.stringify({ meta, corpus, gates, results }, null, 2));

// Derived cases: same labels, ASR transcript as the input text, for: pnpm eval -- --data <file> --split voice
// Spent or fresh held-out rows must never be silently re-evaluated through a derived voice file.
const caseFiles = ["dev.final.jsonl", "dev-ku.final.jsonl", "readiness.dev.jsonl"].map((f) => resolve(root, "eval/data", f)).filter(existsSync);
const byId = new Map<string, any>();
for (const f of caseFiles) for (const l of readFileSync(f, "utf8").split("\n").filter(Boolean)) { const c = JSON.parse(l); byId.set(c.id, c); }
const derived = ok.filter((r) => r.case_id && byId.has(r.case_id)).map((r) => ({ ...byId.get(r.case_id!), id: `V-${r.id}`, text: r.hypothesis, voice: { reference: r.reference, original_case: r.case_id, gate: r.gate, ...(r.confidence === null ? {} : { confidence: r.confidence }) } }));
const derivedPath = resolve(root, `eval/results/voice-${tag}.cases.jsonl`);
if (derived.length) writeFileSync(derivedPath, derived.map((d) => JSON.stringify(d)).join("\n") + "\n");

const worst = [...ok].sort((a, b) => b.score!.werNorm - a.score!.werNorm).slice(0, 8);
const md = [
  `# Voice eval: ${meta.provider}`, "",
  `Commit ${meta.commit} · manifest ${meta.manifest} (sha256 ${meta.manifest_sha256.slice(0, 12)}…) · n=${meta.n}, scored ${meta.scored}, failed ${meta.failed} · speakers ${meta.speakers}`, "",
  "| Metric | Value |", "|---|---|",
  `| WER raw / normalised | ${pct(corpus.wer)} / ${pct(corpus.wer_norm)} |`,
  `| CER raw / normalised | ${pct(corpus.cer)} / ${pct(corpus.cer_norm)} |`,
  `| Amount survived | ${fmtRate(wilson(amounts.filter((r) => r.amount_ok).length, amounts.length))} |`,
  `| Names survived | ${fmtRate(wilson(names.filter((r) => r.names_ok).length, names.length))} |`,
  `| Voice gate (repeat / read back / accept), τ=${policy.low}/${policy.high}, no-confidence=${policy.noConfidence} | ${gates.repeat} / ${gates.readback} / ${gates.accept} |`,
  `| ASR latency p50 / p95 (uncached) | ${lat.length ? `${percentile(lat, 0.5)} / ${percentile(lat, 0.95)} ms` : "n/a"} |`, "",
  "Normalised = the agent's own Arabic/digit normaliser + no punctuation. Corpus rates pool all errors over all reference words.", "",
  "## Per speaker", "", "| Speaker | n | WER norm | CER norm |", "|---|---|---|---|",
  ...speakers.map((sp) => { const xs = ok.filter((r) => r.speaker === sp); return `| ${sp} | ${xs.length} | ${pct(corpusRate(xs.map((r) => r.score!.wN)))} | ${pct(corpusRate(xs.map((r) => r.score!.cN)))} |`; }), "",
  "## Worst utterances (normalised WER)", "", "| id | reference | hypothesis | WER |", "|---|---|---|---|",
  ...worst.map((r) => `| ${r.id} | ${r.reference} | ${r.hypothesis} | ${pct(r.score!.werNorm)} |`), "",
  results.length > ok.length ? `Failures: ${results.filter((r) => !r.score).map((r) => `${r.id} (${r.error})`).join(", ")}` : "",
  derived.length ? `\nEnd to end on voice: \`pnpm eval -- --data ${derivedPath.replace(root + "/", "")} --split voice\` (${derived.length} cases; compare with the same ids on text).` : "",
].join("\n");
writeFileSync(resolve(root, `eval/results/voice-${tag}.md`), md + "\n");
console.log(md);
