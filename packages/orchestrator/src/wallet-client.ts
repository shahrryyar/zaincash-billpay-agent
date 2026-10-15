// HTTP client for the (mock) wallet. Timeouts and network failures surface as WalletUnreachable:
// the caller must treat that as an UNKNOWN outcome for writes, never as "nothing happened".
import type { Payload } from "@zc/core";

export class WalletUnreachable extends Error {}

export type FetchResponse = { status: number; headers: { get(n: string): string | null }; json(): Promise<any>; text(): Promise<string> };
export type FetchFn = (url: string, init?: any) => Promise<FetchResponse>;
export type WalletResult = { status: number; json: any; replay: boolean };

export type WalletClientOptions = { baseUrl: string; fetch?: FetchFn; timeoutMs?: number };

/** Make an in-process Hono app look like fetch (tests, CLI demo). */
export const appFetch = (app: { request: (input: string, init?: any) => Promise<Response> | Response }): FetchFn =>
  async (url, init) => {
    const u = new URL(url);
    return (await app.request(u.pathname + u.search, init)) as unknown as FetchResponse;
  };

export class WalletClient {
  private readonly fetchFn: FetchFn;
  private readonly base: string;
  private readonly timeoutMs: number;
  constructor(o: WalletClientOptions) {
    this.base = o.baseUrl.replace(/\/$/, "");
    this.fetchFn = o.fetch ?? ((u, i) => fetch(u, i) as unknown as Promise<FetchResponse>);
    this.timeoutMs = o.timeoutMs ?? 3000;
  }

  private async req(method: string, path: string, body?: unknown, headers: Record<string, string> = {}): Promise<WalletResult> {
    const ctl = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<never>((_, rej) => { timer = setTimeout(() => { ctl.abort(); rej(new WalletUnreachable(`wallet timeout after ${this.timeoutMs} ms: ${method} ${path}`)); }, this.timeoutMs); });
    try {
      const res = await Promise.race([
        this.fetchFn(`${this.base}${path}`, { method, headers: { "content-type": "application/json", ...headers }, body: body === undefined ? undefined : JSON.stringify(body), signal: ctl.signal }),
        timeout,
      ]);
      const text = await Promise.race([res.text(), timeout]);
      return { status: res.status, json: text ? JSON.parse(text) : null, replay: res.headers.get("idempotent-replay") === "true" };
    } catch (e) {
      if (e instanceof WalletUnreachable) throw e;
      throw new WalletUnreachable(`wallet unreachable: ${(e as Error).message}`);
    } finally { clearTimeout(timer); }
  }

  user(id: string) { return this.req("GET", `/users/${encodeURIComponent(id)}`); }
  contacts(userId: string) { return this.req("GET", `/users/${encodeURIComponent(userId)}/contacts`); }
  billers() { return this.req("GET", "/billers"); }
  billAccounts(userId: string) { return this.req("GET", `/users/${encodeURIComponent(userId)}/bill-accounts`); }
  transactions(userId: string, o: { limit?: number; idempotencyKey?: string } = {}) {
    const q = o.idempotencyKey ? `?idempotencyKey=${encodeURIComponent(o.idempotencyKey)}` : `?limit=${o.limit ?? 20}`;
    return this.req("GET", `/users/${encodeURIComponent(userId)}/transactions${q}`);
  }
  quote(body: unknown) { return this.req("POST", "/quotes", body); }
  issueToken(sessionId: string, payload: Payload) { return this.req("POST", "/confirmation-tokens", { session_id: sessionId, payload }); }
  revokeToken(sessionId: string, token: string) { return this.req("POST", "/confirmation-tokens/revoke", { session_id: sessionId, token }); }
  execute(kind: "transfer" | "bill_pay", body: unknown, idempotencyKey: string, token: string) {
    return this.req("POST", kind === "transfer" ? "/transfers" : "/bill-payments", body, { "idempotency-key": idempotencyKey, "x-confirmation-token": token });
  }
}
