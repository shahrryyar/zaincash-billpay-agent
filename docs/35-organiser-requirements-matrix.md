# 35 — Organiser requirements matrix (October 2026 pack)

Created 2026-10-25. This first version records the state **before** that day's fixes. Sources are the three organiser documents the author received in October 2026. They are **not committed** (the repo is public). Each row paraphrases one point; nothing is quoted in full.

| Code | Document | Date on document | Pages |
|---|---|---|---|
| NS | "Your Next Steps" (build stage) | PDF created 13/10/2026 (no date printed) | 2 |
| RS | "Resources for Design and Development" (participant guide) | 11/10/2026 | 3 |
| FA | "Free Ways to Access an LLM API" (participant guide) | 11/10/2026 | 2 |

These documents are newer than [docs/00](00-official-brief.md) (September topic-brief draft) and [docs/20](20-build-plan.md), so they take precedence. Differences are listed under [Contradictions and date changes](#contradictions-and-date-changes) and are flagged for the author, not silently rewritten.

**Status key:** **Met** = repo evidence exists. **Partly met** = some evidence, a gap remains. **Not met** = nothing yet (often a future deliverable). **Needs a human** = only the author or real people can do or confirm it. **Unclear** = the documents do not say enough.

"Evidence" points at files, tests or commits. "Needs a human" rows never claim that something happened: no organiser reply, upload, booking, review or interview is recorded here unless it is already in the repo.

## Next Steps (NS)

| ID | Source | Requirement (paraphrase) | Status | Evidence | What's left |
|---|---|---|---|---|---|
| NS-01 | p1, intro | The design brief and MVP deadlines are fixed. Every other date is tentative and will be confirmed in advance. | Met | docs/20 already treats only 22/10 and 08/11 as fixed | Keep later dates as TBC until confirmed |
| NS-02 | p1, timeline | Design brief due by 22/10. It is not scored and nobody is eliminated at that stage. | Needs a human | `brief/ShahryarSabir_Topic04_BillPayTransfer.pdf` and `.pptx`; docs/22 says the upload was *reported* by the author | Author keeps the upload receipt. The repo cannot confirm receipt |
| NS-03 | p1, timeline | Informal meet and greet at Espresso Lab after the brief deadline. Date TBC. | Needs a human | none | Watch for the date and attend if possible |
| NS-04 | p1, timeline | MVP (semi-final) due by 08/11. Session dates are tentative. | Not met | Draft: MVP_UPDATE.md, `brief/ShahryarSabir_Topic04_MVP_Update_DRAFT.pdf` | Finalise and submit by 08/11. The submission channel and time are not stated (see Questions) |
| NS-05 | p1, timeline | Each project books a 20-minute session to demo its working core. Organisers will send a booking link before sessions open. | Needs a human | none | Watch for the link, then book |
| NS-06 | p1, timeline | After the MVP round, the 10 strongest projects continue. | Unclear | Judging weights in docs/00 match NS-30 | How ranking is decided and announced is not stated |
| NS-07 | p1, timeline | Progress review for the 10 finalists, showing the working app and test results. Date tentative. | Unclear | docs/20 row "TBC" | Wait for the date |
| NS-08 | p1, timeline | Demo Day with final demos to the judging panel. Date tentative. | Unclear | docs/20 row "TBC" | Wait for the date |
| NS-09 | p1, §1 | Brief: a fuller version of the earlier two-slide submission, at most five slides or two pages. | Met | Brief PDF has 5 pages (`pdfinfo`) | none |
| NS-10 | p1, §1 | Brief: the target user and the problem. | Met | Brief slide 1 | none |
| NS-11 | p1, §1 | Brief: how the system works end to end, with a simple architecture diagram. | Met | Brief slide 2 (four-step flow); docs/03 | none |
| NS-12 | p1, §1 | Brief: the models, tools and data, including how synthetic data is generated. | Partly met | Brief slide 3 | The submitted slide no longer matches the repo (Claude Haiku → Gemini 3.5 Flash-Lite; k6 and promptfoo not used; labels not hand-made). Drift is disclosed in DISCLOSURE.md, docs/19 and MVP_UPDATE.md. The submitted brief is not edited |
| NS-13 | p1, §1 | Brief: the test plan, what good looks like and how it is measured. | Met | Brief slide 4; docs/12 | none |
| NS-14 | p1, §1 | Brief: the main risks and a week-by-week plan to the MVP. | Met | Brief slide 5 | none |
| NS-15 | p1, §1 | Brief: a link to the GitHub repository. | Met | Brief slide 5 | none |
| NS-16 | p1, §2 | MVP: the core works end to end on sample inputs. | Met | Live demo https://zc-billpay-agent.onrender.com; docs/33 production checks; `pnpm smoke -- --fake` 15/15; CI on `648e368` | Recheck on the final submission commit |
| NS-17 | p1, §2 | MVP: the GitHub repository with its commit history. | Met | Public repo; commits since 2026-10-15 | none |
| NS-18 | p1, §2 | MVP: first results on the test set. | Met | Historical held-out (Claude Haiku 5.5): `eval/results/heldout-haiku-tools.md`, `heldout-ku-haiku-tools.md`. Deployed model (Gemini 3.5 Flash-Lite) dev results: docs/30 `CURRENT-DEV-RESULTS` | There is no held-out result yet on the deployed model (NS-22) |
| NS-19 | p1, §2 | MVP: a one-page update covering what works, what does not work yet and what comes next. | Partly met | MVP_UPDATE.md (draft) has "What works", "Evidence" and "Remaining". It does not use the three required headings | Restructure into the three sections. Author reviews, then submits |
| NS-20 | p1, §2 | MVP session: demo the MVP and discuss it with the panel. | Needs a human | DEMO.md, docs/18 runbook | Rehearse delivery; open Render early |
| NS-21 | p1, §3 | Progress review: a working app demoed live, including on an input the organisers provide. | Partly met | App is live; ambiguity and fail-closed paths are tested (FAILURE_MODES.md) | Author rehearses with unseen human input; check free-tier quota beforehand (FA-14) |
| NS-22 | p1, §3 | Progress review: results on a held-out set that was not used for tuning. | Partly met | `eval/data/heldout2.final.jsonl` is frozen (`heldout2.sha256`) and unspent; the harness refuses reruns (`eval/test/heldout-guard.test.ts`). The original Arabic and Sorani held-out sets are spent | Human review → freeze → one run on the final provider. Only the author decides when |
| NS-23 | p1, §3 | Progress review: at least three documented failure modes and how the system handles each. | Met | FAILURE_MODES.md (FM-01–FM-21, each with tests); docs/13 | Keep current |
| NS-24 | p1, §3 | Progress review: full disclosure of models, tools, data and AI coding assistants. | Met | DISCLOSURE.md, docs/19 | Keep current at every review. Add a per-component provider table (FA-14) |
| NS-25 | p1, §3 | Progress review: walk the panel through the results. | Needs a human | docs/30, docs/12 | Prepare a short results walkthrough |
| NS-26 | p1, §4 | Demo Day: a live demo and Q&A, including one unexpected input from the judges. | Needs a human | DEMO.md; docs/23 judge Q&A prep | Rehearse three times with unseen input |
| NS-27 | p1, §4 | Demo Day: the final repository. | Not met | none (future) | Freeze code, data and scorer before the final evaluation |
| NS-28 | p1, §4 | Demo Day: a one-page summary, separate from the MVP update. | Not met | none (future) | Write after the final held-out run |
| NS-29 | p1, §4 | Demo Day: evaluation results. | Not met | none (future) | Run heldout2 once (NS-22) |
| NS-30 | p2, judging | The same criteria apply at the MVP, the progress review and Demo Day. The design brief is not scored. | Met | docs/20 already calls the MVP "scored" | docs/00 heading still says "build & demo round" (C-2) |
| NS-31 | p2, judging | Working prototype and reliability: 25%. | Partly met | Live demo, 943 tests and green CI (docs/33) | Free-tier quota and Render sleep are live-demo risks (FA-14, RS-14) |
| NS-32 | p2, judging | Technical judgment and architecture: 20%. | Met | docs/03; plain state machine; no framework (AGENTS.md) | none |
| NS-33 | p2, judging | Problem and impact: 20%. | Partly met | docs/17: five interviews (one city, ages 19–22) and an author-reported three-person tryout | Broader interviews and observed usability (human) |
| NS-34 | p2, judging | Grounding, security and responsibility: 15%. | Met | docs/07, docs/14, docs/26; invariant tests | Native copy review (human). OWASP walk-through incomplete (RS-11) |
| NS-35 | p2, judging | Evaluation evidence: 15%. | Partly met | eval/results; Wilson CIs (`eval/src/stats.ts`) | Fresh held-out on the deployed model; human-checked labels |
| NS-36 | p2, judging | Demo clarity: 5%. | Partly met | DEMO.md, docs/18 | Author rehearsal |
| NS-37 | p2, ground rules | Synthetic data only; never real personal or customer data. | Met | Seed `apps/wallet-api/src/seed.ts`; DISCLOSURE.md "Data" | none |
| NS-38 | p2, ground rules | Disclose models, tools, data sources and AI coding assistants. AI coding tools are allowed. | Met | DISCLOSURE.md, docs/19 | Add each new assistant session (done for 2026-10-25) |
| NS-39 | p2, ground rules | Iraqi Arabic is the default for everything users see or say. | Met | `packages/core/src/copy.ts` (Arabic default, Sorani opt-in) | Native dialect review of copy (human; `VERIFY-DIALECT` markers) |
| NS-40 | p2, ground rules | Code on GitHub with a real commit history. | Met | Public repo history | none |
| NS-41 | p2, ground rules | Keep API keys out of the repo. | Met | `.gitignore` (`.env`), CI gitleaks job `.github/workflows/ci.yml` | none |
| NS-42 | p2, ground rules | Simple and reliable beats complex. | Met | AGENTS.md stack rules; no LangGraph, vector DB or multi-agent | none |
| NS-43 | p2, footer | A contact line exists, but it reads "[contact details]", an unfilled placeholder. | Unclear | none | Get the real contact channel (Questions) |

## Resources guide (RS)

Most of this guide is advice, not rules. Rows that are only a list of tools (OCR, RAG, embeddings, app frameworks, hosting options) are summarised in RS-15 and do not apply to this design.

| ID | Source | Requirement or advice (paraphrase) | Status | Evidence | What's left |
|---|---|---|---|---|---|
| RS-01 | p1, Start here | Read the "when do you need an agent" guide before the brief. | Needs a human | none (reading cannot be evidenced) | none |
| RS-02 | p1, Agent frameworks | Start with plain function calling. Add a framework only when the design needs it. | Met | `packages/llm/src/understand.ts` (read-only tools and `propose`); no framework | none |
| RS-03 | p2, Arabic and dialect | Build the test set with real-sounding Iraqi phrasing. | Partly met | LLM-written sets in eval/data; review sheets `eval/data/review/*.csv` are unsigned | Native-speaker review and edits (human) |
| RS-04 | p2, Arabic and dialect | Check how the system copes with mixed Arabic and English. | Not met | Arabizi (Arabic in Latin letters) is covered: 10 `dialect_variation_arabizi` rows in `dev.final.jsonl`. Arabic mixed with English words is almost absent (one English injection row) | Add a code-switch dev set and deterministic parser tests. Measure with the deployed model |
| RS-05 | p2, Testing | Keep a held-out set from the start and never tune prompts on it. Results are reported at the progress review. | Partly met | `heldout.sha256`, `heldout2.sha256`, `eval/test/heldout-guard.test.ts`, `eval/results/heldout-runs.log` | heldout2 single run (NS-22) |
| RS-06 | p2, Synthetic data | Generate data with an LLM, then review a sample by hand. | Needs a human | Generation documented in eval/data/README.md; no hand review yet | Review at least a sample (docs/34) |
| RS-07 | p2, Synthetic data | Save the data so results can be reproduced. | Met | eval/data committed; result files record commit, dataset SHA-256 and prompt/scorer hashes (`eval/src/run.ts`) | none |
| RS-08 | p2, Testing | promptfoo is suggested for comparing prompts and models. | Met (alternative) | Own harness `eval/src/run.ts` compares providers and modes. promptfoo was in the brief but never used; disclosed | none |
| RS-09 | p3, Design phase | Mermaid diagrams render directly in a GitHub README. | Partly met | Text diagrams in docs/03; brief slide 2 | Optional |
| RS-10 | p3, Free hosting | Render's free services sleep when idle, so open the demo before presenting. | Met | README and docs/34 say this | On the day: open early (human) |
| RS-11 | p3, Code and security | Use the OWASP Top 10 for LLM Applications for the risks section. | Partly met | docs/14 and docs/23 map LLM06 (excessive agency). docs/26 says only LLM06 has been walked through | Walk all ten items with evidence |
| RS-12 | p3, footer | Keep keys in a `.env` that is listed in `.gitignore` and loaded from environment variables. Organisers scan repositories for exposed keys. | Met | `.gitignore`, `.env.example`, gitleaks in CI | none |
| RS-13 | p2, Arabic and dialect | Models handle MSA better than dialect. | Met (acknowledged) | docs/08 deterministic amount and name parsing; ask-don't-guess | none |
| RS-14 | p1–p3, Local models | Local models (Ollama, LM Studio) allow unlimited offline testing. | Partly met | `LLM_PROVIDER=local` adapter (`packages/llm/src/openai.ts`); no local benchmark | Optional |
| RS-15 | p1–p3, lists | OCR, embeddings, vector DBs, Streamlit/Gradio/FastAPI, other hosts. | Met (not needed) | AGENTS.md rules out a vector DB; Next.js app | none |

## Free LLM API access guide (FA)

| ID | Source | Requirement or advice (paraphrase) | Status | Evidence | What's left |
|---|---|---|---|---|---|
| FA-01 | p1, recommended setup | Use Groq for day-to-day development and Google AI Studio Flash-Lite for volume. Flash is limited to about 20 requests a day. | Met (consistent) | Gemini 3.5 Flash-Lite deployed; Groq adapter exists but is unconfigured (docs/10) | Optional: add a Groq key as a configured fallback (human: account and key) |
| FA-02 | p1 | Free limits change often. Your console shows the current limits. | Met | docs/10 and docs/31 say to check the console | none |
| FA-03 | p1, table | Gemini free tier: Flash-Lite about 15 a minute and 500 a day, per project. | Partly met | Per-minute: `LLM_REQUEST_INTERVAL_MS=5000` pacing. Per-day: nothing counts model calls per turn, so the daily demo budget is unknown | Count model calls per turn in traces and eval reports, then measure on Gemini |
| FA-04 | p1, table | Free-tier prompts may be used to improve Google's products. | Met | Synthetic data only (DISCLOSURE.md) | none |
| FA-05 | p1, table | Gemini 2.5 is closed to new users; use the Gemini 3 family. | Met | `gemini-3.5-flash-lite`; the 2.5 probe returned 404 (docs/30) | none |
| FA-06 | p1, "Not free" | Anthropic has no free API tier. | Met (no conflict) | The Claude key was removed on 21/10 (docs/10); the live demo uses Gemini | Disclosed as drift from the brief |
| FA-07 | p2, switching | Put the model call behind one function so switching provider is a two-setting change. | Met | `ChatClient` (`packages/llm/src/types.ts`); `LLM_PROVIDER` plus model variables (`.env.example`) | none |
| FA-08 | p2, rules | One account per person. Don't create extra accounts to get around limits. | Needs a human | none | Author confirms one account per provider |
| FA-09 | p2, rules | Keep keys secret: environment or ignored `.env`, never committed. Organisers scan. | Met | As NS-41 | none |
| FA-10 | p2, rules | Synthetic data only, because free tiers may train on inputs. | Met | As NS-37 | none |
| FA-11 | p2, rules | On a 429, wait and retry with increasing pauses. | Met | `packages/llm/src/wrappers.ts`; `packages/llm/test/wrappers.test.ts`, `adapters.test.ts` | none |
| FA-12 | p2, rules | Cache responses during development. | Met | `LLM_CACHE=1` (`packages/llm/src/factory.ts`) | none |
| FA-13 | p2, rules | Run a small test set before a large one. | Met | `--limit`, `--ids`; 21-case readiness set | none |
| FA-14 | p2, rules | Record which provider and model each part of the system uses. This is disclosed at every review. | Partly met | DISCLOSURE.md lists models by purpose, but historical and current rows are mixed | Add a current per-component table |
| FA-15 | p2, rules | Free limits can run out mid-demo. Tell the organisers early if this could affect the presentation. | Needs a human | Risk documented in docs/10, docs/30. `LLM_PROVIDER=fake` is the disclosed scripted backup | **Author tells the organisers early** (only the author can contact them). Measure calls per turn first (FA-03) |

## Contradictions and date changes

The October documents win. Nothing below changes product behaviour, so no code was changed because of it. Each item is flagged for the author.

| # | Where | What differs | Effect |
|---|---|---|---|
| C-1 | docs/00 "Gates" vs NS | docs/00 lists four pass/fail gates (history, live judge input, disclosure, ≥3 failure modes) from the September draft. The October Next Steps do not mention gates. They list the same items as progress-review deliverables (NS-21–NS-24) and ground rules. | Keep meeting all four. Ask whether they are still pass/fail gates |
| C-2 | docs/00 judging heading | docs/00 titles the weights "build & demo round". NS-30 says the same weights apply at the MVP, the progress review and Demo Day. | The MVP is scored. docs/20 already says so. The weights are the same in both |
| C-3 | docs/20, 22/10 row | docs/20 lists the brief format as "PDF/PPTX, EN/AR, Name_Topic, GitHub link, Typeform". The October documents only say "≤5 slides or two pages" plus the GitHub link. Format, language, file naming and Typeform are not in these three PDFs. | Those details came from another source that is not in this pack. Historical only; nothing to redo |
| C-4 | docs/20 | No date changed. 22/10 and 08/11 match; everything else is still tentative. The Espresso Lab meet and greet (NS-03) and the MVP booking link (NS-05) are new items. | To add to docs/22 |
| C-5 | NS vs docs/20 | Demo Day needs a **one-page summary** as well as the MVP's one-page update (NS-19, NS-28). docs/20 already lists both. | None |
| C-6 | Submitted brief vs repo | The brief named Claude Haiku 5.5 as the live model, Claude Sonnet 5.5 for hard cases, Groq and Gemini 3 Flash-Lite as free fallbacks, k6, promptfoo, hand-edited and hand-labelled requests, a second Iraqi labeller, native review, and 3–5 user tests plus a red-team session. In the repo, the live model is Gemini 3.5 Flash-Lite with no configured fallback, the stress test is a plain Node script, evaluation uses its own harness, labels are LLM-made, and no native review, second labeller or red-team session has happened yet. | Partly disclosed (docs/10 and docs/19 record the model switch; docs/19 says promptfoo was dropped). No single place states the full drift. The brief files are unchanged |
| C-7 | NS dates | The year is not printed. The repo assumes 2026, which matches the RS and FA dates. No time of day or timezone is given for 08/11. | Ask (Questions) |

No PDF, doc and code disagreement was found that would change payment behaviour. The safety invariants in AGENTS.md are unaffected.

## Questions for the organisers (draft; nothing has been sent)

1. Where and how is the 08/11 MVP submitted (form, email, upload), and by what time and timezone?
2. Are the September "gates" (commit history, live run on judge input, full disclosure, ≥3 failure modes) still pass/fail before scoring, or are they now ordinary deliverables?
3. The "Questions? Contact us at" line in Next Steps is a placeholder. What is the right contact channel?
4. The free Gemini Flash-Lite tier is about 15 requests a minute and 500 a day per project. If several judges use the hosted demo at once, quota could run out. Is that acceptable, and is the demo expected to run on the participant's own key?
5. The repo is proprietary ("all rights reserved"). Do judges need an explicit grant to clone and run it for evaluation, and is a narrow evaluation permission enough?
6. Is the author's pre-existing RegaLabs ASR (disclosed conflict of interest) acceptable for the voice stretch?
7. For the progress review "input we give you": text only, or voice too? What device and network will be used?
8. Must the Demo Day one-page summary follow a template?
