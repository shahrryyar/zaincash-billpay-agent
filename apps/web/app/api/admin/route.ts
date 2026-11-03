import { engine, stateOf } from "../../../server/engine";
import { clientIp, guard, readJson } from "../../../server/http";
import { cleanSessionId } from "../../../server/sandboxes";
export const dynamic = "force-dynamic";

// Demo-only controls (docs/18 "break it on purpose"). Each acts on the caller's OWN sandbox only, so one judge cannot
// reset or break another's demo. Disabled unless DEMO_MODE=1 (the default for this demo build).
export async function POST(req: Request) {
  if ((process.env.DEMO_MODE ?? "1") !== "1") return Response.json({ error: "disabled" }, { status: 403 });
  return guard(async () => {
    const b = await readJson<{ action?: string; kind?: string; session_id?: string; ms?: number; lang?: string }>(req);
    const sid = cleanSessionId(b.session_id);
    return guard(() => engine().use(sid, b.lang, clientIp(req), async (box) => {
      if (b.action === "reset") await box.reset();
      else if (b.action === "fault") await box.arm((b.kind as "timeout" | "5xx" | "biller_down" | "none") ?? "none");
      else if (b.action === "advance") box.advance(Math.min(Number(b.ms) || 0, 40 * 86_400_000)); // demo: move this sandbox's clock forward so a schedule runs now
      else return Response.json({ error: "unknown action" }, { status: 400 });
      return Response.json({ ok: true, ...(await stateOf(box)) });
    }), b.lang);
  });
}
