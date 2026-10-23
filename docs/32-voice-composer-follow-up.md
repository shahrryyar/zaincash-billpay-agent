# Voice composer follow-up — requested 2026-10-21, for later

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

The hosted demo now uses the dedicated RegaLabs streaming recognizer through the server adapter (docs/09), but the browser still uploads a finished push-to-talk WAV. The live editable composer described here remains queued and is not claimed as implemented.
