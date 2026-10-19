# MEMORY.md — project state for humans and AI assistants

Short, current, no secrets. Update when a decision changes. Full spec lives in `docs/` (**local only, gitignored**), so anything critical is repeated here.

## What this is
ZainCash Agentic AI Challenge Iraq, **Topic 04: Bill Pay & Transfer Agent**. Solo entry: Shahryar Sabir (RegaLabs). One Iraqi Arabic sentence in, one confirmed exactly-once transaction out, against a **mock** wallet with **synthetic** data.

## Deadlines (organiser pack, 11/10/2026)
| Date | What |
|---|---|
| 22/10/2026 | Design brief (not scored). **Uploaded.** Source in `brief/` (gitignored). It names this repo: github.com/shahrryyar/zaincash-billpay-agent |
| 08/11/2026 | **MVP, scored.** Core works end to end, repo + commit history, first test-set results, one-page update. Top 10 continue. |
| TBC | Progress review, Demo Day |

Accepted into the build stage already. Elimination is after the MVP.

### Organiser pack (emails from sarah.haider@zaincash.iq: Topic Briefs 17/09, Next Steps + Resources + Free LLM API Access 11/10)
- **MVP 08/11:** core working end to end on sample inputs; repo with commit history; first test-set results; one-page update (works / not yet / next). Book a 20-min session (link to come). Top 10 continue.
- **Progress review (finalists):** live demo incl. an input they give; results on a held-out set not tuned on; ≥3 failure modes; full disclosure. **Demo Day:** live demo + one unexpected judge input; final repo, one-page summary, eval results.
- **Topic 04 must-haves:** explicit readable confirmation before anything executes; ambiguity → ask; retries never double-pay (show how); honest failure messages; mock wallet only. **Data:** wallet generated with an LLM from a schema; test set ≥50 dialect requests incl. ambiguous/malformed, LLM-generated **"then edited by hand for realism"** (rules: "check a sample by hand"). Strong: designed confirmation, deliberate edge cases (balance, unknown contact, two requests), results on must-not-execute requests. Stretch: voice.
- **Judging:** "Problem and impact 20%: a real user, a real problem, **evidence you spoke to someone**". Gates: commit history across the build period, live run on judge input, full disclosure, ≥3 failure modes.
- **Free LLM access (their guide):** Anthropic has **no free tier**. Free, no card: **Groq** (~30 req/min, open models like GPT-OSS/Qwen/Llama), **Google AI Studio** (Gemini 3 Flash-Lite ~500/day, Flash ~20/day; free prompts may train Google's models), OpenRouter `:free` (50/day), local (Ollama/LM Studio). Our `packages/llm` already speaks the OpenAI format with tool calls for groq/gemini/openrouter/local (`LLM_PROVIDER`, `*_API_KEY`, `*_MODEL`).
- Free hosting they list: Render (free tier sleeps when idle; open the demo before presenting), Hugging Face Spaces.
- The author's 06/10 clarification email (RegaLabs ASR, dates, public repo, demo input text/voice, branding) has **no reply** yet.

## Prime directive
**The LLM understands. Deterministic code moves money.** The model may call read-only tools and `propose` a pending card. It has no payment tool, no token access, no wallet write.

## Invariants (tests must enforce)
1. No execution without a valid confirmation token (single-use, 120 s, bound to payload hash).
2. No duplicate debit under retry (idempotency key per card; same key = stored result).
3. Ambiguity means ask, never guess.
4. Fail closed: any doubt, nothing is sent, honest message.
5. Invalid model output never reaches execution (Zod).
6. Iraqi Arabic is the default for all user-facing text (one copy file).
7. Synthetic data only. Keys only in `.env`.

## Decisions
- **LLM:** Claude primary (Haiku 5.5 live; Sonnet 5.5 only as comparison: not better on dev). Groq/Gemini/OpenRouter/local fallbacks are wired but need keys. Anthropic has no free tier; free tiers may train on prompts, so synthetic data only. Prompt caching on the stable prefix keeps cost low (per request ~150 normal input + ~3.5k cache-read + 170-380 output). Budget cap in code is `LLM_DAILY_TOKEN_CAP` (tokens, per process); the real cap is the spend limit on the Anthropic workspace.
- **Agentic design:** read-only tool loop (max 4 calls) + `propose`. `tools` beat `workflow` on dev (97.5% vs 90.0% at the time), so tools is the default. The model has no tool that pays, confirms, schedules or cancels.
- **Stack:** TypeScript, pnpm, Next 16 web, Hono + SQLite mock wallet, Zod, Vitest. No agent framework on purpose.
- **Fees/limits** come from ZainCash's public Fees & Limits page (read 2026-10-16), in `apps/wallet-api/src/fees.ts` with source and date.
- **Scheduling** (docs/27): model copies the time words, `packages/core/src/when.ts` computes the instant, the approved instant is part of the confirmation token, wallet runner pays once, re-checks everything at run time.
- **License:** proprietary, all rights reserved, until the author changes it. Judges/organisers need written permission from the author to run it.
- **Voice:** RegaLabs ASR (author's own pre-existing service, disclosed) via its OpenAI-compatible **developer HTTP API** (`POST https://api.regalabs.dev/v1/audio/transcriptions`, WAV PCM16, Bearer key, returns `{text}` only, no confidence). **LiveKit dropped** (push-to-talk needs no media server). Built 2026-10-17: `packages/asr`, core voice gate (`asr.ts`), orchestrator read-back (mid/unknown confidence → «سمعتك تگول… صح؟», runs only after «صح»), `/api/voice`, mic button, demo simulator (`ASR_PROVIDER=fake`), WER/CER eval (`eval:voice`). **Blockers (author):** `REGALABS_API_KEY` with paid credit; RegaLabs gateway refuses `acm` (developer-audio.ts SUPPORTED_ASR_LANGUAGES) → add it, or `REGALABS_ASR_LANGUAGE=ar` (disclose). Check with `pnpm --filter @zc/asr check`.
- **Evidence finding:** 500 App Store reviews: pain is failed/stuck money, support, fees, KYC, fraud, not "too many taps". Lead with safe/honest/recoverable.
- **No human labels.** Test labels are LLM-made (agy, Fable, Haiku, adjudicated).
- **Interviews (2026-10-19): 5 real**, Sulaymaniyah, 19–22, all consented, app unnamed. 5/5 want automation + scheduling + typing; 2/5 sent to wrong person; 3/5 would use, 2/5 not (no reason). All native Kurdish speakers (ZainCash serves KRG; author thinks they may want Kurdish, not asked), so no Arabic phrasings. Kurdish version built the same day (see Kurdish below). Log: `research/interview-log.csv`. Never add details the author did not give.

## Kurdish (Sorani) version (2026-10-19)
- Language picker عربي / کوردی in the top bar (`lang` on every request, `Session.lang`, `setLang`). Copy has `ku` for every key + `ui_*` screen strings.
- Deterministic: `packages/core/src/kurdish.ts` (amounts, time words -> Arabic forms for parseWhen, relations, name key + consonant skeleton for look-alikes, yes/no/cancel/ordinals, «هەمان بڕی جاری پێشوو», dollars). Resolver Kurdish fallback runs only after exact Arabic matching found nobody (or `lang: ku`). crossCheck: in a message with Kurdish letters the recipient must be in the user's words (`recipient_not_in_input`).
- Model: `KU_RULES` in the stable prompt for ku sessions + `retrieveKurdish` (trigram top-4 from a hand-written bank + glossary hits) in the per-request part. Bank never overlaps the test sets (`eval/test/ku-bank.test.ts`).
- Seed: 8 Kurdish contacts (ئاراس عومەر/کەریم, هێمن, شیلان, کاروان, ڕێباز, ڕێبوار, دڵشاد); 33 contacts now.
- Eval: dev-ku 60 / heldout-ku 90 (Claude-written, 3 Claude labellers). dev-ku v0 90.0% -> v2 96.7%; **heldout-ku run ONCE (commit 49319bd): 92.2% [84.8, 96.2], S1 0/90. Spent.** Arabic dev after the change 97.5%.
- Known: Kurdish spelling variants («حەسێن», «شێلان») resolve without asking (FAILURE_MODES). Voice in Kurdish not wired (needs RegaLabs Kurdish code or the local model).

## Status (2026-10-19)
- **Work on `main` only, no PRs, commits authored by the author only.** Push access works again (19/10).
- Tests: core 389, asr 33, llm 78, wallet-api 104, orchestrator 137, eval 22, web 12 (**775**) + **8 Playwright browser tests** (`pnpm --filter @zc/web e2e`) + `pnpm smoke -- --fake` 15/15. CI adds smoke, e2e and a Docker image job.
- **No-key mode:** `LLM_PROVIDER=fake` (scripted demo sentences) for web/CLI/smoke; with no provider at all the app loads and answers «busy».
- **Hosted demo:** one sandbox per browser session (`apps/web/server/sandboxes.ts`: own wallet/clock/faults, 30 min idle, cap 200, `TURNS_PER_10_MIN`). `Dockerfile` (standalone Next, non-root, `/api/health`). Built and run locally; **deploying needs the author's host account**.
- **Honesty fixes:** a lost Confirm answer says «ما متأكدين» with a safe «تحقق» (re-posts the same card) and polls `/api/recheck`; UNKNOWN_OUTCOME keeps its key and RECHECK looks it up (never re-sends); amount_changed states the new amount; unknown phone number says it is not saved (never creates a contact); last_transfer skips bills; recipient wallet capacity enforced; countdown follows the server clock.
- **Accuracy fixes** from the held-out error analysis (see FAILURE_MODES "Addressed after that run"). Not measured yet.
- **`heldout2`**: fresh 180-case set, Claude-only generator + 3 blind Claude labellers, frozen sha256 `de55b443…`. **Run it once** with the key: `pnpm eval -- --split heldout2 --mode tools --allow-heldout`. Then fix «بعد الظهر» (read as 12:00; deliberately NOT fixed before the run).
- Low-balance seed user `u_low` now has the full contact book and a generator bill.

- Added later on 19/10: `MVP_UPDATE.md` (one-pager draft), `DEMO.md` (runbook), `render.yaml` (Render Blueprint, not deployed), `research/INTERVIEWS.md` + empty `interview-log.csv`, review sheets in `eval/data/review/` (heldout2 sample, dialect). Free Groq/Gemini path documented; `pnpm smoke` is the model check.
- **Waiting on the author:** a free Groq or Gemini key (Anthropic key not available), the two review sheets, the organisers' reply.

## Status (2026-10-17)
- Pushed to origin/main. Tests: core 350, asr 33, llm 74, wallet-api 102, orchestrator 126, eval 22, web 7 (714). CI: typecheck, test, build, gitleaks, **OSV-Scanner** (vitest 4 / vite 7 after it flagged 9 dev-tool advisories).
- **Public gate docs committed:** `DISCLOSURE.md`, `FAILURE_MODES.md` (16 FMs), README with measured results (docs/ and brief/ published 2026-10-19).
- Local docs refreshed 2026-10-17: 02/03/05/06/09 (rewritten)/10/11/12 (results table filled)/13/14/15/18/19/20/21/22/23/24/25/26; **docs/28 = MVP one-pager draft**.
- Resolver fix 2026-10-17 (property test found it): a bare «أبو» no longer resolves to the only «أبو …» contact. **This is after the held-out run: disclosed.**
- Tested by hand in real Chrome (bsk) on 16/10: hero flow, scheduling, faults, out-of-scope, Arabizi, biller alias. 17/10: voice read-back seen in Chrome via the simulator (the author interrupted the browser session); the «صح» → card → «اي» never confirms → low confidence → non-WAV path verified over HTTP against the running app with the real model.
- **Dev (Haiku 5.5, tools):** 92.5% e2e (111/120), S1 0/120. Sonnet dev 94.2%, workflow dev 90.0% (overlapping CIs). **Schedule dev:** 26/26. Dev was tuned.
- **HELD-OUT RUN ONCE** (commit 1445bff, hash 13e0fa33…): e2e **81.1%** [74.8, 86.2] n=180; state 81.3%; ambiguity recall 100% (n=42), precision 73.7%; **S1 0/180 (≤1.7%)**; card on must-not-execute 1/100; p50/p95 2.3/3.7 s. **Spent: never re-run.** Misses: «نفس المبلغ مال اخر مرة» (previous not implemented, asks), malformed chatter → out_of_scope, «ورقة/دفتر» asked not refused, descriptor words after a name.
- `.env`: voice keys added empty (ASR_PROVIDER, REGALABS_API_KEY, REGALABS_BASE_URL, REGALABS_ASR_LANGUAGE=acm, ASR_*); author fills REGALABS_API_KEY.

## Next steps
0. **Author:** reconnect GitHub for Claude (https://claude.ai/connect-github) so the local commits can be pushed; put `ANTHROPIC_API_KEY` in the session env (dev eval + the one `heldout2` run); pick a Docker host and deploy (README "Run it for judges").
1. **Voice on** (author): REGALABS_API_KEY + `acm` in the RegaLabs gateway allow-list → `pnpm --filter @zc/asr check` → hold 🎤 in Chrome. Then record 40–60 consented utterances (≥5 speakers) via `VOICE_CAPTURE_DIR=eval/voice/captures`, type references, `pnpm --filter @zc/eval eval:voice`. Never claim a voice number before that.
2. **MVP one-pager**: docs/28 is the draft; export to PDF and submit 08/11.
3. docs/19 final Human-vs-AI line; demo rehearsal x3 (docs/18, incl. voice read-back + scheduling) and a screen recording backup.
4. More interviews (older users, Arabic-speaking cities; ask why no, ask language). Kurdish (Sorani) support is the open question from the first 5.
5. Improvements needing a **fresh** test set: `previous`, refuse «ورقة/دفتر», clarification order, Latin-letter time words.
6. Ask organisers: judge input text or voice, demo format, may judges run a proprietary-licensed repo, is the RegaLabs ASR OK.
7. Keep committing on more days (history must span the build period).

## Working rules (from the author)
- **Commits are authored by the author only: no `Co-Authored-By` trailer, no "Generated with" footer.** Small commits, imperative subject.
- **Test with real Chrome (`bsk`) and do not assume.** Chat like a real person (typos, follow-ups, corrections, small talk), not only scripted sentences.
- **Do the work with the AI tools (me, Haiku, Fable, agy); do not hand tasks to the author.** Exception: never fabricate evidence (interviews, labels checked by "a human", numbers).
- `.env` is mine to edit for config; never print keys. Key must be workspace-scoped on Anthropic.
- Restart `pnpm dev` after changing core/orchestrator/llm code (the web engine is a singleton).
- Typecheck exit code matters: do not pipe it into `tail`/`head` and trust the status.
- Check `git push` really pushed (`git status -sb`). Never commit `.env`.
- Disclosure of AI tools stays in `docs/19`.

## Open-source findings (docs/research/03, local)
- No Arabic number-word parser exists in JS; `pyarabic` (GPL) got 8/24 on Iraqi money phrases with silent wrong answers. Own parser stays.
- Jaro-Winkler cannot separate same-person typos from different people (حسن/حسين 0.933). Fuzzy only proposes candidates; user always picks. Fuse.js rejected.
- Own code on the money path (normaliser, parser, JW, reducer). Libs: Zod, Hono, better-sqlite3, Anthropic SDK. Dev: fast-check, promptfoo, jaro-winkler (oracle).
- Add gitleaks + OSV-Scanner to CI. Avoid GPL/NC assets (pyarabic, MADAR mirrors, factlogic corpus).

## Open questions
Repo is **public** (decided) but the license grants nothing to anyone but the author. Still unanswered by the organisers: whether the RegaLabs ASR is acceptable (author emailed, no reply), whether judge input includes voice, demo format. Contributor sidebar may show an old co-author from rewritten history; the author said that is acceptable.

## Run
`pnpm install && pnpm typecheck && pnpm test`; app: `pnpm dev` (http://localhost:3000); eval: `pnpm eval -- --split dev --mode tools` (held-out refuses to run: spent).
