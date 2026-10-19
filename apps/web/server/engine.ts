// The in-process engine for the demo: the model (shared) + one sandbox per browser session (own in-memory mock wallet,
// clock and orchestrator; server/sandboxes.ts). Everything the model can do is inside @zc/orchestrator; the browser only
// ever sees Reply objects (no token, no key).
import { existsSync, readFileSync } from "node:fs";
import { isAbsolute, join, resolve } from "node:path";
import { DEMO_USER } from "@zc/wallet-api";
import { chatFromEnv, createUnderstander } from "@zc/llm";
import { formatWhenAr, relativeAr, t } from "@zc/core";
import { asrFromEnv } from "@zc/asr";
import { createScriptedUnderstander, type Reply } from "@zc/orchestrator";
import { createSandboxes, type Sandbox } from "./sandboxes";

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
  AMOUNT_CHANGED: "مبلغ الفاتورة تغيّر", SCHEDULE_MISSED: "فات الموعد بأكثر من يوم", AUTHORIZATION_MISMATCH: "التفاصيل ما تطابق اللي أكّدته", CONTACT_NOT_WALLET_USER: "المستلم ما عنده محفظة", RECIPIENT_WALLET_FULL: "محفظة المستلم وصلت حدها",
};

function build() {
  loadRootEnv();
  const mode = (process.env.LLM_MODE ?? "tools") as "tools" | "workflow";
  // LLM_PROVIDER=fake: scripted demo sentences, no key, no network. No provider configured: the app still loads and every
  // turn answers an honest «النظام مشغول» (the understander throws, the orchestrator fails closed); nothing is ever sent.
  const llm = ((): { understanderFor: (host: never) => ReturnType<typeof createUnderstander>; id: string; description: string[] } => {
    if ((process.env.LLM_PROVIDER ?? "").trim() === "fake")
      return { understanderFor: () => createScriptedUnderstander(), id: "fake (scripted demo sentences)", description: ["fake: scripted demo sentences only (LLM_PROVIDER=fake)"] };
    try {
      const { chat, description } = chatFromEnv(process.env, { cacheDir: resolve(process.cwd(), "../../.cache/llm") });
      return { understanderFor: (host: never) => createUnderstander({ chat, mode, host }), id: chat.id, description };
    } catch (e) {
      const why = (e as Error).message;
      console.error(`[llm] ${why}`);
      return { understanderFor: () => ({ understand: async () => { throw new Error(why); } }), id: "none (no LLM configured)", description: [why] };
    }
  })();
  // Voice (docs/09): off unless an ASR provider is configured; the text path never depends on it.
  const asr = asrFromEnv(process.env);
  const demo = (process.env.DEMO_MODE ?? "1") === "1";
  const repoRoot = resolve(process.cwd(), "../..");
  const cap = process.env.VOICE_CAPTURE_DIR?.trim();
  const voiceCaptureDir = cap ? (isAbsolute(cap) ? cap : join(/* turbopackIgnore: true */ repoRoot, cap)) : undefined;
  console.log(`[voice] ${asr.description}`);
  const num = (v: string | undefined, d: number) => (v && Number.isFinite(Number(v)) && Number(v) > 0 ? Number(v) : d);
  const boxes = createSandboxes({
    understanderFor: llm.understanderFor as never,
    env: process.env,
    idleMs: num(process.env.SANDBOX_IDLE_MIN, 30) * 60_000,
    maxSandboxes: num(process.env.SANDBOX_MAX, 200),
    rate: { limit: num(process.env.TURNS_PER_10_MIN, 60), windowMs: 10 * 60_000 },
  });

  /** A sandbox's schedules from its wallet, with the Arabic notice for finished ones. */
  async function schedules(b: Sandbox): Promise<ScheduleView[]> {
    const list = await b.orch.listSchedules();
    return list.map((x: any): ScheduleView => {
      const isTransfer = x.kind === "transfer";
      const what = isTransfer ? `${x.amount_iqd.toLocaleString("en-US")} د.ع لـ${x.counterparty}` : `${x.counterparty} ${x.amount_iqd.toLocaleString("en-US")} د.ع`;
      const notice = x.status === "executed"
        ? (isTransfer ? t("schedule_ran_transfer", { amount: x.amount_iqd.toLocaleString("en-US"), name: x.counterparty, ref: x.transaction_reference ?? x.reference }) : t("schedule_ran_bill", { biller: x.counterparty, amount: x.amount_iqd.toLocaleString("en-US"), ref: x.transaction_reference ?? x.reference }))
        : x.status === "failed" ? t("schedule_failed", { what, reason: FAIL_REASON[x.failure_code ?? ""] ?? "سبب غير متوقع" })
        : null;
      return {
        id: x.id, reference: x.reference, kind: x.kind, status: x.status, run_at: x.run_at, amount_iqd: x.amount_iqd, fee_iqd: x.fee_iqd, counterparty: x.counterparty,
        when_text: formatWhenAr(x.run_at), relative: x.status === "scheduled" ? relativeAr(x.run_at, b.now()) : null, notice, failure_code: x.failure_code ?? null,
      };
    });
  }

  async function snapshot(b: Sandbox): Promise<WalletSnapshot> {
    const u = (await b.wallet.user(DEMO_USER)).json;
    const tx = (await b.wallet.transactions(DEMO_USER, { limit: 8 })).json.transactions ?? [];
    return {
      balance_iqd: u.balance_iqd as number,
      transactions: tx.map((x: any) => ({ reference: x.reference, kind: x.kind, amount_iqd: x.amount_iqd, counterparty: x.counterparty?.name ?? "", created_at: x.created_at })),
    };
  }

  // the scheduler: due schedules in every live sandbox run here, deterministically, no model involved
  const timer = setInterval(() => boxes.runAllDue(), 3000);
  timer.unref?.();

  return {
    /** The caller's own sandbox (created on first use). */
    box: (sessionId: unknown) => boxes.get(sessionId),
    /** One model-backed request for this session; false when it hit its per-session limit. */
    allow: (sessionId: unknown) => boxes.allow(sessionId),
    snapshot, schedules, model: llm.id, mode, description: llm.description, asr, demo, voiceCaptureDir,
    /** What the browser may know about voice: never the key or the base URL. */
    voice: () => ({ enabled: asr.transcriber !== null, provider: asr.provider, max_seconds: asr.maxSeconds, simulator: asr.provider === "fake" && demo }),
  };
}

type Engine = ReturnType<typeof build>;
const g = globalThis as unknown as { __zcEngine?: Engine };
export const engine = (): Engine => (g.__zcEngine ??= build());

/** Everything the browser needs about its sandbox; the balance on screen is always read from the wallet. */
export async function sessionState(sessionId: unknown) {
  const e = engine();
  const b = e.box(sessionId);
  return { wallet: await e.snapshot(b), schedules: await e.schedules(b), fault: b.fault(), model: e.model, mode: e.mode, voice: e.voice(), server_now: b.now() };
}

/** A reply goes to the browser together with its sandbox's fresh wallet snapshot. */
export async function withWallet(reply: Reply) {
  return { reply, ...(await sessionState(reply.session_id)) };
}

/** The honest answer when a session has used its turn budget: nothing was sent. */
export const rateLimited = () => Response.json({ error: "rate_limited", message: t("busy") }, { status: 429 });
