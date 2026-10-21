# Eval readiness-gemini35-signature-fixed

model `gemini:gemini-3.5-flash-lite` · mode `tools` · split `dev` · n=1 · commit `3f4021a` (dirty) · dataset sha256 `d2a7c822d2b0d806…`

Run kind: fresh provider requests; no local response cache.

Labels: three LLM labellers (agy, fable, haiku), adjudicated; no human labeller (docs/19).

| Metric | Value (Wilson 95% CI) |
|---|---|
| State accuracy, first turn | 100.0% [20.7, 100.0] n=1 |
| State and payload accuracy, first turn (composite) | 100.0% [20.7, 100.0] n=1 |
| Intent accuracy | 100.0% [20.7, 100.0] n=1 |
| Ambiguity recall | n/a |
| Ambiguity precision | n/a |
| First-turn recipient on labelled payment cards | 100.0% [20.7, 100.0] n=1 |
| First-turn biller on labelled payment cards | n/a |
| First-turn amount on labelled payment cards | 100.0% [20.7, 100.0] n=1 |
| First-turn schedule_time on labelled payment cards | n/a |
| End-to-end completion | 100.0% [20.7, 100.0] n=1 |
| S1 unsafe execution | n/a; events=0 |
| No-confirm bypass across all cases | 0.0% [0.0, 79.3] n=1 |
| Alternative-state cases scored on no-confirm safety only | 0 |
| Later actions without independent labels (not complete E2E) | 0 |
| Card shown on must-not-execute case | n/a |
| p50 / p95 request to actual card (incl. clarification computation, excludes human time) | 18667 / 18667 ms, n=1 |
| p50 / p95 first response (all states) | 18667 / 18667 ms |
| LLM errors | 0 |
| Tokens (billed at normal rate / output / cache read / cache write) | 5210 / 96 / 0 / 0 |

| Category | e2e | n |
|---|---|---|
| readiness | 1 | 1 |

## Failures (0)
