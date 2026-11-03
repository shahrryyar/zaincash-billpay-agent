# Re-scored heldout-haiku-tools.json

offline re-score of stored stage observations and replies with the current score.ts; stored wallet outcomes kept; can only lower a stored e2e; no model or orchestrator was run.

| Metric | Value (Wilson 95% CI) |
|---|---|
| E2E all rows, as stored | 81.1% [74.8, 86.2] n=180 |
| E2E all rows, re-scored | 81.1% [74.8, 86.2] n=180 |
| E2E payment rows (alternative-safe-state rows excluded), re-scored | 79.4% [72.3, 85.0] n=155 |
| E2E payment rows, as stored | 79.4% [72.3, 85.0] n=155 |
| E2E alternative-safe-state rows, re-scored / as stored | 92.0% [75.0, 97.8] n=25 / 92.0% [75.0, 97.8] n=25 |
| Ambiguity recall / precision, labelled slot (payment rows) | 100.0% [91.6, 100.0] n=42 / 73.7% [61.0, 83.4] n=57 |
| Ambiguity recall / precision, any slot (payment rows) | 100.0% [91.6, 100.0] n=42 / 73.7% [61.0, 83.4] n=57 |

Notes: failure_code_checks_skipped=18, stages_without_label=0, stages_without_reply=0, replies_possibly_truncated=0, cases_missing_from_data=0.

| Category | e2e | n | rate (Wilson 95% CI) |
|---|---|---|---|
| ambiguous_amount | 7 | 7 | 100.0% [64.6, 100.0] n=7 |
| ambiguous_recipient | 19 | 20 | 95.0% [76.4, 99.1] n=20 |
| dialect_variation_arabizi | 14 | 16 | 87.5% [64.0, 96.5] n=16 |
| injection | 7 | 7 | 100.0% [64.6, 100.0] n=7 |
| insufficient_balance | 5 | 10 | 50.0% [23.7, 76.3] n=10 |
| malformed | 2 | 10 | 20.0% [5.7, 51.0] n=10 |
| missing_amount | 13 | 13 | 100.0% [77.2, 100.0] n=13 |
| ordinary_bill | 18 | 20 | 90.0% [69.9, 97.2] n=20 |
| ordinary_transfer | 21 | 25 | 84.0% [65.3, 93.6] n=25 |
| out_of_scope | 4 | 8 | 50.0% [21.5, 78.5] n=8 |
| similar_names | 8 | 13 | 61.5% [35.5, 82.3] n=13 |
| two_actions | 12 | 13 | 92.3% [66.7, 98.6] n=13 |
| unknown_biller | 6 | 8 | 75.0% [40.9, 92.9] n=8 |
| unknown_contact | 10 | 10 | 100.0% [72.2, 100.0] n=10 |

## Newly failing (0)
