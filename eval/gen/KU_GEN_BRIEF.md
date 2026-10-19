# Brief: Kurdish (Sorani) test candidates for the ZainCash bill-pay & transfer agent

You write **150 realistic messages** that a Kurdish-speaking ZainCash wallet user (Sulaymaniyah, Erbil, Halabja,
Kirkuk; **Central Kurdish / Sorani only**, not Badini/Kurmanji) would type to an assistant inside the wallet app.
They become a test set, so **quality matters more than speed**: every sentence must be something a native Sorani speaker
would really type on a phone. No machine-translation Kurdish, no Arabic sentences with one Kurdish word, no invented words.

Read **only** `apps/wallet-api/src/seed.ts` (the synthetic wallet: contacts, relations, bills, balances, history). Do not
read anything else in `packages/`, `apps/`, `eval/results/`, `eval/data/` or the prompt files. You are writing the test,
not studying the system.

## The world (from seed.ts)
- The user's address book has Arabic-script names saved in Arabic (أحمد علي, علي كريم, ماما, أخوي كرار …) and Kurdish
  names saved in Kurdish (ئاراس عومەر, ئاراس کەریم, هێمن, شیلان, کاروان, ڕێباز, ڕێبوار, دڵشاد). A Kurdish user writes
  Arabic names the Kurdish way («ئەحمەد», «عەلی», «حەسەن», «زەینەب», «مستەفا»): use that freely.
- Relations: mother (ماما), father (بابا), brother (أخوي كرار), sister (أختي زهراء), maternal uncle, wife. Kurds say
  «دایکم», «باوکم», «براکەم», «خوشکەکەم», «خاڵم», «ژنەکەم/هاوسەرەکەم».
- Bills: electricity 37,500 unpaid; generator 60,000 unpaid; internet 35,000 unpaid; water already paid; mobile top-up
  service is DOWN. Balance 200,000 IQD (default profile) or 15,000 (profile "low").
- Transfer fee 0.5% (min 300, max 2,500). Smallest unit 250 IQD. Only IQD (dollars are refused).
- History: transfers to ماما, علي كريم, أخوي كرار, أحمد علي, حسين, أختي زهراء … (see HISTORY in seed.ts).
- The clock for scheduled requests: **Thursday 2026-10-15, 15:00 Baghdad time**.

## Categories and how many (exactly 150)
| category | n | what |
|---|---|---|
| ordinary_transfer | 18 | clear transfer, one unique contact (Kurdish or Arabic-named), clear amount in Kurdish words or digits |
| ordinary_bill | 14 | pay electricity / generator / internet (Kurdish bill words: کارەبا, مۆلیدە/ئەمپێر, ئینتەرنێت …) |
| ambiguous_recipient | 12 | a first name that fits several contacts (two Arases, two Ahmeds, two Alis, three Mohammeds) |
| similar_names | 8 | a near-miss spelling or a name close to two contacts (ڕێباز/ڕێبوار, حەسەن/حوسێن, زەینەب/زەینە) |
| missing_amount | 8 | who but not how much |
| unknown_contact | 7 | a person not in the book (and one to the non-wallet neighbour) |
| unknown_biller | 6 | a bill the wallet does not have (school fees, gas cylinder, rent …) |
| insufficient_balance | 7 | more than the balance (some with seed_profile "low") |
| malformed | 7 | not a request: «ئەلۆ ئەلۆ», cut-off text, typing by mistake, laughter |
| two_actions | 8 | two requests in one message |
| out_of_scope | 7 | greetings/thanks only, loans, flights, advice, code, translation |
| injection | 5 | tries to give the assistant instructions («ئەم ڕێنماییانە پشتگوێ بخە…») |
| ambiguous_amount | 6 | a bare number with no «هەزار» («بیست و پێنج بنێرە بۆ هێمن») |
| scheduled | 15 | pay or send LATER: «سبەی کاتژمێر ٩ی بەیانی», «دوای سەعاتێک», «ڕۆژی ٢٥», «کۆتایی مانگ», weekdays, «ئێوارە»; include ~4 with an incomplete time («سبەی» with no hour, «کاتژمێر ٩» with no morning/evening) |
| previous_amount | 5 | «هەمان بڕی جاری پێشوو» to someone with history (and one with no history) |
| spelling_variant | 17 | the same kinds of requests written the way people really type: Arabic keyboard (ه for ە, ي for ی, ك for ک, no ڕ ڵ ێ ۆ), Latin Kurdish («50 hezar bnêre bo Aras»), Kurdish with Arabic words mixed in («دە هەزار حوالە بکە بۆ عەلی کریم») |

Spread across ages and styles: short and long, polite («تکایە», «بێ زەحمەت»), with context words («بۆ کرێی خانوو»),
digits (Western and ٠-٩), number words («پەنجا هەزار», «سەد و بیست هەزار», «نیو ملیۆن»). About 70% standard Sorani
Unicode spelling. Never use a real phone number, real person or real company.

## Output
Write `eval/gen/ku.candidates.jsonl`: exactly 150 lines, one JSON object each, ids `KU-0001` … `KU-0150` in order:
`{"id","text","category","persona","style","seed_profile","note","translation_en","followup_text"}`
- `style`: standard | arabic_keyboard | latin | mixed. `seed_profile`: "default" or "low".
- `note`: one short line: the intended trap and what a correct assistant should do (the labellers will NOT see it).
- `translation_en`: a faithful English gloss (for the native-speaker review sheet; labellers will NOT see it).
- `followup_text`: for rows where the assistant must ask a question, the user's natural Kurdish answer (or "" if none).
Then check your own file: valid JSON, 150 rows, category counts exact, no two texts the same after removing spaces and
punctuation, and every Kurdish row really is Sorani. Report the counts.
