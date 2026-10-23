# 09 — Voice: RegaLabs Iraqi-Arabic ASR

Updated 2026-10-21: **local Stage-11 API available for laptop testing**, according to the author's client checks below; corpus voice evaluation is still pending. Disclose (docs/19,
`DISCLOSURE.md`): RegaLabs is the author's company; the ASR predates the challenge and is called as an external API.

## Hosted voice setup, 2026-10-23

The author supplied a hosted developer key and chose to resume the hosted RegaLabs API. The key, `REGALABS_BASE_URL=https://api.regalabs.dev/v1`, automatic language detection and `ASR_NO_CONFIDENCE=readback` were saved and read back through Render's environment API without printing secret values. Render remains on the free plan. The laptop configuration was preserved separately.

The hosted transcription endpoint currently returns **HTTP 503 `SERVICE_PAUSED`** for both the supplied key and a deliberately invalid test key. This occurs before authentication, so key validity and hosted transcription have not been established. [Probe evidence](../eval/results/readiness-hosted-asr-probe-2026-10-23T11-44-55-801Z.json). Voice remains explicitly off until the API resumes; the text demo remains available. No laptop-ASR tunnel was started.

After the API resumes, check the supplied key with a synthetic WAV, set the existing Render service's `ASR_PROVIDER=regalabs`, redeploy the existing application commit, then verify the mic, upload/read-back and Gemini continuation over public HTTPS. Every transcript still requires read-back acceptance and every payment still requires its separate confirmation card. Synthetic test audio was generated with eSpeak NG and converted to 16 kHz mono PCM16 by FFmpeg; it is a transport fixture, not human task speech or WER evidence.

## Local Stage-11 option (2026-10-21, author-reported checks)

The laptop service in `rega-asr-work/local-asr/server.py` implements the same transcription contract at
`http://127.0.0.1:8790/v1/audio/transcriptions`. `.env` uses `ASR_PROVIDER=regalabs`,
`REGALABS_BASE_URL=http://127.0.0.1:8790/v1` and a separate local key; never commit or print the key.
The author tested through ZainCash's `asrFromEnv`: correct Sorani transcript, detected `ckb`, 2.9 s;
Iraqi-Arabic 2.4-second phone clip detected `ar`, 0.7 s; wrong key -> 401. These are spot checks, not WER/CER or voice E2E.

CPU inference is about 3 s per sentence while the GPU trains a corrector. Client timeout is 15 s.
The service does not auto-start and needs about 85 s to load. From `local-asr/`:
`nohup /home/jackal/Desktop/idk/nemo-venv/bin/python server.py > server.log 2>&1 &`.
Check readiness before the demo. Laptop loopback is unavailable to a remotely hosted web server or an ordinary Docker
container; configure their ASR endpoint separately. The remaining hosted-service notes below describe the cloud path.
Exact local checkpoint: stage11-avg3-36k44k48k.nemo, SHA-256 e9de02a14d531d79c531d442e6d7294d175cda55d118cf34fa4ab6efb052b02c; CPU context [56,13], blank penalty 0.9. Training-data provenance still needs an author disclosure before comparison. Independent client/web upload checks are in docs/30; no task WER/CER is claimed.

The author confirms the underlying model supports streaming at 80/320/400 ms chunks. The current local server.py exposes final HTTP transcription only. Connecting a streaming transport and editable partials is captured for later in docs/32; these chunk sizes are not measured end-to-end latency.

## Decision: the developer HTTP API, not LiveKit
RegaLabs exposes an OpenAI-compatible developer API (RegaLabs repo: `server/gateway/src/routes/developer-audio.ts`):

| Endpoint | Contract |
|---|---|
| `POST https://api.regalabs.dev/v1/audio/transcriptions` | `Authorization: Bearer rega_live_…`, multipart `file` = **WAV PCM16** (≤ 8 MB), `language`; optional `Idempotency-Key` (billing reference). Returns `{ "text": … }` only. OpenAI error envelope `{error:{message,type,code}}`: 401 `invalid_api_key`, 402 `insufficient_quota`, 400 `unsupported_format`/`unsupported_language`, 413, 429 (60/min/key), 502/503 (credits refunded). |
| `WS /v1/audio/stream` | PCM16 16 kHz frames, `{type:"configure",language}`, `{type:"flush"}` → `{type:"transcript",text,is_final}`. Not used yet (live partials would be a later addition). |

LiveKit was the original plan. For push-to-talk it adds a media server, room tokens and an agent dispatch for no gain:
one HTTPS call per utterance is simpler, testable and keeps the key on our server. Judges reward simple and reliable.

## Language: auto-detected (2026-10-19)
The RegaLabs API detects the spoken language itself, so the app sends **no** `language` field by default
(`REGALABS_ASR_LANGUAGE=auto`). One setting serves the Iraqi-Arabic and the Kurdish (Sorani) screen; the transcript goes
through the same read-back and the same parsers (Kurdish words are read by `packages/core/src/kurdish.ts`). The old
`acm` blocker below only applies when a language is forced.

