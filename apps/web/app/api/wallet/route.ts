import { sessionState } from "../../../server/engine";
import { cleanSessionId } from "../../../server/sandboxes";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  return Response.json(await sessionState(cleanSessionId(new URL(req.url).searchParams.get("session_id"))));
}
