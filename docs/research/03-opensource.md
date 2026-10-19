# R3 — Open-source options for this system

Date: 2026-10-15. Grades: **[V]** verified from primary data this session (GitHub API, registry, OSV, HF API, source files) · **[M]** measured by a spike · **[U]** unverified / lead only.
Raw outputs: scratchpad only (not committed). Re-run: `gh api repos/<r>`, `api.securityscorecards.dev`, `api.osv.dev`, `huggingface.co/api`.

## Method and limits
- Metadata for ~40 candidates via GitHub API; registry + OSV queries for 12 npm packages; HF API for datasets/models; two spikes on our own cases.
- **Spike bias:** the money phrases come from our docs/08, which our own parser was written against. A candidate failing them shows a gap for *our* use, not that it is a bad library.
- Not done: ASR accuracy (no audio set yet), CAMeL Tools install/benchmark, Mojaloop licence reading, long-term maintainer review. Stars are popularity, not quality.

## Spike results

**A. Arabic number words → IQD.** No JS library found. `allo-media/text2num` README lists Danish, Dutch, English, French, German, Italian, Portuguese, Spanish: **no Arabic [V]**. `pyarabic` (GPL-3.0) `number.text2number` on our 24 Iraqi money phrases: **8/24 correct [M]**, and the wrong answers are *silent and dangerous*: «ربع مليون» → 1,000,000 (expected 250,000), «نص ألف» → 1000 (expected 500), «مية وخمسين ألف» → 50,000. **Decision: keep our own parser; never trust a library number without the cross-check.**

**B. Fuzzy name matching** (15 hand-made Iraqi name pairs, normalised first) **[M]**:

| Pair type | Jaro-Winkler scores |
|---|---|
| Same person, typo/ASR-like | احمد/احمت 0.883 · مصطفى/مصطفا 0.920 · زهراء/زهره 0.848 · حسين/حسيين 0.953 · محمد/محمت 0.883 |
| **Different people** | **حسن/حسين 0.933** · حسن/محسن 0.917 · علي/عالي 0.925 · زينب/زينة 0.883 |

At the doc-08 threshold 0.92: caught 5/8 same-person, **wrongly caught 2/7 different people**. No threshold separates them. **Conclusion: fuzzy score cannot decide identity. It only proposes candidates; the user always picks (already our rule).** Set the candidate threshold lower (≈0.85) and never auto-resolve. Small sample, so retest on the real dev set.
`Fuse.js` for query «علي» ranks «ابو علي» and «احمد علي» as close matches (substring logic), which contradicts our first-token rule and the «أبو علي is a different person» trap → **reject for the resolver**.

## Verdicts by component

