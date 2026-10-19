# Builds a hand-review sheet for a labelled split (the brief: test requests are "generated ... then edited by hand for
# realism"; the rules: "check a sample by hand"). A stratified, seeded sample, so the choice of rows is not ours.
#   python3 eval/gen/review_sheet.py heldout2 60     -> eval/data/review/heldout2.review.csv (opens in Excel / Google Sheets)
# The reviewer fills the last columns. Nothing here changes a label; edits are applied (and the set re-frozen) separately,
# BEFORE the set is run, and the review is disclosed with its real size.
import csv, json, os, random, re, sys, collections
sp, n = sys.argv[1], int(sys.argv[2])
here = os.path.dirname(__file__)
rows = [json.loads(l) for l in open(os.path.join(here, "..", "data", f"{sp}.final.jsonl"), encoding="utf-8")]
seed = open(os.path.join(here, "..", "..", "apps", "wallet-api", "src", "seed.ts"), encoding="utf-8").read()
NAMES = dict(re.findall(r'\["(c_[a-z_]+)", "([^"]+)"', seed))
BILLS = {"electricity": "الكهرباء 37,500", "generator": "المولدة 60,000", "internet": "الانترنت 35,000", "water": "الماي (مدفوعة)", "mobile_topup": "شحن الرصيد (الخدمة واگفة)"}
SLOT = {"recipient": "منو المستلم", "amount": "شكد المبلغ", "biller": "أي فاتورة", "time": "متى بالضبط"}
num = lambda v: f"{v:,}" if isinstance(v, int) else "?"

def outcome(e):
    s = e["final_state"]
    if s == "AWAITING_CONFIRM":
        who = NAMES.get(e.get("to") or "", "") or BILLS.get(e.get("biller") or "", e.get("biller") or "")
        when = f" — مجدولة {e['due_local']}" if e.get("due_local") else ""
        return f"بطاقة تأكيد: {who} {num(e.get('amount_iqd'))} د.ع{when}"
    if s == "CLARIFYING":
        c = ", ".join(NAMES.get(x, x) for x in e.get("candidates") or [])
        return f"يسأل: {SLOT.get(e.get('clarify_slot'), e.get('clarify_slot'))}" + (f" ({c})" if c else "")
    if s == "FAILED_SAFE": return f"يرفض بأمان: {e.get('failure_code') or ''} — ما ينرسل شي"
    if s == "NEEDS_REPHRASE": return "يطلب يعيد الكلام"
    return s

by = collections.defaultdict(list)
for r in rows: by[r["category"]].append(r)
rng = random.Random(20261019)
pick = []
for cat in sorted(by):
    k = max(2, round(n * len(by[cat]) / len(rows)))
    pick += rng.sample(sorted(by[cat], key=lambda r: r["id"]), min(k, len(by[cat])))
pick.sort(key=lambda r: r["id"])
out = os.path.join(here, "..", "data", "review", f"{sp}.review.csv")
os.makedirs(os.path.dirname(out), exist_ok=True)
with open(out, "w", encoding="utf-8-sig", newline="") as f:  # BOM: Excel shows Arabic correctly
    w = csv.writer(f)
    w.writerow(["id", "category", "text (what the user typed)", "seed user", "expected (what the agent should do)",
                "1. natural Iraqi? (Y/N)", "2. expected outcome right? (Y/N)", "better wording (if 1 = N)", "correct outcome (if 2 = N)", "notes"])
    for r in pick:
        w.writerow([r["id"], r["category"], r["text"], "low balance 15,000" if r.get("seed_profile") == "low" else "default 200,000",
                    outcome(r["expected"]), "", "", "", "", ""])
print(len(pick), "rows ->", out)
