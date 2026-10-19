// One sandbox per browser session for the hosted demo: its own seeded in-memory wallet, clock, faults and orchestrator.
// Judges trying the URL at the same time never see each other's balance, and «إعادة ضبط», fault switches and the
// demo clock only touch the caller's own sandbox. Idle sandboxes are dropped; the oldest goes first when full.
import { applySeed, createApp, openDb, DEMO_USER } from "@zc/wallet-api";
import { asrPolicyFrom } from "@zc/core";
import { appFetch, createOrchestrator, WalletClient, type Orchestrator } from "@zc/orchestrator";

export type Understanders = (host: never) => { understand: (...a: never[]) => Promise<unknown> };

export type Sandbox = {
  id: string;
  orch: Orchestrator;
  wallet: WalletClient;
  /** Runs this sandbox's due schedules (the demo scheduler calls it every few seconds). */
  runDue: () => void;
  now: () => number;
  advance: (ms: number) => void;
  arm: (kind: "timeout" | "5xx" | "biller_down" | "none") => Promise<void>;
  fault: () => string | null;
  reset: () => Promise<void>;
  lastUsed: number;
  /** Request times inside the rate-limit window. */
  hits: number[];
};

export type SandboxOptions = {
  understanderFor: Understanders;
  env?: Record<string, string | undefined>;
  /** Wall clock (tests move it). */
  clock?: () => number;
  idleMs?: number;
  maxSandboxes?: number;
  /** At most `limit` turns per `windowMs` per session (the model costs money; the cap is per process on top). */
  rate?: { limit: number; windowMs: number };
};

const ADMIN_SECRET = "sandbox"; // the wallet's admin routes are only reachable in-process, per sandbox

/** Session ids come from the browser: keep them short and plain. */
export const cleanSessionId = (raw: unknown): string => String(raw ?? "web").replace(/[^A-Za-z0-9_-]/g, "").slice(0, 80) || "web";

export function createSandboxes(o: SandboxOptions) {
  const wall = o.clock ?? Date.now;
  const idleMs = o.idleMs ?? 30 * 60_000;
  const max = o.maxSandboxes ?? 200;
  const rate = o.rate ?? { limit: 60, windowMs: 10 * 60_000 };
  const boxes = new Map<string, Sandbox>();

  function build(id: string): Sandbox {
    const db = openDb();
    applySeed(db);
    // The demo clock: real time plus whatever this sandbox moved forward («قدّم الوقت»); only ever forward, reset puts it back.
    let skewMs = 0;
    const now = () => wall() + skewMs;
    const app = createApp({ db, demoMode: true, adminSecret: ADMIN_SECRET, now });
    const wallet = new WalletClient({ baseUrl: "http://wallet.local", fetch: appFetch(app), timeoutMs: 2500 });
    const orch = createOrchestrator({ wallet, userId: DEMO_USER, asrPolicy: asrPolicyFrom(o.env ?? {}), understanderFor: o.understanderFor as never, retryDelayMs: 300, now });
    let armed: string | null = null;
    const admin = (path: string, body?: unknown) =>
      app.request(path, { method: "POST", headers: { "x-admin-secret": ADMIN_SECRET, "content-type": "application/json" }, ...(body ? { body: JSON.stringify(body) } : {}) });
    const runDue = () => { (app as unknown as { runDueSchedules: () => unknown }).runDueSchedules(); };
    return {
      id, orch, wallet, runDue, now, lastUsed: wall(), hits: [],
      advance(ms) { skewMs += Math.max(0, ms); runDue(); },
      async arm(kind) {
        if (kind === "none") { armed = null; return; } // faults are one-shot or until reset; "none" just clears the label
        const body = kind === "timeout" ? { mode: "timeout_after_commit", count: 1, sleep_ms: 4000 } : kind === "5xx" ? { mode: "error_5xx_before_commit", count: 1 } : { mode: "biller_down", biller: "b_generator" };
        await admin("/admin/faults", body);
        armed = kind;
      },
      fault: () => armed,
      async reset() { await admin("/admin/reset"); orch.reset(id); armed = null; skewMs = 0; },
    };
  }

  function sweep(): void {
    const cutoff = wall() - idleMs;
    for (const [id, b] of boxes) if (b.lastUsed < cutoff) boxes.delete(id);
    while (boxes.size >= max) {
      let oldest: Sandbox | null = null;
      for (const b of boxes.values()) if (!oldest || b.lastUsed < oldest.lastUsed) oldest = b;
      if (!oldest) break;
      boxes.delete(oldest.id);
    }
  }

  return {
    /** The caller's sandbox, created on first use. */
    get(rawId: unknown): Sandbox {
      const id = cleanSessionId(rawId);
      let b = boxes.get(id);
      if (!b) { sweep(); b = build(id); boxes.set(id, b); }
      b.lastUsed = wall();
      return b;
    },
    /** Counts one model-backed request; false when this session has used its budget for the window. */
    allow(rawId: unknown): boolean {
      const b = this.get(rawId);
      const t = wall();
      b.hits = b.hits.filter((x) => x > t - rate.windowMs);
      if (b.hits.length >= rate.limit) return false;
      b.hits.push(t);
      return true;
    },
    /** Every live sandbox's due schedules run here, deterministically, no model involved. */
    runAllDue(): void {
      for (const b of boxes.values()) { try { b.runDue(); } catch (e) { console.error("[scheduler]", (e as Error).message); } }
    },
    size: () => boxes.size,
    has: (rawId: unknown) => boxes.has(cleanSessionId(rawId)),
  };
}

export type Sandboxes = ReturnType<typeof createSandboxes>;
