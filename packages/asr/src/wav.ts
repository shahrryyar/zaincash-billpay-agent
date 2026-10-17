// WAV (RIFF, PCM16) helpers. Pure and browser-safe: the web app records with MediaRecorder, decodes, then uses
// downmix/resample/encode here to produce the 16 kHz mono PCM16 WAV that the RegaLabs API requires.

export const TARGET_SAMPLE_RATE = 16_000;

export type WavInfo = { sampleRate: number; channels: number; bitsPerSample: number; dataBytes: number; durationS: number };
export type WavCheck = ({ ok: true } & WavInfo) | { ok: false; error: "not_wav" | "not_pcm16" | "no_data" | "truncated" };

const ascii = (b: Uint8Array, at: number, n: number) => String.fromCharCode(...b.subarray(at, at + n));

/** Parse the RIFF header and find fmt + data chunks (they need not be adjacent). */
export function inspectWav(bytes: Uint8Array): WavCheck {
  if (bytes.length < 12 || ascii(bytes, 0, 4) !== "RIFF" || ascii(bytes, 8, 4) !== "WAVE") return { ok: false, error: "not_wav" };
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let at = 12;
  let fmt: { format: number; channels: number; sampleRate: number; bits: number } | null = null;
  while (at + 8 <= bytes.length) {
    const id = ascii(bytes, at, 4);
    const size = view.getUint32(at + 4, true);
    const body = at + 8;
    if (id === "fmt ") {
      if (body + 16 > bytes.length) return { ok: false, error: "truncated" };
      fmt = { format: view.getUint16(body, true), channels: view.getUint16(body + 2, true), sampleRate: view.getUint32(body + 4, true), bits: view.getUint16(body + 14, true) };
    } else if (id === "data") {
      if (!fmt) return { ok: false, error: "truncated" };
      if (fmt.format !== 1 || fmt.bits !== 16 || fmt.channels < 1 || fmt.sampleRate < 1) return { ok: false, error: "not_pcm16" };
      const dataBytes = Math.min(size, bytes.length - body);
      if (dataBytes <= 0) return { ok: false, error: "no_data" };
      const durationS = dataBytes / (fmt.sampleRate * fmt.channels * 2);
      return { ok: true, sampleRate: fmt.sampleRate, channels: fmt.channels, bitsPerSample: 16, dataBytes, durationS };
    }
    at = body + size + (size % 2); // chunks are word-aligned
  }
  return { ok: false, error: fmt ? "no_data" : "truncated" };
}

/** Average all channels into one. */
export function downmix(channels: readonly Float32Array[]): Float32Array {
  const first = channels[0];
  if (!first) return new Float32Array(0);
  if (channels.length === 1) return first;
  const out = new Float32Array(first.length);
  for (const ch of channels) for (let i = 0; i < out.length; i++) out[i] = (out[i] as number) + ((ch[i] ?? 0) / channels.length);
  return out;
}

/** Linear-interpolation resampler. Good enough for speech at 16 kHz; no dependencies. */
export function resample(samples: Float32Array, fromRate: number, toRate: number = TARGET_SAMPLE_RATE): Float32Array {
  if (fromRate === toRate || samples.length === 0) return samples;
  const ratio = fromRate / toRate;
  const n = Math.max(1, Math.floor(samples.length / ratio));
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = i * ratio;
    const i0 = Math.floor(x);
    const i1 = Math.min(i0 + 1, samples.length - 1);
    const f = x - i0;
    out[i] = (samples[i0] as number) * (1 - f) + (samples[i1] as number) * f;
  }
  return out;
}

/** Float samples in [-1, 1] -> a mono PCM16 WAV file. Values outside the range are clipped. */
export function encodeWav(samples: Float32Array, sampleRate: number = TARGET_SAMPLE_RATE): Uint8Array {
  const dataBytes = samples.length * 2;
  const buf = new ArrayBuffer(44 + dataBytes);
  const v = new DataView(buf);
  const w = (at: number, s: string) => { for (let i = 0; i < s.length; i++) v.setUint8(at + i, s.charCodeAt(i)); };
  w(0, "RIFF"); v.setUint32(4, 36 + dataBytes, true); w(8, "WAVE");
  w(12, "fmt "); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, sampleRate, true); v.setUint32(28, sampleRate * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true);
  w(36, "data"); v.setUint32(40, dataBytes, true);
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i] as number));
    v.setInt16(44 + i * 2, s < 0 ? Math.round(s * 0x8000) : Math.round(s * 0x7fff), true);
  }
  return new Uint8Array(buf);
}

/** Root-mean-square level of the samples, to refuse near-silent recordings before paying for ASR. */
export function rms(samples: Float32Array): number {
  if (samples.length === 0) return 0;
  let sum = 0;
  for (let i = 0; i < samples.length; i++) sum += (samples[i] as number) ** 2;
  return Math.sqrt(sum / samples.length);
}
