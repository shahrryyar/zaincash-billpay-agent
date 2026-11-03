import { engine, withWallet } from "../../../server/engine";
import { clientIp, guard, readJson } from "../../../server/http";
import { cleanSessionId } from "../../../server/sandboxes";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  return guard(async () => {
    const b = await readJson<{ session_id?: string; card_id?: string; lang?: string }>(req);
    const sid = cleanSessionId(b.session_id);
    return guard(() => engine().use(sid, b.lang, clientIp(req), async (box) => Response.json(await withWallet(await box.orch.confirm(sid, String(b.card_id ?? "")), box))), b.lang);
  });
}
