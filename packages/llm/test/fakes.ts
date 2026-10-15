import type { Block, ChatClient, CompleteRequest, CompleteResponse } from "../src/types";
import type { ToolHost } from "../src/tools";

/** A ChatClient that replays scripted responses and records every request it receives. */
export function scriptedChat(script: (Block[] | ((req: CompleteRequest) => Block[]))[], id = "fake:model") {
  const requests: CompleteRequest[] = [];
  let i = 0;
  const chat: ChatClient = {
    id,
    async complete(req) {
      requests.push(JSON.parse(JSON.stringify(req)));
      const step = script[Math.min(i++, script.length - 1)] as Block[] | ((r: CompleteRequest) => Block[]);
      const content = typeof step === "function" ? step(req) : step;
      const res: CompleteResponse = { content, stop: content.some((b) => b.type === "tool_use") ? "tool_use" : "end", usage: { input: 100, output: 20 } };
      return res;
    },
  };
  return { chat, requests };
}

export const use = (name: string, input: unknown, id = `tu_${name}_${Math.random().toString(36).slice(2, 6)}`): Block => ({ type: "tool_use", id, name, input });
export const say = (text: string): Block => ({ type: "text", text });

export const HERO_INTENT = {
  actions: [{ type: "transfer", recipient: { kind: "name", text: "أحمد" }, amount: { value: 50000, currency: "IQD", source_text: "خمسين ألف" } }],
  status: "ok", confidence: 0.9, language: "ar-iq",
};

export function fakeHost(over: Partial<ToolHost> = {}): ToolHost & { calls: { tool: string; args: unknown }[] } {
  const calls: { tool: string; args: unknown }[] = [];
  const rec = <T>(tool: string, v: T) => async (args?: unknown) => { calls.push({ tool, args }); return v; };
  return {
    calls,
    searchContacts: over.searchContacts ?? (rec("search_contacts", { match: "ambiguous", candidates: [{ handle: "c1", name: "أحمد علي", masked: "••••4471" }, { handle: "c2", name: "أحمد محمد", masked: "••••9023" }] }) as ToolHost["searchContacts"]),
    listBills: over.listBills ?? (rec("list_bills", { bills: [] }) as ToolHost["listBills"]),
    getBalance: over.getBalance ?? (rec("get_balance", { balance_iqd: 200000 }) as ToolHost["getBalance"]),
    getHistory: over.getHistory ?? (rec("get_history", { transactions: [] }) as ToolHost["getHistory"]),
    quote: over.quote ?? (rec("quote", { ok: true }) as ToolHost["quote"]),
  };
}
