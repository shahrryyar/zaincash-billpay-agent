import { engine, withWallet } from "../../../server/engine";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const b = (await req.json()) as { session_id?: string };
  return Response.json(await withWallet(await engine().orch.tick(String(b.session_id ?? "web"))));
}
