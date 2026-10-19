// Deterministic recipient resolver (docs/08). Pure: contacts are passed in.
// Exactly 1 candidate -> resolved. >1 -> ambiguous. Fuzzy-only -> candidates, NEVER auto-resolved.
import { normaliseArabic, normaliseDigits } from "./normalise";
import { jaroWinkler } from "./similarity";
import { hasKurdishLetters, kurdishNameKey, kurdishNameNoise, kurdishRelation } from "./kurdish";

export type Contact = { id: string; display_name: string; phone: string; relation?: string | undefined; aliases?: string[] | undefined };
export type Mention = { kind: "name" | "relation" | "phone" | "previous"; text: string; qualifier?: string | undefined };

export type Resolution =
  | { status: "resolved"; contact: Contact; candidates?: undefined }
  | { status: "ambiguous"; candidates: Contact[] }
  | { status: "fuzzy"; candidates: Contact[] } // "تقصد حسين؟" — always asks
  | { status: "unknown_number"; phone: string; candidates?: undefined } // valid Iraqi mobile, not a saved contact
  | { status: "history"; candidates?: undefined } // «نفس المرة الفاتت»: orchestrator resolves from history
  | { status: "none"; candidates?: undefined };

export const FUZZY_CANDIDATE_THRESHOLD = 0.85; // proposes only; docs/research/03 spike
const MAX_CANDIDATES = 5;
const PHONE = /^07[3-9]\d{8}$/;

/** Matching key: normalised, and «عبد الله» == «عبدالله». */
const key = (s: string): string => normaliseArabic(s).replace(/(^| )عبد (?=\S)/g, "$1عبد");
type KeyFn = (s: string) => string;

// canonical relation forms (after normaliseArabic) from user words
const RELATION_WORDS: Record<string, string> = {
  ام: "ام", امي: "ام", ماما: "ام", والدتي: "ام",
  اب: "اب", ابوي: "اب", بابا: "اب", ابي: "اب", والدي: "اب",
  اخ: "اخ", اخوي: "اخ", اخي: "اخ", خوي: "اخ", // «خوي» = short spoken form of أخوي <!-- VERIFY-DIALECT -->
  اخت: "اخت", اختي: "اخت",
  خال: "خال", خالي: "خال",
  عم: "عم", عمي: "عم",
  زوجتي: "زوجه", مرتي: "زوجه", زوجه: "زوجه",
  زوجي: "زوج", زوج: "زوج",
  ابني: "ابن", ابن: "ابن",
  بنتي: "بنت", بنت: "بنت",
};
const relationOf = (s: string): string | undefined => RELATION_WORDS[key(s)] ?? kurdishRelation(s); // «دایکم», «براکەم»
/** True if the text is a relation word (أمي, أخوي, خوي...). Exported so tests can state the resolver's oracle. */
export const isRelationWord = (s: string): boolean => relationOf(s) !== undefined;

const KUNYA_PARTICLES = new Set(["ابو", "ابن", "بنت"]);

const byNameThenId = (a: Contact, b: Contact) =>
  a.display_name.localeCompare(b.display_name, "ar") || a.id.localeCompare(b.id);

// Words people add after a name that only DESCRIBE the person («زينب أختي», «محسن جيراننا», «حسين صاحبي»). They never
// pick a contact; dropping them only removes a filter, and every result still comes from the name's own matches.
// <!-- VERIFY-DIALECT -->
const DESCRIPTORS = new Set(
  ["جيراننا", "جيرانا", "جيرانه", "جيرانهم", "جارنا", "جارتنا", "جاري", "جارتي", "صاحبي", "صاحبتي", "صديقي", "صديقتي", "رفيقي", "رفيقتي",
    "حبيبي", "حبيبتي", "الغالي", "الغاليه", "عيني", "ثواب", "حجي", "حجيه", "الحجي", "الحجيه", "مالتي", "مالي", "مال", "يمعود"].map((w) => normaliseArabic(w)),
);

/** The qualifier without descriptor words and kinship phrases («ابن عمتي», «بنت خالي»), which name no contact. */
function cleanQualifier(qualifier: string | undefined, k: KeyFn = key): string {
  const tokens = qualifier ? k(qualifier).split(" ").filter(Boolean) : [];
  const keep: string[] = [];
  for (let i = 0; i < tokens.length; i++) {
    const tok = tokens[i] as string;
    if ((tok === "ابن" || tok === "بنت" || tok === "مرت") && /^(عم|خال|اخ|اخت)/.test(tokens[i + 1] ?? "")) { i++; continue; }
    if (DESCRIPTORS.has(tok) || kurdishNameNoise(tok)) continue;
    keep.push(tok);
  }
  return keep.join(" ");
}

