import { randomUUID } from "node:crypto";
import { engine, withWallet } from "../../../server/engine";
import { createVoiceHandler } from "../../../server/voice";
export const dynamic = "force-dynamic";

let handler: ReturnType<typeof createVoiceHandler> | null = null;

/** Push-to-talk upload: a 16 kHz mono PCM16 WAV recorded in the browser. The ASR key never leaves the server. */
export async function POST(req: Request) {
  const e = engine();
  handler ??= createVoiceHandler({
    orch: e.orch, asr: e.asr, demo: e.demo, newId: () => randomUUID(),
    captureDir: e.voiceCaptureDir,
  });
  const form = await req.formData().catch(() => null);
  if (!form) return Response.json({ error: "bad_form", message: "" }, { status: 400 });
  const r = await handler(form);
  if (r.status !== 200) return Response.json({ error: r.error, message: r.message }, { status: r.status });
  return Response.json({ ...(await withWallet(r.reply)), transcript: r.transcript });
}
