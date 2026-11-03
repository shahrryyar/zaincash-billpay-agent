// One sandbox per browser session for the hosted demo: its own seeded in-memory wallet, clock, faults and orchestrator.
// Judges trying the URL at the same time never see each other's balance, and «إعادة ضبط», fault switches and the
// demo clock only touch the caller's own sandbox. Idle sandboxes are dropped. When full, only a sandbox that is not
// protected (no turn in flight, no pending card/read-back, no action within `protectMs`) is evicted, least recently used
// first; if none can go, a new session is refused with an honest "busy" rather than evicting someone's demo.
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
  /** Last real action (a turn, a tap, a demo control); 0 = only ever read. Recent action protects from eviction. */
  lastActive: number;
  /** Requests running on this sandbox right now; never evicted while > 0. */
  inflight: number;
};

/** No sandbox can be created now: the house is full of active demos, or this client made too many. Nothing was evicted. */
export class SandboxBusyError extends Error { override readonly name = "SandboxBusyError"; }
/** The sandbox a request ran on is no longer the live one: never pair a reply with a freshly seeded wallet. */
export class SandboxGoneError extends Error { override readonly name = "SandboxGoneError"; }

type Rate = { limit: number; windowMs: number };

export type SandboxOptions = {
  understanderFor: Understanders;
  env?: Record<string, string | undefined>;
  /** Wall clock (tests move it). */
  clock?: () => number;
  idleMs?: number;
  maxSandboxes?: number;
  /** A sandbox acted on within this window is never evicted to make room. */
  protectMs?: number;
  /** At most `limit` turns per `windowMs` per session (the model costs money; the cap is per process on top). */
  rate?: Rate;
  /** Turns per client IP (rotating session ids does not reset it) and per process. */
  ipRate?: Rate;
  globalRate?: Rate;
  /** New sandboxes per client IP. */
  newPerIp?: Rate;
};

/** Sliding-window counters per key, bounded in memory. */
function windows(maxKeys = 5000) {
  const m = new Map<string, number[]>();
  const live = (k: string, t: number, w: number) => { const h = (m.get(k) ?? []).filter((x) => x > t - w); if (h.length) m.set(k, h); else m.delete(k); return h; };
  return {
    room: (k: string, r: Rate, t: number) => live(k, t, r.windowMs).length < r.limit,
    hit(k: string, r: Rate, t: number) {
      if (m.size >= maxKeys) { for (const key of [...m.keys()]) live(key, t, r.windowMs); if (m.size >= maxKeys) m.clear(); }
      m.set(k, [...live(k, t, r.windowMs), t]);
    },
  };
}
const PENDING = new Set(["AWAITING_CONFIRM", "EXECUTING", "UNKNOWN_OUTCOME"]);

const ADMIN_SECRET = "sandbox"; // the wallet's admin routes are only reachable in-process, per sandbox

/** Session ids come from the browser: keep them short and plain. */
export const cleanSessionId = (raw: unknown): string => String(raw ?? "web").replace(/[^A-Za-z0-9_-]/g, "").slice(0, 80) || "web";

export function createSandboxes(o: SandboxOptions) {
  const wall = o.clock ?? Date.now;
  const idleMs = o.idleMs ?? 30 * 60_000;
  const max = o.maxSandboxes ?? 200;
  const protectMs = o.protectMs ?? 10 * 60_000;
  const rate = o.rate ?? { limit: 60, windowMs: 10 * 60_000 };
  const ipRate = o.ipRate ?? { limit: 100, windowMs: 10 * 60_000 };
  const globalRate = o.globalRate ?? { limit: 150, windowMs: 10 * 60_000 };
  const newPerIp = o.newPerIp ?? { limit: 20, windowMs: 10 * 60_000 };
  const boxes = new Map<string, Sandbox>();
  const turnsBySession = windows(), turnsByIp = windows(), turnsAll = windows(), newByIp = windows();

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
      id, orch, wallet, runDue, now, lastUsed: wall(), lastActive: 0, inflight: 0,
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

  /** A card waiting for Confirm, a payment in flight or unknown, or an unanswered voice read-back. */
  function pending(b: Sandbox): boolean {
    try { const s = b.orch.inspect(b.id) as { machine?: { phase?: string }; pendingVoice?: unknown }; return PENDING.has(s.machine?.phase ?? "") || !!s.pendingVoice; }
    catch { return true; } // unknown: keep it
  }
  const protectedBox = (b: Sandbox, t: number) => b.inflight > 0 || pending(b) || (b.lastActive > 0 && b.lastActive > t - protectMs);

  /** Make room for one more; false when every sandbox is protected (nothing is evicted then). */
  function sweep(): boolean {
    const t = wall(), cutoff = t - idleMs;
    for (const [id, b] of boxes) if (b.lastUsed < cutoff && b.inflight === 0) boxes.delete(id);
    while (boxes.size >= max) {
      let oldest: Sandbox | null = null;
      for (const b of boxes.values()) if (!protectedBox(b, t) && (!oldest || b.lastUsed < oldest.lastUsed)) oldest = b;
      if (!oldest) return false;
      boxes.delete(oldest.id);
    }
    return true;
  }

  function get(rawId: unknown, ip = "unknown"): Sandbox {
    const id = cleanSessionId(rawId);
    let b = boxes.get(id);
    if (!b) {
      const t = wall();
      if (!newByIp.room(ip, newPerIp, t)) throw new SandboxBusyError("too many new sessions from this client");
      if (!sweep()) throw new SandboxBusyError("every sandbox is in use");
      newByIp.hit(ip, newPerIp, t);
      b = build(id); boxes.set(id, b);
    }
    b.lastUsed = wall();
    return b;
  }

  return {
    /** The caller's sandbox, created on first use. Throws SandboxBusyError rather than evicting an active one. */
    get,
    /** The live sandbox for this id, never created. */
    peek: (rawId: unknown): Sandbox | undefined => boxes.get(cleanSessionId(rawId)),
    /** True while `b` is still the sandbox for its id (not evicted and recreated). */
    live: (b: Sandbox) => boxes.get(b.id) === b,
    /** Runs one real action on the caller's sandbox; it cannot be evicted while `fn` runs, and counts as activity. */
    async use<T>(rawId: unknown, ip: string | undefined, fn: (b: Sandbox) => Promise<T>): Promise<T> {
      const b = get(rawId, ip);
      b.inflight++; b.lastActive = wall();
      try { return await fn(b); } finally { b.inflight--; b.lastUsed = b.lastActive = wall(); }
    },
    /** Counts one model-backed request; false when the session, the client IP or the whole process used its budget. */
    allow(rawId: unknown, ip = "unknown"): boolean {
      const t = wall(), id = cleanSessionId(rawId);
      if (!turnsBySession.room(id, rate, t) || !turnsByIp.room(ip, ipRate, t) || !turnsAll.room("*", globalRate, t)) return false;
      turnsBySession.hit(id, rate, t); turnsByIp.hit(ip, ipRate, t); turnsAll.hit("*", globalRate, t);
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
