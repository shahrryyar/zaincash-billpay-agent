// The organisers' October pack fixes the shape of some deliverables (docs/35). These checks keep the public files in
// that shape and honest about what changed since the submitted design brief. They do not judge the content.
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, it, expect } from "vitest";

const root = resolve(__dirname, "../..");
const read = (f: string) => readFileSync(resolve(root, f), "utf8");
const headings = (md: string) => md.split("\n").filter((l) => l.startsWith("## ")).map((l) => l.slice(3).trim());

describe("MVP one-page update (NS-19): what works, what does not work yet, what comes next", () => {
  const md = read("MVP_UPDATE.md");
  it("has the three required sections, in order", () => {
    const h = headings(md);
    const at = ["What works", "What does not work yet", "What comes next"].map((x) => h.indexOf(x));
    expect(at.every((i) => i >= 0), h.join(" | ")).toBe(true);
    expect([...at].sort((a, b) => a - b)).toEqual(at);
  });
  it("stays short enough for one page", () => expect(md.split(/\s+/).filter(Boolean).length).toBeLessThanOrEqual(620));
  it("names the deployed model and the change from the submitted brief", () => {
    expect(md).toMatch(/Gemini 3\.5 Flash-Lite/);
    expect(md).toMatch(/Claude Haiku 5\.5/);
  });
  it("does not claim a submission the repo cannot evidence", () => expect(md).not.toMatch(/\bsubmitted\b(?! by)/i));
});

describe("disclosure (NS-24, FA-14)", () => {
  const md = read("DISCLOSURE.md");
  it("records provider and model per component", () => {
    const i = md.indexOf("## Provider and model per component");
    expect(i).toBeGreaterThanOrEqual(0);
    const section = md.slice(i, md.indexOf("\n## ", i + 3));
    for (const part of ["Intent understanding", "Speech to text", "Test data", "Labels", "AI coding"]) expect(section, part).toContain(part);
    expect(section).toContain("gemini-3.5-flash-lite");
  });
  it("states what changed since the design brief", () => {
    const i = md.indexOf("## Changes since the design brief");
    expect(i).toBeGreaterThanOrEqual(0);
    const section = md.slice(i, md.indexOf("\n## ", i + 3));
    for (const word of ["Claude Haiku 5.5", "Gemini 3.5 Flash-Lite", "k6", "promptfoo"]) expect(section, word).toContain(word);
  });
});

describe("repository hygiene the organisers check (NS-41, RS-12)", () => {
  it(".env is ignored", () => expect(read(".gitignore").split("\n").map((l) => l.trim())).toContain(".env"));
  it("organiser documents are not committed; the only PDFs are the author's own brief exports", () => {
    const tracked = execSync("git ls-files", { cwd: root, encoding: "utf8" }).split("\n").filter(Boolean);
    expect(tracked.filter((f) => /agentic_ai_challenge/i.test(f))).toEqual([]);
    expect(tracked.filter((f) => f.toLowerCase().endsWith(".pdf") && !f.startsWith("brief/"))).toEqual([]);
  });
});
