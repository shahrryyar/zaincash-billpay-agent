# 25 — Open Questions

Update with answer + date.

## Answered (organiser pack, 11/10/2026)
- [x] Dates: brief 22/10, MVP 08/11 fixed; rest tentative → docs/20.
- [x] Pre-work allowed: repo link due with brief, commit history expected.
- [x] Repo required on GitHub with real history; keys must stay out (scanned).
- [x] Demo includes one unexpected judge input; finalists demo live on a judge-given input.
- [x] LLM: author has Anthropic key → Claude Haiku/Sonnet 5.5 primary (paid, capped); Groq/Gemini free fallbacks → docs/10. (2026-10-15)
- [x] Agentic design: read-only tools + `propose`, no payment tool (docs/05). (2026-10-15)
- [x] Voice: author implements + tests ASR personally; ships before MVP only if good. Organisers did not answer the email. (2026-10-15)
- [x] Submission: PDF/PPTX, EN or AR, `Name_Topic`, Typeform.

## Research (docs/research/02 TODO)
- [ ] Install ZainCash/Qi/FIB; record flows, taps, PIN/OTP, wrong-recipient policy
- [x] ZainCash Fees & Limits (read 2026-10-16, in fees.ts) · [ ] CBI Regulation No. 2 of 2024
- [ ] Google Play reviews; Facebook/Telegram threads
- [ ] Does ZainCash really pay electricity bills? (one source only)

## Open-source follow-ups (docs/research/03)
- [ ] CAMeL Tools: install weight and whether it helps dialect analysis
- [x] Kept better-sqlite3 (works on CI Node 22)
- [ ] Iraqi quality of Whisper dialectal fine-tunes vs RegaLabs ASR (needs our audio set)
- [ ] Read the 340 Mizan items; mine money/name phrasing for the dev set (attribute CC-BY)
- [x] gitleaks + OSV-Scanner in CI (2026-10-17)

## Organisers (ask)
- [x] Repo public (author decided); license proprietary — ask whether judges may run it
- [ ] Is a self-owned pre-existing service (RegaLabs ASR) OK with disclosure?
- [ ] Judge input: text only or voice too?
- [ ] Demo format: time, device, internet?
- [ ] Is the Topic 04 brief changed from the 17/09 draft?
- [ ] Branding rules for ZainCash in the UI?
- [ ] Team size: confirm solo submission.

## Technical
- [ ] Groq model chosen on dev (id, daily cap) — not needed unless a fallback is demoed
- [ ] Gemini 3 Flash-Lite id + daily cap in console
- [x] RegaLabs ASR: developer HTTP API, no LiveKit, no confidence field (docs/09) · [ ] add `acm` to the gateway's SUPPORTED_ASR_LANGUAGES · [ ] API key with paid credit
- [ ] ASR capacity for judges live
- [ ] Hosting: laptop vs Vercel/Cloudflare + wallet host (HF Spaces/Render sleep when idle)
- [ ] Digit style on cards: Western vs Arabic-Indic

## Dialect (native review)
- [ ] All `VERIFY-DIALECT` markers
- [ ] Slang amounts (ورقة, دفتر, dropped ألف) with ≥2 speakers
- [ ] Copy read aloud by an Iraqi speaker from outside KRG

## Personal
- [ ] ≥5 interviews (≥2 before 22/10)
- [ ] ≥5 voice volunteers
- [ ] 1–2 native dialect reviewers
- [x] GitHub repo created (github.com/shahrryyar/zaincash-billpay-agent)
