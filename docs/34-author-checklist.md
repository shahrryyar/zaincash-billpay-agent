# Your part before the demo

These checks need you or real participants. Automated production tests and synthetic audio do not replace them. Use fictional names/payment requests only; never record real wallet/customer information.

## First: your actual phone

- Open the public HTTPS URL on the phone/browser you will present with, allow the microphone, and try Arabic and Sorani.
- Say a unique recipient/amount, an ambiguous name, a bill, and a cancellation. Check the transcript, names, digits, fees and balance before confirming.
- Correct an intentionally wrong transcript. Reject one recording. Confirm only a card you have read. Try denying microphone permission and verify typing remains usable.
- Repeat once over mobile data/hotspot. Note device, OS/browser, request, expected result and what actually happened. Send the observations; do not call it passed if you did not try it.

## Native wording and realism

- Have an Iraqi Arabic speaker and a Sorani speaker read the app copy and task examples. Correct the `VERIFY-DIALECT` items in the shared copy file.
- Review at least 50 development examples for natural wording and realistic expected behaviour. Existing sheet: `eval/data/review/dialect.review.csv`.
- Review/sign the fresh heldout2 sheet separately: `eval/data/review/heldout2.review.csv`. Do not use its rows to tune the app. After human review and code/prompt/scorer freeze, its final evaluation runs once.

## Observe 3–5 users

With consent, let each person try a bill payment, a transfer to an ambiguous name, and correcting a mistaken amount. Do not guide their first attempt. Record whether they finish, where they hesitate, whether they understand “nothing sent yet”, and whether they notice confirmation. Keep real observations in the research log; quotes only if actually said and permitted.

If you want a voice-accuracy claim, collect the separate consented task corpus: 40–60 fictional utterances from at least five speakers, with human transcripts and the name/amount labels. Follow `eval/voice/README.md`. Current synthetic transport checks establish no WER or human task accuracy.

## Disclosure and presentation

- Confirm the hosted ASR model/checkpoint version and training-data provenance you can disclose as RegaLabs' founder. The endpoint has not supplied a version; do not label it Stage-11 without evidence.
- Rehearse the runbook three times yourself. Ask someone to supply an unexpected request. Review the backup recording before relying on it.
- Before presenting: open Render early, check provider quota/credits, reset only your own demo session, leave faults off, and prepare the hotspot/backup.
- Resolve organiser questions, proprietary-repo evaluation permission and the submission/review booking. The assistant cannot invent acceptance or submit on your behalf without that instruction.
