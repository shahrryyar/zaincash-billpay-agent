// Browser audio -> the 16 kHz mono PCM16 WAV the RegaLabs API requires. MediaRecorder gives webm/opus; the browser
// decodes it, and the pure helpers in @zc/asr downmix, resample and encode (no ffmpeg, no extra dependency).
import { TARGET_SAMPLE_RATE, downmix, encodeWav, resample, rms } from "@zc/asr";

export type Recorded = { wav: Blob; seconds: number; level: number };

export async function toWav16k(blob: Blob): Promise<Recorded> {
  const ctx = new AudioContext();
  try {
    const buf = await ctx.decodeAudioData(await blob.arrayBuffer());
    const channels = Array.from({ length: buf.numberOfChannels }, (_, i) => buf.getChannelData(i));
    const mono = resample(downmix(channels), buf.sampleRate, TARGET_SAMPLE_RATE);
    return { wav: new Blob([encodeWav(mono) as BlobPart], { type: "audio/wav" }), seconds: mono.length / TARGET_SAMPLE_RATE, level: rms(mono) };
  } finally {
    void ctx.close();
  }
}

/** A short quiet tone: the demo simulator's stand-in for a recording (the fake ASR ignores the audio). */
export function simulatorWav(seconds = 0.6): Blob {
  const s = new Float32Array(Math.round(TARGET_SAMPLE_RATE * seconds));
  for (let i = 0; i < s.length; i++) s[i] = 0.05 * Math.sin((2 * Math.PI * 220 * i) / TARGET_SAMPLE_RATE);
  return new Blob([encodeWav(s) as BlobPart], { type: "audio/wav" });
}
