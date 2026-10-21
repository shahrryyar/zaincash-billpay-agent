import { describe, it, expect } from "vitest";
import fc from "fast-check";
import {
  amountInWordsKu, formatWhenKu, isCancelKu, isNoKu, isPreviousAmountKu, isYesKu, kurdishNameKey, kurdishOrdinal, kurdishRelation,
  kurdishTimeToArabic, normaliseKurdish, parseAmountKu, relativeKu, wantsScheduleKu,
} from "../src/kurdish";
import { parseAmount } from "../src/amount";
import { crossCheck, validateIntent, type Intent } from "../src/schema";
import { parseWhen } from "../src/when";
import { resolveContact, type Contact } from "../src/resolver";

const ok = (v: number) => ({ kind: "ok", value: v });
// Thursday 2026-10-15 15:00 Baghdad (the eval seed clock)
const NOW = Date.UTC(2026, 9, 15, 12, 0);
const at = (y: number, m: number, d: number, h: number, mi = 0) => Date.UTC(y, m - 1, d, h - 3, mi);

describe("normaliseKurdish", () => {
  it("folds Arabic-keyboard spellings onto the Kurdish ones and keeps ێ apart from ی", () => {
    expect(normaliseKurdish("هەزار")).toBe(normaliseKurdish("ههزار"));
    expect(normaliseKurdish("كارەبا")).toBe(normaliseKurdish("کارەبا"));
    expect(normaliseKurdish("سێ")).not.toBe(normaliseKurdish("سی"));
    expect(normaliseKurdish("یه‌ک")).toBe(normaliseKurdish("یەک")); // zero-width non-joiner
  });
  it("is idempotent", () => fc.assert(fc.property(fc.string(), (s) => normaliseKurdish(normaliseKurdish(s)) === normaliseKurdish(s))));
});

describe("parseAmountKu: Sorani number words", () => {
  it.each([
    ["پەنجا هەزار", 50_000],
    ["ههزار", 1000],
    ["هەزار", 1000],
    ["دە هەزار", 10_000],
    ["ده هزار", 10_000], // Arabic keyboard
    ["بیست و پێنج هەزار", 25_000],
    ["سەد هەزار", 100_000],
    ["سەد و بیست هەزار", 120_000],
    ["دووسەد هەزار", 200_000],
    ["دوو سەد هەزار", 200_000],
    ["پێنجسەد هەزار", 500_000],
    ["نیو ملیۆن", 500_000],
    ["چارەکە ملیۆنێک", 250_000],
    ["ملیۆنێک", 1_000_000],
    ["یەک ملیۆن و نیو", 1_500_000],
    ["دوو ملیۆن", 2_000_000],
    ["هەزار و پێنجسەد", 1500],
    ["سی و حەوت هەزار و پێنجسەد", 37_500],
    ["50 هەزار", 50_000],
    ["٥٠ هەزار", 50_000],
    ["50هەزار", 50_000],
    ["50,000 دینار", 50_000],
    ["پەنجا هەزار دینار", 50_000],
    ["هەزاری", 1000],
    ["50 hezar", 50_000],
    ["penja hezar", 50_000],
  ])("%s -> %i", (t, v) => expect(parseAmountKu(t)).toEqual(ok(v)));

  it("keeps 3 and 30 apart (ێ)", () => {
    expect(parseAmountKu("سێ هەزار")).toEqual(ok(3000));
    expect(parseAmountKu("سی هەزار")).toEqual(ok(30_000));
  });
  it("a bare number without هەزار is ambiguous: the user is asked", () => {
    expect(parseAmountKu("بیست و پێنج")).toEqual({ kind: "ambiguous", candidates: [25, 25_000] });
    expect(parseAmountKu("٢٥")).toEqual({ kind: "ambiguous", candidates: [25, 25_000] });
  });
  it("dollars are refused, decimals invalid, chatter is not an amount", () => {
    expect(parseAmountKu("سەد دۆلار")).toEqual({ kind: "unsupported", reason: "currency" });
    expect(parseAmountKu("1.5 ملیۆن").kind).toBe("invalid");
    expect(parseAmountKu("بنێرە بۆ ئاراس").kind).toBe("none");
    expect(parseAmountKu("پەنجا هەزار بنێرە").kind).toBe("none"); // source_text must be ONLY the number words
  });
  it("parseAmount falls back to Kurdish only when the Arabic parser has nothing", () => {
    expect(parseAmount("خمسين ألف")).toEqual(ok(50_000));
    expect(parseAmount("پەنجا هەزار")).toEqual(ok(50_000));
    expect(parseAmount("سەد دۆلار")).toEqual({ kind: "unsupported", reason: "currency" });
  });
});

