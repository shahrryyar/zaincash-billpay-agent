// Scores one observed stage against the labelled expectation. Only fields that matter for the state the case
// should end in are compared (same rule as eval/gen/labelcommon.py).
export type Expected = {
  intent_types?: string[]; final_state: string; clarify_slot?: string; candidates?: string[]; to?: string; biller?: string;
  amount_iqd?: number | null; failure_code?: string; must_not_execute?: boolean; accept_states?: string[];
  /** Scheduled payments: the exact instant, Baghdad local time «YYYY-MM-DDTHH:mm». Absent on an AWAITING_CONFIRM case means: NOT scheduled. */
  due_local?: string;
};
export type Observed = {
  phase: string; clarifySlot: string | null; candidateIds: string[]; to: string | null; biller: string | null; amount: number | null; dueAt: number | null;
};

/** «2026-10-16T09:00» (Baghdad, UTC+3) to epoch ms. */
export const localToMs = (s: string): number => { const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(s); if (!m) throw new Error(`bad due_local: ${s}`); return Date.UTC(+m[1]!, +m[2]! - 1, +m[3]!, +m[4]!, +m[5]!) - 3 * 3_600_000; };

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
    if (exp.due_local) { if (obs.dueAt !== localToMs(exp.due_local)) bad.push(`due ${obs.dueAt} != ${exp.due_local}`); }
    else if (obs.dueAt !== null) bad.push("scheduled but the user asked for it now");
  } else if (exp.final_state === "CLARIFYING") {
    if (exp.clarify_slot && obs.clarifySlot !== exp.clarify_slot) bad.push(`slot ${obs.clarifySlot} != ${exp.clarify_slot}`);
    if (exp.clarify_slot === "recipient") {
      const got = obs.candidateIds.map((c) => plainId(c) as string).sort().join(","), want = [...(exp.candidates ?? [])].sort().join(",");
      if (got !== want) bad.push(`candidates [${got}] != [${want}]`);
    }
  }
  return { stateOk: true, fullOk: bad.length === 0, why: bad.length ? bad.join("; ") : null };
}
