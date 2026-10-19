# User conversations (judging: "Problem and impact 20%: a real user, a real problem, evidence you spoke to someone")

**Status: 5 done (logged 2026-10-19).** See the summary at the end. Only real conversations go in `interview-log.csv`. Never write down what someone "would"
say, never paraphrase into what we hoped to hear, never invent a person.

## Who and how
- 5 to 8 people who use a wallet or bank app in Iraq (ZainCash, SuperQi, FIB, …) at least monthly. Mix of ages; at
  least two who find apps hard or ask someone else to pay for them.
- 10 minutes, in person, by phone or as voice notes. No names: record age band, city, which app, how often.
- Do **not** show or describe our agent until the last question. Ask about what they did, not what they would like.
- Write down their **exact words** (Arabic is fine) for anything about a problem.

## Consent (read first) <!-- VERIFY-DIALECT -->
«هاي دردشة قصيرة لمشروع تجريبي بمسابقة. ما نسجل اسمك، ونكتب بس اللي تگوله بدون أي معلومات شخصية. تگدر توگف بأي وقت. توافق؟»

## Questions (open; follow up with «شلون؟» / «ليش؟» / «احچيلي اكثر») <!-- VERIFY-DIALECT -->
1. «آخر مرة دفعت فاتورة لو حولت فلوس بالتطبيق، شلون صارت؟ احچيلي خطوة خطوة.»
   (Last time you paid a bill or sent money in the app, how did it go?)
2. «صار وياك شي غلط؟ فلوس ما وصلت، دزيت لغير شخص، انخصمت مرتين، علگت؟ شسويت؟»
   (Did anything go wrong — money not arriving, wrong person, charged twice, stuck? What did you do?)
3. «شنو أصعب شي بالتطبيق؟ لو أكو أحد يسويلك الدفع بدالك؟»
   (What is hardest in the app? Does someone else do it for you?)
4. «من تدز لشخص، شلون تتأكد إنه هو الصح؟»
   (When you send to someone, how do you make sure it is the right person?)
5. «أكو شي بالتطبيق يسمعك لو تكتبله سؤال؟ استعملته؟ شسوه؟»
   (Is there anything in your app you can type or talk to? Did you use it? What did it do?)
6. Only now: «لو تگدر تكتب لو تگول جملة وحدة، مثل "دز خمسين ألف لأحمد"، ويطلعلك تأكيد قبل ما يدز، تستعمله؟ شنو يخليك تثق بيه، وشنو يخوفك؟»
   (If you could type or say one sentence and get a confirmation before anything is sent, would you use it? What would make you trust it, what would worry you?)

## After each conversation
Add one row to `interview-log.csv` the same day. Quotes go in `quote_ar` exactly as said. If something surprised you,
say so in `surprise`. Then the README/MVP page may cite counts ("5 of 6 had …") — only from this log.

## Summary (from `interview-log.csv`)
5 short conversations, Sulaymaniyah, ages 19–22, all consented, app not named (logged 2026-10-19 from the
author's notes; exact dates, method and quotes not recorded):
- 5/5 send money with a wallet app and wished it was more automated.
- 2/5 had sent money to the wrong person.
- 3/5 would use the agent ("we hope to see it in the future"); 2/5 would not (reason not recorded).
- 5/5 want scheduled payments and prefer typing to voice.
- All 5 are Kurdish speakers: no Iraqi-Arabic phrasings were collected, and **the agent only understands Arabic**.
- Limits: tiny, narrow sample (one city, one age band, no older or assisted users); no exact words recorded.

If you remember anyone's exact words (including the unique thing each person said), add them to `quote_ar`.
Next time: ask *why* when someone says no, ask the language question, and include older users.
