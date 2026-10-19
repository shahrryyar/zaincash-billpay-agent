// Deterministic date/time reading for scheduled payments (docs/27). Pure, no I/O.
// The model only copies the words about WHEN (`when_text`); this file turns them into one exact instant, the same way
// parseAmount turns amount words into an amount. A wrong model "date" can therefore never reach the wallet, and anything
// this parser does not understand is a question to the user, never a guess.
// Time zone: Iraq is UTC+3 all year (no daylight saving since 2008). <!-- VERIFY-DIALECT: time words -->
import { normaliseArabic } from "./normalise";
import { kurdishTimeToArabic, looksKurdishTime } from "./kurdish";

export const BAGHDAD_OFFSET_MS = 3 * 3_600_000;
export const MIN_LEAD_MS = 2 * 60_000; // a schedule must be at least 2 minutes ahead
export const MAX_LEAD_MS = 90 * 86_400_000; // and at most 90 days

export type DateParts = { y: number; m: number; d: number };
/** What a previous, incomplete answer already told us («باچر» gives the date; «9» gives the hour but not AM/PM). */
export type WhenPrior = { date?: DateParts; hour?: number; minute?: number };

export type When =
  | { kind: "ok"; dueAt: number }
  | { kind: "need_time"; prior: WhenPrior } // we know something, not enough: ask for the hour (and AM/PM)
  | { kind: "too_soon" }
  | { kind: "too_far" }
  | { kind: "unparsed" };

const DAY = 86_400_000;

function local(ms: number): { y: number; m: number; d: number; h: number; mi: number; dow: number } {
  const t = new Date(ms + BAGHDAD_OFFSET_MS);
  return { y: t.getUTCFullYear(), m: t.getUTCMonth() + 1, d: t.getUTCDate(), h: t.getUTCHours(), mi: t.getUTCMinutes(), dow: t.getUTCDay() };
}
const toUtc = (p: DateParts, h: number, mi: number): number => Date.UTC(p.y, p.m - 1, p.d, h, mi) - BAGHDAD_OFFSET_MS;
function validDate(p: DateParts): boolean {
  const t = new Date(Date.UTC(p.y, p.m - 1, p.d));
  return t.getUTCFullYear() === p.y && t.getUTCMonth() === p.m - 1 && t.getUTCDate() === p.d;
}
const addDays = (p: DateParts, n: number): DateParts => {
  const t = new Date(Date.UTC(p.y, p.m - 1, p.d) + n * DAY);
  return { y: t.getUTCFullYear(), m: t.getUTCMonth() + 1, d: t.getUTCDate() };
};
const lastDayOf = (y: number, m: number): number => new Date(Date.UTC(y, m, 0)).getUTCDate();

const prep = (text: string): string =>
  normaliseArabic(text).replace(/چ/g, "ج").replace(/گ/g, "ك").replace(/[،,؛;!؟?]/g, " ").replace(/\s+/g, " ").trim();

const NUM_WORDS: Record<string, number> = {
  واحد: 1, وحده: 1, اثنين: 2, اثنان: 2, ثنين: 2, ثلاث: 3, ثلاثه: 3, اربع: 4, اربعه: 4, خمس: 5, خمسه: 5, ست: 6, سته: 6,
  سبع: 7, سبعه: 7, ثمان: 8, ثمانيه: 8, تسع: 9, تسعه: 9, عشر: 10, عشره: 10, خمسطعش: 15, عشرين: 20, ثلاثين: 30, اربعين: 40, خمسين: 50,
};
const WEEKDAYS: Record<string, number> = { الاحد: 0, الاثنين: 1, الاتنين: 1, الثلاثاء: 2, الاربعاء: 3, الخميس: 4, الجمعه: 5, السبت: 6 };