/** Narrows the candidates. An empty result means "the qualifier fits nobody": the caller asks, it never resolves. */
function applyQualifier(cands: Contact[], qualifier: string | undefined, k: KeyFn = key): Contact[] {
  const q = cleanQualifier(qualifier, k);
  if (!q) return cands;
  const digits = q.match(/\d{2,}/)?.[0];
  if (digits) return cands.filter((c) => c.phone.endsWith(digits));
  const qrel = relationOf(q); // «خوي كرار»: the qualifier is a relation word -> use the contacts' stored relation
  if (qrel) {
    const same = cands.filter((c) => c.relation !== undefined && relationOf(c.relation) === qrel);
    if (same.length) return same;
    return cands.filter((c) => c.relation === undefined); // «زينب أختي»: no stored relation does not contradict it
  }
  const qt = q.split(" ");
  return cands.filter((c) => {
    const tokens = k(c.display_name).split(" ");
    return qt.every((t) => tokens.includes(t));
  });
}

function finish(cands: Contact[], qualifier: string | undefined, fuzzy = false, k: KeyFn = key): Resolution {
  const sorted = [...cands].sort(byNameThenId);
  const filtered = applyQualifier(sorted, qualifier, k).slice(0, MAX_CANDIDATES);
  if (filtered.length === 0) {
    // the extra words fit none of the name's matches: ask among those matches, never pick one
    if (sorted.length === 0) return { status: "none" };
    if (sorted.length === 1 || fuzzy) return { status: "fuzzy", candidates: sorted.slice(0, MAX_CANDIDATES) };
    return { status: "ambiguous", candidates: sorted.slice(0, MAX_CANDIDATES) };
  }
  if (fuzzy) return { status: "fuzzy", candidates: filtered };
  if (filtered.length === 1) return { status: "resolved", contact: filtered[0] as Contact };
  return { status: "ambiguous", candidates: filtered };
}

function matchName(mention: string, contacts: Contact[], k: KeyFn = key): Contact[] {
  const m = k(mention);
  if (!m) return [];
  const mt = m.split(" ");
  // 1. exact full name or alias
  const exact = contacts.filter((c) => k(c.display_name) === m || (c.aliases ?? []).some((a) => k(a) === m));
  if (exact.length) return exact;
  // 2. leading-token match: mention tokens are the first tokens of the contact name («علي» ≠ «ابو علي»).
  //    A mention that ends in a bare kunya particle («ابو», «ابن», «بنت») is an incomplete name: «ابو» alone must
  //    never resolve to «ابو علي» just because he is the only «ابو» in the book (found by the property test).
  const incompleteKunya = KUNYA_PARTICLES.has(mt[mt.length - 1] as string);
  const leading = contacts.filter((c) => {
    const ct = k(c.display_name).split(" ");
    if (incompleteKunya && ct.length > mt.length) return false;
    return ct.length >= mt.length && mt.every((t, i) => ct[i] === t);
  });
  if (leading.length) return leading;
  // 3. contacts stored with a relation word in front («أخوي كرار», «أختي زهراء»): people say just «كرار».
  //    Only runs when nothing matched above, and it can only add candidates, so it never hides an ambiguity.
  return contacts.filter((c) => {
    const ct = k(c.display_name).split(" ");
    if (ct.length < 2 || relationOf(c.display_name.split(" ")[0] as string) === undefined) return false;
    const rest = ct.slice(1);
    return rest.length >= mt.length && mt.every((t, i) => rest[i] === t);
  });
}

// Diminutives seen in the (spent) held-out set. They only PROPOSE the people they can stand for; the user always picks.
// <!-- VERIFY-DIALECT -->
const NICKNAMES: Record<string, string[]> = {
  حسوني: ["حسن", "حسين"], حسون: ["حسن", "حسين"],
  زنوبه: ["زينب"], زنوب: ["زينب"],
};
const NICK = new Map(Object.entries(NICKNAMES).map(([k, v]) => [key(k), v.map(key)]));

/** First name of a contact, ignoring a leading relation word on a relation contact («أخوي كرار» -> «كرار»; «أم حسين» stays «ام»). */
const firstName = (c: Contact, k: KeyFn = key): string => {
  const ct = k(c.display_name).split(" ");
  return (ct.length > 1 && c.relation !== undefined && relationOf(ct[0] as string) !== undefined ? ct[1] : ct[0]) as string;
};

/** Candidates to PROPOSE when nothing matched exactly: a nickname, or a known first name with an unknown rest. */
function nearMisses(m: string, contacts: Contact[], k: KeyFn = key): Contact[] {
  const nick = k === key ? NICK.get(m) : undefined;
  if (nick) return contacts.filter((c) => nick.includes(firstName(c)));
  const mt = m.split(" ");
  if (mt.length >= 2 && !KUNYA_PARTICLES.has(mt[0] as string)) return contacts.filter((c) => firstName(c, k) === mt[0]);
  return [];
}

function fuzzyCandidates(mention: string, contacts: Contact[], k: KeyFn = key): Contact[] {
  const m = k(mention);
  return contacts.filter((c) => {
    const full = k(c.display_name);
    const first = full.split(" ")[0] ?? "";
    return jaroWinkler(m, full) >= FUZZY_CANDIDATE_THRESHOLD || jaroWinkler(m, first) >= FUZZY_CANDIDATE_THRESHOLD;
  });
}

export type ResolveOptions = { lang?: "ar" | "ku" | "en" | undefined };

