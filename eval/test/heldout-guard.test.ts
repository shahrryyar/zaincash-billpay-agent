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
