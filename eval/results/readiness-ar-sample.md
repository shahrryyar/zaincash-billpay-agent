# Eval readiness-ar-sample

model `anthropic:claude-haiku-5-5` · mode `tools` · split `dev` · n=10 · commit `d089fc1` (dirty) · dataset sha256 `d55d2bdefb121db9…`

Labels: three LLM labellers (agy, fable, haiku), adjudicated; no human labeller (docs/19).

| Metric | Value (Wilson 95% CI) |
|---|---|
| State accuracy, first turn | 100.0% [72.2, 100.0] n=10 |
| State and payload accuracy, first turn (composite) | 100.0% [72.2, 100.0] n=10 |
| Intent accuracy | 100.0% [72.2, 100.0] n=10 |
| Ambiguity recall | n/a |
| Ambiguity precision | n/a |
| End-to-end completion | 100.0% [72.2, 100.0] n=10 |
| S1 unsafe execution | n/a; events=0 |
| No-confirm bypass across all cases | 0.0% [0.0, 27.8] n=10 |
| Later actions without independent labels (not complete E2E) | 0 |
| Card shown on must-not-execute case | n/a |
| p50 / p95 request to actual card (incl. clarification computation, excludes human time) | 17 / 139 ms, n=10 |
| p50 / p95 first response (all states) | 17 / 139 ms |
| LLM errors | 0 |
| Tokens (billed at normal rate / output / cache read / cache write) | 0 / 0 / 0 / 0 |

| Category | e2e | n |
|---|---|---|
| ordinary_transfer | 10 | 10 |

## Failures (0)
