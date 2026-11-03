import { engine, stateOf } from "../../../../server/engine";
import { clientIp, guard, readJson } from "../../../../server/http";
import { cleanSessionId } from "../../../../server/sandboxes";
export const dynamic = "force-dynamic";

// The Cancel button next to a schedule. The model has no way to call this.
export async function POST(req: Request) {
  return guard(async () => {
    const b = await readJson<{ session_id?: string; id?: string; lang?: string }>(req);
    const sid = cleanSessionId(b.session_id);
    return guard(() => engine().use(sid, b.lang, clientIp(req), async (box) => {
      const r = await box.orch.cancelSchedule(String(b.id ?? ""));
      return Response.json({ ...r, ...(await stateOf(box)) });
    }), b.lang);
  });
}
