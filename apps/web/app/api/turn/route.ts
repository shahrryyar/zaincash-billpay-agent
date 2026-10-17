import type { TurnInput } from "@zc/orchestrator";
import { engine, withWallet } from "../../../server/engine";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const b = (await req.json()) as { session_id?: string; text?: string; choice?: string; readback?: string };
  const sid = String(b.session_id ?? "web");
  const e = engine();
  const input: TurnInput = b.readback === "accept" || b.readback === "reject" ? { readback: b.readback }
    : b.choice ? { choice: String(b.choice) }
    : { text: String(b.text ?? "").slice(0, 400) };
  const reply = await e.orch.turn(sid, input);
  if (reply.trace.llm_error) console.error(`[turn] llm error: ${reply.trace.llm_error}`);
  return Response.json(await withWallet(reply));
}
