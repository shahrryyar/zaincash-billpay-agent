import type { TurnInput } from "@zc/orchestrator";
import { engine, rateLimited, withWallet } from "../../../server/engine";
import { cleanSessionId } from "../../../server/sandboxes";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const b = (await req.json()) as { session_id?: string; text?: string; choice?: string; readback?: string };
  const sid = cleanSessionId(b.session_id);
  const e = engine();
  const input: TurnInput = b.readback === "accept" || b.readback === "reject" ? { readback: b.readback }
    : b.choice ? { choice: String(b.choice) }
    : { text: String(b.text ?? "").slice(0, 400) };
  if (input.text !== undefined && !e.allow(sid)) return rateLimited(); // typed text may reach the model; taps never do
  const reply = await e.box(sid).orch.turn(sid, input);
  if (reply.trace.llm_error) console.error(`[turn] llm error: ${reply.trace.llm_error}`);
  return Response.json(await withWallet(reply));
}
