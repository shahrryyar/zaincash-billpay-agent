import { engine, withWallet } from "../../../server/engine";
import { cleanSessionId } from "../../../server/sandboxes";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const b = (await req.json()) as { session_id?: string };
  const sid = cleanSessionId(b.session_id);
  return Response.json(await withWallet(await engine().box(sid).orch.tick(sid)));
}
