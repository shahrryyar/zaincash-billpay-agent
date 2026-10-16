// One in-process engine for the demo: mock wallet (SQLite in memory) + orchestrator + the real model.
// Everything the model can do is inside @zc/orchestrator; the browser only ever sees Reply objects (no token, no key).
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { applySeed, createApp, openDb, DEMO_USER } from "@zc/wallet-api";
import { chatFromEnv, createUnderstander } from "@zc/llm";
import { formatWhenAr, relativeAr, t } from "@zc/core";
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

export type ScheduleView = {
  id: string; reference: string; kind: "transfer" | "bill_pay"; status: "scheduled" | "executed" | "failed" | "cancelled"; run_at: number;
  amount_iqd: number; fee_iqd: number; counterparty: string; when_text: string; relative: string | null; notice: string | null; failure_code: string | null;
};

const FAIL_REASON: Record<string, string> = {
  INSUFFICIENT_BALANCE: "الرصيد ما يكفي", LIMIT_EXCEEDED: "تجاوز الحد الشهري", BILLER_UNAVAILABLE: "الخدمة واگفة", BILL_ALREADY_PAID: "الفاتورة مدفوعة من قبل",
  AMOUNT_CHANGED: "مبلغ الفاتورة تغيّر", SCHEDULE_MISSED: "فات الموعد بأكثر من يوم", AUTHORIZATION_MISMATCH: "التفاصيل ما تطابق اللي أكّدته", CONTACT_NOT_WALLET_USER: "المستلم ما عنده محفظة",
};

function build() {
  loadRootEnv();
  const adminSecret = process.env.ADMIN_SECRET || "demo";
  const db = openDb();
  applySeed(db);
  // One clock for the wallet, the orchestrator and the scheduler. The demo panel can move it forward ("+1 hour") to show a
  // scheduled payment running without waiting; it only ever moves forward and «reset» puts it back.
  const clock = { skewMs: 0, now: () => Date.now() + clock.skewMs };
  const app = createApp({ db, demoMode: true, adminSecret, now: clock.now });
  const wallet = new WalletClient({ baseUrl: "http://wallet.local", fetch: appFetch(app), timeoutMs: 2500 });
  const mode = (process.env.LLM_MODE ?? "tools") as "tools" | "workflow";
  const { chat, description } = chatFromEnv(process.env, { cacheDir: resolve(process.cwd(), "../../.cache/llm") });
  const orch = createOrchestrator({
    wallet,
    userId: DEMO_USER,
    understanderFor: ((host: never) => createUnderstander({ chat, mode, host })) as never,
    retryDelayMs: 300,
    now: clock.now,
  });
  const state: { fault: string | null } = { fault: null };
  const admin = (path: string, body?: unknown) =>
    app.request(path, { method: "POST", headers: { "x-admin-secret": adminSecret, "content-type": "application/json" }, ...(body ? { body: JSON.stringify(body) } : {}) });

  /** The user's schedules from the wallet, with the Arabic notice for finished ones. */
  async function schedules(): Promise<ScheduleView[]> {
    const list = await orch.listSchedules();
    return list.map((x: any): ScheduleView => {
      const isTransfer = x.kind === "transfer";
      const what = isTransfer ? `${x.amount_iqd.toLocaleString("en-US")} د.ع لـ${x.counterparty}` : `${x.counterparty} ${x.amount_iqd.toLocaleString("en-US")} د.ع`;
      const notice = x.status === "executed"
        ? (isTransfer ? t("schedule_ran_transfer", { amount: x.amount_iqd.toLocaleString("en-US"), name: x.counterparty, ref: x.reference }) : t("schedule_ran_bill", { biller: x.counterparty, amount: x.amount_iqd.toLocaleString("en-US"), ref: x.reference }))
        : x.status === "failed" ? t("schedule_failed", { what, reason: FAIL_REASON[x.failure_code ?? ""] ?? "سبب غير متوقع" })
        : null;
      return {
        id: x.id, reference: x.reference, kind: x.kind, status: x.status, run_at: x.run_at, amount_iqd: x.amount_iqd, fee_iqd: x.fee_iqd, counterparty: x.counterparty,
        when_text: formatWhenAr(x.run_at), relative: x.status === "scheduled" ? relativeAr(x.run_at, clock.now()) : null, notice, failure_code: x.failure_code ?? null,
      };
    });
  }

  async function snapshot(): Promise<WalletSnapshot> {
    const u = (await wallet.user(DEMO_USER)).json;
    const t = (await wallet.transactions(DEMO_USER, { limit: 8 })).json.transactions ?? [];
    return {
      balance_iqd: u.balance_iqd as number,
      transactions: t.map((x: any) => ({ reference: x.reference, kind: x.kind, amount_iqd: x.amount_iqd, counterparty: x.counterparty?.name ?? "", created_at: x.created_at })),
    };
  }

  // the scheduler: due schedules run here, deterministically, no model involved
  const timer = setInterval(() => { try { (app as unknown as { runDueSchedules: () => unknown }).runDueSchedules(); } catch (e) { console.error("[scheduler]", (e as Error).message); } }, 3000);
  timer.unref?.();

  return {
    orch, snapshot, schedules, model: chat.id, mode, description, now: clock.now,
    async advance(ms: number) { clock.skewMs += Math.max(0, ms); (app as unknown as { runDueSchedules: () => unknown }).runDueSchedules(); },
    fault: () => state.fault,
    async arm(kind: "timeout" | "5xx" | "biller_down" | "none") {
      if (kind === "none") { state.fault = null; return; } // faults are one-shot or until reset; "none" just clears the label
      const body = kind === "timeout" ? { mode: "timeout_after_commit", count: 1, sleep_ms: 4000 } : kind === "5xx" ? { mode: "error_5xx_before_commit", count: 1 } : { mode: "biller_down", biller: "b_generator" };
      await admin("/admin/faults", body);
      state.fault = kind;
    },
    async reset(sessionId: string) { await admin("/admin/reset"); orch.reset(sessionId); state.fault = null; clock.skewMs = 0; },
  };
}

type Engine = ReturnType<typeof build>;
const g = globalThis as unknown as { __zcEngine?: Engine };
export const engine = (): Engine => (g.__zcEngine ??= build());

/** Replies go to the browser together with the fresh wallet snapshot, so the balance on screen is always read from the wallet. */
export async function withWallet(reply: Reply) {
  const e = engine();
  return { reply, wallet: await e.snapshot(), schedules: await e.schedules(), fault: e.fault(), model: e.model, mode: e.mode };
}
