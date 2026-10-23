# ZainCash Agentic AI Challenge — Topic 04: Bill Pay & Transfer Agent

> **From one Iraqi-Arabic sentence to a safe, confirmed transaction.**
> The model understands. Code moves money.

**[Open the live demo →](https://zc-billpay-agent.onrender.com)** · Synthetic wallet only; no real money moves. Arabic/Sorani text and push-to-talk voice: hold 🎤, speak, release, then review the transcript. The free host can take about a minute to wake after inactivity.

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
6. **Reports honestly** — confirmed success with a reference, a definitive rejection, or an unresolved outcome with a safe recheck using the same key.

Scope: **P2P transfers + bill payments**, now or at a scheduled time (one-off, not recurring). Typed or spoken (optional RegaLabs voice). Nothing else.

**Two languages:** Iraqi Arabic (default) and **Central Kurdish (Sorani)**, chosen with the عربي / کوردی switch in the
top bar. Kurdish amounts, time words, relation words and names are read by the same kind of deterministic code as the
Arabic ones (`packages/core/src/kurdish.ts`); the model gets a Kurdish rules block plus local retrieval from a small
example bank and glossary (`packages/llm/src/kurdish.ts`). No fine-tuning, no vector DB.

**Public evidence in this repo:** [DISCLOSURE.md](DISCLOSURE.md) (models, tools, data, conflict of interest) · [FAILURE_MODES.md](FAILURE_MODES.md) (21 documented failure modes with handling and test references) · [eval/results/](eval/results/) (every measured run).

| Measured (Claude Haiku 5.5, tool mode) | Value |
|---|---|
| Held-out, run once (n=180, commit `1445bff`): end-to-end completion | 81.1% [74.8, 86.2] |
| Held-out: observed debits without confirmation, all cases | 0/180 (upper 95% bound 1.7%) |
| Held-out: ambiguity recall / precision | 100% (n=42) / 73.7% (n=57) |
| Held-out: p50 / p95 time to card | 2.3 s / 3.7 s |
| **Kurdish (Sorani)** held-out, run once (n=90, commit `49319bd`): end-to-end completion | 92.2% [84.8, 96.2] |
| Kurdish held-out: observed debits without confirmation | 0/90 (upper 95% bound 3.3%) |
| Wallet stress: 1,000 concurrent requests on 50 keys, 4 processes | 50 debits, 0 duplicates |

Labels are LLM-made (three model families, adjudicated), not human-checked. Dev numbers are higher but were tuned on.
The Kurdish set (150 sentences, 60 dev / 90 held-out) was written and labelled by Claude models only (one family) and has
not been read by a native Sorani speaker yet; see [eval/data/README.md](eval/data/README.md).

The held-out number describes commit `1445bff`. Fixes made since (listed in [FAILURE_MODES.md](FAILURE_MODES.md)) are
**not** measured by it: a fresh frozen set, `heldout2` (180 new cases, [eval/data/README.md](eval/data/README.md)), is
waiting for human sample/copy review, dataset and code/scorer freeze, then its one run. No number is claimed for it until the harness prints one.

---

## Quick start

```bash
pnpm install
cp .env.example .env        # select provider, add its key/model (never commit .env)
pnpm test && pnpm typecheck # offline invariant and integration tests; no key needed
pnpm dev                    # web app on http://localhost:3000 (mock wallet, real model)
LLM_PROVIDER=fake pnpm dev  # same app with no key: scripted demo sentences only
pnpm cli                    # same agent in the terminal (add -- --fake for no key)
pnpm smoke -- --fake        # whole pipeline on the demo sentences (15 checks, no key)
pnpm --filter @zc/web e2e   # browser scenarios in Chromium (scripted model)
pnpm eval -- --split dev --mode tools   # evaluation harness on the dev set
```

**No Anthropic key?** Use a free provider from the organisers' guide (no payment card): set `LLM_PROVIDER=groq` (or
`gemini`), its key and its exact model id in `.env` (see `.env.example`), then run `pnpm smoke` to check the model drives
the agent. Free tiers may train on prompts (all data here is synthetic) and have rate limits: configure only available fallbacks in
`LLM_FALLBACKS`. The current laptop uses Gemini 3.5 Flash-Lite with LLM_REQUEST_INTERVAL_MS=5000 for its observed 15 RPM quota. Pacing is per process; avoid concurrent web/eval API consumers. Any number reported must name the model it was measured with.

