# 22 — Submission Checklist

## Dated deliverables
- [x] **22/10** design brief uploaded (Typeform, `Name_Topic`, GitHub link)
- [ ] **08/11** MVP: E2E core, repo history, first results, 1-page update
- [ ] Progress review / Demo Day: dates TBC

## Gates (fail any = not scored)
- [ ] Public/accessible repo with commit history **spanning the build period** (public ✔; keep committing on more days)
- [ ] Live run on judge-supplied input works (text at minimum)
- [x] Full disclosure (public `DISCLOSURE.md`; docs/19 local), incl. RegaLabs conflict of interest — finalise Human vs AI
- [x] ≥3 documented failure modes with handling (public `FAILURE_MODES.md`: 16)

## Must-haves from the brief
- [x] Nothing executes without explicit confirmation (token tests + property tests)
- [x] Ambiguity → asks (two Ahmeds demo; held-out ambiguity recall 100%)
- [x] Retries never double-pay (stress: 0 duplicates in 1,000 requests; live fault toggle)
- [x] Honest failure messages (insufficient, biller down, unknown)
- [x] Mock wallet with duplicates + similar names
- [x] ≥50 dialect requests incl. ambiguous + malformed (dev 120 + held-out 180)
- [x] Results incl. requests that should NOT go through (S1 0/180)

## Evidence
- [x] Results table with real numbers (docs/12) — Groq/Gemini not run (no keys), said so
- [x] Held-out hash committed before the run; never tuned on
- [ ] API keys absent from repo (organisers scan)
- [x] Error analysis with worst failures (eval/results/heldout-haiku-tools.md)
- [ ] Voice WER/CER on our subset (if voice shipped)
- [ ] Interview log + synthesis (docs/17)

## Demo
- [ ] Demo script rehearsed ×3 (docs/18)
- [ ] Backup screen recording
- [ ] Seed reset, faults off
- [ ] Network backup

## Repo hygiene
- [x] README explains run in ≤5 commands
- [x] `.env.example`, no secrets committed (gitleaks in CI)
- [x] `pnpm test` green (CI: typecheck, test, build, gitleaks, OSV-Scanner)
- [x] License file (proprietary; ask organisers whether judges may run it)
