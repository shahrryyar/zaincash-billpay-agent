import { engine, withWallet } from "../../../server/engine";
export const dynamic = "force-dynamic";

/** Outcome of a payment still unknown: ask the wallet again by the same idempotency key. Never sends anything. */
export async function POST(req: Request) {
  const b = (await req.json()) as { session_id?: string };
  return Response.json(await withWallet(await engine().orch.recheck(String(b.session_id ?? "web"))));
}
