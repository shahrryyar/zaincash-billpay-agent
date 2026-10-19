# 17 — User Research (Problem & Impact = 20%)

## Why this matters
Judges score "a real user, a real problem, **evidence you spoke to someone**." Code can't earn these points. A solo builder with 6–10 short interviews beats a team with none.

**Time cost:** ~15 min per interview × 8 = 2 hours. The highest score-per-hour activity in the whole project.

## Who to interview (aim for 8, minimum 5)
- 2–3 older adults (55+) who use a mobile wallet or ask family to pay for them.
- 1–2 shop owners / people who pay many bills.
- 1–2 young, fast users (students).
- 1 person who helps others pay (the son/daughter who does it for parents).
- Bonus: 1 cash agent or someone who has worked in wallet customer support.
- Mix Baghdad / south / KRG if possible.

## Consent line (say before starting)
> "I'm building a student hackathon project for a payment assistant. I'll take notes and won't use your name or any real account details. OK?"

Don't ask for or record real balances, numbers, or PINs.

## Interview guide (15 min, dialect, conversational)
1. How do you pay bills (electricity, generator, internet) today? Walk me through the last time.
2. Do you send money to people with a wallet app? Who usually does it, you or someone for you?
3. What's the hardest or most annoying step? Ever stopped halfway?
4. Have you ever sent money to the wrong person or the wrong amount? What happened?
5. *(Show the hero mockup / prototype.)* If you could just say «دز خمسين ألف لأحمد», would you use it? Why / why not?
6. What would you need to see before you trust it to send money? *(Listen for: name, number, amount, "nothing sent yet".)*
7. Voice or typing? Why?
8. How would **you** say "send 50 thousand to my brother"? "Pay the generator"? *(Record exact phrasing. Feeds the test set, docs/11.)*
9. Which digits do you read faster: 50,000 or ٥٠٬٠٠٠?
10. Anything that would make you **never** use it?

## Log template (`docs/research/interviews.md`)

| # | Date | Persona (age band, city, role) | Current method | Biggest pain (quote) | Would use? (Y/N/maybe) | Trust needs | Exact phrasings collected | Consent |
|---|---|---|---|---|---|---|---|---|
| I-01 | | | | «…» | | | | ✅ |

## Synthesis (fill before demo)
- Top 3 pains (with counts, e.g. "6/8 ask a family member to pay").
- Top trust requirement for the confirmation card.
- Voice vs text preference split.
- Phrasings added to the test set: N.
- **One quote for the pitch slide.**

## Rules
- Report honestly, including people who said they would **not** use it and why.
- Anonymise: persona labels only.

---

## STATUS (updated 2026-10-19): 5 interviews done

**Rule for this file: only real conversations go in the log. Never write an interview that did not happen.**
Raw rows: `research/interview-log.csv`.

5 short conversations, Sulaymaniyah, ages 19–22, all consented, app not named (logged 2026-10-19 from the
author's notes; exact dates, method and quotes not recorded):
- 5/5 send money with a wallet app and wished it was more automated.
- 2/5 had sent money to the wrong person.
- 3/5 would use the agent ("we hope to see it in the future"); 2/5 would not (reason not recorded).
- 5/5 want scheduled payments and prefer typing to voice.
- All 5 are Kurdish speakers: no Iraqi-Arabic phrasings were collected, and **the agent only understands Arabic**.
- Limits: tiny, narrow sample (one city, one age band, no older or assisted users); no exact words recorded.

### What this changes
| Hypothesis | Result |
|---|---|
| Users fear wrong/failed money more than taps | Partly supported: 2/5 sent to the wrong person. Supports the card (name + masked number + amount in words). |
| Scheduling is wanted | Supported: 5/5 asked for it. docs/27 is built. |
| Voice matters | Not supported here: 5/5 prefer typing. Keeps voice optional, text first. |
| Iraqi Arabic is the right default | **Open:** in Sulaymaniyah every interviewee speaks Kurdish. Language was not asked. Kurdish (Sorani) is a roadmap item, not built. |

### Interview log
| # | Date | Persona | Current method | Biggest pain | Would use? | Trust needs | Schedule wanted? | Consent |
|---|---|---|---|---|---|---|---|---|
| I-01 | n/r | 19–22, Sulaymaniyah | wallet app | wished it was automated | yes | n/r | yes | ✅ |
| I-02 | n/r | 19–22, Sulaymaniyah | wallet app | wished it was automated | yes | n/r | yes | ✅ |
| I-03 | n/r | 19–22, Sulaymaniyah | wallet app | wished it was automated | yes | n/r | yes | ✅ |
| I-04 | n/r | 19–22, Sulaymaniyah | wallet app | wished it was automated | no (reason n/r) | n/r | yes | ✅ |
| I-05 | n/r | 19–22, Sulaymaniyah | wallet app | wished it was automated | no (reason n/r) | n/r | yes | ✅ |

2 of the 5 sent money to the wrong person (not linked to an ID). n/r = not recorded.