describe("amountInWordsKu round-trips through the parser (property)", () => {
  it.each([[50_000, "پەنجا هەزار"], [1000, "هەزار"], [1_250_000, "یەک ملیۆن و دووسەد و پەنجا هەزار"], [37_500, "سی و حەوت هەزار و پێنجسەد"]])(
    "%i -> %s", (n, w) => expect(amountInWordsKu(n)).toBe(w));
  it("every valid amount from 1,000 to 10,000,000 parses back to itself", () => {
    fc.assert(fc.property(fc.integer({ min: 4, max: 40_000 }).map((k) => k * 250), (n) => {
      expect(parseAmountKu(amountInWordsKu(n))).toEqual(ok(n));
    }), { numRuns: 3000 });
  });
  it("under 1,000 it says dinars, and the parser asks rather than guess the scale", () => {
    expect(amountInWordsKu(250)).toBe("دووسەد و پەنجا دینار");
    expect(parseAmountKu(amountInWordsKu(750))).toEqual({ kind: "ambiguous", candidates: [750, 750_000] });
  });
});

describe("Kurdish time words -> the same instant rules as Arabic", () => {
  const ok = (ms: number) => ({ kind: "ok", dueAt: ms });
  it.each([
    ["سبەی کاتژمێر ٩ی بەیانی", at(2026, 10, 16, 9)],
    ["سبەینێ سەعات 8ی ئێوارە", at(2026, 10, 16, 20)],
    ["دوای سەعاتێک", NOW + 3_600_000],
    ["سەعاتێکی تر", NOW + 3_600_000],
    ["دوو سەعاتی تر", NOW + 2 * 3_600_000],
    ["٢٠ خولەکی تر", NOW + 20 * 60_000],
    ["دوای دوو سەعات", NOW + 2 * 3_600_000],
    ["دوای نیو سەعات", NOW + 30 * 60_000],
    ["دوای ١٠ خولەک", NOW + 10 * 60_000],
    ["ڕۆژی ٢٥ کاتژمێر ١٠ی بەیانی", at(2026, 10, 25, 10)],
    ["هەینی کاتژمێر ٩ی بەیانی", at(2026, 10, 16, 9)],
    ["شەممە کاتژمێر 10:30ی بەیانی", at(2026, 10, 17, 10, 30)],
    ["دووسبەی کاتژمێر ٩ی بەیانی", at(2026, 10, 17, 9)],
    ["کۆتایی مانگ کاتژمێر ٩ی بەیانی", at(2026, 10, 31, 9)],
    ["ئەمڕۆ کاتژمێر ٩ی شەو", at(2026, 10, 15, 21)],
    ["کاتژمێر ٩ و نیوی ئێوارە", at(2026, 10, 15, 21, 30)],
    ["سبهي كاتژمير ٩ي بهياني", at(2026, 10, 16, 9)], // Arabic keyboard
    ["ڕۆژی ٢٥ی ئەم مانگە کاتژمێر دەی بەیانی", at(2026, 10, 25, 10)], // number word with izafe
  ])("%s", (t, ms) => expect(parseWhen(t, NOW)).toEqual(ok(ms)));

  it("an incomplete time is a question, never a guess", () => {
    expect(parseWhen("سبەی", NOW).kind).toBe("need_time");
    expect(parseWhen("سبەی بەیانی", NOW).kind).toBe("need_time");
    expect(parseWhen("کاتژمێر ٩", NOW)).toEqual({ kind: "need_time", prior: { hour: 9, minute: 0 } });
  });
  it("rewrites to Arabic forms", () => expect(kurdishTimeToArabic("سبەی کاتژمێر ٩ی بەیانی")).toBe("باجر ساعه 9 الصبح"));
  it("Arabic time words are untouched by the Kurdish path", () => expect(parseWhen("باچر الساعة 9 الصبح", NOW)).toEqual(ok(at(2026, 10, 16, 9))));
  it("formats the card's time in Kurdish", () => {
    expect(formatWhenKu(at(2026, 10, 16, 9))).toBe("هەینی 16/10/2026، کاتژمێر 9:00ی پێش نیوەڕۆ");
    expect(relativeKu(NOW + 3_600_000, NOW)).toBe("دوای 1 کاتژمێر");
  });
});

