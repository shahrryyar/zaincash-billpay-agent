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

Scope: **P2P transfers + bill payments. Nothing else.**

---

## Quick start

```bash
pnpm install
cp .env.example .env        # add ANTHROPIC_API_KEY (never commit .env)
pnpm test && pnpm typecheck # 500+ tests, offline, no key needed
pnpm dev                    # web app on http://localhost:3000 (mock wallet, real model)
pnpm cli                    # same agent in the terminal (add -- --fake for no key)
pnpm eval -- --split dev --mode tools   # evaluation harness on the dev set
```

Held-out is frozen (`eval/data/heldout.sha256`) and runs once, only with `--allow-heldout`. Labels are LLM-made, not human-checked: see [eval/data/README.md](eval/data/README.md). Note: `docs/` is kept local, so the links below only work on the author's machine.

---

## Document map

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
| 09 | [docs/09-voice-asr-regalabs.md](docs/09-voice-asr-regalabs.md) | RegaLabs Iraqi-Arabic ASR (streaming + offline), LiveKit, confidence gating |
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
