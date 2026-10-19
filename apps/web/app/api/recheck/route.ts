import { engine, withWallet } from "../../../server/engine";
import { cleanSessionId } from "../../../server/sandboxes";
export const dynamic = "force-dynamic";

/** Outcome of a payment still unknown: ask the wallet again by the same idempotency key. Never sends anything. */
export async function POST(req: Request) {
  const b = (await req.json()) as { session_id?: string };
  const sid = cleanSessionId(b.session_id);
  return Response.json(await withWallet(await engine().box(sid).orch.recheck(sid)));
}