/** «بعد ساعة», «بعد 10 دقايق», «بعد يومين», «بعد نص ساعة». Returns a delay in ms, or null. */
function parseRelative(s: string): number | null {
  const m = /(?:^| )بعد ((?:[^ ]+ ){0,2}?)(دقيق\S*|دقايق|دقائق|ساع\S*|يوم\S*|ايام|اسبوع\S*|اسابيع|شهر\S*)(?: |$)/.exec(s);
  if (!m) return null;
  const qty = (m[1] ?? "").trim();
  const unitWord = m[2] as string;
  let unitMs: number, dual = false;
  if (/^دقيق|^دقايق|^دقائق/.test(unitWord)) { unitMs = 60_000; dual = /تين$|ين$/.test(unitWord); }
  else if (/^ساع/.test(unitWord)) { unitMs = 3_600_000; dual = /تين$|ين$/.test(unitWord); }
  else if (/^يوم|^ايام/.test(unitWord)) { unitMs = DAY; dual = /ين$/.test(unitWord); }
  else if (/^اسبوع|^اسابيع/.test(unitWord)) { unitMs = 7 * DAY; dual = /ين$/.test(unitWord); }
  else return null; // months are not supported: ask for a date
  if (qty === "") return (dual ? 2 : 1) * unitMs;
  if (/^(نص|نصف)$/.test(qty) && unitMs === 3_600_000) return 30 * 60_000;
  if (qty === "ربع" && unitMs === 3_600_000) return 15 * 60_000;
  const digits = /^(\d{1,6})$/.exec(qty);
  if (digits) return Number(digits[1]) * unitMs;
  const word = NUM_WORDS[qty];
  if (word) return word * unitMs;
  return null;
}

const AM = /(?:^| )(?:ال)?(?:صبح|صباحا|صباح|فجر|فجرا)(?: |$)/;
const NIGHT = /(?:^| )(?:ال|ها)?(?:ليل|ليله|بالليل|ليلا)(?: |$)/;
const NOON = /(?:^| )(?:ال)?(?:ظهر|ظهرا|بعد الظهر)(?: |$)/;
const PM = /(?:^| )(?:ال)?(?:مساء|عصر|عصرا|مغرب)(?: |$)/;
type Meridiem = "am" | "noon" | "pm" | "night";
const meridiemOf = (s: string): Meridiem | undefined => (AM.test(s) ? "am" : NIGHT.test(s) ? "night" : NOON.test(s) ? "noon" : PM.test(s) ? "pm" : undefined);

type Clock = { hour: number; minute: number; meridiem?: Meridiem; clear: boolean };

/** Pull an hour/minute out of the text. `clear` = the 24h value is certain (21:00, 13, 0:30). */
function parseClock(s: string, bareHour = false): Clock | null {
  const mer = meridiemOf(s);
  let h: number | undefined, mi = 0, m: RegExpExecArray | null;
  if ((m = /(\d{1,2}):(\d{2})/.exec(s))) { h = Number(m[1]); mi = Number(m[2]); }
  else if ((m = /(?:^| )(?:الساع\S*|ساع\S*) ?(\d{1,2})(?: و ?(نص|نصف|ربع|ثلث)| ?الا ?(ربع|ثلث)| و ?(\d{1,2}) ?دقيق\S*)?/.exec(s))) {
    h = Number(m[1]);
    if (m[2]) mi = m[2] === "ربع" ? 15 : m[2] === "ثلث" ? 20 : 30;
    else if (m[3]) { mi = m[3] === "ربع" ? 45 : 40; h = h - 1; }
    else if (m[4]) mi = Number(m[4]);
  } else if ((m = /(?:^| )(\d{1,2})(?: و ?(نص|نصف|ربع))? ?(?:ال)?(?:صبح|صباحا|صباح|مساء|بالليل|ليل|ليلا|عصر|عصرا|ظهر|ظهرا|مغرب|فجر)/.exec(s))) {
    h = Number(m[1]);
    if (m[2]) mi = m[2] === "ربع" ? 15 : 30;
  } else if (bareHour && (m = /^(\d{1,2})(?: و ?(نص|نصف|ربع))?$/.exec(s))) {
    // the question was «الساعة شكد؟», so a bare «9» or «9 ونص» is the hour
    h = Number(m[1]);
    if (m[2]) mi = m[2] === "ربع" ? 15 : 30;
  } else if (NOON.test(s) && !/\d/.test(s)) {
    return { hour: 12, minute: 0, meridiem: "noon", clear: true };
  }
  if (h === undefined || h < 0 || h > 24 || mi < 0 || mi > 59) return null;
  if (h === 24) h = 0;
  return { hour: h, minute: mi, ...(mer ? { meridiem: mer } : {}), clear: h === 0 || h >= 13 };
}

