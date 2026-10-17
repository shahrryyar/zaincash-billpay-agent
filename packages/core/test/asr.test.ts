import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { DEFAULT_ASR_POLICY, asrDecision, asrPolicyFrom, cleanTranscript } from "../src/asr";

const P = DEFAULT_ASR_POLICY; // low 0.5, high 0.8, no confidence -> read back

describe("asrDecision: voice never shortens the safety path (docs/09)", () => {
  it("empty or whitespace transcript: ask to repeat", () => {
    for (const t of ["", "   ", "\n\t"]) expect(asrDecision(t, 0.99, P)).toBe("repeat");
  });
  it("below the low threshold: ask to repeat (no LLM call)", () => expect(asrDecision("دز خمسين ألف لأحمد", 0.2, P)).toBe("repeat"));
  it("between low and high: read the transcript back", () => expect(asrDecision("دز خمسين ألف لأحمد", 0.6, P)).toBe("readback"));
  it("at or above high: normal flow (the card is still mandatory)", () => {
    expect(asrDecision("دز خمسين ألف لأحمد", 0.8, P)).toBe("accept");
    expect(asrDecision("دز خمسين ألف لأحمد", 0.97, P)).toBe("accept");
  });
  it("exactly at low is a read-back, not a repeat", () => expect(asrDecision("x", 0.5, P)).toBe("readback"));
  it("no confidence from the provider: read back by default", () => expect(asrDecision("دز خمسين ألف لأحمد", undefined, P)).toBe("readback"));
  it("no confidence can be configured to accept (the card still gates money)", () =>
    expect(asrDecision("دز خمسين ألف لأحمد", undefined, { ...P, noConfidence: "accept" })).toBe("accept"));
  it("an invalid confidence (NaN, <0, >1, Infinity) is never trusted: always read back", () => {
    for (const c of [Number.NaN, -0.1, 1.5, Number.POSITIVE_INFINITY]) {
      expect(asrDecision("x", c, P)).toBe("readback");
      expect(asrDecision("x", c, { ...P, noConfidence: "accept" })).toBe("readback");
    }
  });
  it("property: never accepts below high, never throws", () => {
    fc.assert(fc.property(fc.string(), fc.option(fc.double(), { nil: undefined }), (t, c) => {
      const d = asrDecision(t, c, P);
      if (d === "accept") return t.trim().length > 0 && c !== undefined && c >= P.high && c <= 1;
      return d === "repeat" || d === "readback";
    }));
  });
});

describe("asrPolicyFrom: thresholds from env, invalid values fall back to safe defaults", () => {
  it("reads valid values", () =>
    expect(asrPolicyFrom({ ASR_CONF_LOW: "0.4", ASR_CONF_HIGH: "0.9", ASR_NO_CONFIDENCE: "accept" })).toEqual({ low: 0.4, high: 0.9, noConfidence: "accept" }));
  it("defaults when unset", () => expect(asrPolicyFrom({})).toEqual(P));
  it("rejects garbage and out-of-range values", () =>
    expect(asrPolicyFrom({ ASR_CONF_LOW: "abc", ASR_CONF_HIGH: "7", ASR_NO_CONFIDENCE: "yolo" })).toEqual(P));
  it("low above high falls back to the defaults (never a policy that accepts everything)", () =>
    expect(asrPolicyFrom({ ASR_CONF_LOW: "0.9", ASR_CONF_HIGH: "0.3" })).toEqual(P));
});

describe("cleanTranscript", () => {
  it("trims, collapses whitespace and caps the length", () => {
    expect(cleanTranscript("  دز   خمسين\nألف  ")).toBe("دز خمسين ألف");
    expect(cleanTranscript("ا".repeat(1000)).length).toBe(400);
  });
  it("strips control characters", () => expect(cleanTranscript("دز\u0000 لأحمد\u200f")).toBe("دز لأحمد"));
});
