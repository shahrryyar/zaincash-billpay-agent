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
