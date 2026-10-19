import { engine } from "../../../server/engine";
export const dynamic = "force-dynamic";

/** For the host's health check: the app is up. Says which model is configured, never a key. */
export async function GET() {
  const e = engine();
  return Response.json({ ok: true, model: e.model, voice: e.voice().enabled });
}
