// One in-process engine for the demo: mock wallet (SQLite in memory) + orchestrator + the real model.
// Everything the model can do is inside @zc/orchestrator; the browser only ever sees Reply objects (no token, no key).
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { applySeed, createApp, openDb, DEMO_USER } from "@zc/wallet-api";
import { chatFromEnv, createUnderstander } from "@zc/llm";
import { appFetch, createOrchestrator, WalletClient, type Reply } from "@zc/orchestrator";

function loadRootEnv(): void {
  let dir = process.cwd();
  for (let i = 0; i < 4; i++) {
    const f = resolve(dir, ".env");
    if (existsSync(f)) {
      for (const l of readFileSync(f, "utf8").split("\n")) {
        const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/.exec(l);
        if (m && !l.trim().startsWith("#") && process.env[m[1] as string] === undefined) process.env[m[1] as string] = (m[2] as string).replace(/\s+#.*$/, "").replace(/^["']|["']$/g, "");
      }
      return;
    }
    dir = resolve(dir, "..");
  }
}

export type WalletSnapshot = {
  balance_iqd: number;
  transactions: { reference: string; kind: string; amount_iqd: number; counterparty: string; created_at: string | number }[];
};
export type Faults = { armed: string | null };

function build() {
  loadRootEnv();
  const adminSecret = process.env.ADMIN_SECRET || "demo";
  const db = openDb();
  applySeed(db);
  const app = createApp({ db, demoMode: true, adminSecret });
  const wallet = new WalletClient({ baseUrl: "http://wallet.local", fetch: appFetch(app), timeoutMs: 2500 });
  const mode = (process.env.LLM_MODE ?? "tools") as "tools" | "workflow";
  const { chat, description } = chatFromEnv(process.env, { cacheDir: resolve(process.cwd(), "../../.cache/llm") });
  const orch = createOrchestrator({
    wallet,
    userId: DEMO_USER,
    understanderFor: ((host: never) => createUnderstander({ chat, mode, host })) as never,
    retryDelayMs: 300,
  });
  const state: { fault: string | null } = { fault: null };
  const admin = (path: string, body?: unknown) =>
    app.request(path, { method: "POST", headers: { "x-admin-secret": adminSecret, "content-type": "application/json" }, ...(body ? { body: JSON.stringify(body) } : {}) });

  async function snapshot(): Promise<WalletSnapshot> {
    const u = (await wallet.user(DEMO_USER)).json;
    const t = (await wallet.transactions(DEMO_USER, { limit: 8 })).json.transactions ?? [];
    return {
      balance_iqd: u.balance_iqd as number,
      transactions: t.map((x: any) => ({ reference: x.reference, kind: x.kind, amount_iqd: x.amount_iqd, counterparty: x.counterparty?.name ?? "", created_at: x.created_at })),
    };
  }

  return {
    orch, snapshot, model: chat.id, mode, description,
    fault: () => state.fault,
    async arm(kind: "timeout" | "5xx" | "biller_down" | "none") {
      if (kind === "none") { state.fault = null; return; } // faults are one-shot or until reset; "none" just clears the label
      const body = kind === "timeout" ? { mode: "timeout_after_commit", count: 1, sleep_ms: 4000 } : kind === "5xx" ? { mode: "error_5xx_before_commit", count: 1 } : { mode: "biller_down", biller: "b_generator" };
      await admin("/admin/faults", body);
      state.fault = kind;
    },
    async reset(sessionId: string) { await admin("/admin/reset"); orch.reset(sessionId); state.fault = null; },
  };
}

type Engine = ReturnType<typeof build>;
const g = globalThis as unknown as { __zcEngine?: Engine };
export const engine = (): Engine => (g.__zcEngine ??= build());

/** Replies go to the browser together with the fresh wallet snapshot, so the balance on screen is always read from the wallet. */
export async function withWallet(reply: Reply) {
  const e = engine();
  return { reply, wallet: await e.snapshot(), fault: e.fault(), model: e.model, mode: e.mode };
}
