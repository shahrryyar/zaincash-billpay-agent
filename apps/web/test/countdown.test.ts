import { describe, it, expect } from "vitest";
import { countdownMilestone } from "../components/countdown";

describe("confirmation card countdown announcements", () => {
  it("announces only at 30 s, 10 s and expiry", () => {
    const seen = new Set<string | null>();
    for (let s = 120; s >= 0; s--) seen.add(countdownMilestone(s));
    expect([...seen]).toEqual([null, "30", "10", "expired"]);
    expect(countdownMilestone(31)).toBeNull(); expect(countdownMilestone(30)).toBe("30"); expect(countdownMilestone(11)).toBe("30");
    expect(countdownMilestone(10)).toBe("10"); expect(countdownMilestone(1)).toBe("10"); expect(countdownMilestone(0)).toBe("expired");
  });
});
