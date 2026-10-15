// Deterministic Iraqi-dialect money parser (docs/08). Pure.
// The LLM extracts `source_text`; this re-derives the value. Disagreement means ask, never guess.
import { normaliseArabic } from "./normalise";

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
for (const [prefix, v] of [["ثلاث", 3], ["تلاث", 3], ["اربع", 4], ["خمس", 5], ["ست", 6], ["سبع", 7], ["ثمن", 8], ["تمن", 8], ["ثمان", 8], ["تسع", 9]] as const)
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
  const tokens = t.replace(/[.,،:;!?"'“”()]/g, " ").split(/\s+/).filter(Boolean)
    .map((tok) => stripConj(tok, known));
  let total = 0, cur = 0, lastScale = 0, scaleUsed = false, sawNumber = false;

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
      total += (cur || 1) * 1000; cur = 0; lastScale = 1000; scaleUsed = true; sawNumber = true; continue;
    }
    if (MILLION.has(tok)) {
      if (cur === 0 && tok !== n("مليون")) return { kind: "none" };
      total += (cur || 1) * 1_000_000; cur = 0; lastScale = 1_000_000; scaleUsed = true; sawNumber = true; continue;
    }
    const tf = THOUSAND_FIXED.get(tok);
    if (tf !== undefined) { total += tf; lastScale = 1000; scaleUsed = true; sawNumber = true; continue; }
    const mf = MILLION_FIXED.get(tok);
    if (mf !== undefined) { total += mf; lastScale = 1_000_000; scaleUsed = true; sawNumber = true; continue; }
    const frac = FRACTION.get(tok);
    if (frac !== undefined) {
      const next = tokens[i + 1] === undefined ? undefined : stripConj(tokens[i + 1] as string, known);
      const ns = isScale(next);
      if (ns > 0 && cur === 0) { total += frac * ns; lastScale = ns; scaleUsed = true; sawNumber = true; i++; continue; }
      if (lastScale > 0 && cur === 0) { total += frac * lastScale; sawNumber = true; continue; }
      return { kind: "none" };
    }
    return { kind: "none" }; // unknown word: not a clean amount
  }
  if (!sawNumber) return { kind: "none" };
  return finish(total + cur, scaleUsed);
}

/** Parse the exact span the model quoted as the amount. */
export function parseAmount(raw: string): AmountParse {
  const t = normaliseArabic(raw).replace(/(\d)[٬،](?=\d)/g, "$1,"); // Arabic thousands separators
  if (!t) return { kind: "none" };
  if (CURRENCY.test(t)) return { kind: "unsupported", reason: "currency" };
  if (/\d٫\d/.test(t)) return { kind: "invalid", reason: "decimal" };
  return /\d/.test(t) ? parseNumeric(t) : parseWords(t);
}
