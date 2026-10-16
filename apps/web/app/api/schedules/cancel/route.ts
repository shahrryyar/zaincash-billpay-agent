import { engine } from "../../../../server/engine";
export const dynamic = "force-dynamic";

// The Cancel button next to a schedule. The model has no way to call this.
export async function POST(req: Request) {
  const b = (await req.json()) as { id?: string };
  const e = engine();
  const r = await e.orch.cancelSchedule(String(b.id ?? ""));
  return Response.json({ ...r, wallet: await e.snapshot(), schedules: await e.schedules() });
}