## ⚠ (Only when a language is forced) One blocker on the RegaLabs side
The developer endpoint only accepts `SUPPORTED_ASR_LANGUAGES = ckb, ku, en, tr, ar, es, zh` (developer-audio.ts line 89).
Iraqi Arabic is `acm` in RegaLabs' own catalogue (`server/shared/rega-languages.json`, asrCode `acm_Arab`) and the
recognizer supports it, but the gateway refuses it with 400 `unsupported_language`. Fix: add `'acm'` to that set.
Stopgap: `REGALABS_ASR_LANGUAGE=ar` (MSA prompt on Iraqi speech) — disclose it if used.

## How it works (as built)
```
hold 🎤 ─► MediaRecorder (webm/opus) ─► decode in browser ─► downmix + resample 16 kHz + PCM16 WAV (@zc/asr, pure)
        ─► POST /api/voice (our server)  ─► checks: WAV, 0.3–30 s, size
        ─► RegaLabs /audio/transcriptions (key server-side, Idempotency-Key per utterance, 1 retry on 5xx/timeout)
        ─► voice gate ─► orchestrator.turn(text, voice: true)   ← the SAME path as typed text
```
- **Voice has no execution logic.** The transcript enters the normal turn; the confirmation card and token are unchanged.
- **Voice gate** (`packages/core/src/asr.ts`, pure, property-tested):
  - empty transcript or confidence < τ_low (`ASR_CONF_LOW`, 0.5) → «ما سمعتك زين، تعيدها؟», **no model call**;
  - τ_low ≤ c < τ_high (`ASR_CONF_HIGH`, 0.8) → **read-back**: «سمعتك تگول: «…» — صح؟» with «صح، كمّل» / «لا، أعيدها» /
    «عدّلها بالكتابة». The model sees nothing until «صح». A read-back expires after 2 minutes; any new input drops it;
  - c ≥ τ_high → normal flow (card still mandatory);
  - **no confidence** (RegaLabs returns text only) → read-back by default (`ASR_NO_CONFIDENCE=readback`);
  - a confidence outside [0,1] is never trusted (read-back);
  - a spoken «الغي» is not read back (cancelling is the safe direction); a spoken «اي» never confirms (button only).
- **Fail closed:** provider down, bad key, no credit, unsupported language, bad/too long audio → «الصوت ما يشتغل هسه.
  اكتب طلبك، وما انرسل شي.» Nothing reaches the orchestrator. Typing always works.
- **No key → no mic.** `ASR_PROVIDER` unset and no `REGALABS_API_KEY` = voice off.

## Files
`packages/asr` (client, WAV helpers, fake, env factory, `check` script) · `packages/core/src/asr.ts` (gate) ·
`packages/orchestrator` (read-back in `turn`) · `apps/web/server/voice.ts` + `app/api/voice/route.ts` ·
`apps/web/components/MicButton.tsx`, `recorder.ts` · `eval/src/voice.ts`, `eval/src/wer.ts`, `eval/voice/README.md`.

## Turning it on (author, 2 minutes)
1. `.env`: use the laptop endpoint/key above, or a hosted `REGALABS_API_KEY` with API credit. The laptop key does not need hosted-service credit.
2. `pnpm --filter @zc/asr check [some.wav]` → prints OK + transcript, or the exact problem (auth, quota, language,
   service down / outside the daily public window).
3. `pnpm dev`, hold 🎤. Without a key: `ASR_PROVIDER=fake pnpm dev` and use «محاكاة صوت» in «لوحة العرض».

## Tests (no network)
core gate 15 · asr client/WAV/factory 33 · orchestrator voice 13 (incl. a property: no sequence of voice turns and
read-back taps moves money) · web voice route 7 · eval WER/CER 9. Verified over HTTP against the running app with the
real model: read-back → «صح» → card (fee 300, 149,700 after), spoken «اي» → «اضغط زر التأكيد», low confidence → repeat,
non-WAV → 400.

## Voice evaluation (not done yet: needs recordings)
`eval/voice/README.md`: 40–60 consented utterances, ≥5 speakers, phone mic, some noise; fictional content.
`VOICE_CAPTURE_DIR=eval/voice/captures` saves each in-app utterance with its ASR hypothesis; a listener types the
reference. `pnpm --filter @zc/eval eval:voice` reports WER/CER raw + normalised, amount/name survival, gate decisions,
latency, and writes a case file so `pnpm eval -- --data … --split voice` measures end to end on voice vs text.
**No voice number may be claimed before this runs.** RegaLabs' published figures are from its own test sets
(the streaming README reports Sorani phone WER ~51%); they say nothing about this task.

## TTS read-back (cut first)
Not built. Cut order unchanged: TTS first.
