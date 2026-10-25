// Offline stand-in for the model, used by the CLI/smoke --fake mode and by the web app with LLM_PROVIDER=fake.
// NOT evaluation data and not the real model: it only lets the pipeline be demonstrated without an API key.
// Any sentence not listed here gets no intent, so the machine asks the user to rephrase (fail closed).
import { normaliseArabic } from "@zc/core";
import type { Understander } from "@zc/llm";

const base = { status: "ok", confidence: 0.9, language: "ar-iq" };
const ku = { ...base, language: "ku" };
const money = (value: number, source_text: string) => ({ value, currency: "IQD", source_text });
const transfer = (text: string, amount: ReturnType<typeof money> | null, kind = "name") => ({ type: "transfer", recipient: { kind, text }, amount });
const bill = (biller: string, biller_text: string, when_text?: string) => ({ type: "bill_pay", biller, biller_text, amount: null, ...(when_text ? { when_text } : {}) });

export const DEMO_SCRIPT: Record<string, unknown> = {
  "دز خمسين ألف لأحمد": { ...base, actions: [transfer("أحمد", money(50_000, "خمسين ألف"))] },
  "دز خمسين ألف لعلي كريم": { ...base, actions: [transfer("علي كريم", money(50_000, "خمسين ألف"))] },
  "حول لأمي ميت ألف": { ...base, actions: [transfer("أمي", money(100_000, "ميت ألف"), "relation")] },
  "دز مليون لأمي": { ...base, actions: [transfer("أمي", money(1_000_000, "مليون"), "relation")] },
  "ابعث خمسين الف لحسين": { ...base, actions: [transfer("حسين", money(50_000, "خمسين الف"))] },
  "dz 25 alf l ali karim": { ...base, language: "arabizi", actions: [transfer("علي كريم", money(25_000, "25 alf"))] },
  "دز لعلي كريم": { ...base, actions: [transfer("علي كريم", null)] },
  "ادفع المولدة": { ...base, actions: [bill("generator", "المولدة")] },
  "ادفع الكهرباء": { ...base, actions: [bill("electricity", "الكهرباء")] },
  "سدد النت": { ...base, actions: [bill("internet", "النت")] },
  "ادفع الماي": { ...base, actions: [bill("water", "الماي")] },
  "ادفع المولدة باچر الساعة 9 الصبح": { ...base, actions: [bill("generator", "المولدة", "باچر الساعة 9 الصبح")] },
  "ادفع الكهرباء ودز لعلي كريم عشرة آلاف": { ...base, actions: [bill("electricity", "الكهرباء"), transfer("علي كريم", money(10_000, "عشرة آلاف"))] },
  "شكد رصيدي": { ...base, actions: [{ type: "info", query: "balance" }] },
  "شنو آخر تحويل": { ...base, actions: [{ type: "info", query: "last_transfer" }] },
  "احجزلي تكت طيارة": { ...base, status: "out_of_scope", actions: [] },
  // Kurdish (the examples on the Kurdish screen) <!-- VERIFY-DIALECT -->
  "پەنجا هەزار بنێرە بۆ ئاراس": { ...ku, actions: [transfer("ئاراس", money(50_000, "پەنجا هەزار"))] },
  "پەنجا هەزار بنێرە بۆ هێمن": { ...ku, actions: [transfer("هێمن", money(50_000, "پەنجا هەزار"))] },
  "سەد هەزار بنێرە بۆ دایکم": { ...ku, actions: [transfer("دایکم", money(100_000, "سەد هەزار"), "relation")] },
  "پسوولەی مۆلیدە بدە": { ...ku, actions: [bill("generator", "مۆلیدە")] },
  "پسوولەی کارەبا بدە": { ...ku, actions: [bill("electricity", "کارەبا")] },
  "سبەی کاتژمێر ٩ی بەیانی پسوولەی مۆلیدە بدە": { ...ku, actions: [bill("generator", "مۆلیدە", "سبەی کاتژمێر ٩ی بەیانی")] },
  "باڵانسەکەم چەندە؟": { ...ku, actions: [{ type: "info", query: "balance" }] },
  "دەمەوێت پارەدانێک خشتە بکەم": { ...ku, status: "schedule_help", actions: [] },
};

const SCRIPT_BY_KEY = new Map(Object.entries(DEMO_SCRIPT).map(([k, v]) => [normaliseArabic(k), v]));

/** An Understander that answers only the sentences above (matched after Arabic normalisation). No network, no key. */
export function createScriptedUnderstander(): Understander {
  return {
    understand: async ({ text }) => ({ raw: SCRIPT_BY_KEY.get(normaliseArabic(text)) ?? null, toolCalls: [], usage: { input: 0, output: 0 }, model: "fake (scripted demo sentences)", mode: "workflow", turns: 1, requests: 0 }),
  };
}
