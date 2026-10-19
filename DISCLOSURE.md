# Disclosure (gate: full disclosure)

ZainCash Agentic AI Challenge, Topic 04 (Bill Pay & Transfer Agent). Solo entry: Shahryar Sabir Muhammed (RegaLabs).
Using AI is expected; this file lists every model, tool, library and data source. Kept current with the code.

## Conflict of interest and prior work
- The author founded **RegaLabs**. The optional voice input uses the **RegaLabs speech-to-text API**
  (`POST https://api.regalabs.dev/v1/audio/transcriptions`), a RegaLabs service built **before** the challenge.
  It is called as an external API, like any cloud ASR. **No RegaLabs code is copied into this repo**; the client in
  `packages/asr` was written for this project against the public API shape.
- Voice is optional: with no ASR key the mic is hidden and the text path is unchanged.
- No voice accuracy number is claimed yet. RegaLabs' own figures come from its own test sets; WER/CER on this task
  will be measured on consented recordings (`eval/voice/`) before any voice claim is made.

## Models
| Purpose | Model | Where |
|---|---|---|
| Intent understanding, live (paid, author's key) | Anthropic Claude Haiku 5.5 (`claude-haiku-5-5`), temperature 0, prompt caching on the stable prefix | `packages/llm` |
| Comparison on dev only | Anthropic Claude Sonnet 5.5 (`claude-sonnet-5-5`) | `eval/results/dev-sonnet-tools.md` |
| Fallbacks wired, **not used for any reported number** (no keys) | Groq, Gemini, OpenRouter, local (OpenAI-compatible endpoints) | `packages/llm` |
| Test sentence candidates (300) and primary labels | Gemini 3.8 Flash via the `agy` (Antigravity) CLI | `eval/gen`, `eval/data` |
| Independent blind labellers | Anthropic Claude Fable and Claude Haiku 5.5 (Claude Code subagents) | `eval/data/independent` |
| Fresh test set `heldout2` (2026-10-19): 180 candidate sentences | Anthropic Claude Opus (Claude Code subagent) | `eval/gen/heldout2.candidates.jsonl` |
| `heldout2` labels: three blind labellers | Anthropic Claude Fable, Claude Sonnet 5.5, Claude Haiku 5.5 (Claude Code subagents) | `eval/data/independent/*.heldout2.jsonl` |
| Speech to text (optional) | RegaLabs ASR, Iraqi Arabic (`acm`), via its developer API | `packages/asr` |

The model only understands. It has read-only tools (search contacts, bills, balance, history, quote) and `propose`
(a pending card). It has no tool that pays, confirms, schedules or cancels.

## Libraries
| Name | Use |
|---|---|
| TypeScript, Node.js 22, pnpm | language, runtime, workspaces |
| Next.js, React, Tailwind CSS | web app |
| Hono, @hono/node-server, better-sqlite3 | mock wallet API and its storage |
| Zod | validation of every model output and API body |
| @anthropic-ai/sdk | Claude client |
| Vitest, Vite, fast-check, tsx | tests, property tests, scripts (dev only) |
| Playwright (`@playwright/test`) | browser end-to-end tests of the web app (dev only) |
| Docker (`node:22-bookworm-slim`) | the hosted-demo image |
| jaro-winkler (MIT) | dev-only oracle for our own Jaro-Winkler implementation |
| gitleaks, OSV-Scanner | secret and dependency-vulnerability scanning in CI |

Own code on the money path: normaliser, amount parser, resolver, state machine, token and idempotency logic, WAV and
WER/CER code. Evaluated and rejected: `pyarabic` (GPL, wrong on Iraqi money phrases), Fuse.js. LiveKit was planned for
voice and dropped: push-to-talk over one HTTPS call is simpler and needs no media server.

## AI coding assistants
| Tool | Use |
|---|---|
| Claude Code (Anthropic) | planning docs, code, tests, review, browser testing of the web app (author's `bsk` CLI) |
| DeepSeek Harness running Claude (claude-opus-5-5) | voice path, eval WER/CER, CI hardening, docs refresh (2026-10-17) |
| `agy` (Antigravity CLI, Gemini 3.8 Flash) | generated the 300 test candidates and the primary labels; never ran our system |
| Claude Code (Anthropic, cloud session, 2026-10-19) | gap review and plan; no-key demo mode; honest unknown-outcome recheck; accuracy fixes from the held-out error analysis; per-session sandboxes, Docker image, Playwright tests; built the `heldout2` set with the subagents listed above |

## Data
- **100% synthetic.** Wallet seed written for this project; contacts, numbers and balances are fictional.
- **No human labelled the test set.** Three LLM families labelled every row independently against the seed; a script
  adjudicated (2 of 3, else the safest state). Details: `eval/data/README.md`. **No native-speaker review yet.**
- Held-out (180 rows) frozen before its run: sha256 `13e0fa33f989210fa1e2323c7cfdf020f1b6baae4ec0b78b4a9552aef9faf4a2`.
  It was run **once** (commit `1445bff`). It is spent: no further runs, no tuning on it.
- Changes after the held-out run (so the held-out number describes commit `1445bff`, not later code):
  a resolver fix (a bare «أبو» no longer resolves to the only «أبو …» contact), the voice path, and the 2026-10-19 fixes
  listed in `FAILURE_MODES.md`. Any new number needs a fresh test set.
- **`heldout2`** (180 new cases) was generated and labelled by Claude models only (see Models), adjudicated by the same
  script, and frozen (sha256 `de55b4432582a05936c54971f1234c4329f3a4fbad15efa90bb65540bdd3aca7`) before any change was
  measured on it. Its labellers share one model family and saw the generator's trap notes, so their agreement overstates
  label quality. One scheduled card's exact time was computed by hand from the fixed seed clock. Not yet run.
- 5 user interviews (Sulaymaniyah, ages 19–22, consented, logged in `research/interview-log.csv` from the author's notes;
  no exact quotes recorded). Other personas are hypotheses from public App Store reviews.
- Free LLM tiers may train on prompts; only synthetic data is ever sent to any provider.
- Voice recordings, when collected, are consented, fictional in content, stored locally and not committed.

## Fees and limits
The mock wallet's fee and limit schedule is copied from ZainCash's public page "Fees & Limits (Individual Wallet)"
(https://www.zaincash.iq/individual-wallet, read 2026-10-16): person-to-person 0.5% (min 300, max 2,500 IQD),
2,500,000 IQD a month; bills no additional fee. Pricing is public; all customer data is synthetic. This is a mock,
not ZainCash's system.

## Human vs AI contribution
Architecture and safety design: the author. Code, tests, harness and web app: written with AI assistants under the
author's direction and review. Test sentences and labels: LLMs, as listed. Dialect copy: not yet reviewed by a native
Iraqi speaker (marked `VERIFY-DIALECT`).
