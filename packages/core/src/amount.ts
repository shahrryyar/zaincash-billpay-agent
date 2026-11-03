// Deterministic Iraqi-dialect money parser (docs/08). Pure.
// The LLM extracts `source_text`; this re-derives the value. Disagreement means ask, never guess.
import { normaliseArabic } from "./normalise";
import { isAmountTokenKu, mentionsForeignCurrencyKu, parseAmountKu } from "./kurdish";

export type AmountParse =
  | { kind: "ok"; value: number }
  | { kind: "ambiguous"; candidates: [number, number] } // e.g. «خمسة وعشرين» -> 25 or 25,000
  | { kind: "unsupported"; reason: "currency" } // dollars, ورقة, دفتر
  | { kind: "invalid"; reason: "decimal" }
  | { kind: "none" };

const CURRENCY = /\$|دولار|\busd\b|ورقه|دفتر/;
const FILLER = new Set(["دينار", "دنانير", "عراقي", "عراقيه", "iqd", "دع", "فد", "و"]);

// ---- lexicon (spellings go through normaliseArabic so they can be written naturally)
const UNIT = new Map<string, number>();
const HUNDRED = new Map<string, number>(); // fixed hundreds (100, 200, 300...)
const n = normaliseArabic;
const add = (m: Map<string, number>, words: string[], v: number) => words.forEach((w) => m.set(n(w), v));

add(UNIT, ["واحد", "وحدة"], 1);
add(UNIT, ["اثنين", "ثنين", "اثنان"], 2);
add(UNIT, ["ثلاثة", "ثلاث", "تلاثة", "تلاث"], 3);
add(UNIT, ["اربعة", "اربع", "أربعة", "أربع"], 4);
add(UNIT, ["خمسة", "خمس"], 5);
add(UNIT, ["ستة", "ست"], 6);
add(UNIT, ["سبعة", "سبع"], 7);
add(UNIT, ["ثمانية", "ثمان", "تمانية", "تمان", "ثمنية", "تمنية"], 8);
add(UNIT, ["تسعة", "تسع"], 9);
add(UNIT, ["عشرة", "عشر"], 10);
// teens <!-- VERIFY-DIALECT -->
add(UNIT, ["احدعش", "احداعش", "إحدى عشر"], 11);
add(UNIT, ["اثنعش", "اثناعش", "طنعش", "اطنعش"], 12);
add(UNIT, ["ثلاثطعش", "تلطعش", "ثلطعش"], 13);
add(UNIT, ["اربعطعش", "اربعتعش"], 14);
add(UNIT, ["خمسطعش", "خمستعش"], 15);
add(UNIT, ["ستطعش", "ستتعش"], 16);
add(UNIT, ["سبعطعش", "سبعتعش"], 17);
add(UNIT, ["ثمنطعش", "ثمانطعش", "تمنطعش"], 18);
add(UNIT, ["تسعطعش", "تسعتعش"], 19);
add(UNIT, ["عشرين"], 20);
add(UNIT, ["ثلاثين", "تلاثين"], 30);
add(UNIT, ["اربعين"], 40);
add(UNIT, ["خمسين"], 50);
add(UNIT, ["ستين"], 60);
add(UNIT, ["سبعين"], 70);
add(UNIT, ["ثمانين", "تمانين"], 80);
add(UNIT, ["تسعين"], 90);

const HUNDRED_WORDS = ["مية", "ميت", "مئة", "مائة"]; // all normalise to ميه / ميت / مايه
const HUNDRED_ONE = new Set(HUNDRED_WORDS.map(n));
add(HUNDRED, ["ميتين", "مئتين", "مائتين"], 200);
for (const [prefix, v] of [["ثلاث", 3], ["تلاث", 3], ["ثلث", 3], ["تلث", 3], ["اربع", 4], ["خمس", 5], ["ست", 6], ["سبع", 7], ["ثمن", 8], ["تمن", 8], ["ثمان", 8], ["تسع", 9]] as const)
  for (const suffix of HUNDRED_WORDS) HUNDRED.set(n(prefix + suffix), v * 100);

const THOUSAND = new Set(["الف", "الاف", "آلاف"].map(n));
const THOUSAND_FIXED = new Map([[n("الفين"), 2000]]);
const MILLION = new Set(["مليون", "ملايين"].map(n));
const MILLION_FIXED = new Map([[n("مليونين"), 2_000_000]]);
const FRACTION = new Map([[n("ربع"), 0.25], [n("نص"), 0.5], [n("نصف"), 0.5]]);