/** 12-hour value + marker to 24h. Null = still ambiguous (needs AM/PM): «9» alone, «12 بالليل». */
function to24(hour: number, meridiem: Meridiem | undefined, clear: boolean): number | null {
  if (clear) return hour;
  switch (meridiem) {
    case "am": return hour === 12 ? 0 : hour;
    case "noon": return hour === 12 ? 12 : hour >= 1 && hour <= 6 ? hour + 12 : hour === 10 || hour === 11 ? hour : null;
    case "pm": return hour === 12 ? 12 : hour + 12;
    case "night": return hour >= 6 && hour <= 11 ? hour + 12 : null; // «9 بالليل» = 21:00; «12 بالليل» / «2 بالليل» are ambiguous
    default: return null;
  }
}

function parseDate(s: string, now: number): { date?: DateParts; weekday?: number; dom?: number; edge?: "end" | "start" } {
  const t = local(now);
  const today: DateParts = { y: t.y, m: t.m, d: t.d };
  if (/(?:^| )بعد (?:باجر|باكر|بكره|بكرا|غد|غدا)(?: |$)/.test(s)) return { date: addDays(today, 2) };
  if (/(?:^| )(?:باجر|باكر|بكره|بكرا|غدا|غدوه)(?: |$)/.test(s)) return { date: addDays(today, 1) };
  if (/(?:^| )(?:اليوم|هاليوم|الليله|هاليله)(?: |$)/.test(s)) return { date: today };
  let m: RegExpExecArray | null;
  if ((m = /(?:^| )(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})(?: |$)/.exec(s))) {
    const y = Number(m[3]) < 100 ? 2000 + Number(m[3]) : Number(m[3]);
    const p = { y, m: Number(m[2]), d: Number(m[1]) };
    return validDate(p) ? { date: p } : {};
  }
  if ((m = /(?:^| )(\d{1,2})[/-](\d{1,2})(?: |$)/.exec(s))) {
    const d = Number(m[1]), mo = Number(m[2]);
    let p = { y: t.y, m: mo, d };
    if (!validDate(p)) return {};
    if (toUtc(p, 23, 59) < now) p = { y: t.y + 1, m: mo, d };
    return validDate(p) ? { date: p } : {};
  }
  if (/(?:^| )(?:اخر|نهايه|اخر يوم من) (?:ال)?شهر(?: |$)/.test(s)) return { edge: "end" };
  if (/(?:^| )(?:اول|بدايه) (?:يوم من )?(?:ال)?شهر(?: |$)/.test(s)) return { edge: "start" };
  for (const [w, idx] of Object.entries(WEEKDAYS)) {
    if (new RegExp(`(?:^| )(?:يوم |ل|ب)?${w}(?: |$)`).test(s)) return { weekday: idx };
  }
  if ((m = /(?:^| )(?:يوم|بتاريخ|تاريخ|ليوم) ?(\d{1,2})(?![\d:/])/.exec(s)) || (m = /(?:^| )(\d{1,2}) من (?:هذا |ها)?(?:ال)?شهر/.exec(s))) {
    const d = Number(m[1]);
    return d >= 1 && d <= 31 ? { dom: d } : {};
  }
  return {};
}

function check(dueAt: number, now: number): When {
  if (dueAt < now + MIN_LEAD_MS) return { kind: "too_soon" };
  if (dueAt > now + MAX_LEAD_MS) return { kind: "too_far" };
  return { kind: "ok", dueAt };
}

/**
 * Read «باچر الساعة 9 الصبح», «بعد ساعة», «يوم 25 الساعة 8 المساء», «الجمعة 10:30» ... relative to `now` (epoch ms).
 * `prior` carries what an earlier incomplete answer already gave.
 */
