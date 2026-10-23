# 09 — Voice: RegaLabs Iraqi-Arabic ASR

Updated 2026-10-23: **hosted streaming ASR is live on Render**, with transcript review before Gemini. The pre-existing local Stage-11 option remains available separately; corpus voice evaluation is still pending. Disclose (docs/19,
`DISCLOSURE.md`): RegaLabs is the author's company; the ASR predates the challenge and is called as an external API.

## Selected demo transport — streaming ASR, 2026-10-23

The author selected **`wss://api.regalabs.dev/v1/audio/transcriptions/stream`**, verified against [RegaLabs Speech API docs](https://docs.regalabs.dev/#speech-api). The earlier `/v1/audio/stream` socket combines recognition and synthesis and is not the selected demo recognizer. A real authenticated no-audio handshake returned `ready`, `done` and normal close; [evidence](../eval/results/readiness-asr-stream-handshake-2026-10-23T12-01-53-965Z.json).

Application commit `9213345` is deployed on the existing free Render service. Public checks passed **3/3**, including actual socket transcription, read-back before any model call, and Gemini continuation after acceptance with unchanged balance. [Public check](../eval/results/readiness-render-stream-voice-2026-10-23.json). Chrome's fake microphone also exercised MediaRecorder/conversion/upload/read-back on the public page. The fixture was synthetic Sorani speech; this is not a physical-mic or recognition-accuracy result. Some fixture names were misrecognized and earlier requests failed; preserved results are explained in docs/19 and docs/30.

Set `REGALABS_STREAM_URL` alongside the existing server-side developer key to select this adapter. Keep the current push-to-talk UI: the browser uploads its finished WAV to our server; the server authenticates to the socket, configures `language: auto` and `sample_rate: 16000`, sends raw mono PCM16 in 50 ms frames, then sends `end`. Only ordered final utterances followed by `done` form the final transcript. Ignore partials for intent understanding; timeout, close without `done`, malformed/out-of-order/duplicate finals, failed utterances or dropped audio fail closed. Do not automatically retry a charged stream. No new service or payment path is added, and the key never reaches the browser.

Final transcripts enter the confidence gate. The web composer requests `draft=1`: reject low confidence, then return an editable unsent draft with no orchestrator/model call, regardless of high confidence. The user explicitly sends the reviewed text before Gemini. Legacy clients without that field retain the read-back contract. Live browser partials remain queued in docs/32; this adapter does not claim words appearing while recording. REST remains available for the pre-existing local Stage-11 wrapper when no stream URL is configured. The current public REST docs specify an explicit/default language rather than automatic detection; use the selected socket's documented `auto` for the hosted bilingual demo.

## Initial hosted voice setup, 2026-10-23

The author supplied a hosted developer key and chose to resume the hosted RegaLabs API. The key, `REGALABS_BASE_URL=https://api.regalabs.dev/v1`, automatic language detection and `ASR_NO_CONFIDENCE=readback` were saved and read back through Render's environment API without printing secret values. Render remains on the free plan. The laptop configuration was preserved separately.

The initial REST transcription check returned **HTTP 503 `SERVICE_PAUSED`** for both the supplied key and a deliberately invalid test key, before authentication. [Probe evidence](../eval/results/readiness-hosted-asr-probe-2026-10-23T11-44-55-801Z.json). The author then resumed the service and selected the dedicated streaming recognizer described above. No laptop-ASR tunnel was started.

After resume, the dedicated streaming adapter was implemented, configured and deployed as recorded above. Every transcript still requires read-back acceptance and every payment still requires its separate confirmation card. The initial synthetic test audio was generated with eSpeak NG and converted to 16 kHz mono PCM16 by FFmpeg; a clearer Sorani fixture was generated with RegaLabs Deng Flash. Both are transport fixtures, not human task speech or WER evidence.

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

## Decision: the developer API, not LiveKit
RegaLabs exposes a developer API; the selected socket contract is documented at [docs.regalabs.dev](https://docs.regalabs.dev/#speech-api). The HTTP route below remains the legacy/local-compatible option:

| Endpoint | Contract |
|---|---|
| `POST https://api.regalabs.dev/v1/audio/transcriptions` | `Authorization: Bearer rega_live_…`, multipart `file` = **WAV PCM16** (≤ 8 MB), `language`; optional `Idempotency-Key` (billing reference). Returns `{ "text": … }` only. OpenAI error envelope `{error:{message,type,code}}`: 401 `invalid_api_key`, 402 `insufficient_quota`, 400 `unsupported_format`/`unsupported_language`, 413, 429 (60/min/key), 502/503 (credits refunded). |
| `WS /v1/audio/stream` | PCM16 16 kHz frames, `{type:"configure",language}`, `{type:"flush"}` → `{type:"transcript",text,is_final}`. Not used yet (live partials would be a later addition). |
| **`WS /v1/audio/transcriptions/stream`** | **Selected.** Server sends key in initial `{type:"auth",token}`; waits for `ready`, configures `language:"auto", sample_rate:16000`, sends raw mono PCM16 frames, then `end`. Receives `partial`, ordered `final`, `done`. Maximum 64 KB per audio frame; up to two streams per key. |

LiveKit was the original plan. The existing push-to-talk upload and a server-side socket adapter keep the key on our server without adding a media server, room tokens or another service.

## Language: auto-detected on the selected socket (2026-10-23)
The selected streaming recognizer receives **`language:"auto"` explicitly** (`REGALABS_ASR_LANGUAGE=auto`). One setting serves the Iraqi-Arabic and the Kurdish (Sorani) screen; the transcript goes
through the same read-back and the same parsers (Kurdish words are read by `packages/core/src/kurdish.ts`). The old
`acm` blocker below only applies when a language is forced.

## Historical REST language blocker (does not apply to the selected socket)
The developer endpoint only accepts `SUPPORTED_ASR_LANGUAGES = ckb, ku, en, tr, ar, es, zh` (developer-audio.ts line 89).
Iraqi Arabic is `acm` in RegaLabs' own catalogue (`server/shared/rega-languages.json`, asrCode `acm_Arab`) and the
recognizer supports it, but the gateway refuses it with 400 `unsupported_language`. Fix: add `'acm'` to that set.
The selected socket explicitly supports `acm`, `ar`, `ckb` and `auto`; do not apply this old REST stopgap to it. Current public REST docs specify a default `ckb` language and no automatic guessing when omitted.

## How it works (as built)
```
hold 🎤 ─► MediaRecorder (webm/opus) ─► decode in browser ─► downmix + resample 16 kHz + PCM16 WAV (@zc/asr, pure)
        ─► POST /api/voice (our server)  ─► checks: WAV, 0.3–30 s, size
        ─► RegaLabs /audio/transcriptions/stream (server-side key, 50 ms PCM frames, complete finals + done; no automatic retry)
        ─► confidence gate ─► editable draft ─► user sends /api/turn(text) ← SAME path as typed text
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
`packages/asr` (streaming/legacy clients, WAV helpers, fake, env factory, `check` script) · `packages/core/src/asr.ts` (gate) ·
`packages/orchestrator` (read-back in `turn`) · `apps/web/server/voice.ts` + `app/api/voice/route.ts` ·
`apps/web/components/MicButton.tsx`, `recorder.ts` · `eval/src/voice.ts`, `eval/src/wer.ts`, `eval/voice/README.md`.

## Turning it on (author, 2 minutes)
1. The public demo is already configured in Render. For local development, `.env`: use the laptop endpoint/key above with no stream URL, or a hosted `REGALABS_API_KEY` plus `REGALABS_STREAM_URL=wss://api.regalabs.dev/v1/audio/transcriptions/stream`. The laptop key does not need hosted-service credit.
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
