import { randomUUID } from "node:crypto";
import { asrPolicyFrom } from "@zc/core";
import { engine, rateLimited, sessionState, withWallet } from "../../../server/engine";
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
    policy: asrPolicyFrom(process.env),
  });
  const form = await req.formData().catch(() => null);
  if (!form) return Response.json({ error: "bad_form", message: "" }, { status: 400 });
  form.set("session_id", cleanSessionId(form.get("session_id")));
  const lang = form.get("lang") ?? undefined;
  e.box(form.get("session_id"), lang); // the reply (and the read-back) follow the language picker
  if (!e.allow(form.get("session_id"))) return rateLimited(lang);
  const r = await handler(form);
  if (r.status !== 200) return Response.json({ error: r.error, message: r.message }, { status: r.status });
  if (!r.reply) return Response.json({ ...(await sessionState(form.get("session_id"), lang)), draft: r.draft, transcript: r.transcript });
  return Response.json({ ...(await withWallet(r.reply)), transcript: r.transcript });
}
