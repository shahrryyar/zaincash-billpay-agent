import { describe, it, expect } from "vitest";
import { setup, text, transferIntent, billIntent, infoIntent, twoActions, statusIntent, SEED_TX, DEMO_USER, scriptedChat, createUnderstander } from "./helpers";
import { createToolHost } from "../src";

const HERO = "دز خمسين ألف لأحمد";
const heroScript = { [HERO]: transferIntent("أحمد", 50_000, "خمسين ألف") };

describe("the hero scenario: one sentence to a confirmed, exactly-once transfer", () => {
  it("two Ahmeds -> asks which one (with masked candidates) -> tap -> card -> confirm -> success", async () => {
    const e = setup({ script: heroScript });
    const r1 = await e.orch.turn("s1", { text: HERO });
    expect(r1.phase).toBe("CLARIFYING");
    expect(text(r1)).toContain("عندك 2 باسم أحمد");
    expect(r1.candidates).toEqual([
      { id: "c_ahmed_ali", name: "أحمد علي", masked: "••••4471", relation: null },
      { id: "c_ahmed_moh", name: "أحمد محمد", masked: "••••9023", relation: null },
    ]);
    expect(r1.card).toBeNull();
    expect(e.balance()).toBe(200_000); // nothing moved

    const r2 = await e.orch.turn("s1", { choice: "c_ahmed_ali" });
    expect(r2.phase).toBe("AWAITING_CONFIRM");
    const card = r2.card!;
    expect(card).toMatchObject({
      kind: "transfer", recipient: { name: "أحمد علي", masked: "••••4471" }, amount_iqd: 50_000, amount_text: "50,000 د.ع", amount_words: "خمسين الف",
      fee_iqd: 300, balance_before_iqd: 200_000, balance_after_iqd: 149_700, first_time_recipient: false, ttl_seconds: 120,
    });
    expect(card.nothing_sent).toBe("ما انرسل شي بعد");
    expect(e.balance()).toBe(200_000); // still nothing sent

    const r3 = await e.orch.confirm("s1", card.card_id);
    expect(r3.phase).toBe("EXECUTED");
    expect(text(r3)).toMatch(/انرسلت 50,000 د\.ع لأحمد علي\. رقم العملية ZC-\d{8}\. رصيدك هسه 149,700/);
    expect(r3.result).toMatchObject({ amount_iqd: 50_000, balance_after_iqd: 149_700, counterparty: "أحمد علي", fee_iqd: 300, created_at: expect.any(Number) });
    expect(e.balance()).toBe(149_700);
    expect(e.balance("u_ahmed_ali")).toBe(100_000);
    expect(e.txCount()).toBe(SEED_TX + 1);
  });

  it("answers by text: name, ordinal, last digits", async () => {
    for (const answer of ["أحمد علي", "الأول", "اللي ينتهي 4471"]) {
      const e = setup({ script: heroScript });
      await e.orch.turn("s", { text: HERO });
      const r = await e.orch.turn("s", { text: answer });
      expect(r.phase, answer).toBe("AWAITING_CONFIRM");
      expect(r.card?.recipient?.name, answer).toBe("أحمد علي");
    }
  });
  it("a clear name goes straight to the card (no question)", async () => {
    const e = setup({ script: { "دز خمسين ألف لعلي كريم": transferIntent("علي كريم", 50_000, "خمسين ألف") } });
    const r = await e.orch.turn("s", { text: "دز خمسين ألف لعلي كريم" });
    expect(r.phase).toBe("AWAITING_CONFIRM");
    expect(r.card?.recipient?.name).toBe("علي كريم");
  });
  it("the model's guess is never trusted: it must pass the resolver (the model says 'أحمد', the user has two)", async () => {
    const e = setup({ script: heroScript });
    expect((await e.orch.turn("s", { text: HERO })).card).toBeNull();
  });
  it("an unknown first-time recipient is flagged on the card", async () => {
    const e = setup({ script: { "دز عشرة آلاف لمحمد رضا": transferIntent("محمد رضا", 10_000, "عشرة آلاف") } });
    const r = await e.orch.turn("s", { text: "دز عشرة آلاف لمحمد رضا" });
    expect(r.card?.first_time_recipient).toBe(true);
    expect(text(r)).toContain("أول مرة تدز لهذا الشخص");
  });
  it("relation words resolve: «حول لأمي ميت ألف»", async () => {
    const e = setup({ script: { "حول لأمي ميت ألف": transferIntent("أمي", 100_000, "ميت ألف", "relation") } });
    const r = await e.orch.turn("s", { text: "حول لأمي ميت ألف" });
    expect(r.card).toMatchObject({ recipient: { name: "ماما" }, amount_iqd: 100_000, amount_words: "مية الف" });
  });
});

