// pnpm --filter @zc/asr check [file.wav]
// Sends one WAV (default: 1 s of a quiet tone) to the configured ASR provider and says exactly what is wrong, if anything.
// Reads the root .env. Never prints the key.
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { AsrError, asrFromEnv, encodeWav, inspectWav } from "./index";

function loadEnv(): Record<string, string | undefined> {
  const env: Record<string, string | undefined> = { ...process.env };
  for (let dir = process.cwd(), i = 0; i < 4; i++, dir = resolve(dir, "..")) {
    const f = resolve(dir, ".env");
    if (!existsSync(f)) continue;
    for (const l of readFileSync(f, "utf8").split("\n")) {
      const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/.exec(l);
      if (m && !l.trim().startsWith("#") && env[m[1] as string] === undefined) env[m[1] as string] = (m[2] as string).replace(/\s+#.*$/, "").replace(/^["']|["']$/g, "");
    }
    break;
  }
  return env;
}

const HINT: Record<string, string> = {
  auth: "the key was refused: check REGALABS_API_KEY (a rega_live_… developer key).",
  quota: "the account has no paid credit for API use (free-plan credit does not cover the API).",
  unsupported_language: "the gateway does not accept this language code. RegaLabs' developer endpoint allows only its SUPPORTED_ASR_LANGUAGES; add \"acm\" there, or set REGALABS_ASR_LANGUAGE=ar (MSA model) as a stopgap and say so in the disclosure.",
  bad_audio: "the audio was rejected (it must be WAV PCM16; 16 kHz mono is what the app sends).",
  rate_limited: "rate limited (60 requests a minute per key): wait and retry.",
  unavailable: "the service did not answer or returned 5xx (also happens outside RegaLabs' daily public window).",
  timeout: "no answer in time: raise ASR_TIMEOUT_MS or check the network.",
  rejected: "the request was refused for another reason: see the message.",
};

const env = loadEnv();
const cfg = asrFromEnv(env);
console.log(`provider: ${cfg.provider}  (${cfg.description})`);
if (!cfg.transcriber) { console.log("voice is off: set ASR_PROVIDER/REGALABS_API_KEY in .env"); process.exit(1); }

const path = process.argv[2];
let wav: Uint8Array;
if (path) wav = new Uint8Array(readFileSync(path));
else { const s = new Float32Array(16_000); for (let i = 0; i < s.length; i++) s[i] = 0.05 * Math.sin((2 * Math.PI * 220 * i) / 16_000); wav = encodeWav(s); }
const info = inspectWav(wav);
if (!info.ok) { console.log(`not a PCM16 WAV: ${info.error}. Convert: ffmpeg -i in -ar 16000 -ac 1 -c:a pcm_s16le out.wav`); process.exit(1); }
console.log(`audio: ${info.durationS.toFixed(2)} s, ${info.sampleRate} Hz, ${info.channels} ch`);

try {
  const t = await cfg.transcriber.transcribe(wav, { requestId: `zc-check-${Date.now()}` });
  console.log(`OK in ${t.latencyMs} ms. text: «${t.text}»  confidence: ${t.confidence ?? "not provided (voice will read back every transcript)"}`);
} catch (e) {
  if (e instanceof AsrError) { console.log(`FAILED [${e.code}${e.status ? ` HTTP ${e.status}` : ""}]: ${e.message}\n-> ${HINT[e.code]}`); process.exit(2); }
  throw e;
}
