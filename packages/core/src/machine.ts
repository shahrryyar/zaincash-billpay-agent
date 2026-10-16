// Transaction state machine (docs/04): a plain pure reducer, transition(state, event, ctx) -> {state, effects}.
// The LLM proposes, the machine disposes. This function does NO I/O: the orchestrator performs effects
// (call LLM, resolve, call wallet) and feeds the results back as events. Replayable from the audit log.
import { crossCheck, validateIntent, type Action } from "./schema";
import { TOKEN_TTL_MS } from "./token";
import type { CopyKey } from "./copy";
import { parseWhen, type When, type WhenPrior } from "./when";

export type Phase =
  | "IDLE" | "VALIDATED" | "CLARIFYING" | "RESOLVED" | "AWAITING_CONFIRM" | "EXECUTING" | "UNKNOWN_OUTCOME"
  | "EXECUTED" | "ANSWERED" | "FAILED_SAFE" | "CANCELLED" | "EXPIRED" | "NEEDS_REPHRASE";
// PARSED is transient: parsing + validation happen inside one LLM_OUTPUT transition (audited as IDLE -> VALIDATED).

export const TERMINAL: ReadonlySet<Phase> = new Set<Phase>(["EXECUTED", "ANSWERED", "FAILED_SAFE", "CANCELLED", "EXPIRED"]);

export type Slot = "recipient" | "amount" | "biller" | "time";
type Vars = Record<string, string | number>;

export type Card = { payloadHash: string; token: string; idempotencyKey: string; expiresAt: number; executeSent: boolean };

export type MachineState = {
  phase: Phase;
  current: Action | null;
  queue: Action[];
  clarifySlot: Slot | null;
  clarifyTurns: Partial<Record<Slot, number>>;
  lastAsk: { key: CopyKey; vars: Vars } | null;
  card: Card | null;
  retries: number;
  reason: string | null;
  /** Scheduled payments: what parseWhen made of the current action's words, the instant once known, and what a half answer already told us. */
  when: When | null;
  schedule: { dueAt: number } | null;
  whenPrior: WhenPrior | null;
  queueWhen: (When | null)[];
  /** The user pressed «جدولها» on a pending card: the SAME action (same resolved recipient) goes through the schedule path. */
  scheduling: boolean;
};

export type MachineEvent =
  | { type: "INPUT_RECEIVED"; text: string; asrConfidence?: number | undefined }
  | { type: "LLM_OUTPUT"; raw: unknown; input: string }
  | { type: "RESOLUTION"; slot: "recipient" | "biller"; result: "resolved" | "ambiguous" | "fuzzy" | "none"; count?: number; name?: string }
  | { type: "SLOT_ANSWER"; slot: Slot; filled: boolean; dueAt?: number; prior?: WhenPrior; why?: "need_time" | "too_soon" | "too_far" | "unparsed" }
  | { type: "PRECHECK"; ok: boolean; code?: string | undefined }
  | { type: "CARD_ISSUED"; payloadHash: string; token: string; idempotencyKey: string }
  | { type: "CONFIRM"; token: string; payloadHash: string }
  | { type: "EDIT" }
  | { type: "CANCEL" }
  | { type: "TICK" }
  | { type: "EXEC_RESULT"; outcome: "ok" | "rejected" | "timeout"; code?: string | undefined }
  | { type: "LOOKUP_RESULT"; found: "executed" | "not_found" | "unknown" }
  | { type: "NEXT_ACTION" }
  | { type: "SCHEDULE_THIS"; when?: When }; // «جدولها» on a pending card: same payment, later

export type Effect =
  | { type: "CALL_LLM" }
  | { type: "SAY"; key: CopyKey; vars?: Vars }
  | { type: "ASK"; slot: Slot; key: CopyKey; vars: Vars }
  | { type: "APPLY_CLARIFY"; choice_text: string }
  | { type: "RESOLVE"; slot: "recipient" | "biller" }
  | { type: "PRECHECK" }
  | { type: "ISSUE_CARD" }
  | { type: "EXECUTE"; idempotencyKey: string; payloadHash: string; token: string }
  | { type: "RETRY"; idempotencyKey: string; payloadHash: string; token: string }
  | { type: "LOOKUP_OUTCOME"; idempotencyKey: string }
  | { type: "REVOKE_TOKEN"; token: string }
  | { type: "ANSWER_INFO"; query: string }
  | { type: "SAY_ERROR"; code: string }
  | { type: "REJECT"; reason: string }
  | { type: "AUDIT"; from: Phase; to: Phase; event: string; reason?: string };

