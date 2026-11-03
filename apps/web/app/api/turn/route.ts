import type { TurnInput } from "@zc/orchestrator";
import { engine, rateLimited, withWallet } from "../../../server/engine";
import { clientIp, guard, readJson } from "../../../server/http";
import { cleanSessionId } from "../../../server/sandboxes";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  return guard(async () => {
    const b = await readJson<{ session_id?: string; text?: string; choice?: string; readback?: string; lang?: string }>(req); // 413 before buffering a big body
    const sid = cleanSessionId(b.session_id);
    const e = engine(), ip = clientIp(req);
    const input: TurnInput = b.readback === "accept" || b.readback === "reject" ? { readback: b.readback }
      : b.choice ? { choice: String(b.choice) }
      : { text: String(b.text ?? "").slice(0, 400) };
    // the sandbox is held for the whole turn (never evicted mid-turn); a full house answers busy instead
    return guard(() => e.use(sid, b.lang, ip, async (box) => {
      if (input.text !== undefined && !e.allow(sid, ip)) return rateLimited(b.lang); // typed text may reach the model; taps never do
      const reply = await box.orch.turn(sid, input); // the language picker travels with every request
      if (reply.trace.llm_error) console.error(`[turn] llm error: ${reply.trace.llm_error}`);
      return Response.json(await withWallet(reply, box));
    }), b.lang);
  });
}
