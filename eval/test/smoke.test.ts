import { describe, it, expect } from "vitest";

describe("eval workspace", () => {
  it("is wired into pnpm test", () => {
    expect(1 + 1).toBe(2);
  });
});
