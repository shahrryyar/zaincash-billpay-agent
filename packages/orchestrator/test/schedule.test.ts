import { describe, it, expect } from "vitest";
import { BAGHDAD_OFFSET_MS } from "@zc/core";
import { setup, text, transferIntent, billIntent, statusIntent, SEED_TX, DEMO_USER } from "./helpers";

const HOUR = 3_600_000;
const at = (y: number, m: number, d: number, h = 0, mi = 0) => Date.UTC(y, m - 1, d, h, mi) - BAGHDAD_OFFSET_MS;
const withWhen = (intent: any, when: string) => ({ ...intent, actions: intent.actions.map((a: any) => ({ ...a, when_text: when })) });
const runDue = (e: ReturnType<typeof setup>) => (e.app as any).runDueSchedules() as { executed: string[]; failed: { id: string; code: string }[] };

const MSG = "دز خمسين ألف لأحمد علي بعد ساعتين";
const scheduledScript = { [MSG]: withWhen(transferIntent("أحمد علي", 50_000, "خمسين ألف"), "بعد ساعتين") };

describe("scheduled payments end to end", () => {
  it("card says WHEN and that nothing is sent now; confirm creates the schedule; the runner pays once at the time", async () => {
    const e = setup({ script: scheduledScript });
    const r1 = await e.orch.turn("s", { text: MSG });
    expect(r1.phase).toBe("AWAITING_CONFIRM");
    expect(r1.card).toMatchObject({ kind: "transfer", amount_iqd: 50_000, fee_iqd: 300, nothing_sent: "ما راح ينرسل شي هسه", title: "تأكيد جدولة التحويل" });
    expect(r1.card!.schedule).toMatchObject({ due_at: e.clock.now() + 2 * HOUR, relative: "بعد ساعتين" });
    expect(r1.card!.schedule!.when_text).toContain("الساعة");
    expect(r1.card!.labels.confirm).toBe("أكّد وجدول");

    const r2 = await e.orch.confirm("s", r1.card!.card_id);
    expect(r2.phase).toBe("EXECUTED");
    expect(text(r2)).toContain("انجدول تحويل 50,000 د.ع لـأحمد علي");
    expect(r2.result?.scheduled).toBeTruthy();
    expect(e.balance()).toBe(200_000); // nothing moved
    expect(e.txCount()).toBe(SEED_TX);
    expect(runDue(e)).toEqual({ executed: [], failed: [] }); // not due yet

    e.clock.advance(2 * HOUR);
    expect(runDue(e).executed).toHaveLength(1);
    expect(e.balance()).toBe(200_000 - 50_300);
    expect(e.txCount()).toBe(SEED_TX + 1);
    runDue(e); runDue(e);
    expect(e.txCount()).toBe(SEED_TX + 1); // exactly once
    const list = await e.orch.listSchedules();
    expect(list[0]).toMatchObject({ status: "executed", amount_iqd: 50_000 });
  });

  it("two confirm taps at once create exactly one schedule", async () => {
    const e = setup({ script: scheduledScript });
    const r1 = await e.orch.turn("s", { text: MSG });
    await Promise.all([e.orch.confirm("s", r1.card!.card_id), e.orch.confirm("s", r1.card!.card_id)]);
    expect(await e.orch.listSchedules()).toHaveLength(1);
  });

  it("a time the user never said is refused (the model cannot invent a schedule)", async () => {
    const msg = "دز خمسين ألف لأحمد علي";
    const e = setup({ script: { [msg]: withWhen(transferIntent("أحمد علي", 50_000, "خمسين ألف"), "باچر الساعة 9 الصبح") } });
    const r = await e.orch.turn("s", { text: msg });
    expect(r.phase).toBe("NEEDS_REPHRASE");
    expect(r.card).toBeNull();
    expect(await e.orch.listSchedules()).toHaveLength(0);
  });

  it("a date without an hour: asks the hour, then AM/PM, then shows the card", async () => {
    const msg = "دز خمسين ألف لأحمد علي باچر";
    const e = setup({ script: { [msg]: withWhen(transferIntent("أحمد علي", 50_000, "خمسين ألف"), "باچر") } });
    const r1 = await e.orch.turn("s", { text: msg });
    expect(r1.phase).toBe("CLARIFYING");
    expect(text(r1)).toContain("الساعة شكد");
    const r2 = await e.orch.turn("s", { text: "9" });
    expect(r2.phase).toBe("CLARIFYING"); // 9 what? AM or PM
    const r3 = await e.orch.turn("s", { text: "الصبح" });
    expect(r3.phase).toBe("AWAITING_CONFIRM");
    expect(r3.card!.schedule!.due_at).toBe(at(2026, 10, 16, 9, 0)); // SEED_NOW is Thursday 15 Oct 15:00 in Baghdad
  });

  it("«جدولها» button on a pending card: same payment, asks when, then a scheduled card", async () => {
    const msg = "دز خمسين ألف لأحمد علي";
    const e = setup({ script: { [msg]: transferIntent("أحمد علي", 50_000, "خمسين ألف") } });
    const r1 = await e.orch.turn("s", { text: msg });
    const oldCard = r1.card!;
    const r2 = await e.orch.scheduleCard("s", oldCard.card_id);
    expect(r2.phase).toBe("CLARIFYING");
    expect(text(r2)).toContain("متى تريد أجدولها");
    expect((await e.orch.confirm("s", oldCard.card_id)).phase).toBe("CLARIFYING"); // the old card is dead
    const r3 = await e.orch.turn("s", { text: "باچر الساعة 9 الصبح" });
    expect(r3.phase).toBe("AWAITING_CONFIRM");
    expect(r3.card).toMatchObject({ amount_iqd: 50_000, recipient: { name: "أحمد علي" } });
    expect(r3.card!.schedule!.due_at).toBe(at(2026, 10, 16, 9, 0));
    expect(r3.card!.card_id).not.toBe(oldCard.card_id);
    expect(e.txCount()).toBe(SEED_TX);
  });

  it("typing «اجدولها باچر الساعة 9 الصبح» on a pending card needs no model call", async () => {
    const msg = "دز خمسين ألف لأحمد علي";
    const e = setup({ script: { [msg]: transferIntent("أحمد علي", 50_000, "خمسين ألف") } });
    await e.orch.turn("s", { text: msg });
    const calls = e.llm.calls;
    const r = await e.orch.turn("s", { text: "اجدولها باچر الساعة 9 الصبح" });
    expect(r.phase).toBe("AWAITING_CONFIRM");
    expect(r.card!.schedule!.due_at).toBe(at(2026, 10, 16, 9, 0));
    expect(e.llm.calls).toBe(calls);
  });

  it("the user can cancel a schedule; it never runs", async () => {
    const e = setup({ script: scheduledScript });
    const r1 = await e.orch.turn("s", { text: MSG });
    const r2 = await e.orch.confirm("s", r1.card!.card_id);
    const id = r2.result!.scheduled!.id;
    expect(await e.orch.cancelSchedule(id)).toMatchObject({ cancelled: true });
    e.clock.advance(3 * HOUR);
    expect(runDue(e).executed).toHaveLength(0);
    expect(e.balance()).toBe(200_000);
    expect((await e.orch.cancelSchedule(id)).cancelled).toBe(false); // twice is refused
  });

  it("not enough balance today is allowed with a warning; when it runs without funds it fails safe", async () => {
    const msg = "دز مية الف لأحمد علي بعد ساعة";
    const e = setup({ script: { [msg]: withWhen(transferIntent("أحمد علي", 100_000, "مية الف"), "بعد ساعة") } });
    e.db.prepare("UPDATE users SET balance_iqd = 20000 WHERE id=?").run(DEMO_USER);
    const r1 = await e.orch.turn("s", { text: msg });
    expect(r1.phase).toBe("AWAITING_CONFIRM");
    expect(r1.card!.schedule!.low_balance_warning).toContain("ما يكفي");
    await e.orch.confirm("s", r1.card!.card_id);
    e.clock.advance(HOUR);
    expect(runDue(e).failed.map((f) => f.code)).toEqual(["INSUFFICIENT_BALANCE"]);
    expect(e.balance()).toBe(20_000);
    expect((await e.orch.listSchedules())[0]).toMatchObject({ status: "failed", failure_code: "INSUFFICIENT_BALANCE" });
  });

  it("a scheduled bill is paid at the time, once", async () => {
    const msg = "ادفع المولدة بعد ساعة";
    const e = setup({ script: { [msg]: withWhen(billIntent("generator", "المولدة"), "بعد ساعة") } });
    const r1 = await e.orch.turn("s", { text: msg });
    expect(r1.card).toMatchObject({ kind: "bill_pay", amount_iqd: 60_000, title: "تأكيد جدولة دفع الفاتورة" });
    const r2 = await e.orch.confirm("s", r1.card!.card_id);
    expect(text(r2)).toContain("انجدول دفع فاتورة");
    e.clock.advance(HOUR);
    expect(runDue(e).executed).toHaveLength(1);
    expect(e.balance()).toBe(140_000);
    runDue(e);
    expect(e.txCount()).toBe(SEED_TX + 1);
  });

  it("«اريد أجدول دفعة» (schedule_help): guidance, no card, nothing created", async () => {
    const msg = "اريد أجدول دفعة";
    const e = setup({ script: { [msg]: statusIntent("schedule_help") } });
    const r = await e.orch.turn("s", { text: msg });
    expect(r.phase).toBe("ANSWERED");
    expect(text(r)).toContain("گول لي شنو ومتى");
    expect(r.card).toBeNull();
    expect(await e.orch.listSchedules()).toHaveLength(0);
  });

  it("an immediate payment is unchanged (no schedule fields, executes at confirm)", async () => {
    const msg = "دز خمسين ألف لأحمد علي";
    const e = setup({ script: { [msg]: transferIntent("أحمد علي", 50_000, "خمسين ألف") } });
    const r1 = await e.orch.turn("s", { text: msg });
    expect(r1.card!.schedule).toBeNull();
    const r2 = await e.orch.confirm("s", r1.card!.card_id);
    expect(r2.result?.scheduled).toBeUndefined();
    expect(e.balance()).toBe(200_000 - 50_300);
  });
});