export type Config = { ttlMs: number; maxClarify: number; maxRetries: number; asrLow: number };
export type Ctx = { now: number; config?: Partial<Config> };
export type Result = { state: MachineState; effects: Effect[] };

const DEFAULTS: Config = { ttlMs: TOKEN_TTL_MS, maxClarify: 2, maxRetries: 3, asrLow: 0.5 };

export function initialState(): MachineState {
  return { phase: "IDLE", current: null, queue: [], clarifySlot: null, clarifyTurns: {}, lastAsk: null, card: null, retries: 0, reason: null, when: null, schedule: null, whenPrior: null, queueWhen: [], scheduling: false };
}

// ---- helpers (all pure)
const out = (state: MachineState, effects: Effect[] = []): Result => ({ state, effects });
const reject = (state: MachineState, reason: string): Result => out(state, [{ type: "REJECT", reason }]);
const revoke = (card: Card | null): Effect[] => (card ? [{ type: "REVOKE_TOKEN", token: card.token }] : []);

function rephrase(reason: string, extra: Effect[] = []): Result {
  return out({ ...initialState(), phase: "NEEDS_REPHRASE", reason }, [{ type: "SAY", key: "ask_rephrase" }, ...extra]);
}
function failSafe(state: MachineState, reason: string, effects: Effect[]): Result {
  return out({ ...state, phase: "FAILED_SAFE", clarifySlot: null, reason }, effects);
}

function ask(state: MachineState, slot: Slot, key: CopyKey, vars: Vars, cfg: Config): Result {
  const turns = (state.clarifyTurns[slot] ?? 0) + 1;
  if (turns > cfg.maxClarify) return failSafe(state, "clarify_exhausted", [{ type: "SAY", key: "clarify_exhausted" }]);
  return out(
    { ...state, phase: "CLARIFYING", clarifySlot: slot, clarifyTurns: { ...state.clarifyTurns, [slot]: turns }, lastAsk: { key, vars }, reason: null },
    [{ type: "ASK", slot, key, vars }],
  );
}

const resolveSlot = (a: Action | null): "recipient" | "biller" => (a?.type === "bill_pay" ? "biller" : "recipient");

const whenTextOf = (a: Action | null): string | undefined => (a && a.type !== "info" ? a.when_text : undefined);

/** The question to ask when a scheduled action still has no exact time. */
function timeQuestion(w: When | null): { key: CopyKey; prior: WhenPrior | null } {
  if (w?.kind === "need_time") return { key: w.prior.date ? "ask_time" : w.prior.hour !== undefined ? "ask_time" : "ask_time_date", prior: w.prior };
  if (w?.kind === "too_soon") return { key: "ask_time_soon", prior: null };
  if (w?.kind === "too_far") return { key: "ask_time_far", prior: null };
  return { key: "ask_time_date", prior: null };
}

function processAction(state: MachineState, cfg: Config): Result {
  const a = state.current;
  if (!a) return rephrase("no_action");
  if (a.type === "info") return out({ ...state, phase: "ANSWERED", reason: null }, [{ type: "ANSWER_INFO", query: a.query }]);
  if (a.type === "transfer") {
    if (!a.recipient) return ask(state, "recipient", "ask_recipient", {}, cfg);
    if (!a.amount) return ask(state, "amount", "ask_amount", { name: a.recipient.text }, cfg);
  } else if (a.biller === "unknown") {
    return ask(state, "biller", "ask_biller", {}, cfg);
  }
  // scheduled payment: the instant must be exact before anything is resolved or shown
  if (whenTextOf(a) || state.scheduling) {
    if (state.schedule === null && state.when?.kind === "ok") state = { ...state, schedule: { dueAt: state.when.dueAt } };
    if (state.schedule === null) {
      const q = timeQuestion(state.when);
      return ask({ ...state, whenPrior: q.prior }, "time", q.key, {}, cfg);
    }
  }
  return out({ ...state, phase: "VALIDATED", clarifySlot: null, reason: null }, [{ type: "RESOLVE", slot: resolveSlot(a) }]);
}