const isScale = (t: string | undefined): number =>
  t === undefined ? 0 : THOUSAND.has(t) ? 1000 : MILLION.has(t) ? 1_000_000 : 0;

function stripConj(tok: string, known: (t: string) => boolean): string {
  if (!known(tok) && tok.startsWith("و") && tok.length > 1 && known(tok.slice(1))) return tok.slice(1);
  return tok;
}

const known = (t: string) =>
  UNIT.has(t) || HUNDRED.has(t) || HUNDRED_ONE.has(t) || THOUSAND.has(t) || THOUSAND_FIXED.has(t) ||
  MILLION.has(t) || MILLION_FIXED.has(t) || FRACTION.has(t) || FILLER.has(t);

function finish(value: number, scaleUsed: boolean): AmountParse {
  if (!Number.isSafeInteger(value) || value <= 0) return { kind: "none" };
  if (!scaleUsed && value < 1000) return { kind: "ambiguous", candidates: [value, value * 1000] };
  return { kind: "ok", value };
}

const NUMERIC = /(\d[\d.,]*\d|\d)\s*(k|alf|الف|الاف|مليون|million)?(?![\p{L}])/u;

function parseNumeric(t: string): AmountParse {
  const m = NUMERIC.exec(t);
  if (!m) return { kind: "none" };
  const numStr = m[1] ?? "";
  const unit = m[2];
  const rest = (t.slice(0, m.index) + " " + t.slice(m.index + m[0].length))
    .replace(/[.,،:;!?"'“”()]/g, " ").split(/\s+/).filter(Boolean);
  if (rest.some((w) => !FILLER.has(w))) return { kind: "none" };

  let base: number;
  if (/^\d+$/.test(numStr)) base = Number(numStr);
  else if (/^\d{1,3}([.,]\d{3})+$/.test(numStr)) base = Number(numStr.replace(/[.,]/g, ""));
  else if (/^\d+[.,]\d+$/.test(numStr)) return { kind: "invalid", reason: "decimal" };
  else return { kind: "none" };

  const mult = unit === undefined ? 0 : unit === "مليون" || unit === "million" ? 1_000_000 : 1000;
  return finish(base * (mult || 1), mult > 0);
}

function parseWords(t: string): AmountParse {
  const raw = t.replace(/[.,،:;!?"'“”()]/g, " ").split(/\s+/).filter(Boolean);
  const tokens = raw.map((tok) => stripConj(tok, known));
  // «مليون والف» = 1,001,000, but «الف مليون», «نص مليون الف», «خمسين الف خمسين الف» (an ASR repeat) are not amounts:
  // each scale must be smaller than the one before it, and a bare scale right after another one needs its «و».
  const conj = raw.map((tok, i) => tok === "و" || tok !== tokens[i] || raw[i - 1] === "و");
  let total = 0, cur = 0, lastScale = 0, scaleUsed = false, sawNumber = false;
  const scaleOk = (scale: number, i: number): boolean =>
    lastScale === 0 || (scale < lastScale && (cur > 0 || conj[i] === true));

  for (let i = 0; i < tokens.length; i++) {
    const tok = tokens[i] as string;
    if (FILLER.has(tok)) continue;
    const unit = UNIT.get(tok);
    const hundredFixed = HUNDRED.get(tok);
    if (unit !== undefined) { cur += unit; sawNumber = true; continue; }
    if (hundredFixed !== undefined) { cur += hundredFixed; sawNumber = true; continue; }
    if (HUNDRED_ONE.has(tok)) {
      cur = cur >= 1 && cur <= 9 ? cur * 100 : cur + 100;
      sawNumber = true; continue;
    }
    if (THOUSAND.has(tok)) {
      if (cur === 0 && tok !== n("الف")) return { kind: "none" };
      if (!scaleOk(1000, i)) return { kind: "none" };
      total += (cur || 1) * 1000; cur = 0; lastScale = 1000; scaleUsed = true; sawNumber = true; continue;
    }
    if (MILLION.has(tok)) {
      if (cur === 0 && tok !== n("مليون")) return { kind: "none" };
      if (!scaleOk(1_000_000, i)) return { kind: "none" };
      total += (cur || 1) * 1_000_000; cur = 0; lastScale = 1_000_000; scaleUsed = true; sawNumber = true; continue;
    }
    const tf = THOUSAND_FIXED.get(tok);
    if (tf !== undefined) { if (!scaleOk(1000, i)) return { kind: "none" }; total += tf; lastScale = 1000; scaleUsed = true; sawNumber = true; continue; }
    const mf = MILLION_FIXED.get(tok);
    if (mf !== undefined) { if (!scaleOk(1_000_000, i)) return { kind: "none" }; total += mf; lastScale = 1_000_000; scaleUsed = true; sawNumber = true; continue; }
    const frac = FRACTION.get(tok);
    if (frac !== undefined) {
      const next = tokens[i + 1] === undefined ? undefined : stripConj(tokens[i + 1] as string, known);
      const ns = isScale(next);
      if (ns > 0 && cur === 0) {
        if (!scaleOk(ns, i)) return { kind: "none" }; // «الف ونص مليون»
        total += frac * ns; lastScale = ns; scaleUsed = true; sawNumber = true; i++; continue;
      }
      if (lastScale > 0 && cur === 0) { total += frac * lastScale; sawNumber = true; continue; }
      return { kind: "none" };
    }
    return { kind: "none" }; // unknown word: not a clean amount
  }
  if (!sawNumber) return { kind: "none" };
  return finish(total + cur, scaleUsed);
}

// Arabizi money words (Latin letters, digits for Arabic sounds: 9 = ص, 3 = ع). <!-- VERIFY-DIALECT: spellings -->
const ARABIZI_WORDS: [RegExp, string][] = [
  [/(^|\s)(?:no9|nos|nuss|nus|nsf)(?=\s|$)/g, "$1نص"],
  [/(^|\s)(?:rob3|rub3|rubu3|robo3|roba3|ruba3|rba3|rbu3|rub3a)(?=\s|$)/g, "$1ربع"],
  [/(^|\s)(?:melyon|milyon|mlyon|milion|meliyon|melion)(?=\s|$)/g, "$1مليون"],
  [/(^|\s)(?:mya|miya|meya|miyya)(?=\s|$)/g, "$1ميه"],
];
const arabizi = (t: string): string => ARABIZI_WORDS.reduce((a, [re, to]) => a.replace(re, to), t);

// Whole-message check: dollars and their street names («ورقة» = $100, «دفتر» = $10,000). Used for transfers even when the
// model left the amount empty, because it cannot write a dollar amount as IQD. <!-- VERIFY-DIALECT -->
const FOREIGN = /\$|دولار|\busd\b|(?:^|\s|ل)(?:ورقه|ورقتين|اوراق|دفتر|دفترين|دفاتر)(?=\s|$|[.,،!؟?])/;
export const mentionsForeignCurrency = (text: string): boolean => FOREIGN.test(normaliseArabic(text)) || mentionsForeignCurrencyKu(text);

const NUMBER_WORD = (t: string) =>
  UNIT.has(t) || HUNDRED.has(t) || HUNDRED_ONE.has(t) || THOUSAND.has(t) || THOUSAND_FIXED.has(t) || MILLION.has(t) || MILLION_FIXED.has(t) || FRACTION.has(t);
/**
 * True if one whitespace token of the user's message is (part of) an amount: digits («250», «1,500», «50k»), a number,
 * scale or fraction word, the same with «و» («وخمسين», «ونص»), Arabizi («nus», «alf») or Kurdish («پەنجا», «هەزار»).
 * crossCheck uses it to see that the model's amount span is the whole amount, not «50 الف» out of «250 الف».
 * A phone number (10+ digits) is not an amount.
 */
export function isAmountToken(tok: string): boolean {
  const t = arabizi(normaliseArabic(tok)).replace(/^[.,،:;!?"'“”()«»]+|[.,،:;!?"'“”()«»]+$/g, "");
  if (!t) return false;
  const d = /^[وبل]*(\d[\d.,٬،]*)(k|alf|الف|الاف|مليون|million)?$/.exec(t);
  if (d) return (d[1] as string).replace(/\D/g, "").length <= 9;
  if (/^(?:k|alf|million)$/.test(t)) return true;
  return NUMBER_WORD(t) || (t.startsWith("و") && NUMBER_WORD(t.slice(1))) || isAmountTokenKu(tok);
}

/** Parse the exact span the model quoted as the amount: Iraqi Arabic first, then Kurdish (Sorani) words. */
export function parseAmount(raw: string): AmountParse {
  const ar = parseAmountAr(raw);
  return ar.kind === "none" ? parseAmountKu(raw) : ar;
}

function parseAmountAr(raw: string): AmountParse {
  const t = arabizi(normaliseArabic(raw)).replace(/(\d)[٬،](?=\d)/g, "$1,"); // Arabic thousands separators
  if (!t) return { kind: "none" };
  if (CURRENCY.test(t)) return { kind: "unsupported", reason: "currency" };
  if (/\d٫\d/.test(t)) return { kind: "invalid", reason: "decimal" };
  return /\d/.test(t) ? parseNumeric(t) : parseWords(t);
}
