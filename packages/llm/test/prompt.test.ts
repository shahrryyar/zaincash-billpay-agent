import { describe, it, expect } from "vitest";
import { buildSystemPrompt } from "../src/prompt";

describe("buildSystemPrompt: previous exchange", () => {
  it("includes the previous exchange as data and says amounts must come from the current message", () => {
    const p = buildSystemPrompt("tools", { billers: ["الكهرباء"], recent: "User: «شكد الكهرباء» / Assistant: «37,500»" });
    expect(p).toContain("«شكد الكهرباء»");
    expect(p).toMatch(/CURRENT message/);
  });
  it("omits it when there is none", () => {
    expect(buildSystemPrompt("tools", { billers: [] })).not.toContain("Previous exchange");
  });
});

describe("Kurdish prompt mode (prompt engineering + local retrieval)", () => {
  it("the Kurdish rules are in the stable (cached) part only for a Kurdish session", async () => {
    const { stablePrompt, buildSystemParts } = await import("../src/prompt");
    expect(stablePrompt("tools", "ku")).toContain("KURDISH (Central Kurdish / Sorani)");
    expect(stablePrompt("tools", "ar")).not.toContain("KURDISH (Central Kurdish / Sorani)");
    const p = buildSystemParts("tools", { billers: ["generator: المولدة"], lang: "ku", retrieved: "RETRIEVED" });
    expect(p.system.startsWith(p.prefix)).toBe(true);
    expect(p.prefix).not.toContain("RETRIEVED"); // per-request retrieval never breaks the cache
    expect(p.system).toContain("RETRIEVED");
  });
  it("retrieval returns close examples and the glossary lines for words in the message, never test data", async () => {
    const { retrieveKurdish } = await import("../src/kurdish");
    const r = retrieveKurdish("سبەی کاتژمێر ٨ی ئێوارە پسوولەی مۆلیدە بدە");
    expect(r).toContain("Similar Kurdish examples");
    expect(r).toContain("time words");
    expect(r).toContain("generator");
    expect(retrieveKurdish("سی هەزار")).toContain("سی = 30");
  });
});