describe("ask, never guess", () => {
  it("missing amount -> asks how much -> answer -> card", async () => {
    const e = setup({ script: { "دز لعلي كريم": transferIntent("علي كريم", null, null) } });
    const r1 = await e.orch.turn("s", { text: "دز لعلي كريم" });
    expect(r1.phase).toBe("CLARIFYING");
    expect(text(r1)).toContain("شكد تريد تدز لعلي كريم");
    const r2 = await e.orch.turn("s", { text: "خمسين ألف" });
    expect(r2.phase).toBe("AWAITING_CONFIRM");
    expect(r2.card?.amount_iqd).toBe(50_000);
    expect(e.llm.calls).toBe(1); // the answer was read deterministically, no second LLM call
  });
  it("dropped «ألف» (خمسة وعشرين) -> «تقصد 25 ألف؟» -> yes -> 25,000", async () => {
    const e = setup({ script: { "دز خمسة وعشرين لعلي كريم": transferIntent("علي كريم", 25, "خمسة وعشرين") } });
    const r1 = await e.orch.turn("s", { text: "دز خمسة وعشرين لعلي كريم" });
    expect(text(r1)).toContain("تقصد 25 ألف دينار؟");
    const r2 = await e.orch.turn("s", { text: "اي" });
    expect(r2.card?.amount_iqd).toBe(25_000);
  });
  it("the amount that is SENT is the clarified one the card showed, not the model's raw 25", async () => {
    const e = setup({ script: { "دز خمسة وعشرين لعلي كريم": transferIntent("علي كريم", 25, "خمسة وعشرين") } });
    await e.orch.turn("s", { text: "دز خمسة وعشرين لعلي كريم" });
    const card = (await e.orch.turn("s", { text: "اي" })).card!;
    const done = await e.orch.confirm("s", card.card_id);
    expect(done.phase).toBe("EXECUTED");
    expect(e.balance()).toBe(174_700); // 25,000 + 300 fee
    expect(done.result?.amount_iqd).toBe(25_000);
  });
  it("…and «لا» -> asks the amount in words", async () => {
    const e = setup({ script: { "دز خمسة وعشرين لعلي كريم": transferIntent("علي كريم", 25, "خمسة وعشرين") } });
    await e.orch.turn("s", { text: "دز خمسة وعشرين لعلي كريم" });
    const r = await e.orch.turn("s", { text: "لا" });
    expect(r.phase).toBe("CLARIFYING");
    expect(text(r)).toContain("شكد تريد تدز لعلي كريم");
    expect((await e.orch.turn("s", { text: "عشرين ألف" })).card?.amount_iqd).toBe(20_000);
  });
  it("unknown contact: asks twice, then fails safe with nothing sent", async () => {
    const e = setup({ script: { "دز خمسين ألف لزيدان": transferIntent("زيدان", 50_000, "خمسين ألف") } });
    const r1 = await e.orch.turn("s", { text: "دز خمسين ألف لزيدان" });
    expect(text(r1)).toContain("ما لگيت زيدان");
    const r2 = await e.orch.turn("s", { text: "سعيد" });
    expect(r2.phase).toBe("CLARIFYING");
    const r3 = await e.orch.turn("s", { text: "كمال" });
    expect(r3.phase).toBe("FAILED_SAFE");
    expect(text(r3)).toContain("ما انرسل شي");
    expect(e.txCount()).toBe(SEED_TX);
  });
  it("unknown contact, then the user types the phone number of a saved contact: card, nothing sent yet", async () => {
    const e = setup({ script: { "دز خمسين ألف لزيدان": transferIntent("زيدان", 50_000, "خمسين ألف") } });
    await e.orch.turn("s", { text: "دز خمسين ألف لزيدان" });
    const r = await e.orch.turn("s", { text: "07700000101" });
    expect(r.phase).toBe("AWAITING_CONFIRM");
    expect(r.card).toMatchObject({ recipient: { name: "علي كريم", masked: "••••0101" }, amount_iqd: 50_000 });
    expect(e.txCount()).toBe(SEED_TX);
    expect(e.balance()).toBe(200_000);
  });
  it("unknown contact, then a saved contact's name: card; an ambiguous name asks; an unknown number does not resolve", async () => {
    const script = { "دز خمسين ألف لزيدان": transferIntent("زيدان", 50_000, "خمسين ألف") };
    const a = setup({ script }); await a.orch.turn("s", { text: "دز خمسين ألف لزيدان" });
    expect((await a.orch.turn("s", { text: "علي كريم" })).card?.recipient?.name).toBe("علي كريم");
    const b = setup({ script }); await b.orch.turn("s", { text: "دز خمسين ألف لزيدان" });
    const rb = await b.orch.turn("s", { text: "أحمد" });
    expect(rb.phase).toBe("CLARIFYING"); expect(rb.candidates).toHaveLength(2); expect(rb.card).toBeNull();
    const c = setup({ script }); await c.orch.turn("s", { text: "دز خمسين ألف لزيدان" });
    const rc = await c.orch.turn("s", { text: "07800001234" });
    expect(rc.card).toBeNull(); expect(c.txCount()).toBe(SEED_TX);
  });
  it("a typo gets «تقصد حسين؟» and only a yes resolves it", async () => {
    const e = setup({ script: { "دز عشرة آلاف لحسيين": transferIntent("حسيين", 10_000, "عشرة آلاف") } });
    const r1 = await e.orch.turn("s", { text: "دز عشرة آلاف لحسيين" });
    expect(text(r1)).toContain("تقصد حسين؟");
    expect(r1.card).toBeNull();
    const r2 = await e.orch.turn("s", { text: "اي" });
    expect(r2.card?.recipient?.name).toBe("حسين");
  });
  it("«لا قصدي حسين»: after a wrong fuzzy guess the user can name the right saved contact", async () => {
    const reply = { actions: [], status: "clarify_reply", clarify_reply: { choice_text: "حسين" }, confidence: 0.9, language: "ar-iq" };
    const e = setup({ script: { "دز عشرة آلاف لحسيين": transferIntent("حسيين", 10_000, "عشرة آلاف"), "لا لا قصدي حسين مو حسن": reply } });
    expect((await e.orch.turn("s", { text: "دز عشرة آلاف لحسيين" })).card).toBeNull();
    const r = await e.orch.turn("s", { text: "لا لا قصدي حسين مو حسن" });
    expect(r.phase).toBe("AWAITING_CONFIRM");
    expect(r.card?.recipient?.name).toBe("حسين");
    expect(e.txCount()).toBe(SEED_TX);
  });
  it("a fuzzy guess is still not resolved by a typed name that matches nobody", async () => {
    const reply = { actions: [], status: "clarify_reply", clarify_reply: { choice_text: "زيدان" }, confidence: 0.9, language: "ar-iq" };
    const e = setup({ script: { "دز عشرة آلاف لحسيين": transferIntent("حسيين", 10_000, "عشرة آلاف"), "لا قصدي زيدان": reply } });
    await e.orch.turn("s", { text: "دز عشرة آلاف لحسيين" });
    const r = await e.orch.turn("s", { text: "لا قصدي زيدان" });
    expect(r.card).toBeNull(); expect(e.txCount()).toBe(SEED_TX);
  });
  it("a bare phone number that is not a saved contact is not paid (asks instead)", async () => {
    const e = setup({ script: { "دز خمسين ألف للرقم 07751234567": transferIntent("07751234567", 50_000, "خمسين ألف", "phone") } });
    const r = await e.orch.turn("s", { text: "دز خمسين ألف للرقم 07751234567" });
    expect(r.card).toBeNull();
    expect(r.phase).toBe("CLARIFYING");
  });
  it("an answer that is really a new request is handed to the LLM", async () => {
    const e = setup({ script: { ...heroScript, "لا دز لعلي كريم عشرة آلاف": transferIntent("علي كريم", 10_000, "عشرة آلاف") } });
    await e.orch.turn("s", { text: HERO });
    const r = await e.orch.turn("s", { text: "لا دز لعلي كريم عشرة آلاف" });
    expect(e.llm.calls).toBe(2);
    expect(r.card?.recipient?.name).toBe("علي كريم");
  });
  it("cancel during a question", async () => {
    const e = setup({ script: heroScript });
    await e.orch.turn("s", { text: HERO });
    const r = await e.orch.turn("s", { text: "الغي" });
    expect(r.phase).toBe("CANCELLED");
    expect(text(r)).toContain("لغيتها");
  });
});

