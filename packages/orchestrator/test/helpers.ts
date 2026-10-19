import { createApp, openDb, applySeed, SEED_NOW, DEMO_USER } from "@zc/wallet-api";
import { createUnderstander, type ChatClient, type Block, type CompleteRequest, type Understander, type UnderstandResult } from "@zc/llm";
import { createOrchestrator, WalletClient, appFetch, type FetchFn, type Reply } from "../src";

export { DEMO_USER, SEED_NOW };
export const ADMIN = { "content-type": "application/json", "x-admin-secret": "s3cret" };

export const transferIntent = (text: string, value: number | null, source: string | null, kind: "name" | "relation" | "phone" = "name", qualifier?: string) => ({
  actions: [{
    type: "transfer",
    recipient: { kind, text, ...(qualifier ? { qualifier } : {}) },
    amount: value === null ? null : { value, currency: "IQD", source_text: source },
  }],
  status: "ok", confidence: 0.9, language: "ar-iq",
});
export const billIntent = (biller: string, text: string, amount: { value: number; source: string } | null = null) => ({
  actions: [{ type: "bill_pay", biller, biller_text: text, amount: amount ? { value: amount.value, currency: "IQD", source_text: amount.source } : null }],
  status: "ok", confidence: 0.9, language: "ar-iq",
});
export const infoIntent = (query: string, biller?: string) => ({ actions: [{ type: "info", query, ...(biller ? { biller } : {}) }], status: "ok", confidence: 0.9, language: "ar-iq" });
export const twoActions = (a: any, b: any) => ({ actions: [...a.actions, ...b.actions], status: "ok", confidence: 0.9, language: "ar-iq" });
export const statusIntent = (status: string) => ({ actions: [], status, confidence: 0.9, language: "ar-iq" });

export function setup(o: { timeoutMs?: number; script?: Record<string, unknown>; understanderFor?: (host: any) => Understander; wrapFetch?: (f: FetchFn) => FetchFn } = {}) {
  const db = openDb();
  applySeed(db);
  let t = SEED_NOW;
  const clock = { now: () => t, advance: (ms: number) => { t += ms; } };
  const app = createApp({ db, now: clock.now, demoMode: true, adminSecret: "s3cret" });
  const wallet = new WalletClient({ baseUrl: "http://wallet.test", fetch: o.wrapFetch ? o.wrapFetch(appFetch(app)) : appFetch(app), timeoutMs: o.timeoutMs ?? 2000 });
  const script = new Map<string, unknown>(Object.entries(o.script ?? {}));
  const llm = { calls: 0, texts: [] as string[], fail: false };
  const fakeUnderstander = (): Understander => ({
    async understand({ text }): Promise<UnderstandResult> {
      llm.calls++; llm.texts.push(text);
      if (llm.fail) throw new Error("provider down");
      return { raw: script.has(text) ? script.get(text) : null, toolCalls: [], usage: { input: 1, output: 1 }, model: "fake", mode: "workflow", turns: 1 };
    },
  });
  let n = 0;
  const orch = createOrchestrator({
    wallet, understanderFor: o.understanderFor ?? (() => fakeUnderstander()), now: clock.now, newId: () => `id${++n}x${"0".repeat(6)}`,
    sleep: async () => {}, retryDelayMs: 0,
  });
  const balance = (id = DEMO_USER) => (db.prepare("SELECT balance_iqd b FROM users WHERE id=?").get(id) as { b: number }).b;
  const txCount = () => (db.prepare("SELECT COUNT(*) c FROM transactions").get() as { c: number }).c;
  const fault = (body: unknown) => app.request("/admin/faults", { method: "POST", headers: ADMIN, body: JSON.stringify(body) });
  return { db, app, wallet, clock, orch, script, llm, balance, txCount, fault };
}
export type Env = ReturnType<typeof setup>;

export const text = (r: Reply) => r.messages.map((m) => m.text).join(" | ");
export const SEED_TX = 11;

/** A model client that replays scripted responses (for the tool-loop integration test). */
export function scriptedChat(script: ((req: CompleteRequest) => Block[])[]): { chat: ChatClient; requests: CompleteRequest[] } {
  const requests: CompleteRequest[] = [];
  let i = 0;
  return {
    requests,
    chat: {
      id: "fake:scripted",
      async complete(req) {
        requests.push(JSON.parse(JSON.stringify(req)));
        const content = (script[Math.min(i++, script.length - 1)] as (r: CompleteRequest) => Block[])(req);
        return { content, stop: content.some((b) => b.type === "tool_use") ? "tool_use" : "end", usage: { input: 10, output: 5 } };
      },
    },
  };
}
export { createUnderstander };
