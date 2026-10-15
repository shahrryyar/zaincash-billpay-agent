// Arabic / digit normalisation. Pure, no I/O. Used for matching and amount parsing.

const ARABIC_INDIC = "٠١٢٣٤٥٦٧٨٩";
const PERSIAN = "۰۱۲۳۴۵۶۷۸۹";

/** Arabic-Indic and Persian digits to ASCII. Everything else untouched. */
export function normaliseDigits(s: string): string {
  return s.replace(/[٠-٩۰-۹]/g, (ch) => {
    const a = ARABIC_INDIC.indexOf(ch);
    return String(a >= 0 ? a : PERSIAN.indexOf(ch));
  });
}

const DIACRITICS = /[ً-ٰٟۖ-ۭ]/g;

/**
 * Canonical form for comparing Arabic text:
 * digits to ASCII, no diacritics/tatweel, أإآٱ→ا, ة→ه, ى→ي, ؤ→و, ئ→ي,
 * Persian ی→ي and ک→ك, lowercase Latin, single spaces.
 * Idempotent. Note: «عبد الله» and «عبدالله» are NOT merged here; the resolver handles that.
 */
export function normaliseArabic(s: string): string {
  let t = normaliseDigits(s.normalize("NFKC"));
  t = t
    .replace(DIACRITICS, "")
    .replace(/ـ/g, "")
    .replace(/[أإآٱ]/g, "ا")
    .replace(/ة/g, "ه")
    .replace(/ى/g, "ي")
    .replace(/ی/g, "ي")
    .replace(/ک/g, "ك")
    .replace(/ؤ/g, "و")
    .replace(/ئ/g, "ي");
  t = t.toLowerCase().normalize("NFKC");
  return t.replace(/\s+/g, " ").trim();
}