describe("Kurdish people, answers and phrases", () => {
  it("relation words map to the stored relations", () => {
    expect(kurdishRelation("دایکم")).toBe("ام");
    expect(kurdishRelation("براکەم")).toBe("اخ");
    expect(kurdishRelation("براكهم")).toBe("اخ"); // Arabic keyboard
    expect(kurdishRelation("خوشکەکەم")).toBe("اخت");
    expect(kurdishRelation("ئاراس")).toBeUndefined();
  });
  it("name key: Kurdish spelling of Arabic names meets the Arabic contact", () => {
    expect(kurdishNameKey("ئەحمەد عەلی")).toBe(kurdishNameKey("أحمد علي"));
    expect(kurdishNameKey("مستەفا")).toBe(kurdishNameKey("مصطفى"));
    expect(kurdishNameKey("زەینە")).toBe(kurdishNameKey("زينة"));
    expect(kurdishNameKey("زەینەب")).toBe(kurdishNameKey("زينب"));
    expect(kurdishNameKey("زەینە")).not.toBe(kurdishNameKey("زينب"));
    expect(kurdishNameKey("حەسەن")).not.toBe(kurdishNameKey("حسين"));
  });
  it("yes / no / cancel / ordinals", () => {
    for (const y of ["بەڵێ", "باشە", "ئا", "بەلی"]) expect(isYesKu(y)).toBe(true);
    for (const n of ["نا", "نەخێر"]) expect(isNoKu(n)).toBe(true);
    expect(isYesKu("نا")).toBe(false);
    expect(isCancelKu("هەڵیوەشێنەوە")).toBe(true);
    expect(isCancelKu("نامەوێ")).toBe(true);
    expect(isCancelKu("نا")).toBe(false); // a bare no answers the question
    expect(kurdishOrdinal("یەکەم")).toBe(0);
    expect(kurdishOrdinal("ئەوەی دووەم")).toBe(1);
  });
  it("same amount as last time, and schedule-this", () => {
    expect(isPreviousAmountKu("هەمان بڕی جاری پێشوو")).toBe(true);
    expect(isPreviousAmountKu("وەک جاری پێشوو")).toBe(true);
    expect(isPreviousAmountKu("پەنجا هەزار")).toBe(false);
    expect(wantsScheduleKu("خشتەی بکە")).toBe(true);
    expect(wantsScheduleKu("خشتەی بکە و پارە بنێرە")).toBe(false);
  });
});

const C = (id: string, display_name: string, phone: string, relation?: string): Contact => ({ id, display_name, phone, ...(relation ? { relation } : {}) });
const BOOK: Contact[] = [
  C("c_ahmed_ali", "أحمد علي", "07700004471"), C("c_ahmed_moh", "أحمد محمد", "07700009023"), C("c_ali_karim", "علي كريم", "07700000101"),
  C("c_hasan", "حسن", "07700000301"), C("c_husain", "حسين", "07700000302"), C("c_muhsin", "محسن", "07700000303"), C("c_zainab", "زينب", "07700000401"), C("c_zaina", "زينة", "07700000402"),
  C("c_mustafa", "مصطفى", "07700000501"), C("c_mama", "ماما", "07700000601", "ام"), C("c_karrar", "أخوي كرار", "07700000701", "اخ"),
  C("c_aras_omar", "ئاراس عومەر", "07700002001"), C("c_aras_karim", "ئاراس کەریم", "07700002002"), C("c_hemn", "هێمن", "07700002003"),
  C("c_rebaz", "ڕێباز", "07700002006"), C("c_rebwar", "ڕێبوار", "07700002007"),
];
const r = (text: string, kind: "name" | "relation" = "name", qualifier?: string) => resolveContact({ kind, text, ...(qualifier ? { qualifier } : {}) }, BOOK, { lang: "ku" });

