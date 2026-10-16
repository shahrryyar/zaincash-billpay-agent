# Deterministic stratified split of candidates.jsonl: 40% dev / 60% held-out per category (docs/11).
# Done BEFORE labelling so labelling can't influence which items land in held-out. Seed fixed, rerun = same output.
import json, random, collections
rows = [json.loads(l) for l in open("candidates.jsonl", encoding="utf-8")]
by = collections.defaultdict(list)
for r in rows: by[r["category"]].append(r)
rng = random.Random(20261016)
dev, held = [], []
for cat in sorted(by):
    items = sorted(by[cat], key=lambda r: r["id"]); rng.shuffle(items)
    k = round(len(items) * 0.4)
    dev += items[:k]; held += items[k:]
for name, part in (("dev", dev), ("heldout", held)):
    with open(f"{name}.candidates.jsonl", "w", encoding="utf-8") as f:
        for r in sorted(part, key=lambda r: r["id"]): f.write(json.dumps(r, ensure_ascii=False) + "\n")
print(len(dev), "dev,", len(held), "heldout")
