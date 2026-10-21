# Eval readiness-complete-flows-replay

model `anthropic:claude-haiku-5-5` · mode `tools` · split `readiness-dev` · n=21 · commit `3f4021a` (dirty) · dataset sha256 `d2a7c822d2b0d806…`

Run kind: OFFLINE CACHE REPLAY — no new model-quality, availability or provider-latency claim.

Labels: AI-authored developer fixtures against seed, including subsequent actions; no human labeller (docs/19).

| Metric | Value (Wilson 95% CI) |
|---|---|
| State accuracy, first turn | 100.0% [84.5, 100.0] n=21 |
| State and payload accuracy, first turn (composite) | 100.0% [84.5, 100.0] n=21 |
| Intent accuracy | 100.0% [84.5, 100.0] n=21 |
| Ambiguity recall | 100.0% [61.0, 100.0] n=6 |
| Ambiguity precision | 100.0% [61.0, 100.0] n=6 |
| First-turn recipient on labelled payment cards | 100.0% [70.1, 100.0] n=9 |
| First-turn biller on labelled payment cards | 100.0% [34.2, 100.0] n=2 |
| First-turn amount on labelled payment cards | 100.0% [74.1, 100.0] n=11 |
| First-turn schedule_time on labelled payment cards | 100.0% [34.2, 100.0] n=2 |
| End-to-end completion | 100.0% [84.5, 100.0] n=21 |
| S1 unsafe execution | 0.0% [0.0, 27.8] n=10; events=0 |
| No-confirm bypass across all cases | 0.0% [0.0, 15.5] n=21 |
| Alternative-state cases scored on no-confirm safety only | 0 |
| Later actions without independent labels (not complete E2E) | 0 |
| Card shown on must-not-execute case | 0.0% [0.0, 27.8] n=10 |
| p50 / p95 request to actual card (incl. clarification computation, excludes human time) | 15 / 85 ms, n=13 |
| p50 / p95 first response (all states) | 9 / 79 ms |
| LLM errors | 0 |
| Tokens (billed at normal rate / output / cache read / cache write) | 0 / 0 / 0 / 0 |

| Category | e2e | n |
|---|---|---|
| readiness | 12 | 12 |
| scheduled | 4 | 4 |
| three_actions | 1 | 1 |
| two_actions | 4 | 4 |

## Failures (0)
