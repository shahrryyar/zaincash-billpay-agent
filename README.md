# ZainCash Agentic AI Challenge — Topic 04: Bill Pay & Transfer Agent

> **From one Iraqi-Arabic sentence to a safe, confirmed transaction.**
> The model understands. Code moves money.

Solo entry by Shahryar Sabir Muhammed (RegaLabs). Status: **working end to end** (core, mock wallet, LLM layer, orchestrator, web app, eval harness). Project state: [MEMORY.md](MEMORY.md). **Deadlines: design brief 22/10, MVP 08/11.**

---

## The one-minute version

A ZainCash user says or types one sentence in Iraqi Arabic:

> «دز خمسين ألف لأحمد» — "Send 50,000 to Ahmed."

The agent:

1. **Understands** it (LLM → strict JSON intent, validated by Zod).
2. **Resolves** it against a mock ZainCash wallet (contacts, billers, balance) with deterministic code.
3. **Asks** when anything is unclear — two Ahmeds is a question, never a coin flip.
4. **Shows a confirmation card** — nothing moves without an explicit tap.
5. **Executes once** — confirmation token + idempotency key, so retries never double-debit.
6. **Reports honestly** — success with a reference, or «ما انرسل شي، رصيدك نفسه ما تغيّر» ("Nothing was sent, your balance is unchanged").

Scope: **P2P transfers + bill payments**, now or at a scheduled time (one-off, not recurring). Typed or spoken (optional RegaLabs voice). Nothing else.

**Two languages:** Iraqi Arabic (default) and **Central Kurdish (Sorani)**, chosen with the عربي / کوردی switch in the
top bar. Kurdish amounts, time words, relation words and names are read by the same kind of deterministic code as the
Arabic ones (`packages/core/src/kurdish.ts`); the model gets a Kurdish rules block plus local retrieval from a small
example bank and glossary (`packages/llm/src/kurdish.ts`). No fine-tuning, no vector DB.

**Public evidence in this repo:** [DISCLOSURE.md](DISCLOSURE.md) (models, tools, data, conflict of interest) · [FAILURE_MODES.md](FAILURE_MODES.md) (20 failure modes, each tested) · [eval/results/](eval/results/) (every measured run).

| Measured (Claude Haiku 5.5, tool mode) | Value |
|---|---|
| Held-out, run once (n=180, commit `1445bff`): end-to-end completion | 81.1% [74.8, 86.2] |
| Held-out: unsafe executions on must-not-execute cases | 0/180 (upper 95% bound 1.7%) |
| Held-out: ambiguity recall / precision | 100% (n=42) / 73.7% (n=57) |
| Held-out: p50 / p95 time to card | 2.3 s / 3.7 s |
| **Kurdish (Sorani)** held-out, run once (n=90, commit `49319bd`): end-to-end completion | 92.2% [84.8, 96.2] |
| Kurdish held-out: unsafe executions | 0/90 (upper 95% bound 3.3%) |
| Wallet stress: 1,000 concurrent requests on 50 keys, 4 processes | 50 debits, 0 duplicates |

Labels are LLM-made (three model families, adjudicated), not human-checked. Dev numbers are higher but were tuned on.
The Kurdish set (150 sentences, 60 dev / 90 held-out) was written and labelled by Claude models only (one family) and has
not been read by a native Sorani speaker yet; see [eval/data/README.md](eval/data/README.md).

The held-out number describes commit `1445bff`. Fixes made since (listed in [FAILURE_MODES.md](FAILURE_MODES.md)) are
**not** measured by it: a fresh frozen set, `heldout2` (180 new cases, [eval/data/README.md](eval/data/README.md)), is
waiting for its one run. No number is claimed for it until the harness prints one.

---

## Quick start

```bash
pnpm install
cp .env.example .env        # add ANTHROPIC_API_KEY (never commit .env)
pnpm test && pnpm typecheck # 775 unit tests, offline, no key needed
pnpm dev                    # web app on http://localhost:3000 (mock wallet, real model)
LLM_PROVIDER=fake pnpm dev  # same app with no key: scripted demo sentences only
pnpm cli                    # same agent in the terminal (add -- --fake for no key)
pnpm smoke -- --fake        # whole pipeline on the demo sentences (15 checks, no key)
pnpm --filter @zc/web e2e   # 8 browser tests in Chromium (scripted model)
pnpm eval -- --split dev --mode tools   # evaluation harness on the dev set
```

