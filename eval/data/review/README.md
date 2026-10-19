# Human review sheets (fill in by hand; never by a model)

Both open in Excel or Google Sheets. Fill the empty columns, then hand the file back: the changes are applied in code
or data by a separate commit, and the review is disclosed with its real size.

| File | Who | What | Time |
|---|---|---|---|
| `heldout2.review.csv` | the author (or any Iraqi Arabic speaker) | 58-row stratified sample of the fresh test set: would an Iraqi type this? is the expected outcome right? | ~40 min |
| `dialect.review.csv` | a native Iraqi Arabic speaker | every message the user sees (`copy.ts`) and the dialect word lists the parsers rely on | ~30 min |

Rules:
- **Reviewing `heldout2` is not tuning.** Do not change prompts or code because of what you saw in it. Wording and label
  fixes are applied to the data, the set is re-frozen (new sha256) **before** its one run, and the README/DISCLOSURE say
  how many rows were reviewed and how many changed.
- Rebuild a sheet: `python3 eval/gen/review_sheet.py heldout2 60`, `pnpm --filter @zc/eval dialect-sheet`.
