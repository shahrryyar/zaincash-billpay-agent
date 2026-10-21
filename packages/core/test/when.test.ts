import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { parseWhen, formatWhenAr, relativeAr, BAGHDAD_OFFSET_MS, MIN_LEAD_MS, MAX_LEAD_MS } from "../src/when";

/** Baghdad local time to epoch ms. */
const at = (y: number, m: number, d: number, h = 0, mi = 0) => Date.UTC(y, m - 1, d, h, mi) - BAGHDAD_OFFSET_MS;
// Friday 16 Oct 2026, 14:05 in Baghdad
const NOW = at(2026, 10, 16, 14, 5);
const ok = (text: string, due: number) => expect(parseWhen(text, NOW)).toEqual({ kind: "ok", dueAt: due });

describe("parseWhen: relative delays are exact", () => {
  it.each([
    ["بعد ساعة", 60], ["بعد ساعتين", 120], ["بعد 10 دقايق", 10], ["بعد ١٠ دقائق", 10], ["بعد دقيقتين", 2],
    ["بعد نص ساعة", 30], ["بعد ربع ساعة", 15], ["بعد ثلاث ساعات", 180], ["بعد 3 ساعات", 180], ["بعد يوم", 1440], ["بعد يومين", 2880], ["بعد اسبوع", 10080],
  ])("«%s» is %i minutes ahead", (text, mins) => ok(text, NOW + mins * 60_000));
  it("property: «بعد N دقيقة» is exactly N minutes for any N the wallet allows", () => {
    fc.assert(fc.property(fc.integer({ min: 3, max: 90 * 24 * 60 }), (n) => {
      const r = parseWhen(`بعد ${n} دقيقة`, NOW);
      return r.kind === "ok" && r.dueAt === NOW + n * 60_000;
    }));
  });
  it("too soon and too far are refused, never clamped", () => {
    expect(parseWhen("بعد دقيقة", NOW).kind).toBe("too_soon");
    expect(parseWhen("بعد 100 يوم", NOW).kind).toBe("too_far");
  });
  it("«بعد يومين الساعة 9 الصبح» is a date plus a clock", () => ok("بعد يومين الساعة 9 الصبح", at(2026, 10, 18, 9, 0)));
});

describe("parseWhen: dates and clock times", () => {
  it("tomorrow at 9 AM (باچر / باجر / بكرة)", () => {
    for (const w of ["باچر الساعة 9 الصبح", "باجر الساعة 9 صباحا", "بكرة الساعة ٩ الصبح", "بكره 9 الصبح"]) ok(w, at(2026, 10, 17, 9, 0));
  });
  it("tomorrow 9 PM", () => { ok("باچر 9 مساء", at(2026, 10, 17, 21, 0)); ok("بكرة الساعة 9 بالليل", at(2026, 10, 17, 21, 0)); });
  it("minutes and halves", () => { ok("باچر الساعة 9:30 مساء", at(2026, 10, 17, 21, 30)); ok("باچر الساعة 9 ونص الصبح", at(2026, 10, 17, 9, 30)); ok("باچر الساعة 9 الا ربع الصبح", at(2026, 10, 17, 8, 45)); });
  it("24-hour clock is certain", () => { ok("اليوم 21:00", at(2026, 10, 16, 21, 0)); ok("باچر 13:30", at(2026, 10, 17, 13, 30)); });
  it("only a clock: the next time that hour comes", () => {
    ok("الساعة 9 الصبح", at(2026, 10, 17, 9, 0)); // 09:00 already passed today
    ok("الساعة 9 المساء", at(2026, 10, 16, 21, 0));
    ok("الساعة 2 الظهر", at(2026, 10, 17, 14, 0)); // 14:00 is before now (14:05)
  });
  it("day of month, this month or next", () => {
    ok("يوم 25 الساعة 8 المساء", at(2026, 10, 25, 20, 0));
    ok("يوم 5 الساعة 10 الصبح", at(2026, 11, 5, 10, 0));
    ok("بتاريخ 31 الساعة 7 مساء", at(2026, 10, 31, 19, 0));
  });
  it("a day that does not exist this month moves to the next month that has it", () => {
    expect(parseWhen("يوم 31 الساعة 7 مساء", at(2026, 11, 20, 10, 0))).toEqual({ kind: "ok", dueAt: at(2026, 12, 31, 19, 0) });
  });
  it("weekdays", () => {
    ok("الجمعة الساعة 6 المساء", at(2026, 10, 16, 18, 0)); // today is Friday and 18:00 is still ahead
    ok("الخميس 9 الصبح", at(2026, 10, 22, 9, 0));
    ok("يوم السبت الساعة 10 الصبح", at(2026, 10, 17, 10, 0));
  });
  it("end and start of the month", () => { ok("اخر الشهر الساعة 10 الصبح", at(2026, 10, 31, 10, 0)); ok("اول الشهر 9 صباحا", at(2026, 11, 1, 9, 0)); });
  it("numeric dates", () => { ok("25/10 الساعة 7 المساء", at(2026, 10, 25, 19, 0)); ok("1/11/2026 الساعة 8 الصبح", at(2026, 11, 1, 8, 0)); });
  it("year rollover for a date already past this year", () => { expect(parseWhen("5/1 الساعة 9 الصبح", NOW)).toEqual({ kind: "ok", dueAt: at(2027, 1, 5, 9, 0) }); });
});

