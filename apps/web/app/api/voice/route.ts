import { randomUUID } from "node:crypto";
import { asrPolicyFrom } from "@zc/core";
import { engine, rateLimited, stateOf, withWallet } from "../../../server/engine";
import { clientIp, guard, readForm } from "../../../server/http";
import { cleanSessionId } from "../../../server/sandboxes";
import { createVoiceHandler, voiceBodyLimit } from "../../../server/voice";
export const dynamic = "force-dynamic";

let handler: ReturnType<typeof createVoiceHandler> | null = null;

/** Push-to-talk upload: a 16 kHz mono PCM16 WAV recorded in the browser. The ASR key never leaves the server. */
export async function POST(req: Request) {
  return guard(async () => {
    const e = engine();
    handler ??= createVoiceHandler({
      orch: { turn: (sid, input) => e.box(sid).orch.turn(cleanSessionId(sid), input) }, asr: e.asr, demo: e.demo, newId: () => randomUUID(),
      captureDir: e.voiceCaptureDir,
      policy: asrPolicyFrom(process.env),
    });
    const form = await readForm(req, voiceBodyLimit(e.asr)); // 413 before buffering an oversize upload
    const sid = cleanSessionId(form.get("session_id"));
    form.set("session_id", sid);
    const lang = form.get("lang") ?? undefined, ip = clientIp(req);
    // the reply (and the read-back) follow the language picker; the sandbox is held until the reply is built
    return guard(() => e.use(sid, lang, ip, async (box) => {
      if (!e.allow(sid, ip)) return rateLimited(lang);
      const r = await handler!(form, req.signal);
      if (r.status !== 200) return Response.json({ error: r.error, message: r.message }, { status: r.status });
      if (!r.reply) return Response.json({ ...(await stateOf(box)), draft: r.draft, transcript: r.transcript });
      return Response.json({ ...(await withWallet(r.reply, box)), transcript: r.transcript });
    }), lang);
  });
}
