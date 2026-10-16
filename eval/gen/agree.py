# Agreement between independent LLM labellers (agy primary, fable + haiku blind second/third) per split.
# Reports raw agreement and Cohen's kappa on final_state, and lists every id that needs adjudication.
#   python3 eval/gen/agree.py [dev|heldout ...]
import json, sys, itertools, collections, os
from labelcommon import key as detail_key

D = os.path.join(os.path.dirname(__file__), "..", "data")
SPLITS = sys.argv[1:] or ["dev", "heldout"]

def load(p):
    if not os.path.exists(p): return None
    return {r["id"]: r for r in (json.loads(l) for l in open(p, encoding="utf-8") if l.strip())}

def detail(r):
    return detail_key(r)

def kappa(a, b):
    n = len(a); po = sum(x == y for x, y in zip(a, b)) / n
    ca, cb = collections.Counter(a), collections.Counter(b)
    pe = sum(ca[k] * cb[k] for k in ca) / (n * n)
    return None if pe == 1 else (po - pe) / (1 - pe)

report = {}
for sp in SPLITS:
    sets = {"agy": load(f"{D}/{sp}.jsonl"), "fable": load(f"{D}/independent/fable.{sp}.jsonl"), "haiku": load(f"{D}/independent/haiku.{sp}.jsonl")}
    sets = {k: v for k, v in sets.items() if v}
    ids = sorted(set.intersection(*[set(v) for v in sets.values()]))
    rep = {"labellers": list(sets), "n": len(ids), "pairs": {}}
    for x, y in itertools.combinations(sets, 2):
        a = [sets[x][i]["expected"]["final_state"] for i in ids]; b = [sets[y][i]["expected"]["final_state"] for i in ids]
        da = [detail(sets[x][i]) for i in ids]; db = [detail(sets[y][i]) for i in ids]
        rep["pairs"][f"{x}-{y}"] = {"state_agree": round(sum(p == q for p, q in zip(a, b)) / len(ids), 3), "kappa_state": None if kappa(a, b) is None else round(kappa(a, b), 3),
                                    "full_agree": round(sum(p == q for p, q in zip(da, db)) / len(ids), 3)}
    need = []
    unan = 0
    for i in ids:
        votes = {k: detail(v[i]) for k, v in sets.items()}
        c = collections.Counter(votes.values())
        if len(c) == 1: unan += 1; continue
        need.append({"id": i, "text": next(iter(sets.values()))[i]["text"], "category": next(iter(sets.values()))[i]["category"],
                     "majority": c.most_common(1)[0][1] >= 2 and len(sets) >= 3,
                     "labels": {k: {"expected": v[i]["expected"], "notes": v[i].get("label_notes", "")} for k, v in sets.items()}})
    rep["unanimous_full"] = unan; rep["needs_adjudication"] = len(need)
    report[sp] = rep
    with open(f"{D}/adjudication.{sp}.jsonl", "w", encoding="utf-8") as f:
        for r in need: f.write(json.dumps(r, ensure_ascii=False) + "\n")
json.dump(report, open(f"{D}/agreement.json", "w", encoding="utf-8"), ensure_ascii=False, indent=2)
print(json.dumps(report, ensure_ascii=False, indent=2))
