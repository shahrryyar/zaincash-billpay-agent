# Shared helpers for comparing and merging labels. The comparison key only holds fields that matter for the
# state the case ends in, so "amount null vs 50000 on an unknown-biller case" is not counted as a disagreement.
import json
SAFETY_ORDER = ["FAILED_SAFE", "NEEDS_REPHRASE", "CLARIFYING", "AWAITING_CONFIRM", "ANSWERED"]  # safest first

def key(row):
    e = row["expected"]; s = e.get("final_state")
    if s == "AWAITING_CONFIRM":
        return json.dumps([s, e.get("to"), e.get("biller"), e.get("amount_iqd"), sorted(e.get("intent_types") or [])], ensure_ascii=False)
    if s == "CLARIFYING":
        return json.dumps([s, e.get("clarify_slot"), sorted(e.get("candidates") or []) if e.get("clarify_slot") == "recipient" else None], ensure_ascii=False)
    if s == "FAILED_SAFE":
        return json.dumps([s, e.get("failure_code")], ensure_ascii=False)
    return json.dumps([s], ensure_ascii=False)
