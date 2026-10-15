// Offline stand-in for the model, used by the CLI's --fake mode. NOT evaluation data and not the real model:
// it only lets the pipeline be demonstrated without an API key.
const base = { status: "ok", confidence: 0.9, language: "ar-iq" };
const money = (value: number, source_text: string) => ({ value, currency: "IQD", source_text });
const transfer = (text: string, amount: ReturnType<typeof money> | null, kind = "name") => ({ type: "transfer", recipient: { kind, text }, amount });
const bill = (biller: string, biller_text: string) => ({ type: "bill_pay", biller, biller_text, amount: null });

export const DEMO_SCRIPT: Record<string, unknown> = {
  "دز خمسين ألف لأحمد": { ...base, actions: [transfer("أحمد", money(50_000, "خمسين ألف"))] },
  "دز خمسين ألف لعلي كريم": { ...base, actions: [transfer("علي كريم", money(50_000, "خمسين ألف"))] },
  "حول لأمي ميت ألف": { ...base, actions: [transfer("أمي", money(100_000, "ميت ألف"), "relation")] },
  "دز مليون لأمي": { ...base, actions: [transfer("أمي", money(1_000_000, "مليون"), "relation")] },
  "دز لعلي كريم": { ...base, actions: [transfer("علي كريم", null)] },
  "ادفع المولدة": { ...base, actions: [bill("generator", "المولدة")] },
  "ادفع الكهرباء": { ...base, actions: [bill("electricity", "الكهرباء")] },
  "ادفع الكهرباء ودز لعلي كريم عشرة آلاف": { ...base, actions: [bill("electricity", "الكهرباء"), transfer("علي كريم", money(10_000, "عشرة آلاف"))] },
  "شكد رصيدي": { ...base, actions: [{ type: "info", query: "balance" }] },
  "احجزلي تكت طيارة": { ...base, status: "out_of_scope", actions: [] },
};
