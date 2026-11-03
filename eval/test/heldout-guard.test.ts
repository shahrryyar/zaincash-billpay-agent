import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { describe, it, expect } from "vitest";

describe("held-out access is refused before any model call", () => {
  const run = (...args: string[]) => spawnSync(process.execPath, ["--import", "tsx", fileURLToPath(new URL("../src/run.ts", import.meta.url)), ...args], {
    cwd: fileURLToPath(new URL("..", import.meta.url)), encoding: "utf8", timeout: 20_000,
  });
  it("cannot disguise frozen data as a development split", () => {
    const r = run("--split", "dev", "--data", "eval/data/heldout2.final.jsonl");
    expect(r.status).toBe(3); expect(r.stderr).toContain("frozen heldout2 data cannot be run under split dev");
  });
  it("requires explicit one-shot access and refuses partial runs", () => {
    const r = run("--split", "heldout2"); expect(r.status).toBe(3); expect(r.stderr).toContain("Pass --allow-heldout");
    const partial = run("--split", "heldout2", "--allow-heldout", "--limit", "1");
    expect(partial.status).toBe(3); expect(partial.stderr).toContain("no partial held-out runs");
  });
});

// The guard itself, tested directly: no run is started and no model is constructed.
import { mkdtempSync, writeFileSync, readFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { heldoutGuard, isSpent, loadFrozenSets, logAttemptStarted, type GuardInput } from "../src/heldout-guard";

describe("heldoutGuard (pure)", () => {
  const frozen = [
    { name: "heldout", sha256: "h1", ids: new Set(["C-0001", "C-0002"]) },
    { name: "heldout2", sha256: "h2", ids: new Set(["H2-0001"]) },
  ];
  const ok: GuardInput = { split: "heldout2", datasetSha: "h2", caseIds: ["H2-0001"], frozen, allowHeldout: true, cacheOnly: false, llmCache: false, partial: false, dirty: false, spent: false };
  it("a clean, first, full, uncached held-out run passes and is marked held-out", () => {
    expect(heldoutGuard(ok)).toEqual({ heldout: true, refuse: null });
    expect(heldoutGuard({ ...ok, split: "dev", datasetSha: "d", caseIds: ["D-1"] })).toEqual({ heldout: false, refuse: null });
  });
  it("refuses held-out case ids inside another file (edited copy, other split)", () => {
    const r = heldoutGuard({ ...ok, split: "dev", datasetSha: "edited", caseIds: ["D-1", "C-0002"] });
    expect(r.refuse).toContain("overlap frozen heldout");
    expect(heldoutGuard({ ...ok, split: "heldout", datasetSha: "x", caseIds: ["H2-0001"] }).refuse).toContain("overlap frozen heldout2");
  });
  it("refuses a dirty tree, LLM_CACHE=1, cache replay, partial runs, a spent set and a hash mismatch", () => {
    expect(heldoutGuard({ ...ok, dirty: true }).refuse).toContain("clean git tree");
    expect(heldoutGuard({ ...ok, llmCache: true }).refuse).toContain("LLM_CACHE=1");
    expect(heldoutGuard({ ...ok, cacheOnly: true }).refuse).toContain("offline cache replay");
    expect(heldoutGuard({ ...ok, partial: true }).refuse).toContain("no partial held-out runs");
    expect(heldoutGuard({ ...ok, spent: true }).refuse).toContain("already run once");
    expect(heldoutGuard({ ...ok, datasetSha: "other" }).refuse).toContain("frozen hash");
    expect(heldoutGuard({ ...ok, allowHeldout: false }).refuse).toContain("Pass --allow-heldout");
  });
  it("a dirty tree or a cache does not block development runs", () => {
    expect(heldoutGuard({ ...ok, split: "dev", datasetSha: "d", caseIds: ["D-1"], dirty: true, llmCache: true, allowHeldout: false }).refuse).toBeNull();
  });
});

describe("attempt log and spent detection", () => {
  it("an attempt-started line alone marks the set spent (a crashed run still counts)", () => {
    const dir = mkdtempSync(join(tmpdir(), "zc-guard-"));
    const log = join(dir, "heldout-runs.log"), results = join(dir, "results");
    mkdirSync(results);
    expect(isSpent(results, log, "abc")).toBe(false);
    logAttemptStarted(log, { date: "2026-11-03T00:00:00.000Z", tag: "heldout2-x", model: "m", mode: "tools", sha: "abc", commit: "deadbee" });
    expect(readFileSync(log, "utf8")).toMatch(/ATTEMPT-STARTED heldout2-x m tools sha=abc commit=deadbee\n$/);
    expect(isSpent(results, log, "abc")).toBe(true);
    expect(isSpent(results, log, "abcd")).toBe(false);
    writeFileSync(join(results, "r.json"), JSON.stringify({ meta: { dataset_sha256: "zzz" } }));
    expect(isSpent(results, join(dir, "missing.log"), "zzz")).toBe(true);
  });
  it("loads every frozen set's ids from eval/data", () => {
    const sets = loadFrozenSets(fileURLToPath(new URL("../data", import.meta.url)));
    expect(sets.map((s) => s.name).sort()).toEqual(["heldout", "heldout-ku", "heldout2"]);
    for (const s of sets) { expect(s.ids.size).toBeGreaterThan(0); expect(s.sha256).toMatch(/^[0-9a-f]{64}$/); }
  });
});
