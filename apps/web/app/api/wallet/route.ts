import { engine } from "../../../server/engine";
export const dynamic = "force-dynamic";

export async function GET() {
  const e = engine();
  return Response.json({ wallet: await e.snapshot(), schedules: await e.schedules(), fault: e.fault(), model: e.model, mode: e.mode });
}
