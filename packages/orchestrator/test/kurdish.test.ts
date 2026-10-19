import { describe, it, expect } from "vitest";
import type { Understander, UnderstandInput } from "@zc/llm";
import { setup, text, SEED_TX } from "./helpers";

const ku = (o: Record<string, unknown>) => ({ ...o, status: o.status ?? "ok", confidence: 0.9, language: "ku" });
const kuTransfer = (who: string, value: number | null, source: string | null, kind: "name" | "relation" = "name", extra: Record<string, unknown> = {}) =>
  ku({ actions: [{ type: "transfer", recipient: { kind, text: who }, amount: value === null ? null : { value, currency: "IQD", source_text: source }, ...extra }] });
const kuBill = (biller: string, words: string, extra: Record<string, unknown> = {}) => ku({ actions: [{ type: "bill_pay", biller, biller_text: words, amount: null, ...extra }] });

/** A scripted model that also records what the orchestrator told it (language, billers). */
function kurdishSetup(script: Record<string, unknown>) {
  const seen: UnderstandInput[] = [];
  const understanderFor = (): Understander => ({
    async understand(input) {
      seen.push(input);
      return { raw: script[input.text] ?? null, toolCalls: [], usage: { input: 1, output: 1 }, model: "fake", mode: "workflow", turns: 1 };
    },
  });
  return { ...setup({ understanderFor }), seen };
}