describe("bills", () => {
  it("«ادفع المولدة»: the amount comes from the wallet, the fee is shown", async () => {
    const e = setup({ script: { "ادفع المولدة": billIntent("generator", "المولدة") } });
    const r = await e.orch.turn("s", { text: "ادفع المولدة" });
    expect(r.card).toMatchObject({ kind: "bill_pay", biller: { name: "اشتراك المولدة (تجريبي)" }, amount_iqd: 60_000, fee_iqd: 0, total_iqd: 60_000, balance_after_iqd: 140_000 });
    const done = await e.orch.confirm("s", r.card!.card_id);
    expect(done.phase).toBe("EXECUTED");
    expect(text(done)).toContain("اندفعت فاتورة");
    expect(e.balance()).toBe(140_000);
  });
  it("already-paid bill fails safe at the pre-check, no card", async () => {
    const e = setup({ script: { "ادفع الماي": billIntent("water", "الماي") } });
    const r = await e.orch.turn("s", { text: "ادفع الماي" });
    expect(r.phase).toBe("FAILED_SAFE");
    expect(r.card).toBeNull();
    expect(text(r)).toContain("مدفوعة من قبل");
  });
  it("biller down: honest message, nothing charged", async () => {
    const e = setup({ script: { "اشحن رصيد خمسة آلاف": billIntent("mobile_topup", "رصيد", { value: 5000, source: "خمسة آلاف" }) } });
    const r = await e.orch.turn("s", { text: "اشحن رصيد خمسة آلاف" });
    expect(r.phase).toBe("FAILED_SAFE");
    expect(text(r)).toContain("واگفة");
    expect(e.balance()).toBe(200_000);
  });
  it("paying the same bill twice: the second request is refused before any card", async () => {
    const e = setup({ script: { "ادفع الكهرباء": billIntent("electricity", "الكهرباء") } });
    const a = await e.orch.turn("s", { text: "ادفع الكهرباء" });
    await e.orch.confirm("s", a.card!.card_id);
    const b = await e.orch.turn("s", { text: "ادفع الكهرباء" });
    expect(b.phase).toBe("FAILED_SAFE");
    expect(e.balance()).toBe(200_000 - 37_500);
  });
  it("unknown biller asks which bill", async () => {
    const e = setup({ script: { "ادفع الشي ذاك": billIntent("unknown", "الشي ذاك") } });
    const r = await e.orch.turn("s", { text: "ادفع الشي ذاك" });
    expect(r.phase).toBe("CLARIFYING");
    expect(text(r)).toContain("أي فاتورة");
    const r2 = await e.orch.turn("s", { text: "الانترنت" });
    expect(r2.card).toMatchObject({ kind: "bill_pay", amount_iqd: 35_000 });
  });
  it("the model's biller must match the user's words: «الامبيرات» tagged electricity asks which bill (held-out C-0056)", async () => {
    const e = setup({ script: { "سددلي الامبيرات": billIntent("electricity", "الامبيرات") } });
    const r = await e.orch.turn("s", { text: "سددلي الامبيرات" });
    expect(r.phase).toBe("CLARIFYING");
    expect(r.card).toBeNull();
    expect((await e.orch.turn("s", { text: "المولدة" })).card).toMatchObject({ kind: "bill_pay", amount_iqd: 60_000 });
  });
  it("the model sees every biller alias", async () => {
    let system = "";
    const e = setup({ understanderFor: () => ({ understand: async (i: { context: { billers: string[] } }) => { system = i.context.billers.join(" | "); return { raw: null, toolCalls: [], usage: { input: 0, output: 0 }, model: "x", mode: "workflow", turns: 1 }; } }) as never });
    await e.orch.turn("s", { text: "اي شي" });
    expect(system).toContain("الأمبيرات");
    expect(system).toContain("الواي فاي");
  });
  it("an amount said for an unknown bill is dropped when the user picks a real one: the card shows the wallet's amount", async () => {
    const e = setup({ script: { "ادفع قسط المدرسة 150 الف": billIntent("unknown", "قسط المدرسة", { value: 150_000, source: "150 الف" }) } });
    expect((await e.orch.turn("s", { text: "ادفع قسط المدرسة 150 الف" })).phase).toBe("CLARIFYING");
    const r = await e.orch.turn("s", { text: "المولدة" });
    expect(r.card).toMatchObject({ kind: "bill_pay", amount_iqd: 60_000 });
  });
  it("a valid phone number that is not a saved contact: says so, offers nothing to send, creates no contact", async () => {
    const e = setup({ script: { "دز عشرين الف لـ07801234567": transferIntent("07801234567", 20_000, "عشرين الف", "phone") } });
    const r = await e.orch.turn("s", { text: "دز عشرين الف لـ07801234567" });
    expect(r.phase).toBe("CLARIFYING");
    expect(text(r)).toContain("مو محفوظ بجهات اتصالك");
    expect(text(r)).toContain("••••4567");
    expect(r.card).toBeNull();
    expect((e.db.prepare("SELECT COUNT(*) c FROM contacts WHERE phone='07801234567'").get() as { c: number }).c).toBe(0);
  });
});