describe("resolveContact for Kurdish mentions (ask, never guess)", () => {
  it("unique Kurdish name resolves; honorifics and affection are ignored", () => {
    expect(r("هێمن")).toMatchObject({ status: "resolved", contact: { id: "c_hemn" } });
    expect(r("کاک هێمن گیان")).toMatchObject({ status: "resolved", contact: { id: "c_hemn" } });
    expect(r("مستەفا")).toMatchObject({ status: "resolved", contact: { id: "c_mustafa" } });
    expect(r("زەینەب")).toMatchObject({ status: "resolved", contact: { id: "c_zainab" } });
  });
  it("two Arases / two Ahmeds is a question", () => {
    expect(r("ئاراس")).toMatchObject({ status: "ambiguous" });
    expect((r("ئاراس").candidates ?? []).map((c) => c.id).sort()).toEqual(["c_aras_karim", "c_aras_omar"]);
    expect((r("ئەحمەد").candidates ?? []).map((c) => c.id).sort()).toEqual(["c_ahmed_ali", "c_ahmed_moh"]);
    expect(r("ئاراس کەریم")).toMatchObject({ status: "resolved", contact: { id: "c_aras_karim" } });
    expect(r("ئاراس", "name", "کەریم")).toMatchObject({ status: "resolved", contact: { id: "c_aras_karim" } });
  });
  it("relation words reach the stored relation", () => {
    expect(r("دایکم", "relation")).toMatchObject({ status: "resolved", contact: { id: "c_mama" } });
    expect(r("براکەم", "relation")).toMatchObject({ status: "resolved", contact: { id: "c_karrar" } });
    expect(r("کەڕار")).toMatchObject({ status: "resolved", contact: { id: "c_karrar" } });
  });
  it("a near-miss only proposes (fuzzy), never resolves", () => {
    const vowelVariant = r("حەسێن");
    expect(vowelVariant.status).toBe("ambiguous");
    expect(vowelVariant.candidates?.map((c) => c.id).sort()).toEqual(["c_hasan", "c_husain"]);
    const shilan = resolveContact({ kind: "name", text: "شێلان" }, [C("s", "شیلان", "07700002004")], { lang: "ku" });
    expect(shilan).toMatchObject({ status: "fuzzy", candidates: [{ id: "s" }] });
    const x = r("ڕێبا");
    expect(["fuzzy", "ambiguous", "none"]).toContain(x.status);
    expect(r("حوسێن").status).not.toBe("resolved");
    expect(r("شێرزاد").status).toBe("none");
    expect(r("موحسین")).toMatchObject({ status: "fuzzy", candidates: [{ id: "c_muhsin" }] }); // vowels written out
    expect(r("زەینا")).toMatchObject({ status: "ambiguous" }); // close to زينب and زينة: ask which
    expect((r("زەینا").candidates ?? []).map((c) => c.id).sort()).toEqual(["c_zaina", "c_zainab"]);
    expect(r("ئاراس", "name", "كريم")).toMatchObject({ status: "resolved", contact: { id: "c_aras_karim" } }); // Arabic-keyboard surname
  });
  it("an Arabic session is unchanged: no Kurdish fallback for Arabic text", () => {
    expect(resolveContact({ kind: "name", text: "مستفى" }, BOOK).status).not.toBe("resolved");
  });
});

describe("crossCheck on Kurdish messages", () => {
  const intent = (o: Partial<Intent> & { actions: Intent["actions"] }): Intent => {
    const v = validateIntent({ status: "ok", confidence: 0.9, language: "ku", ...o });
    if (!v.ok) throw new Error(v.error);
    return v.intent;
  };
  it("Kurdish amount words pass the deterministic check", () => {
    const i = intent({ actions: [{ type: "transfer", recipient: { kind: "name", text: "هێمن" }, amount: { value: 50_000, currency: "IQD", source_text: "پەنجا هەزار" } }] });
    expect(crossCheck(i, "پەنجا هەزار بنێرە بۆ هێمن")).toEqual({ ok: true });
  });
  it("a wrong value for the Kurdish words is caught", () => {
    const i = intent({ actions: [{ type: "transfer", recipient: { kind: "name", text: "هێمن" }, amount: { value: 500_000, currency: "IQD", source_text: "پەنجا هەزار" } }] });
    expect(crossCheck(i, "پەنجا هەزار بنێرە بۆ هێمن")).toMatchObject({ ok: false, issues: [{ code: "amount_mismatch" }] });
  });
  it("a recipient the user never wrote is rejected (the model may not bring in a name)", () => {
    const i = intent({ actions: [{ type: "transfer", recipient: { kind: "name", text: "ئاراس" }, amount: { value: 50_000, currency: "IQD", source_text: "پەنجا هەزار" } }] });
    expect(crossCheck(i, "پەنجا هەزار بنێرە بۆ هێمن")).toMatchObject({ ok: false, issues: [{ code: "recipient_not_in_input" }] });
    const j = intent({ actions: [{ type: "transfer", recipient: { kind: "name", text: "أحمد" }, amount: { value: 50_000, currency: "IQD", source_text: "پەنجا هەزار" } }] });
    expect(crossCheck(j, "پەنجا هەزار بنێرە بۆ ئەحمەد")).toEqual({ ok: true }); // the Arabic spelling of what they wrote
  });
  it("«هەمان بڕی جاری پێشوو» is a valid amount reference; dollars are refused", () => {
    const i = intent({ actions: [{ type: "transfer", recipient: { kind: "relation", text: "دایکم" }, amount: null, amount_ref: { kind: "previous", source_text: "هەمان بڕی جاری پێشوو" } }] });
    expect(crossCheck(i, "هەمان بڕی جاری پێشوو بنێرە بۆ دایکم")).toEqual({ ok: true });
    const d = intent({ actions: [{ type: "transfer", recipient: { kind: "name", text: "هێمن" }, amount: null }] });
    expect(crossCheck(d, "سەد دۆلار بنێرە بۆ هێمن")).toMatchObject({ ok: false, issues: [{ code: "currency_unsupported" }] });
  });
});
