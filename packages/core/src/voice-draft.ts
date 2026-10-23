import { cleanTranscript } from "./asr";

/** An unsent composer draft. No event in this reducer calls the model or approves a payment. */
export type VoiceDraft = { phase: "idle" | "connecting" | "recording" | "finalizing" | "review"; id: string | null; text: string; raw: string };
export type VoiceDraftEvent =
  | { type: "start"; id: string; existingText: string }
  | { type: "started" | "partial" | "stop" | "final" | "cancel" | "fail"; id: string; text?: string }
  | { type: "edit"; text: string }
  | { type: "submit" };

export const initialVoiceDraft = (): VoiceDraft => ({ phase: "idle", id: null, text: "", raw: "" });
export const voiceDraftCanSubmit = (s: VoiceDraft): boolean => s.phase === "review" && cleanTranscript(s.text).length > 0;

export function reduceVoiceDraft(s: VoiceDraft, e: VoiceDraftEvent): VoiceDraft {
  if (e.type === "start") return s.phase === "idle" && !e.existingText.trim()
    ? { ...initialVoiceDraft(), phase: "connecting", id: e.id } : s;
  if (e.type === "submit") return voiceDraftCanSubmit(s) ? initialVoiceDraft() : s;
  if (e.type === "edit") return s.phase === "review" ? { ...s, text: e.text.slice(0, 400) } : s;
  if (!s.id || e.id !== s.id) return s;
  if (e.type === "cancel" || e.type === "fail") return initialVoiceDraft();
  if (e.type === "started") return s.phase === "connecting" ? { ...s, phase: "recording" } : s;
  if (e.type === "partial") return s.phase === "recording" ? { ...s, text: cleanTranscript(e.text ?? "") } : s;
  if (e.type === "stop") return s.phase === "recording" || s.phase === "connecting" ? { ...s, phase: "finalizing" } : s;
  if (e.type === "final" && s.phase === "finalizing") {
    const text = cleanTranscript(e.text ?? "");
    return text ? { ...s, phase: "review", text, raw: text } : initialVoiceDraft();
  }
  return s;
}
