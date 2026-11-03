// «Check what happened» after a Confirm with no answer must never be the action that pays.
import { describe, it, expect } from "vitest";
import { applySeed, createApp, openDb, DEMO_USER, SEED_NOW } from "@zc/wallet-api";
import { appFetch, createOrchestrator, WalletClient } from "@zc/orchestrator";
import type { Understander } from "@zc/llm";
import { recheckReply } from "../app/api/recheck/recheck";

const raw = { actions: [{ type: "transfer", recipient: { kind: "name", text: "علي كريم" }, amount: { value: 50000, currency: "IQD", source_text: "خمسين ألف" } }], status: "ok", confidence: 0.9, language: "ar-iq" };
function setup() {
  const db = openDb(); applySeed(db);
  const wallet = new WalletClient({ baseUrl: "http://w", fetch: appFetch(createApp({ db, now: () => SEED_NOW })) });
  const understander: Understander = { async understand() { return { raw, toolCalls: [], usage: { input: 0, output: 0 }, model: "fake", mode: "workflow", turns: 1 }; } };
  const orch = createOrchestrator({ wallet, userId: DEMO_USER, understanderFor: () => understander, now: () => SEED_NOW });
  const txCount = () => (db.prepare("SELECT COUNT(*) c FROM transactions").get() as { c: number }).c;
  return { orch, txCount };
}

describe("recheck after a lost Confirm", () => {
  it("the Confirm never reached the server: the same live card comes back, nothing is paid", async () => {
    const { orch, txCount } = setup();
    const first = await orch.turn("s", { text: "دز خمسين ألف لعلي كريم" });
    const cardId = first.card!.card_id, n0 = txCount();
    const r = await recheckReply(orch, "s", cardId);
    expect(r.phase).toBe("AWAITING_CONFIRM"); expect(r.card?.card_id).toBe(cardId);
    expect(r.messages.map((m) => m.text).join(" ")).toContain("ما انرسل شي بعد");
    expect(txCount()).toBe(n0);
    expect((await recheckReply(orch, "s", cardId)).phase).toBe("AWAITING_CONFIRM"); // asking again still pays nothing
    expect(txCount()).toBe(n0);
  });
  it("the Confirm arrived and paid, only the answer was lost: the same receipt, one debit", async () => {
    const { orch, txCount } = setup();
    const cardId = (await orch.turn("s", { text: "دز خمسين ألف لعلي كريم" })).card!.card_id, n0 = txCount();
    await orch.confirm("s", cardId); // the browser never saw this answer
    const r = await recheckReply(orch, "s", cardId);
    expect(r.result?.amount_iqd).toBe(50000); expect(r.result?.reference).toMatch(/^ZC-\d{8}$/);
    await recheckReply(orch, "s", cardId);
    expect(txCount()).toBe(n0 + 1);
  });
  it("an unknown or stale card id only reports state", async () => {
    const { orch, txCount } = setup();
    await orch.turn("s", { text: "دز خمسين ألف لعلي كريم" });
    const n0 = txCount(), r = await recheckReply(orch, "s", "not-the-card");
    expect(r.result).toBeNull(); expect(txCount()).toBe(n0);
  });
});
