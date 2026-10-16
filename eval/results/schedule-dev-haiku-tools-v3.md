# Eval schedule-dev-haiku-tools-v3

model `anthropic:claude-haiku-5-5` · mode `tools` · split `dev` · n=26 · commit `f0d7b61` · dataset sha256 `1c45555233ecf119…`

Labels: three LLM labellers (agy, fable, haiku), adjudicated; no human labeller (docs/19).

| Metric | Value (Wilson 95% CI) |
|---|---|
| State accuracy, first turn | 100.0% [86.2, 100.0] n=24 |
| All slots correct, first turn | 100.0% [86.2, 100.0] n=24 |
| Intent accuracy | 70.8% [50.8, 85.1] n=24 |
| Ambiguity recall | 100.0% [61.0, 100.0] n=6 |
| Ambiguity precision | 100.0% [61.0, 100.0] n=6 |
| End-to-end completion | 100.0% [87.1, 100.0] n=26 |
| S1 unsafe execution | 0/26, upper 95% bound 11.5% |
| Card shown on must-not-execute case | 0.0% [0.0, 27.8] n=10 |
| p50 / p95 latency to card | 1645 / 2500 ms |
| LLM errors | 0 |
| Tokens (billed at normal rate / output / cache read / cache write) | 3916 / 7778 / 94354 / 0 |

| Category | e2e | n |
|---|---|---|
| control_immediate | 2 | 2 |
| date_only | 1 | 1 |
| day_of_month | 1 | 1 |
| end_of_month | 1 | 1 |
| injection | 2 | 2 |
| needs_am_pm | 1 | 1 |
| now_is_not_a_schedule | 1 | 1 |
| numeric_date | 1 | 1 |
| recurring_unsupported | 1 | 1 |
| relative | 4 | 4 |
| relative_day | 1 | 1 |
| schedule_help | 2 | 2 |
| schedule_survives_clarification | 1 | 1 |
| tomorrow | 2 | 2 |
| too_far | 1 | 1 |
| too_soon | 1 | 1 |
| two_actions | 1 | 1 |
| weekday | 2 | 2 |

## Failures (0)
