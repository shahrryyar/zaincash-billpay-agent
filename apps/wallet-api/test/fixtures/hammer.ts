// Child process for the multi-process stress test: opens its OWN SQLite connection to the shared DB file
// and fires every planned request several times, all concurrently. Prints a JSON summary on stdout.
import { readFileSync } from "node:fs";
import { createApp } from "../../src/app";
import { openDb } from "../../src/db";

type Item = { key: string; token: string; body: unknown };
const plan = JSON.parse(readFileSync(process.argv[2] as string, "utf8")) as { dbPath: string; now: number; repeats: number; items: Item[] };

const db = openDb(plan.dbPath);
const app = createApp({ db, now: () => plan.now, demoMode: false });

const statuses: Record<string, number> = {};
let replays = 0, firsts = 0;
const bodies: Record<string, string[]> = {};

const reqs: Promise<void>[] = [];
for (let r = 0; r < plan.repeats; r++) {
  for (const it of plan.items) {
    reqs.push((async () => {
      const res = await app.request("/transfers", {
        method: "POST",
        headers: { "content-type": "application/json", "idempotency-key": it.key, "x-confirmation-token": it.token },
        body: JSON.stringify(it.body),
      });
      statuses[res.status] = (statuses[res.status] ?? 0) + 1;
      if (res.status === 200) {
        if (res.headers.get("idempotent-replay") === "true") replays++; else firsts++;
        (bodies[it.key] ??= []).push(await res.text());
      }
    })());
  }
}
await Promise.all(reqs);
const distinctBodiesPerKey = Object.fromEntries(Object.entries(bodies).map(([k, v]) => [k, new Set(v).size]));
console.log(JSON.stringify({ pid: process.pid, requests: reqs.length, statuses, firsts, replays, distinctBodiesPerKey }));
