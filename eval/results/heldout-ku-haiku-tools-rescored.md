# Re-scored heldout-ku-haiku-tools.json

offline re-score of stored stage observations and replies with the current score.ts; stored wallet outcomes kept; can only lower a stored e2e; no model or orchestrator was run.

| Metric | Value (Wilson 95% CI) |
|---|---|
| E2E all rows, as stored | 92.2% [84.8, 96.2] n=90 |
| E2E all rows, re-scored | 92.2% [84.8, 96.2] n=90 |
| E2E payment rows (alternative-safe-state rows excluded), re-scored | 91.1% [82.8, 95.6] n=79 |
| E2E payment rows, as stored | 91.1% [82.8, 95.6] n=79 |
| E2E alternative-safe-state rows, re-scored / as stored | 100.0% [74.1, 100.0] n=11 / 100.0% [74.1, 100.0] n=11 |
| Ambiguity recall / precision, labelled slot (payment rows) | 92.0% [75.0, 97.8] n=25 / 100.0% [85.7, 100.0] n=23 |
| Ambiguity recall / precision, any slot (payment rows) | 92.0% [75.0, 97.8] n=25 / 100.0% [85.7, 100.0] n=23 |

Notes: failure_code_checks_skipped=11, stages_without_label=0, stages_without_reply=0, replies_possibly_truncated=0, cases_missing_from_data=0.

| Category | e2e | n | rate (Wilson 95% CI) |
|---|---|---|---|
| ambiguous_amount | 3 | 4 | 75.0% [30.1, 95.4] n=4 |
| ambiguous_recipient | 7 | 7 | 100.0% [64.6, 100.0] n=7 |
| injection | 3 | 3 | 100.0% [43.9, 100.0] n=3 |
| insufficient_balance | 4 | 4 | 100.0% [51.0, 100.0] n=4 |
| malformed | 4 | 4 | 100.0% [51.0, 100.0] n=4 |
| missing_amount | 5 | 5 | 100.0% [56.6, 100.0] n=5 |
| ordinary_bill | 8 | 8 | 100.0% [67.6, 100.0] n=8 |
| ordinary_transfer | 11 | 11 | 100.0% [74.1, 100.0] n=11 |
| out_of_scope | 4 | 4 | 100.0% [51.0, 100.0] n=4 |
| previous_amount | 3 | 3 | 100.0% [43.9, 100.0] n=3 |
| scheduled | 9 | 9 | 100.0% [70.1, 100.0] n=9 |
| similar_names | 1 | 5 | 20.0% [3.6, 62.4] n=5 |
| spelling_variant | 10 | 10 | 100.0% [72.2, 100.0] n=10 |
| two_actions | 3 | 5 | 60.0% [23.1, 88.2] n=5 |
| unknown_biller | 4 | 4 | 100.0% [51.0, 100.0] n=4 |
| unknown_contact | 4 | 4 | 100.0% [51.0, 100.0] n=4 |

## Newly failing (0)