describe("parseWhen: incomplete answers become a question, never a guess", () => {
  it("afternoon is a time range, not an implicit noon appointment", () => {
    for (const t of ["باچر بعد الظهر", "باچر بعد ظهر", "باچر العصر", "باچر المساء"])
      expect(parseWhen(t, NOW), t).toMatchObject({ kind: "need_time", prior: { date: { y: 2026, m: 10, d: 17 } } });
    ok("باچر الظهر", at(2026, 10, 17, 12));
    ok("باچر الساعة 3 بعد الظهر", at(2026, 10, 17, 15));
  });
  it("a date without an hour needs the hour", () => {
    const r = parseWhen("باچر", NOW);
    expect(r).toMatchObject({ kind: "need_time", prior: { date: { y: 2026, m: 10, d: 17 } } });
  });
  it("an hour without AM/PM needs AM/PM and remembers the hour", () => {
    const r = parseWhen("باچر الساعة 9", NOW);
    expect(r).toMatchObject({ kind: "need_time", prior: { date: { y: 2026, m: 10, d: 17 }, hour: 9 } });
  });
  it("«12 بالليل» is ambiguous (start or end of the day)", () => { expect(parseWhen("باچر الساعة 12 بالليل", NOW).kind).toBe("need_time"); });
  it("«10:00» without a marker is ambiguous", () => { expect(parseWhen("باچر 10:00", NOW).kind).toBe("need_time"); });
  it("the follow-up answer completes the remembered parts", () => {
    const first = parseWhen("باچر الساعة 9", NOW);
    if (first.kind !== "need_time") throw new Error("expected need_time");
    expect(parseWhen("الصبح", NOW, first.prior)).toEqual({ kind: "ok", dueAt: at(2026, 10, 17, 9, 0) });
    expect(parseWhen("المساء", NOW, first.prior)).toEqual({ kind: "ok", dueAt: at(2026, 10, 17, 21, 0) });
    const dateOnly = parseWhen("باچر", NOW);
    if (dateOnly.kind !== "need_time") throw new Error("expected need_time");
    expect(parseWhen("9 المساء", NOW, dateOnly.prior)).toEqual({ kind: "ok", dueAt: at(2026, 10, 17, 21, 0) });
  });
  it.each(["", "   ", "شهر الجاي", "بعد العصر", "اي وقت", "someday", "بعد شهر", "يوم 32"])("«%s» is not understood", (t) => expect(parseWhen(t, NOW).kind).toBe("unparsed"));
});

describe("parseWhen: a bare number answers «الساعة شكد؟»", () => {
  it("only when the caller says an hour is expected", () => {
    expect(parseWhen("9", NOW).kind).toBe("unparsed");
    const date = parseWhen("باچر", NOW);
    if (date.kind !== "need_time") throw new Error("expected need_time");
    expect(parseWhen("9", NOW, date.prior, { bareHour: true })).toMatchObject({ kind: "need_time", prior: { hour: 9 } });
    expect(parseWhen("9 ونص", NOW, date.prior, { bareHour: true })).toMatchObject({ kind: "need_time", prior: { hour: 9, minute: 30 } });
    expect(parseWhen("21", NOW, date.prior, { bareHour: true })).toEqual({ kind: "ok", dueAt: at(2026, 10, 17, 21, 0) });
  });
});

describe("parseWhen: invariants", () => {
  const words = ["باچر", "اليوم", "بعد ساعة", "بعد 5 دقايق", "الساعة 9 الصبح", "الساعة 9 المساء", "يوم 25", "الجمعة", "21:00", "9", "الصبح", "بعد يومين"];
  it("property: an `ok` result is always between the minimum and maximum lead time, whatever the text", () => {
    fc.assert(fc.property(fc.array(fc.constantFrom(...words), { minLength: 1, maxLength: 4 }), fc.integer({ min: 0, max: 400 }), (parts, dayOffset) => {
      const now = NOW + dayOffset * 86_400_000;
      const r = parseWhen(parts.join(" "), now);
      return r.kind !== "ok" || (r.dueAt >= now + MIN_LEAD_MS && r.dueAt <= now + MAX_LEAD_MS);
    }), { numRuns: 2000 });
  });
  it("property: never throws on arbitrary text", () => {
    fc.assert(fc.property(fc.string({ maxLength: 60 }), (t) => { parseWhen(t, NOW); return true; }), { numRuns: 2000 });
  });
});

describe("formatWhenAr and relativeAr (what the confirmation card shows)", () => {
  it("formats in Baghdad time with weekday", () => {
    expect(formatWhenAr(at(2026, 10, 17, 9, 0))).toBe("السبت 17/10/2026، الساعة 9:00 صباحاً");
    expect(formatWhenAr(at(2026, 10, 25, 20, 30))).toBe("الأحد 25/10/2026، الساعة 8:30 مساءً");
    expect(formatWhenAr(at(2026, 10, 18, 0, 5))).toBe("الأحد 18/10/2026، الساعة 12:05 صباحاً");
  });
  it("relative wording follows Arabic number agreement", () => {
    const r = (mins: number) => relativeAr(NOW + mins * 60_000, NOW);
    expect(r(1)).toBe("بعد دقيقة"); expect(r(2)).toBe("بعد دقيقتين"); expect(r(3)).toBe("بعد 3 دقائق"); expect(r(10)).toBe("بعد 10 دقائق"); expect(r(15)).toBe("بعد 15 دقيقة");
    expect(r(60)).toBe("بعد ساعة"); expect(r(120)).toBe("بعد ساعتين"); expect(r(18 * 60)).toBe("بعد 18 ساعة"); expect(r(5 * 60)).toBe("بعد 5 ساعات");
    expect(r(3 * 1440)).toBe("بعد 3 أيام"); expect(r(30 * 1440)).toBe("بعد 30 يوم");
  });
});