**No Anthropic key?** Use a free provider from the organisers' guide (no payment card): set `LLM_PROVIDER=groq` (or
`gemini`), its key and its exact model id in `.env` (see `.env.example`), then run `pnpm smoke` to check the model drives
the agent. Free tiers may train on prompts (all data here is synthetic) and have rate limits: keep a fallback in
`LLM_FALLBACKS`. Any number reported must name the model it was measured with.

### Run it for judges

- **Hosted URL (Docker).** One image holds the web app and the in-process mock wallet. Every browser tab gets its own
  sandbox (own seeded wallet, clock and fault switches, dropped after 30 idle minutes), so judges trying it at the same
  time never see each other's balance and the demo panel only affects the caller.
  ```bash
  docker build -t zc-billpay .
  docker run -p 3000:3000 -e ANTHROPIC_API_KEY=... zc-billpay    # put the key in the host's secret store, not the image
  docker run -p 3000:3000 -e LLM_PROVIDER=fake zc-billpay        # no key: scripted sentences only
  ```
  **Render** (the organisers' suggestion): `render.yaml` is a ready Blueprint (render.com → New → Blueprint → this repo,
  then enter the key in the dashboard). The free plan sleeps when idle: open the URL before presenting.
  Health check: `GET /api/health`. Limits per session: `TURNS_PER_10_MIN` (default 60), plus `LLM_DAILY_TOKEN_CAP` per
  process; `SANDBOX_MAX` (200) and `SANDBOX_IDLE_MIN` (30). Any Docker host works (Fly.io, Render, a VPS); deploying
  needs the author's account.
- **Laptop backup.** `pnpm install && pnpm dev` with the key in `.env`, or `docker run` as above. If the network or the
  model is down, `LLM_PROVIDER=fake` still shows the full flow on the demo sentences.

**Voice (optional):** set `REGALABS_API_KEY` in `.env`, check it with `pnpm --filter @zc/asr check`, then hold the 🎤 button. Without a key the mic is hidden. To try the voice flow with no key: `ASR_PROVIDER=fake pnpm dev` and use the simulator in «لوحة العرض». Voice eval: [eval/voice/README.md](eval/voice/README.md).

Held-out is frozen (`eval/data/heldout.sha256`) and runs once, only with `--allow-heldout`. Labels are LLM-made, not human-checked: see [eval/data/README.md](eval/data/README.md). Note: `docs/` is kept local, so the links below only work on the author's machine.

---

## Document map

> The numbered planning docs (`docs/00`–`28`) are the author's working spec and are **kept local** (not in this public
> repo), so those links do not resolve on GitHub. Everything a judge needs is in the files that are committed:
> this README, [AGENTS.md](AGENTS.md), [MEMORY.md](MEMORY.md), [DISCLOSURE.md](DISCLOSURE.md),
> [FAILURE_MODES.md](FAILURE_MODES.md) and [eval/](eval/).

