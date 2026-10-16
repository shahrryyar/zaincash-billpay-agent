// Deterministic recipient resolver (docs/08). Pure: contacts are passed in.
// Exactly 1 candidate -> resolved. >1 -> ambiguous. Fuzzy-only -> candidates, NEVER auto-resolved.
import { normaliseArabic, normaliseDigits } from "./normalise";
import { jaroWinkler } from "./similarity";

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
const relationOf = (s: string): string | undefined => RELATION_WORDS[key(s)];
/** True if the text is a relation word (أمي, أخوي, خوي...). Exported so tests can state the resolver's oracle. */
export const isRelationWord = (s: string): boolean => relationOf(s) !== undefined;

const byNameThenId = (a: Contact, b: Contact) =>
  a.display_name.localeCompare(b.display_name, "ar") || a.id.localeCompare(b.id);

function applyQualifier(cands: Contact[], qualifier: string | undefined): Contact[] {
  const q = qualifier ? normaliseArabic(qualifier) : "";
  if (!q) return cands;
  const digits = q.match(/\d{2,}/)?.[0];
  if (digits) return cands.filter((c) => c.phone.endsWith(digits));
  const qrel = relationOf(q); // «خوي كرار»: the qualifier is a relation word -> filter by the contact's relation
  if (qrel) return cands.filter((c) => c.relation !== undefined && relationOf(c.relation) === qrel);
  const qt = key(q).split(" ").filter(Boolean);
  return cands.filter((c) => {
    const tokens = key(c.display_name).split(" ");
    return qt.every((t) => tokens.includes(t));
  });
}

function finish(cands: Contact[], qualifier: string | undefined, fuzzy = false): Resolution {
  const filtered = applyQualifier(cands, qualifier).sort(byNameThenId).slice(0, MAX_CANDIDATES);
  if (filtered.length === 0) return { status: "none" };
  if (fuzzy) return { status: "fuzzy", candidates: filtered };
  if (filtered.length === 1) return { status: "resolved", contact: filtered[0] as Contact };
  return { status: "ambiguous", candidates: filtered };
}

function matchName(mention: string, contacts: Contact[]): Contact[] {
  const m = key(mention);
  if (!m) return [];
  const mt = m.split(" ");
  // 1. exact full name or alias
  const exact = contacts.filter((c) => key(c.display_name) === m || (c.aliases ?? []).some((a) => key(a) === m));
  if (exact.length) return exact;
  // 2. leading-token match: mention tokens are the first tokens of the contact name («علي» ≠ «ابو علي»)
  const leading = contacts.filter((c) => {
    const ct = key(c.display_name).split(" ");
    return ct.length >= mt.length && mt.every((t, i) => ct[i] === t);
  });
  if (leading.length) return leading;
  // 3. contacts stored with a relation word in front («أخوي كرار», «أختي زهراء»): people say just «كرار».
  //    Only runs when nothing matched above, and it can only add candidates, so it never hides an ambiguity.
  return contacts.filter((c) => {
    const ct = key(c.display_name).split(" ");
    if (ct.length < 2 || relationOf(ct[0] as string) === undefined) return false;
    const rest = ct.slice(1);
    return rest.length >= mt.length && mt.every((t, i) => rest[i] === t);
  });
}

function fuzzyCandidates(mention: string, contacts: Contact[]): Contact[] {
  const m = key(mention);
  return contacts.filter((c) => {
    const full = key(c.display_name);
    const first = full.split(" ")[0] ?? "";
    return jaroWinkler(m, full) >= FUZZY_CANDIDATE_THRESHOLD || jaroWinkler(m, first) >= FUZZY_CANDIDATE_THRESHOLD;
  });
}

export function resolveContact(mention: Mention, contacts: readonly Contact[]): Resolution {
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
  if (mention.kind === "relation") return { status: "none" };

  let cands = matchName(text, all);
  // «لأحمد»: drop the preposition ل only if the literal form matched nobody
  const k = key(text);
  if (cands.length === 0 && k.startsWith("ل") && k.length > 2) cands = matchName(k.slice(1), all);
  if (cands.length) return finish(cands, mention.qualifier);

  return finish(fuzzyCandidates(k.startsWith("ل") && k.length > 2 ? k.slice(1) : k, all), mention.qualifier, true);
}
