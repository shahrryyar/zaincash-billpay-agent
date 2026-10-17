import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { isRelationWord, resolveContact, type Contact, type Mention } from "../src/resolver";

// Demo contact book with the deliberate traps from docs/11. Phones are fictional (0770000xxxx).
const C = (id: string, display_name: string, phone: string, relation?: string, aliases?: string[]): Contact => ({ id, display_name, phone, relation, aliases });
const book: Contact[] = [
  C("c_ahmed_ali", "أحمد علي", "07700004471"),
  C("c_ahmed_moh", "أحمد محمد", "07700009023"),
  C("c_ali_karim", "علي كريم", "07700000101"),
  C("c_ali_nasir", "علي ناصر", "07700000102"),
  C("c_abu_ali", "أبو علي", "07700000201"),
  C("c_hasan", "حسن", "07700000301"),
  C("c_husain", "حسين", "07700000302"),
  C("c_muhsin", "محسن", "07700000303"),
  C("c_zainab", "زينب", "07700000401"),
  C("c_zaina", "زينة", "07700000402"),
  C("c_mustafa", "مصطفى", "07700000501"),
  C("c_murtada", "مرتضى", "07700000502"),
  C("c_mama", "ماما", "07700000601", "ام"),
  C("c_karrar", "أخوي كرار", "07700000701", "اخ"),
  C("c_zahraa", "أختي زهراء", "07700000702", "اخت"),
  C("c_abdullah", "عبدالله", "07700000801"),
  C("c_layla", "ليلى", "07700000901"),
  C("c_umhusain", "أم حسين", "07700001001"),
];
const name = (text: string, qualifier?: string): Mention => ({ kind: "name", text, ...(qualifier ? { qualifier } : {}) });
const ids = (r: { candidates?: Contact[] }) => (r.candidates ?? []).map((c) => c.id).sort();

describe("resolveContact: exact and ambiguity (ask, never guess)", () => {
  it("two Ahmeds is ambiguous", () => {
    const r = resolveContact(name("أحمد"), book);
    expect(r.status).toBe("ambiguous");
    expect(ids(r)).toEqual(["c_ahmed_ali", "c_ahmed_moh"]);
  });
  it("full name resolves", () => expect(resolveContact(name("احمد علي"), book)).toMatchObject({ status: "resolved", contact: { id: "c_ahmed_ali" } }));
  it("qualifier by second name narrows to one", () =>
    expect(resolveContact(name("أحمد", "علي"), book)).toMatchObject({ status: "resolved", contact: { id: "c_ahmed_ali" } }));
  it("qualifier by phone ending narrows to one", () =>
    expect(resolveContact(name("أحمد", "ينتهي 4471"), book)).toMatchObject({ status: "resolved", contact: { id: "c_ahmed_ali" } }));
  it("qualifier that matches nobody is none (cannot introduce a new recipient)", () =>
    expect(resolveContact(name("أحمد", "سعيد"), book).status).toBe("none"));
  it("strips the ل prefix: لأحمد", () => expect(resolveContact(name("لأحمد"), book).status).toBe("ambiguous"));
  it("does not strip ل when the contact really starts with it (ليلى)", () =>
    expect(resolveContact(name("ليلى"), book)).toMatchObject({ status: "resolved", contact: { id: "c_layla" } }));
  it("علي matches first names only, not أبو علي or أحمد علي", () => {
    const r = resolveContact(name("علي"), book);
    expect(r.status).toBe("ambiguous");
    expect(ids(r)).toEqual(["c_ali_karim", "c_ali_nasir"]);
  });
  it("kunya matches as a whole name", () => expect(resolveContact(name("ابو علي"), book)).toMatchObject({ status: "resolved", contact: { id: "c_abu_ali" } }));
  it("exact beats fuzzy: حسين resolves to حسين only", () =>
    expect(resolveContact(name("حسين"), book)).toMatchObject({ status: "resolved", contact: { id: "c_husain" } }));
  it("عبد الله matches عبدالله", () => expect(resolveContact(name("عبد الله"), book)).toMatchObject({ status: "resolved", contact: { id: "c_abdullah" } }));
  it("alias match", () => {
    const withAlias = [...book, C("c_boss", "كريم الموسوي", "07700001101", undefined, ["الحجي"])];
    expect(resolveContact(name("الحجي"), withAlias)).toMatchObject({ status: "resolved", contact: { id: "c_boss" } });
  });
});

describe("resolveContact: relations", () => {
  it("أمي resolves by relation", () =>
    expect(resolveContact({ kind: "relation", text: "أمي" }, book)).toMatchObject({ status: "resolved", contact: { id: "c_mama" } }));
  it("relation word typed as a name still resolves", () =>
    expect(resolveContact(name("امي"), book)).toMatchObject({ status: "resolved", contact: { id: "c_mama" } }));
  it("two brothers is ambiguous", () => {
    const two = [...book, C("c_brother2", "أخوي سجاد", "07700000703", "اخ")];
    const r = resolveContact({ kind: "relation", text: "اخوي" }, two);
    expect(r.status).toBe("ambiguous");
    expect(ids(r)).toEqual(["c_brother2", "c_karrar"]);
  });
  it("relation + qualifier picks the named one", () => {
    const two = [...book, C("c_brother2", "أخوي سجاد", "07700000703", "اخ")];
    expect(resolveContact({ kind: "relation", text: "اخوي", qualifier: "كرار" }, two)).toMatchObject({ status: "resolved", contact: { id: "c_karrar" } });
  });
  it("relation with no contact is none", () => expect(resolveContact({ kind: "relation", text: "خالي" }, book).status).toBe("none"));
});