describe("fail closed", () => {
  it("insufficient balance: no card, says nothing was sent, shows the balance", async () => {
    const e = setup({ script: { "دز مليون لأمي": transferIntent("أمي", 1_000_000, "مليون", "relation") } });
    const r = await e.orch.turn("s", { text: "دز مليون لأمي" });
    expect(r.phase).toBe("FAILED_SAFE");
    expect(r.card).toBeNull();
    expect(text(r)).toMatch(/رصيدك 200,000 د\.ع وما يكفي لـ1,000,000 د\.ع\. ما انرسل شي/);
    expect(e.txCount()).toBe(SEED_TX);
  });
  it("invalid model output: asks to rephrase, then a good message works", async () => {
    const e = setup({ script: { ...heroScript, "بلا بلا": { not: "an intent" } } });
    const r1 = await e.orch.turn("s", { text: "بلا بلا" });
    expect(r1.phase).toBe("NEEDS_REPHRASE");
    expect(text(r1)).toContain("ما فهمت عليك");
    const r2 = await e.orch.turn("s", { text: HERO });
    expect(r2.phase).toBe("CLARIFYING");
  });
  it("hallucinated amount (source_text not in the message) never reaches a card", async () => {
    const e = setup({ script: { "دز لعلي كريم": transferIntent("علي كريم", 50_000, "خمسين ألف") } });
    const r = await e.orch.turn("s", { text: "دز لعلي كريم" });
    expect(r.phase).toBe("NEEDS_REPHRASE");
    expect(r.card).toBeNull();
  });
  it("a model that adds an 'execute' field is rejected by the strict schema", async () => {
    const bad = { ...transferIntent("علي كريم", 50_000, "خمسين ألف"), execute: true, actions: [{ ...transferIntent("علي كريم", 50_000, "خمسين ألف").actions[0], execute: true }] };
    const e = setup({ script: { "دز خمسين ألف لعلي كريم": bad } });
    const r = await e.orch.turn("s", { text: "دز خمسين ألف لعلي كريم" });
    expect(r.phase).toBe("NEEDS_REPHRASE");
    expect(e.txCount()).toBe(SEED_TX);
  });
  it("out of scope: polite refusal", async () => {
    const e = setup({ script: { "احجزلي تكت": statusIntent("out_of_scope") } });
    const r = await e.orch.turn("s", { text: "احجزلي تكت" });
    expect(r.phase).toBe("FAILED_SAFE");
    expect(text(r)).toContain("أنا مساعد زين كاش");
    expect(text(r)).toContain("أجدول دفعاتك");
  });
  it("dollars (ورقة) are refused", async () => {
    const e = setup({ script: { "دز ورقة لعلي كريم": transferIntent("علي كريم", 100_000, "ورقة") } });
    const r = await e.orch.turn("s", { text: "دز ورقة لعلي كريم" });
    expect(r.phase).toBe("FAILED_SAFE");
    expect(text(r)).toContain("بالدولار");
  });
  it("LLM provider down: honest 'busy', nothing happens, the next try works", async () => {
    const e = setup({ script: heroScript });
    e.llm.fail = true;
    const r1 = await e.orch.turn("s", { text: HERO });
    expect(text(r1)).toContain("النظام مشغول");
    expect(r1.phase).toBe("IDLE");
    expect(r1.trace.llm_error).toContain("provider down");
    e.llm.fail = false;
    expect((await e.orch.turn("s", { text: HERO })).phase).toBe("CLARIFYING");
  });
  it("low ASR confidence: asks to repeat and does not call the LLM", async () => {
    const e = setup({ script: heroScript });
    const r = await e.orch.turn("s", { text: HERO, asrConfidence: 0.2 });
    expect(text(r)).toContain("ما سمعتك زين");
    expect(e.llm.calls).toBe(0);
  });
  it("wallet unreachable during the pre-check fails safe (busy)", async () => {
    const e = setup({ script: { "دز خمسين ألف لعلي كريم": transferIntent("علي كريم", 50_000, "خمسين ألف") }, timeoutMs: 5 });
    await e.fault({ mode: "latency_ms", ms: 60, count: 1 }); // quotes are not delayed, so use a dead wallet instead
    const dead = setup({ script: { "دز خمسين ألف لعلي كريم": transferIntent("علي كريم", 50_000, "خمسين ألف") } });
    (dead.wallet as any).fetchFn = async () => { throw new Error("ECONNREFUSED"); };
    const r = await dead.orch.turn("s", { text: "دز خمسين ألف لعلي كريم" });
    expect(r.card).toBeNull();
    expect(dead.txCount()).toBe(SEED_TX);
  });
});

