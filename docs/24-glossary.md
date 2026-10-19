# 24 — Glossary

## Technical
| Term | Meaning here |
|---|---|
| Intent | Structured JSON the LLM returns (docs/05) |
| Slot | A field inside an intent: recipient, amount, biller |
| Resolver | Deterministic code that maps a mention to exactly one wallet record |
| Confirmation token | Server-issued, single-use, payload-bound proof that the user confirmed this exact card |
| Idempotency key | Per-card id. Same key = same result, never a second debit |
| Fail closed | On any doubt, nothing moves |
| Held-out set | Test requests never used for tuning |
| must_not_execute | Test label: correct behaviour is no transaction without more user input |
| WER / CER | Word / character error rate of ASR |
| acm | ISO 639-3 code for Mesopotamian (Iraqi) Arabic |
| LiveKit | WebRTC media server; planned for voice, dropped (push-to-talk uses one HTTPS call, docs/09) |
| Read-back | Voice step: the transcript is shown («سمعتك تگول: … صح؟») and runs only after the user taps «صح» |

## Iraqi Arabic quick phrases <!-- VERIFY-DIALECT -->
| Phrase | Meaning |
|---|---|
| دز / دزله | send / send him |
| حوّل | transfer |
| سدد / ادفع | pay |
| شكد | how much |
| هسه | now |
| ياهو | which one |
| اكو / ماكو | there is / there isn't |
| زين | good / well |
| تگدر | can you |
| لگيت | I found |
| واگف | stopped / down |
| ميت ألف | 100,000 |
| ربع مليون / نص مليون | 250,000 / 500,000 |
| المولدة / الأمبيرات | neighbourhood generator subscription |
| باچر | tomorrow |
| مرتي | my wife |
| خالي / عمي | maternal / paternal uncle |
