import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { normaliseArabic, normaliseDigits } from "../src/normalise";

describe("normaliseDigits", () => {
  it("maps Arabic-Indic digits", () => expect(normaliseDigits("٥٠٠٠٠")).toBe("50000"));
  it("maps Persian digits", () => expect(normaliseDigits("۱۲۳")).toBe("123"));
  it("leaves ASCII untouched", () => expect(normaliseDigits("07701234567")).toBe("07701234567"));
});

describe("normaliseArabic", () => {
  it("unifies alef forms", () => expect(normaliseArabic("أحمد")).toBe(normaliseArabic("احمد")));
  it("unifies ya / alef maqsura", () => expect(normaliseArabic("مصطفى")).toBe(normaliseArabic("مصطفي")));
  it("unifies ta marbuta and ha", () => expect(normaliseArabic("زهرة")).toBe(normaliseArabic("زهره")));
  it("strips diacritics and tatweel", () => expect(normaliseArabic("أَحْمَـد")).toBe(normaliseArabic("احمد")));
  it("maps hamza on waw/ya", () => {
    expect(normaliseArabic("مؤمن")).toBe("مومن");
    expect(normaliseArabic("مئة")).toBe("ميه");
  });
  it("collapses whitespace and trims", () => expect(normaliseArabic("  أحمد   علي ")).toBe("احمد علي"));
  it("lowercases latin and normalises digits", () => expect(normaliseArabic("DZ ٥٠ ALF")).toBe("dz 50 alf"));
  it("does not split abdullah spellings (documented: handled by resolver)", () => {
    expect(normaliseArabic("عبد الله")).not.toBe(normaliseArabic("عبدالله"));
  });
  it("is idempotent (property)", () => {
    fc.assert(fc.property(fc.string(), (s) => normaliseArabic(normaliseArabic(s)) === normaliseArabic(s)));
  });
  it("never throws (property)", () => {
    fc.assert(fc.property(fc.string({ unit: "binary" }), (s) => typeof normaliseArabic(s) === "string"));
  });
});
