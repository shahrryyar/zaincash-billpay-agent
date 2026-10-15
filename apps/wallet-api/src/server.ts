// Dev/demo server. Env: PORT (8787), DB_PATH (default in-memory), DEMO_MODE=1 + ADMIN_SECRET (enables /admin/*).
import { serve } from "@hono/node-server";
import { createApp } from "./app";
import { openDb } from "./db";
import { applySeed } from "./seed";

const demoMode = process.env.DEMO_MODE === "1";
const adminSecret = process.env.ADMIN_SECRET ?? "";
if (demoMode && !adminSecret) {
  console.error("DEMO_MODE=1 requires ADMIN_SECRET. Refusing to start with open admin endpoints.");
  process.exit(1);
}

const db = openDb(process.env.DB_PATH ?? ":memory:");
const empty = (db.prepare("SELECT COUNT(*) c FROM users").get() as { c: number }).c === 0;
if (empty) applySeed(db);

const app = createApp({ db, demoMode, adminSecret });
const port = Number(process.env.PORT ?? 8787);
serve({ fetch: app.fetch, port }, () => console.log(`mock wallet (synthetic data) on http://localhost:${port}  demo=${demoMode}`));
