import { engine } from "../../../server/engine";
export const dynamic = "force-dynamic";

/** For the host's health check: the app is up. Says which model and commit are running, never a key. */
export async function GET() {
  const e = engine();
  const commit = process.env.RENDER_GIT_COMMIT?.slice(0, 7) ?? null; // set by Render; null locally
  return Response.json({ ok: true, model: e.model, voice: e.voice().enabled, commit });
}