/** A fresh request: Zod gate, deterministic cross-checks, then slot checks. Never executes. */
function fromIntent(raw: unknown, input: string, cfg: Config, now: number): Result {
  const v = validateIntent(raw);
  if (!v.ok) return rephrase("invalid_output");
  let intent = v.intent;
  if (intent.status === "out_of_scope") return failSafe(initialState(), "out_of_scope", [{ type: "SAY", key: "out_of_scope" }]);
  if (intent.status === "cancel") return out({ ...initialState(), phase: "CANCELLED" }, [{ type: "SAY", key: "cancelled" }]);
  if (intent.status === "schedule_help") return out({ ...initialState(), phase: "ANSWERED", reason: null }, [{ type: "SAY", key: "schedule_help" }]);
  if (intent.status !== "ok") return rephrase("no_pending_context"); // unclear / confirm_reply / clarify_reply with nothing pending
  // A dropped-«ألف» amount (e.g. «40») in a LATER action must not be asked now: the answer would be applied to the
  // action that is current (the first one). A transfer gets its amount cleared so it asks for it when its turn comes
  // («شكد تريد تدز لـ…»); anything else fails closed (rephrase) rather than guessing.
  const early = crossCheck(intent, input);
  if (!early.ok) {
    const late = new Set(early.issues.filter((i) => i.actionIndex > 0 && i.code === "amount_ambiguous").map((i) => i.actionIndex));
    if (late.size > 0) {
      if ([...late].some((i) => intent.actions[i]?.type !== "transfer")) return rephrase("amount_ambiguous_later");
      intent = { ...intent, actions: intent.actions.map((a, i) => (late.has(i) && a.type === "transfer" ? { ...a, amount: null } : a)) };
    }
  }
  const [first, ...rest] = intent.actions;
  if (!first) return rephrase("no_actions");

  const whens = intent.actions.map((a) => (whenTextOf(a) ? parseWhen(whenTextOf(a) as string, now) : null));
  const base: MachineState = { ...initialState(), current: first, queue: rest, when: whens[0] ?? null, queueWhen: whens.slice(1) };
  const many: Effect[] = rest.length > 0 ? [{ type: "SAY", key: "two_actions" }] : [];
  const cc = crossCheck(intent, input);
  if (!cc.ok) {
    if (cc.issues.some((i) => i.code === "currency_unsupported")) return failSafe(base, "currency", [{ type: "SAY", key: "usd_unsupported" }]);
    const amb = cc.issues[0];
    if (cc.issues.every((i) => i.code === "amount_ambiguous") && amb)
      return withEffects(ask(base, "amount", "ask_amount_thousands", { value: amb.candidates?.[0] ?? 0 }, cfg), many);
    return rephrase(cc.issues[0]?.code ?? "cross_check");
  }
  return withEffects(processAction(base, cfg), many);
}
const withEffects = (r: Result, more: Effect[]): Result => ({ state: r.state, effects: [...r.effects, ...more] });

function onTimeout(state: MachineState, cfg: Config): Result {
  const card = state.card;
  if (!card) return failSafe(state, "unknown_outcome", [{ type: "SAY", key: "unknown_outcome" }]);
  if (state.retries < cfg.maxRetries) {
    return out({ ...state, phase: "UNKNOWN_OUTCOME", retries: state.retries + 1 }, [
      ...(state.phase === "EXECUTING" ? [{ type: "SAY", key: "checking" } as const] : []),
      { type: "RETRY", idempotencyKey: card.idempotencyKey, payloadHash: card.payloadHash, token: card.token },
    ]);
  }
  return out({ ...state, phase: "UNKNOWN_OUTCOME" }, [{ type: "LOOKUP_OUTCOME", idempotencyKey: card.idempotencyKey }]);
}