export function parseWhen(text: string, now: number, prior: WhenPrior = {}, opts: { bareHour?: boolean } = {}): When {
  const s = prep(looksKurdishTime(text) ? kurdishTimeToArabic(text) : text); // Kurdish words are read by the same rules
  if (!s) return { kind: "unparsed" };
  const t = local(now);
  const today: DateParts = { y: t.y, m: t.m, d: t.d };
  const clock = parseClock(s, opts.bareHour === true);

  let relDate: DateParts | undefined;
  if (prior.date === undefined && prior.hour === undefined) {
    const rel = parseRelative(s);
    if (rel !== null) {
      // «بعد ساعة» / «بعد 10 دقايق»: an exact delay. «بعد يومين الساعة 9»: a date plus a clock.
      if (!(rel >= DAY && clock)) return check(now + rel, now);
      relDate = addDays(today, Math.round(rel / DAY));
    }
  }

  const d = parseDate(s, now);
  let hour: number | null = null, minute = prior.minute ?? 0, hourHint = prior.hour;
  if (clock) {
    minute = clock.minute;
    hour = to24(clock.hour, clock.meridiem, clock.clear);
    if (hour === null) hourHint = clock.hour;
  } else if (prior.hour !== undefined) {
    const mer = meridiemOf(s);
    if (mer) hour = to24(prior.hour, mer, false);
  }
  const known = hour !== null;

  let date: DateParts | undefined = relDate ?? d.date ?? prior.date;
  if (!date && d.edge === "end") date = { y: t.y, m: t.m, d: lastDayOf(t.y, t.m) };
  if (!date && d.edge === "start") date = { ...(t.m === 12 ? { y: t.y + 1, m: 1 } : { y: t.y, m: t.m + 1 }), d: 1 };
  if (!date && d.weekday !== undefined) {
    for (let off = known ? 0 : 1; off <= 7 && !date; off++) {
      const cand = addDays(today, off);
      if (new Date(Date.UTC(cand.y, cand.m - 1, cand.d)).getUTCDay() !== d.weekday) continue;
      if (known && toUtc(cand, hour as number, minute) < now + MIN_LEAD_MS) continue;
      date = cand;
    }
  }
  if (!date && d.dom !== undefined) {
    for (let k = 0; k < 4 && !date; k++) {
      const cand = { y: t.y + Math.floor((t.m - 1 + k) / 12), m: ((t.m - 1 + k) % 12) + 1, d: d.dom };
      if (!validDate(cand)) continue;
      if (known) { if (toUtc(cand, hour as number, minute) >= now + MIN_LEAD_MS) date = cand; }
      else if (toUtc(cand, 23, 59) >= now) date = cand; // today counts: the hour is asked next
    }
    if (!date) return { kind: "unparsed" };
  }
  if (!date && known) {
    // only a time of day: its next occurrence
    date = toUtc(today, hour as number, minute) >= now + MIN_LEAD_MS ? today : addDays(today, 1);
  }

  if (date && known) return check(toUtc(date, hour as number, minute), now);
  if (date || hourHint !== undefined) {
    return { kind: "need_time", prior: { ...(date ? { date } : {}), ...(hourHint !== undefined ? { hour: hourHint } : {}), minute } };
  }
  return { kind: "unparsed" };
}

const WEEKDAY_AR = ["الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"];

/** «الجمعة 17/10/2026، الساعة 9:00 صباحاً». The confirmation card shows this so a wrong date is visible. */
export function formatWhenAr(dueAt: number): string {
  const t = local(dueAt);
  const h12 = t.h % 12 === 0 ? 12 : t.h % 12;
  const part = t.h < 12 ? "صباحاً" : "مساءً";
  return `${WEEKDAY_AR[t.dow]} ${t.d}/${t.m}/${t.y}، الساعة ${h12}:${String(t.mi).padStart(2, "0")} ${part}`;
}

/** «بعد دقيقتين», «بعد 3 دقائق», «بعد 15 دقيقة», «بعد ساعتين», «بعد 3 أيام». Arabic number agreement: 1, 2, 3-10 (plural), 11+ (singular). */
export function relativeAr(dueAt: number, now: number): string {
  const unit = (n: number, one: string, two: string, plural: string, many: string): string =>
    n === 1 ? `بعد ${one}` : n === 2 ? `بعد ${two}` : n <= 10 ? `بعد ${n} ${plural}` : `بعد ${n} ${many}`;
  const mins = Math.max(1, Math.round((dueAt - now) / 60_000));
  if (mins < 60) return unit(mins, "دقيقة", "دقيقتين", "دقائق", "دقيقة");
  const hrs = Math.round(mins / 60);
  if (hrs < 48) return unit(hrs, "ساعة", "ساعتين", "ساعات", "ساعة");
  return unit(Math.round(hrs / 24), "يوم", "يومين", "أيام", "يوم");
}