| Component | Candidates (licence · health) | Verdict |
|---|---|---|
| Arabic normalisation | **Own** 10-line normaliser · CAMeL Tools (MIT, 585★, pushed 2026-10-14, 34 issues) · `arabic-normalize` (MIT, 2★ [U]) | **Adopt own.** CAMeL: reference + optional offline analysis (install weight [U]). |
| Number words | `pyarabic` GPL-3.0 (8/24) · text2num (no Arabic) | **Reject both; own parser.** GPL also blocks bundling. |
| Name matching | Fuse.js (Apache-2.0, 20k★, Scorecard 3.2) · `jaro-winkler` (MIT, 0 deps, 0 vulns) · `fastest-levenshtein` (MIT) · RapidFuzz (MIT, Python) | **Own Jaro-Winkler (~20 lines)**; use `jaro-winkler` as a **dev-only differential-test oracle**. Reject Fuse for resolving. |
| Schema/validation | Zod (MIT, 44k★, Scorecard 5.1, 0 vulns) | **Adopt** (already). |
| Wallet HTTP | Hono (MIT, 32k★, 0 vulns, 0 deps) · `@hono/node-server` (MIT) | **Adopt.** No idempotency middleware ships in Hono core (middleware list checked **[V]**). |
| Idempotency | `idempot-dev/idempot-js` (BSD-style text, GitHub says "other", 11★, new, 37 open issues) · Apache Fineract design doc | **Reference only.** Generic middleware cannot make the key atomic with the debit; ours does it in one SQLite transaction. Fineract (Apache-2.0) doc: key+action+entity unique, completed→cached result, in-flight→**409**; note it keys on action, not payload, so our **422 on payload mismatch (IETF draft)** is stricter. |
| SQLite | `better-sqlite3` (MIT, 0 vulns, native build) · `node:sqlite` built-in (works on Node 25 here [V]; Node 22 CI [U]) | **better-sqlite3**, pinned; run `pnpm approve-builds`. Revisit `node:sqlite` once stable on CI Node. |
| State machine | **Own reducer** · XState (MIT, 30k★, Scorecard 6.6, 0 deps) · TLA+ (MIT) | **Own reducer** (docs/04). Model-based test with `fast-check` commands. XState/TLA+: reference for specs only. |
| Property/model tests | fast-check (MIT, 5k★, Scorecard 8.2, 1 dep) | **Adopt** (dev). |
| Concurrency test tool | k6 (**AGPL-3.0**, 32k★) · autocannon (licence [U]) | k6 is fine as an **external CLI** (not linked), but disclose; prefer a plain Node script with `Promise.all` for the 20×50 test. |
| LLM client | `@anthropic-ai/sdk` (MIT, 0 vulns, 3 deps, 2k★) · Vercel AI SDK (Apache-2.0 text; GitHub "NOASSERTION"; 27k★, **1,381 open issues**) | **Adopt Anthropic SDK + own thin adapter.** Vercel AI SDK: not now (extra layer on the money-adjacent path); revisit only if the fallback adapters cost too much. |
| Eval / prompt comparison | promptfoo (MIT, 26k★, 76 deps, has red-team mode) · Inspect AI (MIT, 3k★) | **Adopt promptfoo as dev tool only** (never in the runtime path). |
| Red-team | garak (Apache-2.0, 9.6k★) · **microsoft/PyRIT (MIT, 4.6k★)**; `Azure/PyRIT` is **archived** (moved) | Optional, after MVP. Use microsoft/PyRIT, not the archived repo. |
| Guardrails | NeMo Guardrails (Apache-2.0 text, 7k★) · `llm-guard` (MIT, **archived**) | **Reject llm-guard.** NeMo: reference only; our structural defences (no payment tool, token, Zod) outrank prompt filters. |
| Voice transport | LiveKit server + agents (Apache-2.0, 21k/15k★, active) · silero-vad (MIT) | **Adopt LiveKit** as planned; Silero VAD optional. |
| ASR baselines | openai/whisper (MIT) · faster-whisper (MIT, 26k★) · Arabic-dialectal Whisper fine-tunes on HF (`oddadmix/whisper-large-v3-…-arabic-dialectal-v2`, apache-2.0; `MohamedRashad/Arabic-Whisper-CodeSwitching-Edition` **GPL-3.0**) | **Baselines to compare with RegaLabs ASR** on our own clips. Iraqi accuracy **[U]**. Avoid the GPL model. |
| Iraqi LLMs | `anaspro/Shako-iraqi-4B-it`, Lahja-iraqi-4B (apache-2.0 per HF tags, <500 downloads) | **[U] Fine-tune/local-fallback candidates** only if the API model fails (docs/10). Not trusted yet. |
| Synthetic data | Faker py (MIT) · faker-js (MIT-style text; GitHub "NOASSERTION") · Distilabel (Apache-2.0) | Faker (Arabic locale) for names/phones; Distilabel optional. We mostly prompt the LLM directly. |
| Labelling | Label Studio (Apache-2.0, 28k★) · Argilla (Apache-2.0) | Optional, only if a second labeller joins. JSONL + spreadsheet is enough otherwise. |
| Security in CI | OSV-Scanner (Apache-2.0) · gitleaks (MIT, 30k★) · OpenSSF Scorecard (Apache-2.0) · semgrep (LGPL-2.1, external tool) | **Adopt gitleaks + OSV-Scanner in CI** (we are a public repo). |
| Mock-wallet references | Apache Fineract (Apache-2.0, Java) · Mojaloop (custom licence text, [U]; microservices) | **Reference only.** Too heavy; do not adopt. |

## Datasets (read before use)

| Dataset | Licence | Use for us |
|---|---|---|
| `nawaralseelawi/mizan-iraqi-arabic-benchmark` (340 items, "public_dev" tier) | CC-BY-4.0 | **Read the 340 items as a dialect sanity reference.** MCQ comprehension, not payments. Never in our test set. Attribute. |
| `ameer4wisam/iraqi-arabic-sales-dialogue-dataset` | CC-BY-4.0 (card) | Contains scraped marketplace data (file names show scraped sources) → **privacy and provenance risk. Reference for price/money phrasing only. Do not train on it.** [U on contents] |
| `factlogic/iraqi-arabic-dialect-corpus` | **CC-BY-NC-4.0** | Non-commercial. Avoid, or reference only. |
| `hayderkharrufa/iraqi-dialect-tts-corpus` (GitHub) | CC-BY-4.0 | Possible TTS/voice reference; not needed for MVP. |
| MADAR (HF mirrors) | CC-BY-NC-3.0 on the mirror seen | NC: reference only. Original licence **[U]**. |
| NADI / dialect-ID sets | mixed | Out of scope. |
Contamination rule: none of these enter `eval/data/`; our held-out set is hand-labelled and hash-frozen. Cite everything used in docs/19.

## Decisions that change the build
1. **Resolver:** fuzzy matches are candidates at ≈0.85, never auto-resolved; exact match is first-token/full-name/alias on the normalised form (docs/08). Update the old 0.92 figure.
2. **Own code on the money path:** normaliser, `parseAmount`, Jaro-Winkler, reducer. Libraries only for Zod, Hono, better-sqlite3, the Anthropic SDK.
3. **Differential test:** compare our Jaro-Winkler to `jaro-winkler` on random strings (dev dependency).
4. **CI:** add gitleaks + OSV-Scanner. Commit the lockfile; pin exact versions for the money path.
5. **Concurrency test** as a plain Node script, not k6.
6. **Idempotency semantics** stay: 422 payload mismatch, 409 in flight (IETF draft-07), plus Fineract's "served from cache" header idea (`Idempotent-Replay: true`, already in docs/06).
7. **Voice:** add Whisper/faster-whisper and one Arabic-dialectal Whisper fine-tune as **baselines** in the voice spike, compared with RegaLabs on our own clips.

## Unverified / not done
Mojaloop licence reading · CAMeL Tools weight and benchmark · autocannon licence · `node:sqlite` on Node 22 · Iraqi quality of any ASR/LLM · contents of the Iraqi sales dataset · whether Label Studio/Argilla are worth the setup time · Scorecard scores missing for several repos (no entry in the API).
