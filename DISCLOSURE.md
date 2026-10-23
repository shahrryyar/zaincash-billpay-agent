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
| Historical intent understanding (paid key, now removed) | Anthropic Claude Haiku 5.5 (`claude-haiku-5-5`), provider-default temperature (parameter omitted), prompt caching on the stable prefix | `packages/llm` |
| Comparison on dev only | Anthropic Claude Sonnet 5.5 (`claude-sonnet-5-5`) | `eval/results/dev-sonnet-tools.md` |
| Other adapters wired, not currently benchmarked | Groq, OpenRouter, local (OpenAI-compatible endpoints) | `packages/llm` |
| Test sentence candidates (300) and primary labels | Gemini 3.8 Flash via the `agy` (Antigravity) CLI | `eval/gen`, `eval/data` |
| Independent blind labellers | Anthropic Claude Fable and Claude Haiku 5.5 (Claude Code subagents) | `eval/data/independent` |
| Fresh test set `heldout2` (2026-10-19): 180 candidate sentences | Anthropic Claude Opus (Claude Code subagent) | `eval/gen/heldout2.candidates.jsonl` |
| `heldout2` labels: three blind labellers | Anthropic Claude Fable, Claude Sonnet 5.5, Claude Haiku 5.5 (Claude Code subagents) | `eval/data/independent/*.heldout2.jsonl` |
| Kurdish (Sorani) test set (2026-10-19): 150 candidate sentences | Anthropic Claude Opus (Claude Code subagent, saw only `seed.ts` and a brief) | `eval/gen/ku.candidates.jsonl`, `eval/gen/KU_GEN_BRIEF.md` |
| Kurdish labels: three blind labellers | Anthropic Claude Opus, Claude Sonnet 5.5, Claude Haiku 5.5 (Claude Code subagents) | `eval/data/independent/*-ku.jsonl` |
| Kurdish copy, parsers, prompt block and retrieval bank | written by Claude (Claude Code), not yet checked by a native Sorani speaker | `packages/core/src/{copy,kurdish}.ts`, `packages/llm/src/kurdish.ts` |
| Speech to text (optional) | RegaLabs ASR, Iraqi Arabic (`acm`), via its developer API | `packages/asr` |
| Local speech-to-text testing (2026-10-21) | Author's Stage-11 model on laptop CPU behind a loopback OpenAI-compatible API; checkpoint stage11-avg3-36k44k48k.nemo (hash/settings below); training-data provenance still requires author disclosure | external `rega-asr-work/local-asr/server.py`, configured through `packages/asr` |

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
| OpenAI Codex (2026-10-21) | requirements audit; test-first safety fixes; evaluator strengthening; phone zoom fix; Gemini signatures/pacing; API/browser verification and hosting preparation (docs/29–32) |
| DeepSeek Harness running Claude (claude-opus-5-5) | voice path, eval WER/CER, CI hardening, docs refresh (2026-10-17) |
| `agy` (Antigravity CLI, Gemini 3.8 Flash) | generated the 300 test candidates and the primary labels; never ran our system |
| Claude Code (Anthropic, cloud session, 2026-10-19) | gap review and plan; no-key demo mode; honest unknown-outcome recheck; accuracy fixes from the held-out error analysis; per-session sandboxes, Docker image, Playwright tests; built the `heldout2` set with the subagents listed above |

## Data
- **Wallet and task requests are synthetic.** Wallet seed written for this project; contacts, numbers and balances are fictional.
- **No human labelled the test set.** Three LLM families labelled every row independently against the seed; a script
  adjudicated (2 of 3, else the safest state). Details: `eval/data/README.md`. **No native-speaker review yet.**
- **Kurdish sets** (2026-10-19): 150 Claude-written Sorani sentences split 40/60 by category **before** labelling
  (`eval/gen/split_ku.py`), labelled by three Claude models blind to each other and to the system (`LABEL_SPEC.ku.md`),
  adjudicated by the same script. Held-out frozen (sha256 `55bd3ce1a02afa1e67fb9857edea5a2565dc1442a680f1ed77684da9f40e7056`)
  before any Kurdish prompt work and run **once** (commit `49319bd`). Limits: one model family wrote and labelled it
  (agreement 59/60 dev, 82/90 held-out unanimous is partly shared bias); no native speaker has read it; one labeller
  (Opus) read all of `dev.final.jsonl` to learn field values, beyond the 15 lines the spec allowed (it printed only the
  set of values); the labellers invented names for read-only intents, mapped to `info` in `eval/gen/labelcommon.py`.
  The assistant building the system saw short summaries of some held-out rows in the labellers' reports before the run;
  no change was made for them. The retrieval bank is checked against both Kurdish sets (`eval/test/ku-bank.test.ts`:
  no shared people, trigram similarity below 0.6); two bank sentences that were near-copies were rewritten.
