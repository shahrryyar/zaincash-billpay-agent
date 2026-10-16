import { engine, withWallet } from "../../../server/engine";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const b = (await req.json()) as { session_id?: string; text?: string; choice?: string };
  const sid = String(b.session_id ?? "web");
  const e = engine();
  const reply = await e.orch.turn(sid, b.choice ? { choice: String(b.choice) } : { text: String(b.text ?? "").slice(0, 400) });
  return Response.json(await withWallet(reply));
}
