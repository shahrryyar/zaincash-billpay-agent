import { engine } from "../../../server/engine";
export const dynamic = "force-dynamic";

// Demo-only controls (docs/18 "break it on purpose"). Disabled unless DEMO_MODE=1 (the default for this demo build).
export async function POST(req: Request) {
  if ((process.env.DEMO_MODE ?? "1") !== "1") return Response.json({ error: "disabled" }, { status: 403 });
  const b = (await req.json()) as { action?: string; kind?: string; session_id?: string; ms?: number };
  const e = engine();
  if (b.action === "reset") await e.reset(String(b.session_id ?? "web"));
  else if (b.action === "fault") await e.arm((b.kind as "timeout" | "5xx" | "biller_down" | "none") ?? "none");
  else if (b.action === "advance") await e.advance(Math.min(Number(b.ms) || 0, 40 * 86_400_000)); // demo: move the clock forward so a schedule runs now
  else return Response.json({ error: "unknown action" }, { status: 400 });
  return Response.json({ ok: true, wallet: await e.snapshot(), schedules: await e.schedules(), fault: e.fault() });
}
