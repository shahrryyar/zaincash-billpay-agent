import { engine, sessionState } from "../../../../server/engine";
import { cleanSessionId } from "../../../../server/sandboxes";
export const dynamic = "force-dynamic";

// The Cancel button next to a schedule. The model has no way to call this.
export async function POST(req: Request) {
  const b = (await req.json()) as { session_id?: string; id?: string };
  const sid = cleanSessionId(b.session_id);
  const r = await engine().box(sid).orch.cancelSchedule(String(b.id ?? ""));
  return Response.json({ ...r, ...(await sessionState(sid)) });
}
