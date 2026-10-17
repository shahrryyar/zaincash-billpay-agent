import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { amountSurvived, corpusRate, editCounts, nameSurvived, scoreUtterance, words } from "../src/wer";

describe("edit counts / WER / CER", () => {
  it("identical: 0", () => expect(scoreUtterance("دز خمسين ألف لأحمد", "دز خمسين ألف لأحمد")).toMatchObject({ wer: 0, cer: 0 }));
  it("one substitution in four words = 25% WER", () => {
    const s = scoreUtterance("دز خمسين ألف لأحمد", "دز ستين ألف لأحمد");
    expect(s.w).toEqual({ sub: 1, del: 0, ins: 0, ref: 4 });
    expect(s.wer).toBe(0.25);
  });
  it("deletion and insertion", () => {
    expect(editCounts(words("a b c"), words("a c"))).toEqual({ sub: 0, del: 1, ins: 0, ref: 3 });
    expect(editCounts(words("a c"), words("a b c"))).toEqual({ sub: 0, del: 0, ins: 1, ref: 2 });
  });
  it("normalised scoring ignores hamza/ta-marbuta/digit style and punctuation", () => {
    const s = scoreUtterance("ادفع فاتورة الكهرباء، ٣٧ ألف", "إدفع فاتوره الكهربا 37 الف");
    expect(s.wer).toBeGreaterThan(0);
    expect(s.wN.sub).toBe(1); // only «الكهرباء» vs «الكهربا» remains a real difference
  });
  it("empty reference with output counts as 100%", () => expect(scoreUtterance("", "x").wer).toBe(1));
  it("corpus rate pools errors, not per-utterance rates", () =>
    expect(corpusRate([{ sub: 1, del: 0, ins: 0, ref: 1 }, { sub: 0, del: 0, ins: 0, ref: 9 }])).toBe(0.1));
  it("property: WER is 0 iff equal; total errors never exceed max(len) and are symmetric", () => {
    fc.assert(fc.property(fc.array(fc.constantFrom("دز", "ألف", "لأحمد", "خمسين", "ادفع")), fc.array(fc.constantFrom("دز", "ألف", "لأحمد", "خمسين", "ادفع")), (a, b) => {
      const x = editCounts(a, b), y = editCounts(b, a);
      const tx = x.sub + x.del + x.ins, ty = y.sub + y.del + y.ins;
      return tx === ty && tx <= Math.max(a.length, b.length) && (tx === 0) === (a.join(" ") === b.join(" "));
    }));
  });
});

describe("slot survival", () => {
  it("amount in words or digits", () => {
    expect(amountSurvived("دز خمسين ألف لأحمد علي", 50_000)).toBe(true);
    expect(amountSurvived("دز 50 الف لأحمد", 50_000)).toBe(true);
    expect(amountSurvived("دز ستين ألف لأحمد", 50_000)).toBe(false);
    expect(amountSurvived("دز خمسين لأحمد", 50_000)).toBe(false); // dropped «ألف» is ambiguous, not survived
  });
  it("names after normalisation, with or without the preposition ل", () => {
    expect(nameSurvived("دز خمسين ألف لاحمد علي", "أحمد علي")).toBe(true);
    expect(nameSurvived("دز خمسين ألف لحسين", "حسن")).toBe(false);
  });
});
