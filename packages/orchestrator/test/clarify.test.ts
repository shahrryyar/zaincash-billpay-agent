import { describe, it, expect } from "vitest";
import type { Contact } from "@zc/core";
import { isCancel, isNo, isYes, matchChoice } from "../src/clarify";

const A: Contact = { id: "c_ahmed_ali", display_name: "أحمد علي", phone: "07700004471" };
const B: Contact = { id: "c_ahmed_moh", display_name: "أحمد محمد", phone: "07700009023" };

describe("matchChoice: answers to «ياهو تقصد؟»", () => {
  it.each([["الأول", "c_ahmed_ali"], ["الاول", "c_ahmed_ali"], ["اول", "c_ahmed_ali"], ["1", "c_ahmed_ali"], ["الثاني", "c_ahmed_moh"], ["2", "c_ahmed_moh"]])("ordinal %s", (t, id) =>
    expect(matchChoice(t, [A, B])).toMatchObject({ status: "resolved", contact: { id } }));
  it("an ordinal beyond the list is none", () => expect(matchChoice("الثالث", [A, B]).status).toBe("none"));
  it.each(["أحمد علي", "احمد علي", "علي", "اللي اسمه أحمد علي"])("by name: %s", (t) =>
    expect(matchChoice(t, [A, B])).toMatchObject({ status: "resolved", contact: { id: "c_ahmed_ali" } }));
  it("by second name only: محمد", () => expect(matchChoice("أحمد محمد", [A, B])).toMatchObject({ status: "resolved", contact: { id: "c_ahmed_moh" } }));
  it.each(["4471", "اللي ينتهي 4471", "ينتهي ب 4471"])("by the last digits: %s", (t) =>
    expect(matchChoice(t, [A, B])).toMatchObject({ status: "resolved", contact: { id: "c_ahmed_ali" } }));
  it("digits that match nobody are none", () => expect(matchChoice("0000", [A, B]).status).toBe("none"));
  it("a person who is not among the candidates is none (no new recipient can sneak in)", () =>
    expect(matchChoice("حسين", [A, B]).status).toBe("none"));
  it("«أحمد» alone is still ambiguous", () => expect(matchChoice("أحمد", [A, B]).status).toBe("ambiguous"));
  it("empty answer is none", () => expect(matchChoice("  ", [A, B]).status).toBe("none"));
});

describe("yes / no / cancel wording", () => {
  it.each(["اي", "إي", "تمام", "اكيد", "نعم", "ok", "yes"])("%s is yes", (t) => expect(isYes(t)).toBe(true));
  it.each(["لا", "لا لا", "مو"])("%s is no", (t) => expect(isNo(t)).toBe(true));
  it.each(["الغي", "الغي الطلب", "بطلت", "ماريد", "cancel"])("%s is cancel", (t) => expect(isCancel(t)).toBe(true));
  it("a bare «لا» is NOT a cancel (it answers yes/no questions)", () => expect(isCancel("لا")).toBe(false));
  it("ordinary text is none of them", () => {
    for (const t of ["خمسين ألف", "أحمد علي"]) { expect(isYes(t)).toBe(false); expect(isNo(t)).toBe(false); expect(isCancel(t)).toBe(false); }
  });
});