function step(state: MachineState, ev: MachineEvent, ctx: Ctx, cfg: Config): Result {
  const { phase } = state;

  if (ev.type === "NEXT_ACTION") {
    const [next, ...rest] = state.queue;
    if (TERMINAL.has(phase) && next) return processAction({ ...initialState(), current: next, queue: rest, when: state.queueWhen[0] ?? null, queueWhen: state.queueWhen.slice(1) }, cfg);
    return reject(state, "no_next_action");
  }
  if (TERMINAL.has(phase)) return reject(state, "terminal");

  switch (ev.type) {
    case "INPUT_RECEIVED": {
      if (phase !== "IDLE" && phase !== "NEEDS_REPHRASE" && phase !== "CLARIFYING" && phase !== "AWAITING_CONFIRM") return reject(state, "busy");
      if (ev.asrConfidence !== undefined && ev.asrConfidence < cfg.asrLow) {
        // never drop a live card/clarification because of a bad transcript: just ask to repeat and stay put
        if (phase === "CLARIFYING" || phase === "AWAITING_CONFIRM") return out(state, [{ type: "SAY", key: "asr_low" }]);
        return out({ ...initialState(), phase: "NEEDS_REPHRASE", reason: "asr_low" }, [{ type: "SAY", key: "asr_low" }]);
      }
      return out(phase === "NEEDS_REPHRASE" ? { ...initialState() } : state, [{ type: "CALL_LLM" }]);
    }

    case "LLM_OUTPUT": {
      if (phase === "IDLE" || phase === "NEEDS_REPHRASE") return fromIntent(ev.raw, ev.input, cfg, ctx.now);
      if (phase !== "CLARIFYING" && phase !== "AWAITING_CONFIRM" && phase !== "VALIDATED") return reject(state, "busy");
      const v = validateIntent(ev.raw);
      if (!v.ok) return out(state, [{ type: "SAY", key: "ask_rephrase" }]); // stay where we are; nothing changes
      const status = v.intent.status;
      if (status === "cancel") return out({ ...initialState(), phase: "CANCELLED" }, [...revoke(state.card), { type: "SAY", key: "cancelled" }]);
      if (status === "confirm_reply") {
        // a spoken/typed "yes" NEVER executes; only the Confirm action with the token does (docs/05, docs/07)
        return phase === "AWAITING_CONFIRM" ? out(state, [{ type: "SAY", key: "press_confirm_button" }]) : out(state, [{ type: "SAY", key: "ask_rephrase" }]);
      }
      if (status === "clarify_reply")
        return phase === "CLARIFYING" ? out(state, [{ type: "APPLY_CLARIFY", choice_text: v.intent.clarify_reply?.choice_text ?? "" }]) : out(state, [{ type: "SAY", key: "ask_rephrase" }]);
      // a new request replaces the pending one; any live token is revoked
      const r = fromIntent(ev.raw, ev.input, cfg, ctx.now);
      return withEffects({ state: r.state, effects: [] }, [...revoke(state.card), ...r.effects]);
    }

    case "RESOLUTION": {
      const okPhase = phase === "VALIDATED" || (phase === "CLARIFYING" && state.clarifySlot === ev.slot);
      if (!okPhase) return reject(state, "resolution_not_expected");
      const name = ev.name ?? "";
      if (ev.result === "resolved") return out({ ...state, phase: "RESOLVED", clarifySlot: null, reason: null }, [{ type: "PRECHECK" }]);
      if (ev.slot === "biller") return ask(state, "biller", ev.result === "none" ? "biller_unknown" : "ask_biller", {}, cfg);
      if (ev.result === "ambiguous") return ask(state, "recipient", "ask_which_contact", { n: ev.count ?? 2, name }, cfg);
      if (ev.result === "fuzzy") return ask(state, "recipient", "ask_fuzzy_contact", { name }, cfg);
      return ask(state, "recipient", "contact_not_found", { name }, cfg);
    }

    case "SLOT_ANSWER": {
      if (phase !== "CLARIFYING" || state.clarifySlot !== ev.slot) return reject(state, "answer_not_expected");
      if (ev.slot === "time") {
        if (ev.filled && ev.dueAt !== undefined)
          return out({ ...state, phase: "VALIDATED", clarifySlot: null, schedule: { dueAt: ev.dueAt }, whenPrior: null, reason: null }, [{ type: "RESOLVE", slot: resolveSlot(state.current) }]);
        const q = timeQuestion(ev.why === "need_time" ? { kind: "need_time", prior: ev.prior ?? {} } : ev.why === "too_soon" ? { kind: "too_soon" } : ev.why === "too_far" ? { kind: "too_far" } : { kind: "unparsed" });
        return ask({ ...state, whenPrior: ev.prior ?? q.prior }, "time", q.key, {}, cfg);
      }
      if (ev.filled)
        return out({ ...state, phase: "VALIDATED", clarifySlot: null, reason: null }, [{ type: "RESOLVE", slot: resolveSlot(state.current) }]);
      const again = state.lastAsk;
      return again ? ask(state, ev.slot, again.key, again.vars, cfg) : ask(state, ev.slot, "ask_rephrase", {}, cfg);
    }

    case "PRECHECK": {
      if (phase !== "RESOLVED") return reject(state, "precheck_not_expected");
      if (ev.ok) return out(state, [{ type: "ISSUE_CARD" }]);
      const code = ev.code ?? "precheck_failed";
      return failSafe({ ...state, card: null }, code, [{ type: "SAY_ERROR", code }]);
    }

    case "CARD_ISSUED": {
      if (phase !== "RESOLVED") return reject(state, "card_not_expected");
      const card: Card = { payloadHash: ev.payloadHash, token: ev.token, idempotencyKey: ev.idempotencyKey, expiresAt: ctx.now + cfg.ttlMs, executeSent: false };
      return out({ ...state, phase: "AWAITING_CONFIRM", card }, []);
    }

    case "CONFIRM": {
      const card = state.card;
      if (phase !== "AWAITING_CONFIRM" || !card) return reject(state, "nothing_to_confirm");
      if (ctx.now >= card.expiresAt)
        return out({ ...state, phase: "EXPIRED", card: null, reason: "expired" }, [...revoke(card), { type: "SAY", key: "expired" }]);
      if (ev.token !== card.token || ev.payloadHash !== card.payloadHash || card.executeSent) return reject(state, "confirmation_invalid");
      return out({ ...state, phase: "EXECUTING", card: { ...card, executeSent: true } }, [
        { type: "EXECUTE", idempotencyKey: card.idempotencyKey, payloadHash: card.payloadHash, token: card.token },
      ]);
    }

    case "SCHEDULE_THIS": {
      const cur = state.current;
      if (phase !== "AWAITING_CONFIRM" || !cur || cur.type === "info") return reject(state, "nothing_to_schedule");
      const r = processAction({ ...state, phase: "VALIDATED", card: null, scheduling: true, schedule: null, when: ev.when ?? null, whenPrior: null, clarifyTurns: {}, reason: null }, cfg);
      return withEffects(r, revoke(state.card));
    }

    case "EDIT": {
      if (phase !== "AWAITING_CONFIRM") return reject(state, "nothing_to_edit");
      return out({ ...state, phase: "VALIDATED", card: null, reason: null }, [...revoke(state.card), { type: "RESOLVE", slot: resolveSlot(state.current) }]);
    }

    case "CANCEL": {
      if (phase === "EXECUTING" || phase === "UNKNOWN_OUTCOME") return reject(state, "already_sent"); // cannot undo
      if (phase === "IDLE" || phase === "NEEDS_REPHRASE") return reject(state, "nothing_to_cancel");
      return out({ ...state, phase: "CANCELLED", card: null, clarifySlot: null }, [...revoke(state.card), { type: "SAY", key: "cancelled" }]);
    }

    case "TICK": {
      const card = state.card;
      if (phase === "AWAITING_CONFIRM" && card && ctx.now >= card.expiresAt)
        return out({ ...state, phase: "EXPIRED", card: null, reason: "expired" }, [...revoke(card), { type: "SAY", key: "expired" }]);
      return out(state);
    }

    case "EXEC_RESULT": {
      if (phase !== "EXECUTING" && phase !== "UNKNOWN_OUTCOME") return reject(state, "no_execution_pending");
      if (ev.outcome === "ok") return out({ ...state, phase: "EXECUTED", reason: null }, []);
      if (ev.outcome === "rejected") {
        const code = ev.code ?? "rejected";
        return failSafe(state, code, [{ type: "SAY_ERROR", code }]);
      }
      return onTimeout(state, cfg);
    }

    case "LOOKUP_RESULT": {
      if (phase !== "UNKNOWN_OUTCOME") return reject(state, "no_lookup_pending");
      if (ev.found === "executed") return out({ ...state, phase: "EXECUTED", reason: null }, []);
      if (ev.found === "not_found") return failSafe(state, "not_executed", [{ type: "SAY_ERROR", code: "not_executed" }]);
      // keep the card (and its idempotency key) so any later retry is still safe
      return failSafe(state, "unknown_outcome", [{ type: "SAY", key: "unknown_outcome" }]);
    }
  }
}

/** The one entry point. Emits an AUDIT effect on every phase change (docs/14). */
export function transition(state: MachineState, ev: MachineEvent, ctx: Ctx): Result {
  const cfg: Config = { ...DEFAULTS, ...ctx.config };
  const r = step(state, ev, ctx, cfg);
  if (r.state.phase === state.phase) return r;
  const audit: Effect = { type: "AUDIT", from: state.phase, to: r.state.phase, event: ev.type, ...(r.state.reason ? { reason: r.state.reason } : {}) };
  return { state: r.state, effects: [audit, ...r.effects] };
}
