import { sessionState } from "../../../server/engine";
import { clientIp, guard } from "../../../server/http";
import { cleanSessionId } from "../../../server/sandboxes";
export const dynamic = "force-dynamic";

/** Reading creates the sandbox on first load but is not "activity": a never-used sandbox is the first to make room. */
export async function GET(req: Request) {
  const q = new URL(req.url).searchParams;
  const lang = q.get("lang") ?? undefined;
  return guard(async () => Response.json(await sessionState(cleanSessionId(q.get("session_id")), lang, clientIp(req))), lang);
}
