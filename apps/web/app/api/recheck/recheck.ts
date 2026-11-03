import { t } from "@zc/core";
import type { Orchestrator, Reply } from "@zc/orchestrator";

/**
 * «Check what happened» after a Confirm that got no answer. Never the action that pays:
 * - outcome unknown: the orchestrator asks the wallet again by the same idempotency key;
 * - the Confirm never arrived (the same card is still waiting): that live card comes back, nothing was sent;
 * - it arrived and paid, only the answer was lost: the same receipt. confirm() on an EXECUTED card only re-shows it.
 */
export async function recheckReply(orch: Pick<Orchestrator, "recheck" | "confirm" | "inspect" | "langOf">, sid: string, cardId: string): Promise<Reply> {
  const r = await orch.recheck(sid);
  if (!cardId) return r;
  if (r.phase === "AWAITING_CONFIRM" && r.card?.card_id === cardId) { r.messages.push({ kind: "info", text: t("confirm_prompt", {}, orch.langOf(sid)) }); return r; }
  const s = orch.inspect(sid);
  // a card id can never return to AWAITING_CONFIRM once EXECUTED, so this confirm cannot execute anything
  if (r.phase === "EXECUTED" && s.machine.phase === "EXECUTED" && s.card?.cardId === cardId && s.exec) return orch.confirm(sid, cardId);
  return r;
}
