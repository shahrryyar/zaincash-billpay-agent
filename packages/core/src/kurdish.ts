// Central Kurdish (Sorani) for the deterministic money path (docs/08). Pure, no I/O.
// Same rule as the Iraqi-Arabic parsers: the model only COPIES the user's words (amount, time, name); this file turns
// them into numbers, instants and contacts. Anything it does not understand is a question to the user, never a guess.
// <!-- VERIFY-DIALECT --> every Kurdish word list here needs a native Sorani speaker's check before the demo.
import { normaliseDigits } from "./normalise";

const DIACRITICS = /[ً-ٰٟۖ-ۭ]/g;
/** Letters only Kurdish uses (Arabic and Iraqi-Arabic text never contains them). */
export const KURDISH_LETTERS = /[ەێۆڕڵھڤ]/;
export const hasKurdishLetters = (s: string): boolean => KURDISH_LETTERS.test(s);

/**
 * Canonical form for comparing Kurdish text, robust to Arabic keyboards: digits to ASCII, no diacritics, ي/ى→ی, ك→ک,
 * ە/ة/ھ→ه (people without a Kurdish keyboard type ه for ە), ڕ→ر, ڵ→ل, lowercase Latin, single spaces.
 * Keeps ێ and ۆ: «سێ» (3) and «سی» (30) must stay different. Idempotent.
 */
export function normaliseKurdish(s: string): string {
  let t = normaliseDigits(s.normalize("NFKC"));
  t = t.replace(DIACRITICS, "").replace(/[ـ\u200c\u200d]/g, "")
    .replace(/[أإآٱ]/g, "ا").replace(/[يى]/g, "ی").replace(/ك/g, "ک")
    .replace(/[ەةھ]/g, "ه").replace(/ڕ/g, "ر").replace(/ڵ/g, "ل");
  return t.toLowerCase().replace(/\s+/g, " ").trim();
}

