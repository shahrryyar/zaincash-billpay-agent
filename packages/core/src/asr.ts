// Voice gate (docs/09). Pure: the ASR transcript and its confidence decide whether we ask the user to repeat,
// read the transcript back for a tap, or let it into the normal flow. The confirmation card is mandatory in every
// case: this gate can only ADD a step, never remove one.

export type AsrDecision = "repeat" | "readback" | "accept";
export type AsrPolicy = { low: number; high: number; noConfidence: "readback" | "accept" };

/** τ_low / τ_high from docs/09. Tune on the dev voice set only, then freeze. */
export const DEFAULT_ASR_POLICY: AsrPolicy = { low: 0.5, high: 0.8, noConfidence: "readback" };

const MAX_TRANSCRIPT = 400;

/** Trim, drop control/bidi characters, collapse whitespace, cap the length (same cap as typed input). */
export function cleanTranscript(text: string): string {
  return text
    .replace(/[\u0000-\u001f\u007f\u200b-\u200f\u202a-\u202e\u2066-\u2069]/g, (c) => (c === "\n" || c === "\t" || c === "\r" ? " " : ""))
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_TRANSCRIPT);
}

/**
 * - empty transcript, or confidence below `low`: ask to repeat (no model call).
 * - confidence in [low, high): read the transcript back; the user taps «صح» before anything else happens.
 * - confidence >= high: normal flow.
 * - no confidence (the RegaLabs transcription API returns text only): `policy.noConfidence`, read-back by default.
 * - a confidence that is not a number in [0, 1] is never trusted: read-back.
 */
export function asrDecision(transcript: string, confidence: number | undefined, policy: AsrPolicy = DEFAULT_ASR_POLICY): AsrDecision {
  if (!cleanTranscript(transcript)) return "repeat";
  if (confidence === undefined) return policy.noConfidence;
  if (!Number.isFinite(confidence) || confidence < 0 || confidence > 1) return "readback";
  if (confidence < policy.low) return "repeat";
  if (confidence < policy.high) return "readback";
  return "accept";
}

const unit = (v: string | undefined): number | undefined => {
  if (v === undefined || v.trim() === "") return undefined;
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 && n <= 1 ? n : undefined;
};

/** Build the policy from env strings. Any invalid value falls back to the safe defaults as a whole. */
export function asrPolicyFrom(env: Record<string, string | undefined>): AsrPolicy {
  const low = unit(env.ASR_CONF_LOW) ?? DEFAULT_ASR_POLICY.low;
  const high = unit(env.ASR_CONF_HIGH) ?? DEFAULT_ASR_POLICY.high;
  const nc = env.ASR_NO_CONFIDENCE === "accept" ? "accept" : "readback";
  if (low > high) return { ...DEFAULT_ASR_POLICY };
  return { low, high, noConfidence: nc };
}
