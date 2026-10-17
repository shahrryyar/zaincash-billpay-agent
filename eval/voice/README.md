# eval/voice — voice subset (docs/09, docs/12)

**Status: no recordings yet.** No voice number exists until real, consented recordings are scored here.
Never invent recordings, speakers or transcripts.

## What goes here
- `audio/` (gitignored): 16 kHz mono PCM16 WAV files. Convert anything else with
  `ffmpeg -i in.m4a -ar 16000 -ac 1 -c:a pcm_s16le out.wav`.
- `manifest.jsonl` (committed): one row per recording. Reference transcripts are typed by a person who listened.

```json
{"id": "V-001", "audio": "audio/V-001.wav", "reference": "دز خمسين ألف لأحمد علي", "speaker": "S1", "consent": true, "case_id": "C-0001", "amount_iqd": 50000, "names": ["أحمد علي"], "noise": "street"}
```

| Field | Meaning |
|---|---|
| `reference` | What was actually said, typed by a listener (not the script they read, if they changed it). |
| `speaker` | A label only (S1, S2…). No names. Keep age band / region / gender in a local sheet if needed. |
| `consent` | Must be `true`. The runner refuses rows without it. |
| `case_id` | Optional: the labelled text case (dev or held-out) this utterance reads. Enables end to end on voice. |
| `amount_iqd`, `names` | Optional: slots to check for survival through ASR. |

## Collecting recordings
1. Target: 40–60 utterances, at least 5 speakers, phone mic, some with background noise (docs/09).
2. Content is fictional (seed names, synthetic amounts). Read the consent line first:
   «هذا تسجيل لمشروع تجريبي. المحتوى وهمي، ما نستخدم اسمك، والتسجيل يبقى بس للتقييم. توافق؟» <!-- VERIFY-DIALECT -->
3. Easiest path: run the app with `VOICE_CAPTURE_DIR=eval/voice/captures` and let each speaker use the mic.
   Every utterance is saved as WAV plus a row in `captures.jsonl` with the ASR `hypothesis` and `reference: null`.
   A listener fills `reference`, then the rows (with `consent: true`) move into `manifest.jsonl`.

## Running
```bash
pnpm --filter @zc/eval eval:voice                     # uses ASR_PROVIDER / REGALABS_* from .env
pnpm eval -- --data eval/results/voice-<tag>.cases.jsonl --split voice   # end to end on the ASR transcripts
```
Reports WER/CER raw and normalised (corpus-level), amount and name survival with Wilson intervals, how many
utterances the voice gate would repeat / read back / accept, and ASR latency. Transcripts are cached by audio hash
in `.cache/asr`, so re-runs cost nothing.

Thresholds τ_low/τ_high (`ASR_CONF_LOW/HIGH`) may be tuned on a **dev** voice set only, then frozen.
RegaLabs' transcription API returns no confidence, so with the default policy every voice request is read back.