describe("info requests and multiple actions", () => {
  it("balance", async () => {
    const e = setup({ script: { "شكد رصيدي": infoIntent("balance") } });
    const r = await e.orch.turn("s", { text: "شكد رصيدي" });
    expect(r.phase).toBe("ANSWERED");
    expect(text(r)).toBe("رصيدك 200,000 د.ع.");
    expect(r.card).toBeNull();
  });
  it("bill amount", async () => {
    const e = setup({ script: { "شكد فاتورة الكهرباء": infoIntent("bill_amount", "electricity") } });
    expect(text(await e.orch.turn("s", { text: "شكد فاتورة الكهرباء" }))).toContain("37,500");
  });
  it("last transfer", async () => {
    const e = setup({ script: { "شكد دزيت اخر مرة": infoIntent("last_transfer") } });
    expect(text(await e.orch.turn("s", { text: "شكد دزيت اخر مرة" }))).toContain("آخر تحويل: 25,000 د.ع لعلي كريم");
  });
  it("«نفس المبلغ مال اخر مرة»: the amount is the latest transfer to that person, from the wallet (held-out C-0017)", async () => {
    const msg = "دز لعلي كريم نفس المبلغ مال اخر مرة";
    const intentPrev = { actions: [{ type: "transfer", recipient: { kind: "name", text: "علي كريم" }, amount: null, amount_ref: { kind: "previous", source_text: "نفس المبلغ مال اخر مرة" } }], status: "ok", confidence: 0.9, language: "ar-iq" };
    const e = setup({ script: { [msg]: intentPrev } });
    const r = await e.orch.turn("s", { text: msg });
    expect(r.phase).toBe("AWAITING_CONFIRM");
    expect(r.card).toMatchObject({ recipient: { name: "علي كريم" }, amount_iqd: 25_000 });
    expect(text(r)).toContain("نفس مبلغ آخر تحويل لـعلي كريم: 25,000");
    expect(e.txCount()).toBe(SEED_TX);
  });
  it("«same as last time» to an ambiguous name: the pick fills the amount from that person's history", async () => {
    const msg = "دز لأحمد نفس المبلغ مال اخر مرة";
    const intentPrev = { actions: [{ type: "transfer", recipient: { kind: "name", text: "أحمد" }, amount: null, amount_ref: { kind: "previous", source_text: "نفس المبلغ مال اخر مرة" } }], status: "ok", confidence: 0.9, language: "ar-iq" };
    const e = setup({ script: { [msg]: intentPrev } });
    const r = await e.orch.turn("s", { text: msg });
    expect(r.phase).toBe("CLARIFYING");
    const byTap = await e.orch.turn("s", { choice: "c_ahmed_moh" });
    expect(byTap.card).toMatchObject({ recipient: { name: "أحمد محمد" }, amount_iqd: 75_000 });
    const e2 = setup({ script: { [msg]: intentPrev } });
    await e2.orch.turn("s", { text: msg });
    expect((await e2.orch.turn("s", { text: "أحمد علي" })).card).toMatchObject({ recipient: { name: "أحمد علي" }, amount_iqd: 50_000 });
  });
  it("«same as last time» to someone with no earlier transfer: asks the amount, then the card", async () => {
    const msg = "حول لمحسن مثل المرة الفاتت";
    const intentPrev = { actions: [{ type: "transfer", recipient: { kind: "name", text: "محسن" }, amount: null, amount_ref: { kind: "previous", source_text: "مثل المرة الفاتت" } }], status: "ok", confidence: 0.9, language: "ar-iq" };
    const e = setup({ script: { [msg]: intentPrev } });
    const r = await e.orch.turn("s", { text: msg });
    expect(r.phase).toBe("CLARIFYING");
    expect(text(r)).toContain("ما لگيت تحويل سابق لـمحسن");
    expect((await e.orch.turn("s", { text: "عشرين الف" })).card).toMatchObject({ recipient: { name: "محسن" }, amount_iqd: 20_000 });
  });
  it("last transfer skips a newer bill payment (a bill is not a «تحويل»)", async () => {
    const e = setup({ script: { "ادفع الكهرباء": billIntent("electricity", "الكهرباء"), "شكد دزيت اخر مرة": infoIntent("last_transfer") } });
    const card = (await e.orch.turn("s", { text: "ادفع الكهرباء" })).card!;
    await e.orch.confirm("s", card.card_id);
    expect(text(await e.orch.turn("s", { text: "شكد دزيت اخر مرة" }))).toContain("آخر تحويل: 25,000 د.ع لعلي كريم");
  });
  it("bill amount with no biller named lists every outstanding bill from the wallet", async () => {
    const e = setup({ script: { "شكد فواتيري": infoIntent("bill_amount") } });
    const out = text(await e.orch.turn("s", { text: "شكد فواتيري" }));
    for (const amount of ["37,500", "60,000", "35,000"]) expect(out).toContain(amount);
    expect(out).not.toContain("12,000"); // water is already paid
  });
  it("two actions: each gets its own card, confirmed separately", async () => {
    const msg = "ادفع الكهرباء ودز لعلي كريم عشرة آلاف";
    const e = setup({ script: { [msg]: twoActions(billIntent("electricity", "الكهرباء"), transferIntent("علي كريم", 10_000, "عشرة آلاف")) } });
    const r1 = await e.orch.turn("s", { text: msg });
    expect(text(r1)).toContain("طلبت شغلتين");
    expect(r1.card).toMatchObject({ kind: "bill_pay", amount_iqd: 37_500 });
    const r2 = await e.orch.confirm("s", r1.card!.card_id);
    expect(r2.phase).toBe("AWAITING_CONFIRM"); // second action's card is up
    expect(r2.card).toMatchObject({ kind: "transfer", amount_iqd: 10_000 });
    expect(r2.card!.card_id).not.toBe(r1.card!.card_id);
    const r3 = await e.orch.confirm("s", r2.card!.card_id);
    expect(r3.phase).toBe("EXECUTED");
    expect(e.balance()).toBe(200_000 - 37_500 - 10_000 - 300);
    expect(e.txCount()).toBe(SEED_TX + 2);
  });
  it("two actions, the SECOND has a dropped-ألف amount: the first card keeps its own amount, the second asks later", async () => {
    const msg = "ارسل لخوي كرار 20 الف ولمرتي 40";
    const e = setup({ script: { [msg]: twoActions(transferIntent("أخوي كرار", 20_000, "20 الف"), transferIntent("مرتي", 40, "40", "relation")) } });
    const r1 = await e.orch.turn("s", { text: msg });
    expect(r1.card).toMatchObject({ kind: "transfer", amount_iqd: 20_000, recipient: { name: "أخوي كرار" } }); // NOT 40,000
    const r2 = await e.orch.confirm("s", r1.card!.card_id);
    expect(r2.phase).toBe("CLARIFYING"); // now the wife's amount is asked, with her name
    expect(text(r2)).toContain("شكد تريد تدز");
    expect(e.balance()).toBe(200_000 - 20_000 - 300);
    const r3 = await e.orch.turn("s", { text: "اربعين الف" });
    expect(r3.card).toMatchObject({ amount_iqd: 40_000, recipient: { name: "مرتي" } });
    expect(e.txCount()).toBe(SEED_TX + 1); // the second is still only a card
  });
  it("cancelling the first does not cancel the second", async () => {
    const msg = "ادفع الكهرباء ودز لعلي كريم عشرة آلاف";
    const e = setup({ script: { [msg]: twoActions(billIntent("electricity", "الكهرباء"), transferIntent("علي كريم", 10_000, "عشرة آلاف")) } });
    const r1 = await e.orch.turn("s", { text: msg });
    const r2 = await e.orch.cancel("s");
    expect(r2.card).toMatchObject({ kind: "transfer" });
    expect(e.balance()).toBe(200_000);
    expect(r1.card!.card_id).not.toBe(r2.card!.card_id);
  });
});

