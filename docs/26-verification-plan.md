# 26 — Verification Plan (evidence that is not "the author says so")

Rule: every claim needs a check that **someone or something other than the author or the author's AI** performs.

## 1. Threat model (STRIDE, money path)

| Threat | Example | Control | Test |
|---|---|---|---|
| **S**poofing | Replay another session's token | Token bound to session + payload hash | Execute with token from session B → 403 |
| **T**ampering | Edit amount after card shown | Payload-hash binding; new card on change | Tamper → 403 |
| **R**epudiation | "I never confirmed" | Wallet SQLite events and in-memory orchestrator trace (docs/14) | Check events and references; full durable session replay is not implemented |
| **I**nfo disclosure | Full phones/balances to LLM provider; PII in logs | Masked handles; redacted logs; synthetic data | Grep prompts/logs for full numbers |
| **D**oS | Burn LLM budget / free-tier quota | Per-session rate limit, daily budget cap, fallback chain | Flood test; budget trips → honest "busy" |
| **E**levation | Model calls execute; injection via contact name or note | No execute tool; downstream token check; tool results wrapped as data | Injection set (docs/11) + tool-result injection cases |

**OWASP LLM Top 10 (2025) checklist:** LLM01 prompt injection · LLM02 sensitive info disclosure · LLM05 improper output handling (Zod) · **LLM06 excessive agency** · LLM07 system prompt leakage · LLM10 unbounded consumption. Walk every item; record "mitigated by / not applicable". *(Walked through item by item in docs/14, 2026-10-25.)*

## 2. Machine-checked invariants (CI, no LLM involved)
- **Property-based tests** (`fast-check`) on `parseAmount`, `normalise`, resolver: no crash, idempotent normalisation, amount round-trip.
- **Model-based test of the reducer:** random event sequences; assert no path reaches `EXECUTING` without `AWAITING_CONFIRM` + valid token.
- **Wallet ledger oracle:** after any test, `sum(balances)` conserved; `count(transactions) == count(distinct idempotency keys that succeeded)`.
- **Concurrency (as built):** own Vitest fixture: 4 OS processes × 50 keys × 5 repeats = 1,000 requests → 50 debits, 0 duplicates (`eval/results/wallet-safety-stress.json`, `pnpm stress`).
- **Fault chaos:** `timeout_after_commit`, 5xx before commit, biller down; retries never double-debit.
- CI runs all on every push (typecheck, test, build, gitleaks, OSV-Scanner). A red CI blocks demo builds.
- Property tests found a real bug on 2026-10-17: a bare «أبو» resolved to the only «أبو …» contact; fixed with a regression test.

## 3. Evaluation that others can check
- **Pre-registered held-out:** SHA-256 committed before dev tuning (v0–v5) and before its single run. (The first prompt existed on 15/10, before the split was labelled; held-out rows never entered prompts or few-shots.)
- **Labellers (as done):** no human. Three LLM families (agy, Fable, Haiku) labelled independently; Cohen's kappa in `eval/data/agreement.json`; disagreements adjudicated by script and logged. Disclosed as a limitation. A native-speaker check of ≥50 items is still wanted.
- **Confidence intervals:** report Wilson 95% CI for every rate. At n≈180 a 90% rate has ≈ ±4–5 pp; zero-event gates (S1–S3) report the **rule-of-three upper bound** (0/180 ⇒ true rate ≤ ~1.7% with 95% confidence), not "proven 0".
- **Ablation:** workflow vs tool loop; Haiku vs Sonnet vs a free model; on dev, then one held-out run each for the final candidate only.
- **Contamination check:** held-out never appears in prompts/few-shots (grep by hash of normalised text).
- **Dialect realism:** ≥50 items reviewed by ≥1 non-author Iraqi speaker; report % rewritten.
- Compare against MADAR-style real dialect phrasing (cite corpus + licence) so the test set isn't only LLM-flavoured.

## 4. Independent humans
- **Usability test (3–5 people, 10 min each):** tasks = "pay the generator", "send 50k to Ahmed (two Ahmeds)", "undo a mistake". Record: success without help, time, where they hesitate, whether they notice "nothing sent yet". Success criterion: ≥4/5 complete without help; 0 misread amounts/recipients.
- **Interview script** in docs/17; add: "How do you pay today? Who helps you?" to test the **taps/voice hypothesis** that app reviews don't support (docs/research/01).
- **Red-team session:** a friend (or another model family) gets 20 minutes to break it. Every successful attack becomes a regression test and a documented failure mode.

## 5. External references as oracles
- PSD2 RTS Art. 5 (dynamic linking) → token tests mirror Art. 5(1)(a)–(d).
- IETF idempotency draft-07 → design reference; this mock stores/replays results but does not implement every draft status (for example, no in-progress 409).
- OWASP LLM06 → checklist.
- Judges' surprise input at the demo is the final unseen test.

## 6. Reporting rules
- Every number carries: model id, mode (workflow/tools), commit SHA, seed hash, held-out hash, n, CI.
- Failures are listed with verbatim input, root cause (dialect / model / resolver / ASR / data), and the fix status.
- Claims we **cannot** support yet are labelled "hypothesis" (e.g., "Claude best on dialect", "voice helps older users").
