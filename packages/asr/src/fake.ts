import { AsrError, type Transcriber, type Transcript } from "./types";

/**
 * Deterministic stand-in for tests and the demo simulator (ASR_PROVIDER=fake). It never hears audio:
 * it returns the hint it is given, or the next scripted result. It must never be the provider on a real demo.
 */
export function createFakeTranscriber(script: (Partial<Transcript> & { text: string } | AsrError)[] = []): Transcriber & { calls: number } {
  const queue = [...script];
  const t = {
    id: "fake",
    calls: 0,
    async transcribe(_wav: Uint8Array, opts: { hint?: { text: string; confidence?: number } } = {}): Promise<Transcript> {
      t.calls++;
      if (opts.hint) return { text: opts.hint.text, provider: "fake", latencyMs: 0, ...(opts.hint.confidence !== undefined ? { confidence: opts.hint.confidence } : {}) };
      const next = queue.shift();
      if (!next) throw new AsrError("unavailable", "fake transcriber has no scripted result");
      if (next instanceof AsrError) throw next;
      return { provider: "fake", latencyMs: 0, ...next };
    },
  };
  return t;
}