describe("the card: cancel, expiry, edits, double taps (invariant 1)", () => {
  const cardEnv = async () => {
    const e = setup({ script: { ...heroScript, "لا خليها عشرين ألف": transferIntent("أحمد علي", 20_000, "عشرين ألف") } });
    await e.orch.turn("s", { text: HERO });
    const r = await e.orch.turn("s", { choice: "c_ahmed_ali" });
    return { e, card: r.card! };
  };
  it("cancel kills the card and its token; the old card_id cannot be confirmed", async () => {
    const { e, card } = await cardEnv();
    const r = await e.orch.cancel("s");
    expect(r.phase).toBe("CANCELLED");
    const late = await e.orch.confirm("s", card.card_id);
    expect(text(late)).toContain("ما انرسل شي");
    expect(e.balance()).toBe(200_000);
    expect((e.db.prepare("SELECT COUNT(*) c FROM confirmation_tokens WHERE used_at IS NULL").get() as { c: number }).c).toBe(0); // revoked in the wallet
  });
  it("a typed «لا» or «الغي» cancels; a typed «اي» does NOT execute", async () => {
    const { e, card } = await cardEnv();
    const yes = await e.orch.turn("s", { text: "اي" });
    expect(yes.phase).toBe("AWAITING_CONFIRM");
    expect(text(yes)).toContain("اضغط زر التأكيد");
    expect(e.balance()).toBe(200_000);
    expect(card).toBeTruthy();
    expect((await e.orch.turn("s", { text: "لا" })).phase).toBe("CANCELLED");
  });
  it("expiry: after 120 s the card cannot be confirmed", async () => {
    const { e, card } = await cardEnv();
    e.clock.advance(120_000);
    const r = await e.orch.confirm("s", card.card_id);
    expect(r.phase).toBe("EXPIRED");
    expect(text(r)).toContain("انتهى وقت التأكيد");
    expect(e.balance()).toBe(200_000);
  });
  it("the UI countdown (tick) expires the card and revokes the token", async () => {
    const { e } = await cardEnv();
    e.clock.advance(120_000);
    const r = await e.orch.tick("s");
    expect(r.phase).toBe("EXPIRED");
    expect((e.db.prepare("SELECT COUNT(*) c FROM confirmation_tokens WHERE used_at IS NULL").get() as { c: number }).c).toBe(0);
  });
  it("editing while a card is pending issues a NEW card; the old card_id is dead", async () => {
    const { e, card: old } = await cardEnv();
    const r = await e.orch.turn("s", { text: "لا خليها عشرين ألف" });
    expect(r.card!.amount_iqd).toBe(20_000);
    expect(r.card!.card_id).not.toBe(old.card_id);
    const stale = await e.orch.confirm("s", old.card_id);
    expect(text(stale)).toContain("ما انرسل شي");
    expect(e.balance()).toBe(200_000);
    await e.orch.confirm("s", r.card!.card_id);
    expect(e.balance()).toBe(179_700);
  });
  it("a made-up card_id never executes", async () => {
    const { e } = await cardEnv();
    const r = await e.orch.confirm("s", "not-a-card");
    expect(r.phase).toBe("AWAITING_CONFIRM");
    expect(e.txCount()).toBe(SEED_TX);
  });
  it("another session cannot confirm this session's card", async () => {
    const { e, card } = await cardEnv();
    const r = await e.orch.confirm("other-session", card.card_id);
    expect(text(r)).toContain("ما انرسل شي");
    expect(e.txCount()).toBe(SEED_TX);
  });
  it("two confirm taps at once: exactly one transaction, the second shows the same result", async () => {
    const { e, card } = await cardEnv();
    const [a, b] = await Promise.all([e.orch.confirm("s", card.card_id), e.orch.confirm("s", card.card_id)]);
    expect(e.txCount()).toBe(SEED_TX + 1);
    expect(e.balance()).toBe(149_700);
    expect(a.result?.reference).toBeTruthy();
    expect(b.result?.reference).toBe(a.result?.reference);
  });
  it("a new request after a finished one starts clean", async () => {
    const { e, card } = await cardEnv();
    await e.orch.confirm("s", card.card_id);
    e.script.set("شكد رصيدي", infoIntent("balance"));
    expect(text(await e.orch.turn("s", { text: "شكد رصيدي" }))).toContain("149,700");
  });
});

