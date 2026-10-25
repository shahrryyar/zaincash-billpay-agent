// Code-switch dev set (Arabic mixed with English words; organiser resources guide, docs/35 RS-04). Developer data only:
// it must be honestly labelled, consistent with the seed, mixed in script, and not a copy of an existing dev row.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, it, expect } from "vitest";
import { applySeed, openDb } from "@zc/wallet-api";
import { labelsCaption } from "../src/labels";
import type { EvalCase } from "../src/case";

const root = resolve(__dirname, "../..");
const read = (f: string) => readFileSync(resolve(root, "eval/data", f), "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l));
const rows = read("codeswitch-dev.final.jsonl") as (EvalCase & { labelled_by: string })[];
const db = openDb(); applySeed(db);
const contactIds = new Set((db.prepare("SELECT id FROM contacts").all() as { id: string }[]).map((r) => r.id));
const billerCodes = new Set((db.prepare("SELECT code FROM billers").all() as { code: string }[]).map((r) => r.code));
const STATES = new Set(["AWAITING_CONFIRM", "CLARIFYING", "FAILED_SAFE", "NEEDS_REPHRASE", "ANSWERED"]);

describe("codeswitch-dev data", () => {
  it("has at least 20 rows with unique ids", () => {
    expect(rows.length).toBeGreaterThanOrEqual(20);
    expect(new Set(rows.map((r) => r.id)).size).toBe(rows.length);
  });
  it("every row mixes Arabic letters with Latin letters", () => {
    for (const r of rows) expect(/[؀-ۿ]/.test(r.text) && /[A-Za-z]/.test(r.text), r.id).toBe(true);
  });
  it("labels name only seed contacts and billers, and valid states", () => {
    const all = rows.flatMap((r) => [r.expected, ...(r.followups ?? []).map((f) => f.expected), ...(r.after_confirm ?? [])]);
    for (const e of all) {
      expect(STATES.has(e.final_state), e.final_state).toBe(true);
      if (e.to) expect(contactIds.has(e.to), e.to).toBe(true);
      for (const c of e.candidates ?? []) expect(contactIds.has(c), c).toBe(true);
      if (e.biller && e.biller !== "unknown") expect(billerCodes.has(e.biller), e.biller).toBe(true);
    }
  });
  it("anything that is not a payable card is marked must_not_execute", () => {
    for (const r of rows) if (r.expected.final_state !== "AWAITING_CONFIRM") expect(r.expected.must_not_execute, r.id).toBe(true);
  });
  it("multi-action rows label every later action (scorer v2 needs after_confirm)", () => {
    for (const r of rows) if ((r.expected.intent_types?.length ?? 0) > 1) expect(r.after_confirm?.length, r.id).toBe((r.expected.intent_types?.length ?? 1) - 1);
  });
  it("says who labelled it and that no human reviewed it", () => {
    for (const r of rows) expect(r.labelled_by, r.id).toMatch(/not human reviewed/);
  });
  it("copies no Arabic dev sentence", () => {
    const dev = new Set((read("dev.final.jsonl") as { text: string }[]).map((r) => r.text.trim()));
    for (const r of rows) expect(dev.has(r.text.trim()), r.id).toBe(false);
  });
  it("the report caption names its real provenance", () => {
    expect(labelsCaption("codeswitch-dev")).toMatch(/Claude Code developer fixtures/);
    expect(labelsCaption("dev")).toMatch(/agy, fable, haiku/);
    expect(labelsCaption("heldout2")).toMatch(/fable, sonnet, haiku/);
    expect(labelsCaption("dev-ku")).toMatch(/opus, sonnet, haiku/);
    expect(labelsCaption("readiness-dev")).toMatch(/AI-authored developer fixtures/);
  });
});
