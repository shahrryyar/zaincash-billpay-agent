/** One finished utterance from an ASR provider. */
export type Transcript = {
  text: string;
  /** 0..1 when the provider gives one. The RegaLabs transcription API returns text only, so this is usually absent. */
  confidence?: number;
  language?: string;
  provider: string;
  latencyMs: number;
};

export type TranscribeOptions = { requestId?: string; signal?: AbortSignal; /** fake provider only */ hint?: { text: string; confidence?: number } };

export interface Transcriber {
  /** "regalabs:acm", "openai-compat:whisper-large-v3", "fake" — for logs and eval reports. */
  readonly id: string;
  transcribe(wav: Uint8Array, opts?: TranscribeOptions): Promise<Transcript>;
}

export type AsrErrorCode = "auth" | "quota" | "rate_limited" | "bad_audio" | "unsupported_language" | "rejected" | "unavailable" | "timeout";

/** Every provider failure becomes one of these. The voice route fails closed on all of them: nothing is sent. */
export class AsrError extends Error {
  override readonly name = "AsrError";
  constructor(readonly code: AsrErrorCode, message: string, readonly status?: number) { super(message); }
}
