# 08 — Iraqi Arabic Understanding

Iraqi Arabic (ISO 639-3 **acm**, Mesopotamian Arabic) is the default. Users also mix MSA, Arabizi (Latin letters + digits), English loanwords, and in the KRG, Kurdish. Everything marked <!-- VERIFY-DIALECT --> must be checked by a native Iraqi speaker before the test set is frozen.

## 1. Action verbs

| Meaning | Common forms |
|---|---|
| send / transfer | دز، دزله، دزلي، ذب (rare), حول، حوّل، حولّه، انطي (give), ابعث، ارسل، اكو فلوس لـ… |
| pay a bill | ادفع، سدد، سددلي، اشحن (top-up), خلّص الفاتورة |
| ask balance | شكد رصيدي، شكد عندي، باقي عندي شكد |
| confirm | اي، إي، اكيد، تمام، أكد، دز، يلا، اوكي |
| cancel | لا، لا لا، الغي، بطلت، خلي، ماريد، وگف |
| which one? (agent) | ياهو؟، ياهو منهم؟، أي واحد؟ |

<!-- VERIFY-DIALECT: ذب, انطي as transfer verbs -->

## 2. Money expressions (the hardest part)

| User says | Meaning (IQD) | Notes |
|---|---|---|
| خمسين ألف / ٥٠ ألف / 50 الف / 50k | 50,000 | |
| ميت ألف / مية ألف / مئة ألف | 100,000 | ميت = Iraqi pronunciation |
| ربع مليون | 250,000 | |
| نص مليون | 500,000 | |
| مليون | 1,000,000 | |
| مليون ونص | 1,500,000 | |
| خمسة وعشرين / ٢٥ | **ambiguous**: 25,000 (dropped "ألف", common) or 25 | → if < 1000 and in a money context, **ask**: «تقصد ٢٥ ألف؟» |
| عشرة | **ambiguous**: often 10,000 colloquially | → ask |
| ورقة | colloquially **$100** | USD not supported → ask/explain <!-- VERIFY-DIALECT --> |
| دفتر | colloquially **$10,000** | out of scope → explain <!-- VERIFY-DIALECT --> |
| فد خمسين | "around fifty" | "فد" = "a/some", not vagueness about the amount, but check |
| نفس المرة الفاتت | same as last time | resolve from history, **show on card** |

**Rule:** the LLM extracts `source_text` + `value`. The deterministic `parseAmount` re-derives the value from `source_text`. Disagreement or an ambiguous dropped-"ألف" form means a clarification question, never a guess. Dollars and any non-IQD currency are out of scope; say so plainly.

### Digit normalisation
- Arabic-Indic `٠١٢٣٤٥٦٧٨٩` and Persian `۰۱۲۳۴۵۶۷۸۹` → ASCII.
- Separators: `٬ , . ،` within digits → stripped. `٫` decimal → reject (no decimals in IQD).
- `k`/`K`/`الف`/`ألف`/`آلاف`/`الاف` → ×1000.

## 3. Names, relations, nicknames

- Same name, multiple contacts: أحمد علي, أحمد محمد → **ask**, showing masked numbers.
- Spelling variants: أحمد/احمد/أحمّد, مصطفى/مصطفي, عبد الله/عبدالله, زهراء/زهرة.
- Relations: أمي، ماما، أبوي، بابا، أخوي، أختي، خالي، عمي، مرتي (my wife), زوجي، ابني، بنتي. Stored as the contact `relation` field.
- Kunya / titles: أبو علي، أم حسين، حجي، الحجية، أستاذ، دكتور. Match against `display_name` and aliases.
- Similar names (test the resolver): علي / عالي, حسن / حسين / محسن, زينب / زينة.

### Resolver algorithm (deterministic)
1. Normalise both sides: strip diacritics/tatweel, `أإآ→ا`, `ة→ه`, `ى→ي`, `ؤ→و`, `ئ→ي`, collapse spaces, drop the prefix «ل/لـ» («لأحمد» → «أحمد»).
2. Exact match on name / relation / alias → candidates.
3. If 0: token-level match (first name), then Jaro-Winkler ≥ **0.85** on the full name to *propose candidates only* (spike, docs/research/03: JW cannot separate same-person typos from different people, e.g. حسن/حسين = 0.933; no threshold works, so fuzzy never decides).
4. Qualifier filter («علي», «ينتهي 4471») narrows candidates.
5. **Exactly 1 → RESOLVED. 0 → ask «منو؟ ما لگيته بالأسماء» or offer phone input. >1 → ask with cards.**
6. Fuzzy-only matches (step 3) are **never auto-resolved**. Always confirm: «تقصد حسين؟»

## 4. Billers

| Code | Users say |
|---|---|
| `electricity` | الكهرباء، الكهربا، كهرباء الوطنية، الوطنية |
| `generator` | المولدة، اشتراك المولدة، الأمبيرات، المولد <!-- VERIFY-DIALECT: الأمبيرات --> |
| `internet` | الانترنت، النت، الواي فاي، الراوتر |
| `water` | الماي، الماء، فاتورة الماي |
| `mobile_topup` | رصيد، كارت، اشحن رصيد، شحن |

Mock biller names must be **fictional** (e.g., "شركة النور للإنترنت (تجريبي)"), not real Iraqi companies.

## 5. Arabizi and mixed input
- `dz 50 alf l ahmad`, `7awel 100k la mama`, `edfa3 el kahraba`.
- 2→ء, 3→ع, 5→خ, 6→ط, 7→ح, 8→ق (varies), 9→ص. Let the LLM handle Arabizi, and include ≥10% Arabizi in the test set.

## 6. Kurdish (bonus, after core)
KRG users may say «پارە بنێرە بۆ ئەحمەد» (send money to Ahmed). Detect `language: "ku"` and either handle it (if the chosen free model does it well in eval) or respond in Arabic + Kurdish that only Arabic is supported in this version. Shahryar is a native Sorani speaker, which makes it a credible differentiator. Only after the never-cut list is done.

## 7. Speech-specific (from ASR)
- ASR may output numbers as words or digits, so feed both to `parseAmount`.
- Names are the most error-prone ASR tokens (WER ~33%), so the resolver plus confirmation card are the safety net.
