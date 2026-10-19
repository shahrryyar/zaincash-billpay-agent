# Shared helpers for comparing and merging labels. The comparison key only holds fields that matter for the
# state the case ends in, so "amount null vs 50000 on an unknown-biller case" is not counted as a disagreement.
import json, os
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

D = os.path.join(os.path.dirname(__file__), "..", "data")
# Which labellers labelled which split. heldout2 (built 2026-10-19 after the first held-out was spent): three Claude models,
# blind to each other, from eval/data/LABEL_SPEC.heldout2.md. `agy` (Gemini) was not available for it.
LABELLERS = {
    "dev": [("agy", "{sp}.jsonl"), ("fable", "independent/fable.{sp}.jsonl"), ("haiku", "independent/haiku.{sp}.jsonl")],
    "heldout": [("agy", "{sp}.jsonl"), ("fable", "independent/fable.{sp}.jsonl"), ("haiku", "independent/haiku.{sp}.jsonl")],
    "heldout2": [("fable", "independent/fable.{sp}.jsonl"), ("sonnet", "independent/sonnet.{sp}.jsonl"), ("haiku", "independent/haiku.{sp}.jsonl")],
}
# Labellers wrote intent names a little differently; the harness compares the system's action types.
INTENT_NAMES = {"transfer": "transfer", "bill_pay": "bill_pay", "bill_payment": "bill_pay", "info": "info"}

def normalise(row):
    e = row["expected"]
    if "intent_types" in e: e["intent_types"] = [INTENT_NAMES[t] for t in e["intent_types"] if t in INTENT_NAMES]
    return row

def load_split(sp):
    """{labeller: {id: row}} for a split, intent names normalised. Missing files are skipped."""
    out = {}
    for name, pattern in LABELLERS[sp]:
        p = os.path.join(D, pattern.format(sp=sp))
        if os.path.exists(p): out[name] = {r["id"]: normalise(r) for r in (json.loads(l) for l in open(p, encoding="utf-8") if l.strip())}
    return out