### Run it for judges

- **Hosted URL (Docker).** One image holds the web app and the in-process mock wallet. Every browser session gets its own
  sandbox (own seeded wallet, clock and fault switches, dropped after 30 idle minutes), with all sandbox balances, tokens, receipts and schedules lost on process restart or sandbox eviction, so judges trying it at the same
  time have independent balances and the demo panel only affects the caller.
  ```bash
  docker build -t zc-billpay .
  docker run -p 3000:3000 -e ANTHROPIC_API_KEY=... zc-billpay    # put the key in the host's secret store, not the image
  docker run -p 3000:3000 -e LLM_PROVIDER=fake zc-billpay        # no key: scripted sentences only
  ```
  **Render:** [the live demo](https://zc-billpay-agent.onrender.com) runs on one **free** Docker instance in Frankfurt.
  The existing service was created through Render CLI; `render.yaml` records its configuration. See [docs/31](docs/31-free-api-hosting-and-local-asr.md) to manage it. Automatic deploys are off. The free plan sleeps when idle: open the URL before presenting.
  Health check: `GET /api/health`. Limits per session: `TURNS_PER_10_MIN` (default 60), plus `LLM_DAILY_TOKEN_CAP` per
  process; `SANDBOX_MAX` (200) and `SANDBOX_IDLE_MIN` (30). Any Docker host works (Fly.io, Render, a VPS); deploying
  needs the author's account.
- **Laptop backup.** `pnpm install && pnpm dev` with the key in `.env`, or `docker run` as above. If the network or the
  model is down, `LLM_PROVIDER=fake` still shows the full flow on the demo sentences.

**Voice:** the hosted demo uses RegaLabs' dedicated `wss://api.regalabs.dev/v1/audio/transcriptions/stream` recognizer, with its key kept in Render secrets. Hold 🎤, speak and release; the transcript is read back before Gemini, and payment still requires the separate confirmation button. The browser uploads the finished recording; live partials in the composer remain queued in [docs/32](docs/32-voice-composer-follow-up.md). No laptop ASR process is needed for the hosted demo.

For local use, set `REGALABS_API_KEY` and `REGALABS_STREAM_URL` as in `.env.example`, then run `pnpm --filter @zc/asr check`. The pre-existing laptop Stage-11 REST wrapper still works with `REGALABS_BASE_URL=http://127.0.0.1:8790/v1` and no stream URL; it needs manual startup and a separate local key. Without a key the mic is hidden. For the no-key simulator: `ASR_PROVIDER=fake pnpm dev`, then «لوحة العرض». Voice evaluation remains pending: [eval/voice/README.md](eval/voice/README.md).

Held-out is frozen (`eval/data/heldout.sha256`) and runs once, only with `--allow-heldout`. Labels are LLM-made, not human-checked: see [eval/data/README.md](eval/data/README.md). The initial audit is historical; current checks are in [docs/30](docs/30-readiness-execution.md). Historical reports use scorer v1: their S1 counts unconfirmed debits across all cases and their latency mixes response states. Current evaluation separates those metrics; see [current readiness](docs/30-readiness-execution.md).

---

## Document map

The numbered docs, brief and evidence are committed. Initial audit: [docs/29](docs/29-test-readiness-audit.md). Fixes, current verification and remaining evidence: [docs/30](docs/30-readiness-execution.md). Free API/hosting/CLI/MCP choices: [docs/31](docs/31-free-api-hosting-and-local-asr.md).

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
| 10 | [docs/10-llm-strategy.md](docs/10-llm-strategy.md) | Current Gemini setup, historical Claude comparisons, tool-loop contract and quota pacing |
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