describe("resolveContact: fuzzy never auto-resolves", () => {
  it("typo proposes candidates only", () => {
    const r = resolveContact(name("حسيين"), book);
    expect(r.status).toBe("fuzzy");
    expect(ids(r)).toContain("c_husain");
  });
  it("مصطفا proposes مصطفى", () => {
    const r = resolveContact(name("مصطفا"), book);
    expect(r.status).toBe("fuzzy");
    expect(ids(r)).toContain("c_mustafa");
  });
  it("unknown name is none", () => expect(resolveContact(name("زيدان"), book).status).toBe("none"));
  it("empty mention is none", () => {
    expect(resolveContact(name("   "), book).status).toBe("none");
    expect(resolveContact(name(""), []).status).toBe("none");
  });
  it("property: arbitrary text never yields 'resolved' unless an exact/first-token/relation match exists", () => {
    fc.assert(fc.property(fc.stringMatching(/^[ء-ي]{2,8}$/), (t) => {
      const r = resolveContact(name(t), book);
      if (r.status === "resolved") {
        const n = (s: string) => s.replace(/[أإآ]/g, "ا").replace(/ة/g, "ه").replace(/ى/g, "ي").replace(/ؤ/g, "و").replace(/ئ/g, "ي");
        const key = n(t);
        return book.some((c) => n(c.display_name).split(" ")[0] === key || n(c.display_name) === key || n(c.display_name).replace(/^ل/, "") === key || n(c.display_name).replace(/ /g, "") === key.replace(/ /g, "") || key.startsWith("ل") || isRelationWord(key) || book.some((c) => { const ct = n(c.display_name).split(" "); return ct.length > 1 && isRelationWord(ct[0] as string) && ct[1] === key; }));
      }
      return true;
    }));
  });
  it("a bare kunya particle («ابو», «آبؤ») never resolves to the only «أبو …» contact", () => {
    for (const t of ["ابو", "أبو", "آبؤ", "لأبو"]) expect(resolveContact(name(t), book).status).not.toBe("resolved");
  });
  it("the full kunya still resolves", () => expect(resolveContact(name("أبو علي"), book)).toMatchObject({ status: "resolved", contact: { id: "c_abu_ali" } }));
  it("property: candidate order does not depend on input order", () => {
    fc.assert(fc.property(fc.shuffledSubarray(book, { minLength: book.length }), (shuffled) => {
      const a = resolveContact(name("أحمد"), book), b = resolveContact(name("أحمد"), shuffled);
      return JSON.stringify(a.candidates?.map((c) => c.id)) === JSON.stringify(b.candidates?.map((c) => c.id));
    }));
  });
});

describe("resolveContact: phone and previous", () => {
  it("existing contact by phone (Arabic digits)", () =>
    expect(resolveContact({ kind: "phone", text: "٠٧٧٠٠٠٠٤٤٧١" }, book)).toMatchObject({ status: "resolved", contact: { id: "c_ahmed_ali" } }));
  it("valid unknown number is flagged as a new number, not a contact", () =>
    expect(resolveContact({ kind: "phone", text: "07751234567" }, book)).toEqual({ status: "unknown_number", phone: "07751234567" }));
  it("invalid number is none", () => expect(resolveContact({ kind: "phone", text: "0701234567" }, book).status).toBe("none"));
  it("«previous» is resolved from history elsewhere", () => expect(resolveContact({ kind: "previous", text: "نفس المرة الفاتت" }, book).status).toBe("history"));
});

describe("resolveContact: contacts stored with a relation word in front", () => {
  const rb = [
    { id: "c_karrar", display_name: "أخوي كرار", phone: "07700000701", relation: "اخ" },
    { id: "c_zahraa", display_name: "أختي زهراء", phone: "07700000702", relation: "اخت" },
    { id: "c_ali", display_name: "علي كريم", phone: "07700000101" },
    { id: "c_ali2", display_name: "أخوي علي", phone: "07700000199", relation: "اخ" },
  ];
  it("«كرار» finds أخوي كرار", () => expect(resolveContact({ kind: "name", text: "كرار" }, rb)).toMatchObject({ status: "resolved", contact: { id: "c_karrar" } }));
  it("exact/leading match still wins: «علي» is علي كريم, not أخوي علي", () => expect(resolveContact({ kind: "name", text: "علي" }, rb)).toMatchObject({ status: "resolved", contact: { id: "c_ali" } }));
  it("relation qualifier filters by relation: «كرار» + «خوي»", () => expect(resolveContact({ kind: "name", text: "كرار", qualifier: "خوي" }, rb)).toMatchObject({ status: "resolved", contact: { id: "c_karrar" } }));
  it("relation qualifier that fits nobody is still none", () => expect(resolveContact({ kind: "name", text: "كرار", qualifier: "خالي" }, rb).status).toBe("none"));
});

describe("resolveContact: the model may tag a full name as a relation", () => {
  const rb = [{ id: "c_karrar", display_name: "أخوي كرار", phone: "07700000701", relation: "اخ" }, { id: "c_mama", display_name: "ماما", phone: "07700000601", relation: "ام" }];
  it("«أخوي كرار» tagged relation still finds the contact by name", () => expect(resolveContact({ kind: "relation", text: "أخوي كرار" }, rb)).toMatchObject({ status: "resolved", contact: { id: "c_karrar" } }));
  it("a bare relation word is still looked up by relation", () => expect(resolveContact({ kind: "relation", text: "أمي" }, rb)).toMatchObject({ status: "resolved", contact: { id: "c_mama" } }));
  it("a relation nobody has is still none", () => expect(resolveContact({ kind: "relation", text: "خالي" }, rb).status).toBe("none"));
});
