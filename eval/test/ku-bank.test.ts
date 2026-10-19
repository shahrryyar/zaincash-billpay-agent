// The Kurdish retrieval bank (packages/llm/src/kurdish.ts) must teach the format, never a test answer:
// no bank example may be a near-copy of a Kurdish test row (dev or held-out), and the bank uses no seed contact.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, it, expect } from "vitest";
import { KU_EXAMPLES, kurdishSimilarity } from "@zc/llm";

const root = resolve(__dirname, "../..");
const rows = (f: string) => readFileSync(resolve(root, "eval/data", f), "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l) as { id: string; text: string });
const tests = [...rows("dev-ku.final.jsonl"), ...rows("heldout-ku.final.jsonl")];
const seed = readFileSync(resolve(root, "apps/wallet-api/src/seed.ts"), "utf8");
const KURDISH_SEED_NAMES = ["ئاراس", "عومەر", "کەریم", "هێمن", "شیلان", "کاروان", "ڕێباز", "ڕێبوار", "دڵشاد"];

describe("Kurdish retrieval bank vs the Kurdish test sets", () => {
  // short Kurdish requests share structure («... بنێرە بۆ ...»), so 0.6 separates "same pattern" from "near copy"
  it("no bank example is close to any test row (trigram Jaccard < 0.6)", () => {
    let worst = { s: 0, bank: "", id: "" };
    for (const e of KU_EXAMPLES) for (const r of tests) { const s = kurdishSimilarity(e.text, r.text); if (s > worst.s) worst = { s, bank: e.text, id: r.id }; }
    console.log(`closest pair: ${worst.s.toFixed(2)} (bank «${worst.bank}» vs ${worst.id})`);
    expect(worst.s).toBeLessThan(0.6);
  });
  it("the bank's people appear in no test row", () => {
    const people = ["ژیار", "jiyar", "بەهار", "سەرکەوت", "سۆلین", "سولین", "ئاوات", "سەرهەنگ", "sarhang", "هاوژین"];
    for (const n of people) expect(tests.filter((r) => r.text.includes(n)).map((r) => r.id), n).toEqual([]);
  });
  it("the bank names no Kurdish seed contact", () => {
    expect(seed).toContain("ئاراس عومەر");
    for (const e of KU_EXAMPLES) for (const n of KURDISH_SEED_NAMES) expect(e.text.includes(n) || e.propose.includes(n), `${e.text} uses ${n}`).toBe(false);
  });
});
