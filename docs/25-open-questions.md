# 25 — Open questions and remaining external decisions

Updated 2026-10-21. Resolved implementation details are in docs/02–15 and docs/21; current automated evidence is in the readiness report.

## Decided / available

- Text is first-class; Arabic default; Sorani implemented. Five real interviews are recorded in docs/17 and research/interview-log.csv.
- Transfers use saved contacts only, also selectable by their saved Iraqi number. Unknown numbers ask/refuse; no contact creation.
- Up to three ordered actions, announced and independently clarified/confirmed. No combined approval.
- One-off scheduled transfers and bills are implemented; recurring payments are not.
- Confirm button only for both text and voice. No alternate spoken-yes payment path.
- Public GitHub repo and real history; docs/brief are tracked. Licence is proprietary, with no general run grant.
- Google AI Studio key configured; Gemini 3.5 Flash-Lite is under dev verification (docs/30). The author removed the Claude key. Groq/OpenRouter remain unconfigured.
- Voice: local Stage-11 CPU API at laptop loopback, compatible client configured; auto language. The old forced-acm cloud gateway issue is not a laptop blocker. No LiveKit.
- Hosted demo uses per-session in-memory wallets. Restart/eviction loses tokens, receipts and pending schedules. Laptop ASR loopback is not a hosted endpoint.

## Organiser / author decisions still requiring an answer

- Is the September draft still the authoritative Topic 04 brief?
- Is the author's pre-existing RegaLabs/Stage-11 ASR acceptable with disclosure?
- Judge input text only or voice too; demo duration/device/internet; branding rules; final review/Demo Day dates and booking link.
- Narrow permission for organisers/judges to run the proprietary repo for evaluation.
- Deployment account/host and reachable ASR endpoint if voice is demonstrated remotely.

## Human evidence still needed

- Native Iraqi-Arabic hand review/editing of fresh requests and copy; Sorani review if shipped. Mark unresolved dialect with VERIFY-DIALECT, not invented sign-off.
- More interviews: older/assisted users, Arabic-speaking cities; ask language preference, why not use, trust requirements, number style and exact phrasings.
- Observe 3–5 usability tasks and record outcomes, not just opinions.
- Consented task recordings with listener-typed references for actual WER/CER and voice-payment completion.

## Optional research, not release gates

Real app teardown/tap counts, more public-review sources, dialect corpora and ASR comparisons can strengthen the problem story. Do not claim “fewer taps”/elderly voice benefits without measurements. No regulatory-compliance claim is made by this synthetic mock.