describe("retries and unknown outcomes (invariant 2: no duplicate debit)", () => {
  const ready = async (timeoutMs = 2000) => {
    const e = setup({ script: { "دز خمسين ألف لعلي كريم": transferIntent("علي كريم", 50_000, "خمسين ألف") }, timeoutMs });
    const r = await e.orch.turn("s", { text: "دز خمسين ألف لعلي كريم" });
    return { e, card: r.card! };
  };
  it("timeout AFTER commit: «جاي نتأكد», retry with the same key replays, ONE debit, same reference", async () => {
    const { e, card } = await ready(25);
    await e.fault({ mode: "timeout_after_commit", count: 1, sleep_ms: 120 });
    const r = await e.orch.confirm("s", card.card_id);
    expect(r.phase).toBe("EXECUTED");
    expect(text(r)).toContain("جاي نتأكد");
    expect(text(r)).toMatch(/انرسلت 50,000 د\.ع لعلي كريم/);
    expect(e.balance()).toBe(149_700);
    expect(e.txCount()).toBe(SEED_TX + 1);
    await new Promise((res) => setTimeout(res, 150)); // let the slow first response finish
    expect(e.txCount()).toBe(SEED_TX + 1);
  });
  it("5xx BEFORE commit: retry succeeds once", async () => {
    const { e, card } = await ready();
    await e.fault({ mode: "error_5xx_before_commit", count: 2 });
    const r = await e.orch.confirm("s", card.card_id);
    expect(r.phase).toBe("EXECUTED");
    expect(e.txCount()).toBe(SEED_TX + 1);
    expect(e.balance()).toBe(149_700);
  });
  it("the wallet stays down: 3 retries, then a lookup by key says nothing happened -> FAILED_SAFE", async () => {
    const { e, card } = await ready();
    await e.fault({ mode: "error_5xx_before_commit", count: 4 }); // initial + 3 retries
    const r = await e.orch.confirm("s", card.card_id);
    expect(r.phase).toBe("FAILED_SAFE");
    expect(text(r)).toContain("ما انرسل شي");
    expect(e.balance()).toBe(200_000);
    expect(e.txCount()).toBe(SEED_TX);
  });
  it("outcome unknown (debit committed, every reply lost, lookup down): says «ما متأكدين», keeps the key; a recheck later finds the ONE debit", async () => {
    let down = false;
    const e = setup({
      script: { "دز خمسين ألف لعلي كريم": transferIntent("علي كريم", 50_000, "خمسين ألف") },
      // the wallet processes the request but the answer never arrives; reads fail too, until `down` clears
      wrapFetch: (f) => async (url, init) => { if (!down) return f(url, init); if (init?.method === "POST") await f(url, init); throw new Error("network down"); },
    });
    const card = (await e.orch.turn("s", { text: "دز خمسين ألف لعلي كريم" })).card!;
    down = true;
    const r = await e.orch.confirm("s", card.card_id);
    expect(r.phase).toBe("UNKNOWN_OUTCOME");
    expect(text(r)).toContain("ما متأكدين");
    expect(e.txCount()).toBe(SEED_TX + 1); // it did go through, once (the retries replayed the same key)
    const still = await e.orch.turn("s", { text: "شصار؟" });
    expect(still.phase).toBe("UNKNOWN_OUTCOME");
    expect(e.llm.texts).not.toContain("شصار؟"); // the model is not asked while the money question is open
    down = false;
    const done = await e.orch.recheck("s");
    expect(done.phase).toBe("EXECUTED");
    expect(text(done)).toMatch(/انرسلت 50,000 د\.ع لعلي كريم/);
    expect(e.txCount()).toBe(SEED_TX + 1);
    expect(e.balance()).toBe(149_700);
  });
  it("outcome unknown, then the wallet says it never arrived: «ما انرسل شي», nothing debited", async () => {
    let down = false;
    const e = setup({
      script: { "دز خمسين ألف لعلي كريم": transferIntent("علي كريم", 50_000, "خمسين ألف") },
      wrapFetch: (f) => async (url, init) => { if (down) throw new Error("network down"); return f(url, init); },
    });
    const card = (await e.orch.turn("s", { text: "دز خمسين ألف لعلي كريم" })).card!;
    down = true;
    expect((await e.orch.confirm("s", card.card_id)).phase).toBe("UNKNOWN_OUTCOME");
    down = false;
    const r = await e.orch.confirm("s", card.card_id); // a second tap only rechecks
    expect(r.phase).toBe("FAILED_SAFE");
    expect(text(r)).toContain("ما انرسل شي");
    expect(e.txCount()).toBe(SEED_TX);
  });
  it("a wallet rejection after confirm (balance spent elsewhere) is honest and nothing is sent", async () => {
    const { e, card } = await ready();
    e.db.prepare("UPDATE users SET balance_iqd = 1000 WHERE id = ?").run(DEMO_USER);
    const r = await e.orch.confirm("s", card.card_id);
    expect(r.phase).toBe("FAILED_SAFE");
    expect(text(r)).toMatch(/رصيدك 1,000 د\.ع وما يكفي/);
    expect(e.txCount()).toBe(SEED_TX);
  });
  it("a bill that grew after the card was shown is refused (amount changed), nothing charged", async () => {
    const e = setup({ script: { "ادفع الكهرباء": billIntent("electricity", "الكهرباء") } });
    const r = await e.orch.turn("s", { text: "ادفع الكهرباء" });
    e.db.prepare("UPDATE bills SET amount_iqd = 45000 WHERE account_id='ba_elec'").run();
    const done = await e.orch.confirm("s", r.card!.card_id);
    expect(done.phase).toBe("FAILED_SAFE");
    expect(text(done)).toContain("هسه 45,000 د.ع، مو 37,500 د.ع"); // says the new amount, never charges it
    expect(e.balance()).toBe(200_000);
  });
});

