import { describe, expect, it } from "vitest";
import { initialVoiceDraft, reduceVoiceDraft, voiceDraftCanSubmit } from "../src/voice-draft";

describe("live transcript draft: no implicit submission and no stale overwrite", () => {
  it("partials and stop cannot be submitted; a complete final still needs the user's send action", () => {
    let s = reduceVoiceDraft(initialVoiceDraft(), { type: "start", id: "a", existingText: "" });
    s = reduceVoiceDraft(s, { type: "started", id: "a" });
    s = reduceVoiceDraft(s, { type: "partial", id: "a", text: "دز خمسين ألف" });
    expect(s.text).toBe("دز خمسين ألف"); expect(voiceDraftCanSubmit(s)).toBe(false);
    expect(reduceVoiceDraft(s, { type: "submit" })).toEqual(s);
    s = reduceVoiceDraft(s, { type: "stop", id: "a" }); expect(voiceDraftCanSubmit(s)).toBe(false);
    s = reduceVoiceDraft(s, { type: "final", id: "a", text: "دز خمسين ألف لأحمد" });
    expect(s.phase).toBe("review"); expect(voiceDraftCanSubmit(s)).toBe(true);
    expect(s.raw).toBe("دز خمسين ألف لأحمد");
    expect(reduceVoiceDraft(s, { type: "submit" })).toEqual(initialVoiceDraft());
  });
  it("never overwrites an existing typed draft", () => {
    const initial = initialVoiceDraft();
    expect(reduceVoiceDraft(initial, { type: "start", id: "a", existingText: "دز 23000 لعلي كريم" })).toEqual(initial);
  });
  it("editing preserves the raw transcript, and late finals/partials cannot replace the user's amount or name", () => {
    let s = reduceVoiceDraft(initialVoiceDraft(), { type: "start", id: "a", existingText: "" });
    s = reduceVoiceDraft(s, { type: "started", id: "a" }); s = reduceVoiceDraft(s, { type: "stop", id: "a" });
    s = reduceVoiceDraft(s, { type: "final", id: "a", text: "دز 50000 لأحمد" });
    s = reduceVoiceDraft(s, { type: "edit", text: "دز 23000 لعلي كريم" });
    expect(s.text).toBe("دز 23000 لعلي كريم"); expect(s.raw).toBe("دز 50000 لأحمد");
    expect(reduceVoiceDraft(s, { type: "final", id: "a", text: "دز مليون لأمي" })).toEqual(s);
    expect(reduceVoiceDraft(s, { type: "partial", id: "a", text: "دز مليون لأمي" })).toEqual(s);
  });
  it("cancel discards audio and invalidates every later event from that recording", () => {
    let s = reduceVoiceDraft(initialVoiceDraft(), { type: "start", id: "a", existingText: "" });
    s = reduceVoiceDraft(s, { type: "cancel", id: "a" });
    for (const type of ["started", "partial", "final", "stop", "fail"] as const)
      expect(reduceVoiceDraft(s, { type, id: "a", text: "دز مليون" })).toEqual(initialVoiceDraft());
  });
  it("a new recording is unaffected by old errors and transcripts", () => {
    let s = reduceVoiceDraft(initialVoiceDraft(), { type: "start", id: "a", existingText: "" });
    s = reduceVoiceDraft(s, { type: "cancel", id: "a" });
    s = reduceVoiceDraft(s, { type: "start", id: "b", existingText: "" });
    expect(reduceVoiceDraft(s, { type: "fail", id: "a" })).toEqual(s);
    expect(reduceVoiceDraft(s, { type: "final", id: "a", text: "دز مليون" })).toEqual(s);
  });
  it("silence and failures clear the draft without making it sendable", () => {
    for (const type of ["final", "fail"] as const) {
      let s = reduceVoiceDraft(initialVoiceDraft(), { type: "start", id: "a", existingText: "" });
      s = reduceVoiceDraft(s, { type: "started", id: "a" }); s = reduceVoiceDraft(s, { type: "stop", id: "a" });
      s = reduceVoiceDraft(s, { type, id: "a", text: "   " });
      expect(voiceDraftCanSubmit(s)).toBe(false); expect(s.text).toBe("");
    }
  });
});
