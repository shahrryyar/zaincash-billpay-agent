import { engine, withWallet } from "../../../server/engine";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const b = (await req.json()) as { session_id?: string; card_id?: string };
  const reply = await engine().orch.confirm(String(b.session_id ?? "web"), String(b.card_id ?? ""));
  return Response.json(await withWallet(reply));
}
