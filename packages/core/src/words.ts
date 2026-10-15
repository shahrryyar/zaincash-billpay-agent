// Amount display for the confirmation card: digits AND Iraqi words (catches a wrong zero).
// Round-trips through parseAmount (property-tested). <!-- VERIFY-DIALECT: spellings -->
import { SMALLEST_UNIT_IQD } from "./schema";

const UNITS = ["", "واحد", "اثنين", "ثلاثة", "اربعة", "خمسة", "ستة", "سبعة", "ثمانية", "تسعة"];
const TEENS: Record<number, string> = { 10: "عشرة", 11: "احدعش", 12: "اثنعش", 13: "ثلاثطعش", 14: "اربعطعش", 15: "خمسطعش", 16: "ستطعش", 17: "سبعطعش", 18: "ثمنطعش", 19: "تسعطعش" };
const TENS: Record<number, string> = { 20: "عشرين", 30: "ثلاثين", 40: "اربعين", 50: "خمسين", 60: "ستين", 70: "سبعين", 80: "ثمانين", 90: "تسعين" };
const HUNDREDS: Record<number, string> = { 1: "مية", 2: "ميتين", 3: "ثلاثمية", 4: "اربعمية", 5: "خمسمية", 6: "ستمية", 7: "سبعمية", 8: "ثمنمية", 9: "تسعمية" };

/** 1..999 as Iraqi words. */
function below1000(n: number): string {
  const parts: string[] = [];
  const h = Math.floor(n / 100), rest = n % 100;
  if (h) parts.push(HUNDREDS[h] as string);
  if (rest) {
    if (rest < 10) parts.push(UNITS[rest] as string);
    else if (rest < 20) parts.push(TEENS[rest] as string);
    else {
      const t = rest - (rest % 10), u = rest % 10;
      parts.push(u ? `${UNITS[u]} و${TENS[t]}` : (TENS[t] as string));
    }
  }
  // join hundreds and the rest with «و»
  return parts.length === 2 ? `${parts[0]} و${parts[1]}` : (parts[0] ?? "");
}

function scaled(n: number, one: string, two: string, plural: string, big: string): string {
  if (n === 1) return one;
  if (n === 2) return two;
  if (n >= 3 && n <= 10) return `${below1000(n)} ${plural}`;
  return `${below1000(n)} ${big}`;
}

/** Iraqi words for a positive IQD amount that is a multiple of 250. */
export function amountInWords(n: number): string {
  if (!Number.isInteger(n) || n <= 0 || n % SMALLEST_UNIT_IQD !== 0) throw new RangeError(`not a valid IQD amount: ${n}`);
  const millions = Math.floor(n / 1_000_000);
  const thousands = Math.floor((n % 1_000_000) / 1000);
  const rest = n % 1000;
  const parts: string[] = [];
  if (millions) parts.push(scaled(millions, "مليون", "مليونين", "ملايين", "مليون"));
  if (thousands) parts.push(scaled(thousands, "الف", "الفين", "الاف", "الف"));
  if (rest) parts.push(below1000(rest));
  // 250 and 500 alone are written with the ALF fraction words so they parse unambiguously
  if (!millions && !thousands) return rest === 250 ? "ربع الف" : rest === 500 ? "نص الف" : below1000(rest);
  return parts.map((p, i) => (i === 0 ? p : `و${p}`)).join(" ");
}

const AR_DIGITS = "٠١٢٣٤٥٦٧٨٩";

/** «50,000 د.ع» (Western digits, default) or «٥٠٬٠٠٠ د.ع». One digit style per session (docs/15). */
export function formatIQD(n: number, digits: "western" | "arabic-indic" = "western"): string {
  const western = n.toLocaleString("en-US");
  if (digits === "western") return `${western} د.ع`;
  const out = western.replace(/\d/g, (d) => AR_DIGITS[Number(d)] as string).replace(/,/g, "٬");
  return `${out} د.ع`;
}