describe("the model's tools end to end (tools mode)", () => {
  it("search_contacts sees masked ambiguity, then propose; the orchestrator still asks the user", async () => {
    const seen: string[] = [];
    const { chat, requests } = scriptedChat([
      () => [{ type: "tool_use", id: "t1", name: "search_contacts", input: { mention: "أحمد" } }],
      (req) => {
        seen.push(JSON.stringify(req.messages.at(-1)));
        return [{ type: "tool_use", id: "t2", name: "propose", input: transferIntent("أحمد", 50_000, "خمسين ألف") }];
      },
    ]);
    const e = setup({ understanderFor: (host) => createUnderstander({ chat, mode: "tools", host }) });
    const r = await e.orch.turn("s", { text: HERO });
    expect(r.phase).toBe("CLARIFYING");
    expect(r.trace.tool_calls).toEqual([{ name: "search_contacts", args: { mention: "أحمد" }, ok: true }]);
    const result = seen[0]!;
    expect(result).toContain("••••4471"); // masked numbers only
    expect(result).not.toContain("07700004471"); // never the full number
    expect(result).toContain("ambiguous");
    expect(requests).toHaveLength(2);
    expect(e.balance()).toBe(200_000);
  });
  it("a model that tries execute_transfer gets an error result and money does not move", async () => {
    const { chat } = scriptedChat([
      () => [{ type: "tool_use", id: "t1", name: "execute_transfer", input: { to: "c_ahmed_ali", amount_iqd: 200000 } }],
      () => [{ type: "tool_use", id: "t2", name: "propose", input: transferIntent("علي كريم", 50_000, "خمسين ألف") }],
    ]);
    const e = setup({ understanderFor: (host) => createUnderstander({ chat, mode: "tools", host }) });
    const r = await e.orch.turn("s", { text: "دز خمسين ألف لعلي كريم" });
    expect(r.trace.tool_calls?.[0]).toMatchObject({ name: "execute_transfer", ok: false });
    expect(r.phase).toBe("AWAITING_CONFIRM"); // only a card; nothing sent
    expect(e.balance()).toBe(200_000);
  });
  it("handles are session-scoped: an unknown handle in quote is an error", async () => {
    const e = setup();
    const host = createToolHost({ wallet: e.wallet, userId: DEMO_USER, session: e.orch.inspect("s") });
    await expect(host.quote({ kind: "transfer", contact_handle: "c9", amount_iqd: 5000 })).rejects.toThrow(/unknown handle/);
    const found = (await host.searchContacts({ mention: "حسين" })) as any;
    expect(found).toMatchObject({ match: "exact", candidates: [{ handle: "c1", name: "حسين", masked: "••••0302" }] });
    const q = (await host.quote({ kind: "transfer", contact_handle: "c1", amount_iqd: 5000 })) as any;
    expect(q).toMatchObject({ ok: true, fee_iqd: 300 }); // 0.5% of 5,000 is below the 300 IQD minimum
    expect(JSON.stringify(found)).not.toContain("0770000");
  });
  it("tool results never expose full phone numbers", async () => {
    const e = setup();
    const host = createToolHost({ wallet: e.wallet, userId: DEMO_USER, session: e.orch.inspect("s") });
    const all = JSON.stringify([await host.searchContacts({ mention: "أحمد" }), await host.listBills({}), await host.getHistory({}), await host.getBalance()]);
    expect(all).not.toMatch(/07[3-9]\d{8}/);
  });
});

describe("what the UI is told, and what it is never told", () => {
  it("replies never contain the confirmation token, payload hash or idempotency key", async () => {
    const e = setup({ script: heroScript });
    await e.orch.turn("s", { text: HERO });
    const r1 = await e.orch.turn("s", { choice: "c_ahmed_ali" });
    const secrets = (() => { const c = e.orch.inspect("s").card!; return [c.token, c.payloadHash, c.idempotencyKey]; })();
    const r2 = await e.orch.confirm("s", r1.card!.card_id);
    for (const r of [r1, r2]) for (const s of secrets) expect(JSON.stringify(r), s).not.toContain(s);
  });
  it("every phase change is audited, without the token", async () => {
    const e = setup({ script: heroScript });
    await e.orch.turn("s", { text: HERO });
    const r1 = await e.orch.turn("s", { choice: "c_ahmed_ali" });
    const r2 = await e.orch.confirm("s", r1.card!.card_id);
    const trail = e.orch.inspect("s").audit.map((a) => `${a.from}>${a.to}`);
    expect(trail).toEqual(["IDLE>VALIDATED", "VALIDATED>CLARIFYING", "CLARIFYING>RESOLVED", "RESOLVED>AWAITING_CONFIRM", "AWAITING_CONFIRM>EXECUTING", "EXECUTING>EXECUTED"]);
    expect(r2.audit.map((a) => a.to)).toEqual(["EXECUTING", "EXECUTED"]);
    expect(JSON.stringify(e.orch.inspect("s").audit)).not.toContain(e.orch.inspect("s").card!.token);
  });
  it("the trace explains the decision (for the judge-facing «Why?» panel)", async () => {
    const e = setup({ script: heroScript });
    const r = await e.orch.turn("s", { text: HERO });
    expect(r.trace).toMatchObject({ model: "fake", mode: "workflow", intent: heroScript[HERO], resolution: { slot: "recipient", status: "ambiguous", candidates: ["c_ahmed_ali", "c_ahmed_moh"] } });
  });
  it("Arabic is the default language of every message", async () => {
    const e = setup({ script: heroScript });
    const r = await e.orch.turn("s", { text: HERO });
    for (const m of r.messages) expect(m.text).toMatch(/[ء-ي]/);
  });
});

describe("answering «أي فاتورة؟» with any alias of the biller", () => {
  it.each(["النت", "الواي فاي", "الانترنت"])("«%s» picks the internet bill (not only the first alias)", async (answer) => {
    const e = setup({ script: { "ادفع اشتراك شي غريب": billIntent("unknown", "شي غريب") } });
    await e.orch.turn("s", { text: "ادفع اشتراك شي غريب" });
    const r = await e.orch.turn("s", { text: answer });
    expect(r.card).toMatchObject({ kind: "bill_pay", biller: { name: "شركة النور للإنترنت (تجريبي)" } });
  });
});

describe("trace: upstream model requests per turn (free-tier quota planning, docs/35 FA-03)", () => {
  const counting = (requests: number | undefined) => () => ({
    understand: async () => ({ raw: transferIntent("علي كريم", 25_000, "25 الف"), toolCalls: [], usage: { input: 1, output: 1 }, model: "x", mode: "tools" as const, turns: 2, ...(requests === undefined ? {} : { requests }) }),
  });
  it("reports the understander's request count", async () => {
    const e = setup({ understanderFor: counting(3) });
    const r = await e.orch.turn("s", { text: "دز 25 الف لعلي كريم" });
    expect(r.trace.model_requests).toBe(3);
    expect(r.card).not.toBeNull();
  });
  it("leaves it out when the understander does not count (scripted fakes)", async () => {
    const e = setup({ understanderFor: counting(undefined) });
    expect((await e.orch.turn("s", { text: "دز 25 الف لعلي كريم" })).trace.model_requests).toBeUndefined();
  });
  it("a turn answered without the model reports none", async () => {
    const e = setup({ understanderFor: counting(3) });
    await e.orch.turn("s", { text: "دز 25 الف لعلي كريم" });
    expect((await e.orch.turn("s", { text: "الغي" })).trace.model_requests).toBeUndefined();
  });
});