describe("a Kurdish session (language picker = ku)", () => {
  it("one Kurdish sentence -> Kurdish card (amount in Kurdish words, دینار) -> confirm -> Kurdish receipt; exactly one debit", async () => {
    const say = "پەنجا هەزار بنێرە بۆ هێمن";
    const e = kurdishSetup({ [say]: kuTransfer("هێمن", 50_000, "پەنجا هەزار") });
    const r1 = await e.orch.turn("k", { text: say, lang: "ku" });
    expect(e.seen[0]?.context.lang).toBe("ku");
    expect(r1.phase).toBe("AWAITING_CONFIRM");
    expect(r1.card).toMatchObject({ recipient: { name: "هێمن" }, amount_iqd: 50_000, amount_text: "50,000 دینار", amount_words: "پەنجا هەزار", fee_text: "300 دینار" });
    expect(r1.card?.title).toBe("پشتڕاستکردنەوەی ناردن");
    expect(r1.card?.nothing_sent).toBe("هێشتا هیچ نەنێردراوە");
    expect(e.txCount()).toBe(SEED_TX); // nothing moved before Confirm
    const r2 = await e.orch.confirm("k", r1.card!.card_id);
    expect(r2.phase).toBe("EXECUTED");
    expect(text(r2)).toMatch(/50,000 دینار نێردرا بۆ هێمن/);
    expect(e.txCount()).toBe(SEED_TX + 1);
  });

  it("two Arases: asks in Kurdish; «یەکەم» / «ئاراس کەریم» / last digits pick from the same list", async () => {
    const say = "سی هەزار بنێرە بۆ ئاراس";
    for (const [answer, id] of [["یەکەم", "first"], ["دووەمیان", "second"], ["ئاراس کەریم", "c_aras_karim"], ["عومەر", "c_aras_omar"], ["ئەوەی 2001", "c_aras_omar"]] as const) {
      const e = kurdishSetup({ [say]: kuTransfer("ئاراس", 30_000, "سی هەزار") });
      const r1 = await e.orch.turn("k", { text: say, lang: "ku" });
      expect(r1.phase).toBe("CLARIFYING");
      expect(text(r1)).toContain("2 کەست هەیە بە ناوی ئاراس");
      expect(r1.candidates.map((c) => c.id).sort()).toEqual(["c_aras_karim", "c_aras_omar"]);
      const r2 = await e.orch.turn("k", { text: answer });
      expect(r2.phase, answer).toBe("AWAITING_CONFIRM");
      const want = id === "first" ? r1.candidates[0]?.id : id === "second" ? r1.candidates[1]?.id : id; // ordinals follow the list shown
      expect(e.orch.inspect("k").draft?.recipient?.id, answer).toBe(want);
    }
  });

  it("an Arabic contact written the Kurdish way («مستەفا») and a relation word («دایکم») resolve", async () => {
    const e = kurdishSetup({ "دە هەزار بنێرە بۆ مستەفا": kuTransfer("مستەفا", 10_000, "دە هەزار"), "سەد هەزار بنێرە بۆ دایکم": kuTransfer("دایکم", 100_000, "سەد هەزار", "relation") });
    expect((await e.orch.turn("a", { text: "دە هەزار بنێرە بۆ مستەفا", lang: "ku" })).card?.recipient?.name).toBe("مصطفى");
    expect((await e.orch.turn("b", { text: "سەد هەزار بنێرە بۆ دایکم", lang: "ku" })).card?.recipient?.name).toBe("ماما");
  });

  it("a look-alike is only proposed («مەبەستت محسن؟»); «بەڵێ موحسین» accepts it, «نا» does not", async () => {
    const say = "پازدە هەزار بنێرە بۆ موحسین";
    for (const [answer, phase] of [["بەڵێ موحسین", "AWAITING_CONFIRM"], ["بەڵێ", "AWAITING_CONFIRM"], ["نا", "CLARIFYING"]] as const) {
      const e = kurdishSetup({ [say]: kuTransfer("موحسین", 15_000, "پازدە هەزار") });
      const r1 = await e.orch.turn("k", { text: say, lang: "ku" });
      expect(text(r1)).toContain("مەبەستت محسن؟");
      expect(r1.card).toBeNull();
      const r2 = await e.orch.turn("k", { text: answer });
      expect(r2.phase, answer).toBe(phase);
      if (phase === "AWAITING_CONFIRM") expect(r2.card?.recipient?.name).toBe("محسن");
    }
  });

  it("a name the user never wrote is rejected (the model may not bring in a person); nothing moves", async () => {
    const say = "پەنجا هەزار بنێرە بۆ هێمن";
    const e = kurdishSetup({ [say]: kuTransfer("شیلان", 50_000, "پەنجا هەزار") });
    const r = await e.orch.turn("k", { text: say, lang: "ku" });
    expect(r.phase).toBe("NEEDS_REPHRASE");
    expect(text(r)).toContain("باش تێنەگەیشتم");
    expect(e.txCount()).toBe(SEED_TX);
  });

  it("a wrong number for the Kurdish words is caught by the parser, not trusted", async () => {
    const say = "پەنجا هەزار بنێرە بۆ هێمن";
    const e = kurdishSetup({ [say]: kuTransfer("هێمن", 500_000, "پەنجا هەزار") });
    expect((await e.orch.turn("k", { text: say, lang: "ku" })).phase).toBe("NEEDS_REPHRASE");
  });

  it("bare number -> «مەبەستت 25 هەزار دینارە؟» -> «بەڵێ» -> card for 25,000", async () => {
    const say = "بیست و پێنج بنێرە بۆ هێمن";
    const e = kurdishSetup({ [say]: kuTransfer("هێمن", 25, "بیست و پێنج") });
    const r1 = await e.orch.turn("k", { text: say, lang: "ku" });
    expect(text(r1)).toContain("مەبەستت 25 هەزار دینارە؟");
    const r2 = await e.orch.turn("k", { text: "بەڵێ" });
    expect(r2.card?.amount_iqd).toBe(25_000);
  });

  it("bill in Kurdish: Kurdish bill name on the card, wallet's amount", async () => {
    const say = "پسوولەی مۆلیدە بدە";
    const e = kurdishSetup({ [say]: kuBill("generator", "مۆلیدە") });
    const r = await e.orch.turn("k", { text: say, lang: "ku" });
    expect(r.card).toMatchObject({ kind: "bill_pay", biller: { name: "بەشداریی مۆلیدە (تاقیکاری)" }, amount_iqd: 60_000, amount_words: "شەست هەزار" });
    expect(e.seen[0]?.context.billers.join(" ")).toContain("مۆلیدە"); // the model is told the Kurdish bill words
  });

  it("scheduled in Kurdish: the instant comes from the Kurdish words, the card says it in Kurdish", async () => {
    const say = "سبەی کاتژمێر ٩ی بەیانی پسوولەی کارەبا بدە";
    const e = kurdishSetup({ [say]: kuBill("electricity", "کارەبا", { when_text: "سبەی کاتژمێر ٩ی بەیانی" }) });
    const r = await e.orch.turn("k", { text: say, lang: "ku" });
    expect(r.phase).toBe("AWAITING_CONFIRM");
    expect(r.card?.schedule?.when_text).toBe("هەینی 16/10/2026، کاتژمێر 9:00ی پێش نیوەڕۆ");
    expect(r.card?.title).toBe("پشتڕاستکردنەوەی دانی پسوولەی خشتەکراو");
  });

  it("«هەڵیوەشێنەوە» cancels a pending card; a typed «بەڵێ» never executes", async () => {
    const say = "پەنجا هەزار بنێرە بۆ هێمن";
    const e = kurdishSetup({ [say]: kuTransfer("هێمن", 50_000, "پەنجا هەزار") });
    await e.orch.turn("k", { text: say, lang: "ku" });
    expect(text(await e.orch.turn("k", { text: "بەڵێ" }))).toContain("دوگمەی پشتڕاستکردنەوە دابگرە");
    expect(e.txCount()).toBe(SEED_TX);
    const r = await e.orch.turn("k", { text: "هەڵیوەشێنەوە" });
    expect(r.phase).toBe("CANCELLED");
    expect(text(r)).toContain("هیچ ڕووی نەدا");
  });

  it("dollars are refused in Kurdish", async () => {
    const say = "سەد دۆلار بنێرە بۆ هێمن";
    const e = kurdishSetup({ [say]: kuTransfer("هێمن", null, null) });
    const r = await e.orch.turn("k", { text: say, lang: "ku" });
    expect(text(r)).toContain("دۆلار بەردەست نییە");
    expect(e.txCount()).toBe(SEED_TX);
  });

  it("«هەمان بڕی جاری پێشوو» takes the amount from the wallet's history (100,000 to mother)", async () => {
    const say = "هەمان بڕی جاری پێشوو بنێرە بۆ دایکم";
    const e = kurdishSetup({ [say]: ku({ actions: [{ type: "transfer", recipient: { kind: "relation", text: "دایکم" }, amount: null, amount_ref: { kind: "previous", source_text: "هەمان بڕی جاری پێشوو" } }] }) });
    const r = await e.orch.turn("k", { text: say, lang: "ku" });
    expect(r.card?.amount_iqd).toBe(100_000);
    expect(text(r)).toContain("هەمان بڕی دوایین ناردن بۆ ماما");
  });

  it("switching back to Arabic: the same session answers in Arabic again", async () => {
    const e = kurdishSetup({ "شكد رصيدي": ku({ actions: [{ type: "info", query: "balance" }] }) });
    expect(text(await e.orch.turn("k", { text: "شكد رصيدي", lang: "ku" }))).toContain("باڵانسەکەت 200,000 دینارە");
    expect(text(await e.orch.turn("k", { text: "شكد رصيدي", lang: "ar" }))).toContain("رصيدك 200,000 د.ع");
  });
});