| # | File | What it answers |
|---|------|-----------------|
| — | [AGENTS.md](AGENTS.md) | Rules for any AI coding assistant working in this repo |
| — | [CLAUDE.md](CLAUDE.md) | Pointer to AGENTS.md for Claude Code |
| 00 | [docs/00-official-brief.md](docs/00-official-brief.md) | The organisers' brief, rules, judging weights, gates — verbatim intent |
| 01 | [docs/01-problem-and-users.md](docs/01-problem-and-users.md) | Who suffers, personas, intended use cases, user stories |
| 02 | [docs/02-scope.md](docs/02-scope.md) | In / out of scope, never-cut list, cut order |
| 03 | [docs/03-architecture.md](docs/03-architecture.md) | Layers, components, data flow, stack |
| 04 | [docs/04-state-machine.md](docs/04-state-machine.md) | Transaction states, transitions, guards |
| 05 | [docs/05-intent-schema.md](docs/05-intent-schema.md) | The JSON contract between LLM and code |
| 06 | [docs/06-mock-wallet-api.md](docs/06-mock-wallet-api.md) | Mock ZainCash wallet: data model, endpoints, errors, fault injection |
| 07 | [docs/07-confirmation-and-idempotency.md](docs/07-confirmation-and-idempotency.md) | How "0 unconfirmed" and "0 duplicates" are guaranteed |
| 08 | [docs/08-iraqi-dialect-nlu.md](docs/08-iraqi-dialect-nlu.md) | Iraqi Arabic: verbs, numbers, money slang, names, normalisation |
| 09 | [docs/09-voice-asr-regalabs.md](docs/09-voice-asr-regalabs.md) | RegaLabs Iraqi-Arabic ASR (developer API), push-to-talk, confidence gate and read-back |
| 10 | [docs/10-llm-strategy.md](docs/10-llm-strategy.md) | Claude primary + free fallbacks, tool-loop vs workflow, prompts, fine-tune only if needed |
| 11 | [docs/11-synthetic-data.md](docs/11-synthetic-data.md) | Generating the wallet + test set with an LLM |
| 12 | [docs/12-evaluation.md](docs/12-evaluation.md) | Metrics, harness, hard gates, results tables |
| 13 | [docs/13-failure-modes.md](docs/13-failure-modes.md) | Documented failure modes and handling (gate needs ≥3) |
| 14 | [docs/14-security-privacy-grounding.md](docs/14-security-privacy-grounding.md) | Prompt injection, PII, audit log, grounding |
| 15 | [docs/15-ux-and-copy.md](docs/15-ux-and-copy.md) | Screens, confirmation card, RTL, every user-facing message in dialect |
| 16 | [docs/16-whatsapp-channel.md](docs/16-whatsapp-channel.md) | Optional second channel |
| 17 | [docs/17-user-research.md](docs/17-user-research.md) | Interview guide and log — worth 20% of score |
| 18 | [docs/18-demo-script.md](docs/18-demo-script.md) | Minute-by-minute demo, live judge input, break-it-on-purpose |
| 19 | [docs/19-disclosure.md](docs/19-disclosure.md) | Models, tools, data, AI assistants, conflict of interest |
| 20 | [docs/20-build-plan.md](docs/20-build-plan.md) | Real timeline (22/10, 08/11), milestones, week plan |
| 21 | [docs/21-repo-structure.md](docs/21-repo-structure.md) | Monorepo layout, scripts, env vars |
| 22 | [docs/22-submission-checklist.md](docs/22-submission-checklist.md) | Everything that must exist before submitting |
| 23 | [docs/23-judge-qa-prep.md](docs/23-judge-qa-prep.md) | Hard questions judges may ask, with answers |
| 24 | [docs/24-glossary.md](docs/24-glossary.md) | Terms and dialect phrase glossary |
| 27 | [docs/27-scheduling.md](docs/27-scheduling.md) | Scheduled payments: time parsing, token-bound time, exactly-once runner |
| 28 | [docs/28-mvp-update.md](docs/28-mvp-update.md) | One-page MVP update for 08/11 |
| 26 | [docs/26-verification-plan.md](docs/26-verification-plan.md) | Threat model, machine-checked invariants, independent verification |
| R | [docs/research/](docs/research/) | App-review mining (raw data + script) and standards/teardown |
| 25 | [docs/25-open-questions.md](docs/25-open-questions.md) | Answered + still-open questions |

---

## Judging weights (memorise)

| Dimension | Weight | Our answer |
|---|---|---|
| Working prototype & reliability | 25% | Live on judge input; deterministic execution layer |
| Technical judgment & architecture | 20% | LLM only understands; plain state machine; no unjustified complexity |
| Problem & impact | 20% | User interviews logged in docs/17 |
| Grounding, security, responsibility | 15% | Every entity resolved from wallet data; tokens; fail closed |
| Evaluation evidence | 15% | 150–200 held-out dialect requests + voice subset, honest numbers |
| Demo clarity | 5% | Hero scenario in the first 60 seconds |

**Gates before scoring:** repo with commit history across the build period · live run on judge input · full disclosure · ≥3 documented failure modes.

## License

**Proprietary, all rights reserved** (see [LICENSE](LICENSE)). Built for the ZainCash Agentic AI Challenge. No one other than the author may use, run or copy this code until the license is updated.