- Eight Kurdish-named contacts were added to the seed (2026-10-19). The Arabic dev set was re-run after all Kurdish
  changes: 97.5% e2e (no regression; `eval/results/dev-haiku-tools-v6-after-ku.md`).
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

## Readiness work and model switch (2026-10-21)

- The author removed the Claude key during testing; later Claude 401 runs are retained as infrastructure failures. A supplied Google AI Studio key is now configured server-side for Gemini 3.5 Flash-Lite. Development checks and quota failures are preserved in eval/results/readiness-gemini*. These are not a fresh held-out comparison. Gemini 3.1 Flash-Lite/3.8 Flash returned overload/timeouts in probes; 2.5 Flash-Lite returned unavailable (404). No model ID or availability is assumed from old guides.
- Local Stage-11 checkpoint SHA-256: e9de02a14d531d79c531d442e6d7294d175cda55d118cf34fa4ab6efb052b02c; avg3-36k44k48k, CPU context [56,13], blank penalty .9. The author reports 80/320/400 ms streaming chunk modes; the current laptop HTTP wrapper returns final text only. Its code/model are external pre-existing RegaLabs work, not newly copied into this repo. Training-data provenance remains to disclose before accuracy comparisons.
- One pre-existing public FLEURS-labelled Sorani benchmark clip was used locally for client/upload and simulated browser-microphone transport. It is not synthetic task speech, not a consented payment corpus, and not a WER/quality result; audio is not committed. Browser capture used fake-device input to test MediaRecorder/conversion/ASR/read-back, not a physical phone mic.
- 21 readiness fixtures and their labels were written by Codex against the synthetic seed, including complete queued actions. They are developer regressions, not independently human-labelled evaluation. One unknown-number expected state was corrected to CLARIFYING to match the saved-contact policy; the original failed run is retained.
- Gemini development-only prompt corrections specify the existing strict info schema and JSON null for missing bill amounts. Zod/source checks remain strict; invalid model output is not repaired into a payment. Scorer v2 and cache replay limitations are documented in docs/12.
- Tools used for this work: local shell/TypeScript/Vitest/Playwright, agent-browser with Google Chrome, GitHub CLI, Docker, gitleaks 8.30.1, OSV-Scanner 2.7.0, Render CLI 2.30.0 (local preparation only; no workspace selected), official documentation/web research. No external messages, public tunnel, hosting account or deployment were created. Human review/recordings/consent and author delivery rehearsal were not invented.

- MVP summary PDF: generated by Codex using a Python standard-library Markdown-to-HTML helper and local Chrome/agent-browser print-to-PDF; page count checked with Poppler pdfinfo and rendered preview inspected. Canonical content remains MVP_UPDATE.md; no submission was made.

## Hosted demo (2026-10-23)

OpenAI Codex deployed https://zc-billpay-agent.onrender.com using Render CLI 2.31.0: one **free** Docker instance in Frankfurt, Gemini 3.5 Flash-Lite, server-side secrets and voice off. The author resolved initial billing verification; no paid compute upgrade was made. Local verification passed 900 unit/integration tests, typechecking, production/Docker builds and 10 scripted-provider browser scenarios. Five synthetic real-model deployment checks passed over public Render HTTPS; they are not held-out accuracy measurements. Initial timeouts and smoke-script assertion errors are retained with explanations in docs/30. Agent-browser/Chrome checked the phone-sized public UI; no physical-phone or voice-quality claim is made.

A temporary Cloudflare Quick Tunnel (cloudflared 2026.10.3, official release SHA-256 verified) was tested during the billing blocker and stopped after Render verification, together with its local Docker container. No ASR endpoint was exposed. GitHub CLI published the README demo link and deployment evidence. Detailed results, model IDs and operational limitations are in docs/30 and docs/31.
