import { randomUUID } from "node:crypto";
import { engine, rateLimited, withWallet } from "../../../server/engine";
import { cleanSessionId } from "../../../server/sandboxes";
import { createVoiceHandler } from "../../../server/voice";
export const dynamic = "force-dynamic";

let handler: ReturnType<typeof createVoiceHandler> | null = null;

/** Push-to-talk upload: a 16 kHz mono PCM16 WAV recorded in the browser. The ASR key never leaves the server. */
export async function POST(req: Request) {
  const e = engine();
  handler ??= createVoiceHandler({
    orch: { turn: (sid, input) => e.box(sid).orch.turn(cleanSessionId(sid), input) }, asr: e.asr, demo: e.demo, newId: () => randomUUID(),
    captureDir: e.voiceCaptureDir,
  });
  const form = await req.formData().catch(() => null);
  if (!form) return Response.json({ error: "bad_form", message: "" }, { status: 400 });
  form.set("session_id", cleanSessionId(form.get("session_id")));
  if (!e.allow(form.get("session_id"))) return rateLimited();
  const r = await handler(form);
  if (r.status !== 200) return Response.json({ error: r.error, message: r.message }, { status: r.status });
  return Response.json({ ...(await withWallet(r.reply)), transcript: r.transcript });
}