const nk = normaliseKurdish;
const strip = (s: string) => s.replace(/[.,،:;!?؟"'“”()«»]/g, " ").replace(/\s+/g, " ").trim();
/** Like strip, but keeps «50,000» and «1.5» (digit separators) for the amount parser. */
const stripAmount = (s: string) => s.replace(/(?<!\d)[.,]|[.,](?!\d)/g, " ").replace(/[،:;!?؟"'“”()«»]/g, " ").replace(/\s+/g, " ").trim();

// ------------------------------------------------------------------ amounts
export type KuAmount =
  | { kind: "ok"; value: number }
  | { kind: "ambiguous"; candidates: [number, number] }
  | { kind: "unsupported"; reason: "currency" }
  | { kind: "invalid"; reason: "decimal" }
  | { kind: "none" };

const UNIT = new Map<string, number>();
const add = (words: string[], v: number) => words.forEach((w) => UNIT.set(nk(w), v));
// standard spelling first, then what Arabic keyboards and quick typing produce
add(["یەک", "یه‌ک", "yek", "yak"], 1);
add(["دوو", "دو", "du", "dû", "dw"], 2);
add(["سێ", "se", "sê"], 3);
add(["چوار", "chwar", "çwar", "cwar"], 4);
add(["پێنج", "پینج", "pênc", "penc", "pench", "penj"], 5);
add(["شەش", "شش", "shash", "şeş", "shesh"], 6);
add(["حەوت", "حوت", "hawt", "hewt"], 7);
add(["هەشت", "هشت", "hasht", "heşt", "hesht"], 8);
add(["نۆ", "نو", "nô"], 9);
add(["دە", "da", "de"], 10);
add(["یازدە", "یانزە", "yazda"], 11);
add(["دوازدە", "dwazda"], 12);
add(["سێزدە", "sêzda", "sezda"], 13);
add(["چواردە", "chwarda"], 14);
add(["پازدە", "پانزە", "pazda"], 15);
add(["شازدە", "شانزە", "shazda"], 16);
add(["حەڤدە", "حەفدە", "hevda", "havda"], 17);
add(["هەژدە", "hazhda", "hejda"], 18);
add(["نۆزدە", "nozda"], 19);
add(["بیست", "bist", "bîst"], 20);
add(["سی", "si", "sî"], 30);
add(["چل", "chil", "çil"], 40);
add(["پەنجا", "پنجا", "penja", "panja", "pence"], 50);
add(["شەست", "شست", "shast", "şest"], 60);
add(["حەفتا", "حفتا", "hafta", "hefta"], 70);
add(["هەشتا", "هشتا", "hashta", "heşta"], 80);
add(["نەوەد", "نوەد", "nawad", "newed"], 90);

const HUNDRED_ONE = new Set(["سەد", "سد", "sad", "sed"].map(nk));
const HUNDRED = new Map<string, number>();
for (const [w, v] of [["دوو", 2], ["دو", 2], ["سێ", 3], ["چوار", 4], ["پێنج", 5], ["پینج", 5], ["شەش", 6], ["حەوت", 7], ["هەشت", 8], ["نۆ", 9]] as const)
  for (const h of ["سەد", "سد"]) HUNDRED.set(nk(w + h), v * 100);
const THOUSAND = new Set(["هەزار", "هزار", "hezar", "hazar", "hezār"].map(nk));
const MILLION = new Set(["ملیۆن", "ملیون", "مليون", "milyon", "milion", "million", "melyon"].map(nk));
const HALF = new Set(["نیو", "نیوە", "niw", "nîw"].map(nk));
const QUARTER = new Set(["چارەک", "چارەکە", "charak", "çarek"].map(nk));
const FILLER = new Set(["دینار", "دیناری", "دینارێک", "عێراقی", "عیراقی", "iqd", "دع", "د.ع", "dinar", "و", "w", "u"].map(nk));
const CURRENCY = /\$|دۆلار|دولار|dolar|dollar|\busd\b|ورقه|دهفتهر/;

/** «هەزارێک», «ملیۆنێک»: the indefinite suffix; «هەزاری»: the izafe. The bare word is the number. */
function base(tok: string): string {
  for (const suf of ["ێک", "یهک", "ی"]) if (tok.length > suf.length + 1 && tok.endsWith(suf)) return tok.slice(0, -suf.length);
  return tok;
}
const isNum = (t: string) => UNIT.has(t) || HUNDRED.has(t) || HUNDRED_ONE.has(t) || THOUSAND.has(t) || MILLION.has(t) || HALF.has(t) || QUARTER.has(t);
function canon(tok: string): string {
  if (isNum(tok) || FILLER.has(tok)) return tok;
  const b = base(tok);
  if (b !== tok && (THOUSAND.has(b) || MILLION.has(b) || HUNDRED_ONE.has(b) || FILLER.has(b))) return b;
  if (tok.startsWith("و") && tok.length > 2 && isNum(tok.slice(1))) return tok.slice(1); // «وپێنج»
  return tok;
}

function finish(value: number, scaleUsed: boolean): KuAmount {
  if (!Number.isSafeInteger(value) || value <= 0) return { kind: "none" };
  if (!scaleUsed && value < 1000) return { kind: "ambiguous", candidates: [value, value * 1000] };
  return { kind: "ok", value };
}

function parseNumeric(t: string): KuAmount {
  const m = /(\d[\d.,]*\d|\d)\s*([^\s\d]+)?/.exec(t);
  if (!m) return { kind: "none" };
  const numStr = m[1] ?? "";
  const unit = m[2] ? canon(m[2]) : undefined;
  const rest = (t.slice(0, m.index) + " " + t.slice(m.index + m[0].length)).split(" ").filter(Boolean).map(canon);
  if (rest.some((w) => !FILLER.has(w))) return { kind: "none" };
  let n: number;
  if (/^\d+$/.test(numStr)) n = Number(numStr);
  else if (/^\d{1,3}([.,]\d{3})+$/.test(numStr)) n = Number(numStr.replace(/[.,]/g, ""));
  else if (/^\d+[.,]\d+$/.test(numStr)) return { kind: "invalid", reason: "decimal" };
  else return { kind: "none" };
  if (unit === undefined || FILLER.has(unit)) return finish(n, false);
  if (THOUSAND.has(unit)) return finish(n * 1000, true);
  if (MILLION.has(unit)) return finish(n * 1_000_000, true);
  return { kind: "none" };
}

function parseWords(t: string): KuAmount {
  const tokens = t.split(" ").filter(Boolean).map(canon);
  let total = 0, cur = 0, lastScale = 0, scaleUsed = false, saw = false;
  for (let i = 0; i < tokens.length; i++) {
    const tok = tokens[i] as string;
    if (FILLER.has(tok)) continue;
    const u = UNIT.get(tok), h = HUNDRED.get(tok);
    if (u !== undefined) { cur += u; saw = true; continue; }
    if (h !== undefined) { cur += h; saw = true; continue; }
    if (HUNDRED_ONE.has(tok)) { cur = cur >= 1 && cur <= 9 ? cur * 100 : cur + 100; saw = true; continue; }
    if (THOUSAND.has(tok)) { total += (cur || 1) * 1000; cur = 0; lastScale = 1000; scaleUsed = true; saw = true; continue; }
    if (MILLION.has(tok)) { total += (cur || 1) * 1_000_000; cur = 0; lastScale = 1_000_000; scaleUsed = true; saw = true; continue; }
    if (HALF.has(tok) || QUARTER.has(tok)) {
      const frac = HALF.has(tok) ? 0.5 : 0.25;
      const next = tokens[i + 1];
      const ns = next === undefined ? 0 : THOUSAND.has(next) ? 1000 : MILLION.has(next) ? 1_000_000 : 0;
      if (ns > 0 && cur === 0) { total += frac * ns; lastScale = ns; scaleUsed = true; saw = true; i++; continue; } // «نیو ملیۆن»
      if (lastScale > 0 && cur === 0) { total += frac * lastScale; saw = true; continue; } // «ملیۆن و نیو»
      return { kind: "none" };
    }
    return { kind: "none" }; // an unknown word: not a clean amount
  }
  if (!saw) return { kind: "none" };
  return finish(total + cur, scaleUsed);
}

/** Parse the exact span the model quoted as the amount, in Kurdish words, digits + «هەزار», or Latin Kurdish. */
export function parseAmountKu(raw: string): KuAmount {
  const t = stripAmount(nk(raw).replace(/(\d)[٬،](?=\d)/g, "$1,"));
  if (!t) return { kind: "none" };
  if (CURRENCY.test(t)) return { kind: "unsupported", reason: "currency" };
  if (/\d٫\d/.test(t)) return { kind: "invalid", reason: "decimal" };
  return /\d/.test(t) ? parseNumeric(t) : parseWords(t);
}

/** Dollars in a Kurdish message (refused even when the model left the amount empty). */
export const mentionsForeignCurrencyKu = (text: string): boolean => /\$|دۆلار|دولار|\bdolar|\bdollar|\busd\b/.test(nk(text));

// ------------------------------------------------------------------ amount in words (the confirmation card)
const W_UNITS = ["", "یەک", "دوو", "سێ", "چوار", "پێنج", "شەش", "حەوت", "هەشت", "نۆ"];
const W_TEENS: Record<number, string> = { 10: "دە", 11: "یازدە", 12: "دوازدە", 13: "سێزدە", 14: "چواردە", 15: "پازدە", 16: "شازدە", 17: "حەڤدە", 18: "هەژدە", 19: "نۆزدە" };
const W_TENS: Record<number, string> = { 20: "بیست", 30: "سی", 40: "چل", 50: "پەنجا", 60: "شەست", 70: "حەفتا", 80: "هەشتا", 90: "نەوەد" };
const W_HUNDREDS = ["", "سەد", "دووسەد", "سێسەد", "چوارسەد", "پێنجسەد", "شەشسەد", "حەوتسەد", "هەشتسەد", "نۆسەد"];

function below1000Ku(n: number): string {
  const parts: string[] = [];
  const h = Math.floor(n / 100), r = n % 100;
  if (h) parts.push(W_HUNDREDS[h] as string);
  if (r) {
    if (r < 10) parts.push(W_UNITS[r] as string);
    else if (r < 20) parts.push(W_TEENS[r] as string);
    else { const t = r - (r % 10), u = r % 10; parts.push(u ? `${W_TENS[t]} و ${W_UNITS[u]}` : (W_TENS[t] as string)); }
  }
  return parts.join(" و ");
}

/** Kurdish words for a positive IQD amount (multiple of 250): «پەنجا هەزار», «یەک ملیۆن و دووسەد و پەنجا هەزار». */
export function amountInWordsKu(n: number): string {
  if (!Number.isInteger(n) || n <= 0 || n % 250 !== 0) throw new RangeError(`not a valid IQD amount: ${n}`);
  const m = Math.floor(n / 1_000_000), th = Math.floor((n % 1_000_000) / 1000), rest = n % 1000;
  const parts: string[] = [];
  if (m) parts.push(`${below1000Ku(m)} ملیۆن`);
  if (th) parts.push(th === 1 ? "هەزار" : `${below1000Ku(th)} هەزار`);
  if (rest) parts.push(below1000Ku(rest));
  const words = parts.join(" و ");
  return m || th ? words : `${words} دینار`;
}

// ------------------------------------------------------------------ time words -> the Iraqi-Arabic forms parseWhen reads
const KU_NUM_FOR_TIME = new Map<string, string>([...UNIT].filter(([k, v]) => v <= 59 && !/[a-z]/.test(k)).map(([k, v]) => [k, String(v)]));
// ordered: longer phrases first. Left side in normaliseKurdish form. <!-- VERIFY-DIALECT -->
const TIME_PHRASES: [RegExp, string][] = ([
  ["(?:دوای|پاش) نیوهرۆ", "بعد الظهر"], ["نیوهرۆ", "الظهر"],
  ["دوو ?سبهی(?:نێ|نی)?", "بعد باجر"], ["سبهی(?:نێ|نی)?", "باجر"], ["sbay|sibey|sbayne", "باجر"],
  ["ئهمرۆ|ئهمرو|emro|amro", "اليوم"], ["ئهمشهو|amshaw|emşew", "الليله"],
  ["(?:کۆتایی|کوتایی|کۆتای|ئاخری|ئاخر) (?:ئهم )?مانگ(?:ه|ی)?|دوا رۆژی (?:ئهم )?مانگ(?:ه|ی)?", "اخر الشهر"], ["(?:سهرهتای|سهری|یهکی) مانگ(?:ی داهاتوو)?", "اول الشهر"],
  ["یهک ?شهممه", "الاحد"], ["دوو ?شهممه", "الاثنين"], ["سێ ?شهممه", "الثلاثاء"], ["چوار ?شهممه", "الاربعاء"], ["پێنج ?شهممه", "الخميس"],
  ["ههینی|جومعه|جمعه", "الجمعه"], ["شهممه", "السبت"],
  ["(?:سهعات|کاتژمێر)(?:ێکی|یکی) تر", "بعد ساعه"], ["(\\S+) (?:سهعات|کاتژمێر)ی? تر", "بعد $2 ساعه"], ["(\\S+) (?:خولهک|دهقیقه)ی? تر", "بعد $2 دقيقه"], ["(?:خولهک|دهقیقه)(?:ێکی|یکی) تر", "بعد دقيقه"],
  ["(\\S+) رۆژی تر", "بعد $2 يوم"], ["کهم چارهک", "الا ربع"], ["و نیوی?", "و نص"], ["و چارهکی?", "و ربع"],
  ["(?:سهعات|کاتژمێر|ساعات|کاتژمیر|saat|sa'at|katjmêr)(?:ێک|یک|ی)?", "ساعه"],
  ["(?:خولهک|دهقیقه|دهقه|xulek|daqiqa)(?:ێک|یک)?", "دقيقه"],
  ["(?:رۆژ|روژ|roj|rozh)(?:ێک|یک|ی)?", "يوم"], ["(?:ههفته|hafta)(?:یهک|ی)?", "اسبوع"],
  ["(?:بهیانی(?:ان)?|سپێده|bayani|beyanî)", "الصبح"], ["(?:ئێواره|ئێوارێ|ئیواره|ewara|êware)", "المساء"], ["عهسر", "العصر"],
  ["(?:به ?)?شهو(?:ێ|ی)?|shaw|şew", "بالليل"],
  ["دوای|پاش", "بعد"], ["نیو", "نص"], ["چارهک", "ربع"],
] as [string, string][]).map(([k, v]) => [new RegExp(`(^| )(?:${k})(?= |$)`, "g"), `$1${v}`]);

/** Kurdish time words that survive an Arabic keyboard (no Kurdish letters left). */
const KU_TIME_HINT = /(?:^| )(?:سبهی|سبهین|کاتژم|بهیانی|ئیواره|ئێواره|ههینی|شهممه|خولهک|ئهمرو|دوای|پاش|sbay|saat|bayani|ewara)/;

/** True if `text` should be read with the Kurdish time words. */
export const looksKurdishTime = (text: string): boolean => hasKurdishLetters(text) || KU_TIME_HINT.test(nk(text));

/**
 * «سبەی کاتژمێر ٩ی بەیانی» -> «باجر ساعه 9 الصبح», «دوای سەعاتێک» -> «بعد ساعه», «ڕۆژی ٢٥» -> «يوم 25».
 * The output is fed to the same tested parser as Arabic, so both languages get the same instant rules.
 */
export function kurdishTimeToArabic(text: string): string {
  let t = nk(text).replace(/[.,،;!?؟"'“”()«»]/g, " ").replace(/\s+/g, " ").trim(); // keeps «10:30» and «25/10»
  t = t.replace(/(\d+)(?:ی|ێ|هم|همین|مین)(?= |$)/g, "$1"); // «٩ی», «٢٥هم»
  for (const [re, to] of TIME_PHRASES) t = t.replace(re, to);
  // number words last, so «دوو شەممە» and «دوو سبەی» were already read as days
  return t.split(" ").map((w) => KU_NUM_FOR_TIME.get(w) ?? w).join(" ");
}

const WEEKDAY_KU = ["یەکشەممە", "دووشەممە", "سێشەممە", "چوارشەممە", "پێنجشەممە", "هەینی", "شەممە"];
const BAGHDAD = 3 * 3_600_000;

/** «هەینی 16/10/2026، کاتژمێر 9:00ی پێش نیوەڕۆ». */
export function formatWhenKu(dueAt: number): string {
  const t = new Date(dueAt + BAGHDAD);
  const h = t.getUTCHours(), h12 = h % 12 === 0 ? 12 : h % 12;
  return `${WEEKDAY_KU[t.getUTCDay()]} ${t.getUTCDate()}/${t.getUTCMonth() + 1}/${t.getUTCFullYear()}، کاتژمێر ${h12}:${String(t.getUTCMinutes()).padStart(2, "0")}ی ${h < 12 ? "پێش نیوەڕۆ" : "دوای نیوەڕۆ"}`;
}

/** «دوای 2 خولەک», «دوای 3 کاتژمێر», «دوای 4 ڕۆژ». */
export function relativeKu(dueAt: number, now: number): string {
  const mins = Math.max(1, Math.round((dueAt - now) / 60_000));
  if (mins < 60) return `دوای ${mins} خولەک`;
  const hrs = Math.round(mins / 60);
  if (hrs < 48) return `دوای ${hrs} کاتژمێر`;
  return `دوای ${Math.round(hrs / 24)} ڕۆژ`;
}

// ------------------------------------------------------------------ people
/** Kurdish relation words -> the canonical relation stored on contacts (same values as the Arabic resolver). */
const KU_RELATIONS: Record<string, string> = {};
const rel = (words: string[], to: string) => words.forEach((w) => (KU_RELATIONS[nk(w)] = to));
rel(["دایک", "دایکم", "دایە", "دایکە", "دایکی خۆم", "دایه گیان"], "ام");
rel(["باوک", "باوکم", "بابە", "بابم", "باوکە"], "اب");
rel(["برا", "براکەم", "برام", "کاکم", "براکەی خۆم"], "اخ");
rel(["خوشک", "خوشکم", "خوشکەکەم", "خوشکی خۆم"], "اخت");
rel(["خاڵ", "خاڵم", "خاڵۆ", "خاڵە"], "خال");
rel(["مام", "مامم", "مامە", "مامۆ"], "عم");
rel(["ژنەکەم", "ژنم", "هاوسەرەکەم", "هاوسەرم", "خێزانەکەم", "خێزانم"], "زوجه");
rel(["مێردەکەم", "مێردم", "پیاوەکەم"], "زوج");
rel(["کوڕەکەم", "کوڕم"], "ابن");
rel(["کچەکەم", "کچم"], "بنت");
export const kurdishRelation = (s: string): string | undefined => KU_RELATIONS[strip(nk(s))];

/** Words around a Kurdish name that never pick a person: «بۆ», honorifics, affection. */
const KU_NAME_NOISE = new Set(["بۆ", "بو", "کاک", "کاکه", "خاتوو", "خاتو", "مامۆستا", "دکتۆر", "حاجی", "گیان", "ئازیز", "ئازیزم", "هاورێکهم", "هاورێم", "دراوسێکهمان", "دراوسێمان", "برادهرهکهم", "خۆشهویستم"].map(nk));
export const kurdishNameNoise = (tok: string): boolean => KU_NAME_NOISE.has(nk(tok));

/**
 * Matching key for a name written the Kurdish way against a contact saved in Arabic or Kurdish:
 * «ئەحمەد» = «أحمد», «مستەفا» = «مصطفى», «زەینە» = «زينة». Vowel ە inside a word is dropped (Arabic does not write it),
 * a final ە is the Arabic ة/ه, initial ئ is ا, emphatic letters fold (ص→س ط→ت ض/ظ/ذ→ز ث→س), doubled letters collapse.
 * Used only as a fallback after the exact Arabic matching found nobody; fuzzy matches still only PROPOSE.
 */
export function kurdishNameKey(s: string): string {
  let t = normaliseDigits(s.normalize("NFKC")).replace(DIACRITICS, "").replace(/[ـ\u200c\u200d]/g, "");
  t = t.replace(/ە(?=[؀-ۿ])/g, "").replace(/ە/g, "ه").replace(/ھ/g, "ه")
    .replace(/ێ/g, "ي").replace(/ۆ/g, "و").replace(/ڕ/g, "ر").replace(/ڵ/g, "ل").replace(/ڤ/g, "ف")
    .replace(/(^|\s)ئ/g, "$1ا").replace(/ئ/g, "").replace(/[أإآٱ]/g, "ا").replace(/ة/g, "ه").replace(/ى/g, "ا")
    .replace(/[یي]/g, "ي").replace(/[کك]/g, "ك")
    .replace(/ص/g, "س").replace(/ط/g, "ت").replace(/[ضظذ]/g, "ز").replace(/ث/g, "س").replace(/ء/g, "").replace(/ؤ/g, "و");
  t = t.replace(/(.)\1+/g, "$1");
  return t.toLowerCase().replace(/\s+/g, " ").trim();
}

// ------------------------------------------------------------------ short answers
const kset = (w: string[]) => new Set(w.map((x) => strip(nk(x))));
const KU_YES = kset(["بەڵێ", "بەلێ", "بەلی", "ئا", "ئەرێ", "ئەری", "باشە", "ئۆکەی", "ئوکەی", "دروستە", "ڕاستە", "هەڵبەت", "بێگومان", "ba le", "bale", "belê", "basha"]);
const KU_NO = kset(["نەخێر", "نەخیر", "نا", "نە", "نەء", "na", "nexêr", "naxer"]);
const KU_CANCEL = ["هەڵیوەشێنەوە", "هەڵیبوەشێنەوە", "هەڵوەشاندنەوە", "هەڵوەشێنەوە", "پاشگەزبوومەوە", "پەشیمان بوومەوە", "ڕایگرە", "بیوەستێنە", "نامەوێ", "مەینێرە", "مەنێرە", "بەتاڵی بکەوە", "betal"].map((w) => strip(nk(w)));
export const isYesKu = (text: string): boolean => KU_YES.has(strip(nk(text)));
export const isNoKu = (text: string): boolean => KU_NO.has(strip(nk(text)));
export const isCancelKu = (text: string): boolean => {
  const c = strip(nk(text));
  return KU_CANCEL.some((s) => c === s || ` ${c} `.includes(` ${s} `));
};
const KU_ORDINALS = new Map<string, number>([["یەکەم", 0], ["یەکەمیان", 0], ["دووەم", 1], ["دووەمیان", 1], ["سێیەم", 2], ["سێهەم", 2], ["سێیەمیان", 2], ["چوارەم", 3], ["پێنجەم", 4]].map(([w, i]) => [strip(nk(w as string)), i as number]));
/** «یەکەم», «ئەوەی دووەم» -> 0, 1. */
export function kurdishOrdinal(text: string): number | undefined {
  return KU_ORDINALS.get(strip(nk(text)).replace(/^(?:ئهوهی|ئهوه|هی) /, ""));
}
/** «ئەوەی …» (the one that …) in front of a choice answer. */
export const stripKurdishChoicePrefix = (c: string): string => c.replace(/^(?:ئهوهی|ئهوه|هی|ئهوهیان) (?:ناوی )?/, "");

// ------------------------------------------------------------------ same amount as last time
const KU_PREVIOUS = /(?:^| )(?:ههمان|وهک|وهکو|وهکوو)(?: ئهو)? (?:بر|بری|پاره|پارهی|ئهندازه)|جاری (?:پێشوو|پیشوو|رابردوو|پێشتر|پیشتر|دوایی)|وهک (?:جاری|جاران|ئهوهی پێشوو)|hamaan|heman/;
/** «هەمان بڕی جاری پێشوو», «وەک جاری پێشوو». A closed list, like the Arabic one. */
export const isPreviousAmountKu = (span: string): boolean => KU_PREVIOUS.test(strip(nk(span)));

// ------------------------------------------------------------------ bills
/** Kurdish words for the billers (matching the user's words to a biller code; never shown as the bill's name). */
export const KU_BILLER_ALIASES: Record<string, string[]> = {
  electricity: ["کارەبا", "کارەبای نیشتمانی", "پسوولەی کارەبا", "karaba"],
  generator: ["مۆلیدە", "مولیدە", "مۆلیدەی گەڕەک", "ئەمپێر", "ئەمپێرەکان", "mwalida", "molida"],
  internet: ["ئینتەرنێت", "ئینتەرنێتەکە", "نێت", "وایفای", "internet"],
  water: ["ئاو", "پسوولەی ئاو", "aw"],
  mobile_topup: ["باڵانس", "کارت", "شەحن", "پڕکردنەوەی باڵانس", "balance"],
};
/** The bill's name on Kurdish screens. */
export const KU_BILLER_NAMES: Record<string, string> = {
  electricity: "کارەبا (تاقیکاری)",
  generator: "بەشداریی مۆلیدە (تاقیکاری)",
  internet: "ئینتەرنێتی نوور (تاقیکاری)",
  water: "ئاو (تاقیکاری)",
  mobile_topup: "پڕکردنەوەی باڵانس (تاقیکاری)",
};

/** «خشتەی بکە», «کاتی بۆ دابنێ»: schedule the pending card (not a new request). */
export const wantsScheduleKu = (text: string): boolean => {
  const c = strip(nk(text));
  return /^(?:و )?(?:خشته|بیخه ?سهر خشته|کاتی بۆ دابنێ|کاتی بو دابنی|دوای بخه|دوایبخه)/.test(c) && !/بنێره|بنیره|بده|پاره|حهواله|حواله/.test(c);
};
