import { sessionState } from "../../../server/engine";
import { cleanSessionId } from "../../../server/sandboxes";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const q = new URL(req.url).searchParams;
  return Response.json(await sessionState(cleanSessionId(q.get("session_id")), q.get("lang") ?? undefined));
}
