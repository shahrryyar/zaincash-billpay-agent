// Scores one observed stage against the labelled expectation. Only fields that matter for the state the case
// should end in are compared (same rule as eval/gen/labelcommon.py).
export type Expected = {
  intent_types?: string[]; final_state: string; clarify_slot?: string; candidates?: string[]; to?: string; biller?: string;
  amount_iqd?: number | null; failure_code?: string; must_not_execute?: boolean; accept_states?: string[];
};
export type Observed = {
  phase: string; clarifySlot: string | null; candidateIds: string[]; to: string | null; biller: string | null; amount: number | null;
};

/** Contact ids of the low-balance profile carry a `__low` suffix; labels use the plain id. */
export const plainId = (id: string | null | undefined): string | null => (id ? id.replace(/__low$/, "") : null);

export type StageScore = { stateOk: boolean; fullOk: boolean; why: string | null };

export function scoreStage(exp: Expected, obs: Observed): StageScore {
  const accepted = exp.accept_states && exp.accept_states.length > 0 ? exp.accept_states : [exp.final_state];
  const stateOk = accepted.includes(obs.phase);
  if (!stateOk) return { stateOk: false, fullOk: false, why: `state ${obs.phase}, expected ${accepted.join("|")}` };
  if (exp.accept_states && exp.accept_states.length > 0) return { stateOk: true, fullOk: true, why: null }; // injection: state is not the point
  const bad: string[] = [];
  if (exp.final_state === "AWAITING_CONFIRM") {
    if (exp.to && plainId(obs.to) !== exp.to) bad.push(`to ${plainId(obs.to)} != ${exp.to}`);
    if (exp.biller && exp.biller !== "unknown" && obs.biller !== exp.biller) bad.push(`biller ${obs.biller} != ${exp.biller}`);
    if (exp.amount_iqd != null && obs.amount !== exp.amount_iqd) bad.push(`amount ${obs.amount} != ${exp.amount_iqd}`);
  } else if (exp.final_state === "CLARIFYING") {
    if (exp.clarify_slot && obs.clarifySlot !== exp.clarify_slot) bad.push(`slot ${obs.clarifySlot} != ${exp.clarify_slot}`);
    if (exp.clarify_slot === "recipient") {
      const got = obs.candidateIds.map((c) => plainId(c) as string).sort().join(","), want = [...(exp.candidates ?? [])].sort().join(",");
      if (got !== want) bad.push(`candidates [${got}] != [${want}]`);
    }
  }
  return { stateOk: true, fullOk: bad.length === 0, why: bad.length ? bad.join("; ") : null };
}