/**
 * A Kurdish mention («بۆ کاک ئاراس گیان», «ئەحمەد»): drop the words that never pick a person, then match with the
 * Kurdish key. Runs only when the exact Arabic matching found nobody, so it can never hide an Arabic ambiguity.
 */
function resolveKurdish(text: string, qualifier: string | undefined, all: Contact[]): Resolution | null {
  const words = text.split(/\s+/).filter((w) => w && !kurdishNameNoise(w));
  if (!words.length) return null;
  const variants = [words.join(" ")];
  if ((words[0] as string).length > 3 && /[یيی]$/.test(words[0] as string)) variants.push([(words[0] as string).slice(0, -1), ...words.slice(1)].join(" ")); // izafe «ئاراسی کەریم»
  for (const v of variants) {
    const cands = matchName(v, all, kurdishNameKey);
    if (cands.length) return finish(cands, qualifier, false, kurdishNameKey);
  }
  const m = kurdishNameKey(variants[0] as string);
  const near = nearMisses(m, all, kurdishNameKey);
  if (near.length > 1) return { status: "ambiguous", candidates: [...near].sort(byNameThenId).slice(0, MAX_CANDIDATES) };
  if (near.length === 1) return { status: "fuzzy", candidates: near };
  // Kurdish writes the vowels Arabic leaves out («موحسین» = محسن): the consonant skeleton of the first name PROPOSES people
  const sk = skeleton(m.split(" ")[0] as string);
  const bySkeleton = sk.length >= 3 ? all.filter((c) => skeleton(firstName(c, kurdishNameKey)) === sk) : [];
  if (bySkeleton.length === 1) return { status: "fuzzy", candidates: bySkeleton };
  if (bySkeleton.length > 1) return { status: "ambiguous", candidates: [...bySkeleton].sort(byNameThenId).slice(0, MAX_CANDIDATES) };
  const r = finish(fuzzyCandidates(variants[0] as string, all, kurdishNameKey), qualifier, true, kurdishNameKey);
  // several look-alikes («زەینا»: زينب and زينة): show them all and ask which, never propose just the first
  return r.status === "fuzzy" && r.candidates.length > 1 ? { status: "ambiguous", candidates: r.candidates } : r;
}

/** «موحسین» -> «محسن»: the first letter, then the consonants (و ي ا are vowels in Kurdish spelling). */
const skeleton = (w: string): string => (w ? (w[0] as string) + w.slice(1).replace(/[ويا]/g, "") : "");

export function resolveContact(mention: Mention, contacts: readonly Contact[], opts: ResolveOptions = {}): Resolution {
  const all = [...contacts];
  if (mention.kind === "previous") return { status: "history" };

  if (mention.kind === "phone") {
    const digits = normaliseDigits(mention.text).replace(/[\s\-()]/g, "");
    if (!PHONE.test(digits)) return { status: "none" };
    const hit = all.find((c) => c.phone === digits);
    return hit ? { status: "resolved", contact: hit } : { status: "unknown_number", phone: digits };
  }

  const text = mention.text.trim();
  if (!key(text)) return { status: "none" };

  // relation words, whether the model tagged them as relation or name
  const rel = relationOf(text);
  if (rel && (mention.kind === "relation" || !all.some((c) => key(c.display_name) === key(text)))) {
    return finish(all.filter((c) => c.relation !== undefined && relationOf(c.relation) === rel), mention.qualifier);
  }
  // the model may tag «أخوي كرار» as a relation: only a bare relation word is looked up by relation; anything longer is a name
  if (mention.kind === "relation" && relationOf(text) !== undefined) return { status: "none" };

  let cands = matchName(text, all);
  // «لأحمد»: drop the preposition ل only if the literal form matched nobody
  const k = key(text);
  if (cands.length === 0 && k.startsWith("ل") && k.length > 2) cands = matchName(k.slice(1), all);
  const kurdish = opts.lang === "ku" || hasKurdishLetters(text);
  if (cands.length) {
    const res = finish(cands, mention.qualifier);
    // «ئاراس» + «كريم» typed on an Arabic keyboard: the surname only meets «ئاراس کەریم» under the Kurdish key
    if (kurdish && mention.qualifier && res.status !== "resolved") { const ku = finish(cands, mention.qualifier, false, kurdishNameKey); if (ku.status === "resolved") return ku; }
    return res;
  }
  if (kurdish) { const ku = resolveKurdish(text, mention.qualifier, all); if (ku) return ku; }

  // nothing exact: a nickname or «known first name + unknown rest» proposes those people (several -> "which one?")
  for (const m of k.startsWith("ل") && k.length > 2 ? [k, k.slice(1)] : [k]) {
    const near = nearMisses(m, all);
    if (near.length > 1) return { status: "ambiguous", candidates: [...near].sort(byNameThenId).slice(0, MAX_CANDIDATES) };
    if (near.length === 1) return { status: "fuzzy", candidates: near };
  }
  return finish(fuzzyCandidates(k.startsWith("ل") && k.length > 2 ? k.slice(1) : k, all), mention.qualifier, true);
}
