# 16 — WhatsApp Channel (strong candidate, after core)

## Why it fits
The brief's users "run on WhatsApp". Elderly users already send **voice notes** there daily, so it's the most natural surface for "one sentence is enough". It's a strong impact story for judges.

## Why it's not first
- Confirmation cards are harder: WhatsApp interactive messages (reply buttons, up to 3; list messages) work but are less rich than the web card.
- Requires a WhatsApp Business API account/number, template approval for outbound messages, and webhook hosting. Setup risk on the day.
- Judges' live input is easiest on the web app.

## Design (if built)
- Same `/api/turn` orchestrator. WhatsApp is just another channel adapter.
- Inbound text → same path. Inbound voice note (OGG/Opus) → RegaLabs **offline** ASR (not LiveKit streaming; a voice note is a file) → same path.
- Candidate choice → interactive **list message** (name + masked number per row).
- Confirmation → message with the card as formatted text + **reply buttons**: «أكّد ودز» / «إلغاء». The button payload carries a `card_id`; the server maps `card_id → token` server-side. **The token never leaves the server.**
- Typed «اي» while a card is active → re-prompt with the buttons, so a free-text "yes" doesn't confirm. Keeps "explicit confirmation" strict.
- Idempotency: WhatsApp redelivers webhooks, so dedupe on the inbound `message.id` **and** keep the payment idempotency key per card.

## Options
| Option | Effort | Note |
|---|---|---|
| WhatsApp Cloud API (Meta) test number | medium | Free test number, up to 5 recipient numbers; good enough for the demo |
| Twilio WhatsApp sandbox | low | Join-code sandbox; fastest to prototype |

## Decision
Build only after: never-cut list done + held-out eval run + demo rehearsed. Otherwise show it as "next step" with a mockup screenshot.
