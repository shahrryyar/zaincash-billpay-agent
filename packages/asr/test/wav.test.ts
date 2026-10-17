import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { downmix, encodeWav, inspectWav, resample, rms } from "../src/wav";

describe("WAV PCM16", () => {
  it("encode -> inspect round trip", () => {
    const wav = encodeWav(new Float32Array(16_000), 16_000);
    expect(inspectWav(wav)).toEqual({ ok: true, sampleRate: 16_000, channels: 1, bitsPerSample: 16, dataBytes: 32_000, durationS: 1 });
  });
  it("clips out-of-range samples instead of wrapping", () => {
    const wav = encodeWav(new Float32Array([2, -2]), 16_000);
    const v = new DataView(wav.buffer);
    expect(v.getInt16(44, true)).toBe(32767);
    expect(v.getInt16(46, true)).toBe(-32768);
  });
  it("rejects non-WAV bytes (an MP3 or webm renamed .wav)", () => {
    expect(inspectWav(new TextEncoder().encode("ID3 not a wav at all"))).toEqual({ ok: false, error: "not_wav" });
    expect(inspectWav(new Uint8Array([0x1a, 0x45, 0xdf, 0xa3, 0, 0, 0, 0, 0, 0, 0, 0]))).toEqual({ ok: false, error: "not_wav" });
  });
  it("rejects non-PCM16 (8-bit or float)", () => {
    const wav = encodeWav(new Float32Array(10));
    new DataView(wav.buffer).setUint16(34, 8, true);
    expect(inspectWav(wav)).toEqual({ ok: false, error: "not_pcm16" });
  });
  it("finds the data chunk after an extra chunk (LIST)", () => {
    const base = encodeWav(new Float32Array(160));
    const list = new Uint8Array([0x4c, 0x49, 0x53, 0x54, 4, 0, 0, 0, 1, 2, 3, 4]);
    const out = new Uint8Array(base.length + list.length);
    out.set(base.subarray(0, 36)); out.set(list, 36); out.set(base.subarray(36), 36 + list.length);
    const r = inspectWav(out);
    expect(r.ok && r.dataBytes).toBe(320);
  });
  it("header only, no samples: no_data", () => expect(inspectWav(encodeWav(new Float32Array(0)))).toEqual({ ok: false, error: "no_data" }));
  it("property: inspect never throws on arbitrary bytes", () => {
    fc.assert(fc.property(fc.uint8Array({ maxLength: 200 }), (b) => { inspectWav(b); return true; }));
    fc.assert(fc.property(fc.uint8Array({ maxLength: 200 }), (b) => { const x = new Uint8Array(12 + b.length); x.set(new TextEncoder().encode("RIFF\0\0\0\0WAVE")); x.set(b, 12); inspectWav(x); return true; }));
  });
});

describe("downmix / resample / rms", () => {
  it("averages channels", () => expect([...downmix([new Float32Array([1, 0]), new Float32Array([0, 1])])]).toEqual([0.5, 0.5]));
  it("48 kHz -> 16 kHz keeps the duration", () => expect(resample(new Float32Array(48_000), 48_000, 16_000).length).toBe(16_000));
  it("same rate is a no-op", () => { const s = new Float32Array([0.1, 0.2]); expect(resample(s, 16_000, 16_000)).toBe(s); });
  it("rms of silence is 0, of a full-scale square is 1", () => {
    expect(rms(new Float32Array(100))).toBe(0);
    expect(rms(new Float32Array([1, -1, 1, -1]))).toBe(1);
  });
});
