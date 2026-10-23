# Voice composer — editable review implemented 2026-10-23

User request: while speaking, show ASR text in the send-message bar; offer confirmation to send the request or review grammar/errors first.

## Intended behaviour

- Transcription fills an editable draft in the composer; it never initiates a payment.
- Explicit options: send the request to the assistant, or review/edit the text before sending.
- Sending a request is separate from the existing payment confirmation card/token. Keep that card mandatory.
- Keep the raw transcript accessible if grammar suggestions are introduced. Names, recipients, numbers, currency and times must not be silently changed; show the difference and require acceptance.
- Cancel/reject/record-again must not submit the old draft. Typed text stays available if speech fails.
- Arabic default and Sorani copy stay in the shared copy table; uncertain wording requires native review.

## Streaming model and current transport

The author confirms the RegaLabs model supports streaming modes at 80 ms, 320 ms and 400 ms. The model is not batch-only. The current local server.py POST /audio/transcriptions wrapper accepts a complete WAV and returns the final utterance only. It can fill the draft after recording stops, but cannot truthfully render streaming words. Use the existing model streaming capability through a tested streaming/partial-transcript transport rather than pretending repeated whole-WAV calls are live streaming. Verify the exposed local protocol and mode selection before wiring the client. Partial text must remain an unsubmitted draft, be replaced by the final transcript safely, and never create a card by itself.

## Acceptance before implementing

Test start/stop/cancel, partial/final replacement, existing typed drafts, user edits, repeated uploads, slow/out-of-order responses, read-back expiry, grammar suggestions changing a name/amount, and both languages. Preserve the invariant that no sequence of microphone events, draft edits or grammar suggestions can move money without the final payment confirmation.

## Release scope, 2026-10-23

The composer now fills an editable draft **after recording ends**. The browser requests `draft=1` on the existing voice upload route. That mode validates audio/confidence and returns the transcript without calling the orchestrator or Gemini, including for high-confidence speech. Low confidence and silence still ask to repeat. The user reviews/edits and explicitly sends a normal text turn; the existing confirmation card remains mandatory. Original uncorrected transcript text is accessible; only existing control-character/whitespace cleanup applies, with no grammar/name/amount rewriting.

Recording/processing disables composer submission and language changes. Typed drafts cannot be overwritten by starting voice. Cancelling invalidates the recording id, aborts the upload locally, and ignores late responses. It cannot guarantee an already-started provider request stops charging. Permission failure and early release return to typing and stop microphone tracks. Existing legacy clients may still use the read-back route without `draft=1`; its expiry and confidence tests remain intact.

**Words appearing while speaking remain queued.** The hosted recognizer supports partials, but the browser still uploads a finished WAV. A browser-to-server live relay would change server packaging/lifecycle; this release keeps the tested single-service Next standalone deployment. No live-partial latency claim is made. The pure draft reducer already tests partial/final/cancel ordering without wiring partials into production.
