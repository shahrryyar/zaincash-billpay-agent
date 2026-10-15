// Deterministic reading of the user's short answers during a clarification (docs/04):
// «الأول», «أحمد علي», «اللي ينتهي 4471», «اي», «لا», «الغي». No LLM involved, no new recipient can appear.
import { normaliseArabic, resolveContact, type Contact } from "@zc/core";

const set = (words: string[]) => new Set(words.map((w) => normaliseArabic(w)));
const YES = set(["اي", "إي", "ايه", "ايوه", "اكيد", "تمام", "اوكي", "اوك", "يلا", "نعم", "صح", "ok", "okay", "yes", "y"]);
const NO = set(["لا", "كلا", "لا لا", "مو", "no", "n"]);
const CANCEL_STEMS = ["الغي", "الغاء", "الغ", "بطلت", "ماريد", "وگف", "وقف", "cancel", "stop"].map((w) => normaliseArabic(w));

const clean = (text: string) => normaliseArabic(text).replace(/[.,،!؟?]/g, " ").replace(/\s+/g, " ").trim();

export const isYes = (text: string) => YES.has(clean(text));
export const isNo = (text: string) => NO.has(clean(text));
/** Strong cancel wording only. A bare «لا» is an answer to a yes/no question, not a cancel. */
export const isCancel = (text: string) => {
  const c = clean(text);
  return CANCEL_STEMS.some((s) => c === s || c.split(" ").includes(s));
};

const ORDINALS = new Map<string, number>(
  [["الاول", 0], ["اول", 0], ["الاولى", 0], ["1", 0], ["الثاني", 1], ["ثاني", 1], ["الثانيه", 1], ["2", 1], ["الثالث", 2], ["ثالث", 2], ["3", 2], ["الرابع", 3], ["4", 3], ["الخامس", 4], ["5", 4]]
    .map(([w, i]) => [normaliseArabic(w as string), i as number]),
);

export type Choice =
  | { status: "resolved"; contact: Contact }
  | { status: "ambiguous"; candidates: Contact[] }
  | { status: "none" };

/** Resolve a clarification answer against the ORIGINAL candidate set only. */
export function matchChoice(text: string, candidates: readonly Contact[]): Choice {
  const c = clean(text).replace(/^(اللي|الي|هذا|هاي|ذاك|يلي)\s+((اسمه|اسمها|اسم)\s+)?/, "");
  if (!c) return { status: "none" };
  const idx = ORDINALS.get(c);
  if (idx !== undefined) {
    const sorted = [...candidates];
    return sorted[idx] ? { status: "resolved", contact: sorted[idx] as Contact } : { status: "none" };
  }
  const digits = c.match(/\d{2,}/)?.[0];
  if (digits) {
    const hit = candidates.filter((x) => x.phone.endsWith(digits));
    return hit.length === 1 ? { status: "resolved", contact: hit[0] as Contact } : hit.length > 1 ? { status: "ambiguous", candidates: hit } : { status: "none" };
  }
  const r = resolveContact({ kind: "name", text: c }, candidates);
  if (r.status === "resolved") return { status: "resolved", contact: r.contact };
  if (r.status === "ambiguous") return { status: "ambiguous", candidates: r.candidates };
  // The candidates usually share a first name, so the answer is often a later token: «علي» for «أحمد علي».
  const tokens = c.split(" ");
  const hit = candidates.filter((x) => {
    const nameTokens = normaliseArabic(x.display_name).split(" ");
    return tokens.every((t) => nameTokens.includes(t));
  });
  if (hit.length === 1) return { status: "resolved", contact: hit[0] as Contact };
  if (hit.length > 1) return { status: "ambiguous", candidates: hit };
  return { status: "none" }; // fuzzy-only answers are not accepted as a choice
}
