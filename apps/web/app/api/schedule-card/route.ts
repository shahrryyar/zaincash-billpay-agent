import { engine, withWallet } from "../../../server/engine";
import { cleanSessionId } from "../../../server/sandboxes";
export const dynamic = "force-dynamic";

// «جدولها» on a pending card: the same payment, later (asks when).
export async function POST(req: Request) {
  const b = (await req.json()) as { session_id?: string; card_id?: string; lang?: string };
  const sid = cleanSessionId(b.session_id);
  return Response.json(await withWallet(await engine().box(sid, b.lang).orch.scheduleCard(sid, String(b.card_id ?? ""))));
}
