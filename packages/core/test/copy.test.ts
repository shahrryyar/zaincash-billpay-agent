import { describe, it, expect } from "vitest";
import { COPY, t, copyKeyForWalletError, type CopyKey } from "../src/copy";

const keys = Object.keys(COPY) as CopyKey[];
const placeholders = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

describe("copy table (single source of user-facing text, docs/15)", () => {
  it("has both ar-IQ and en for every key", () => {
    for (const k of keys) {
      expect(COPY[k].ar, k).toBeTruthy();
      expect(COPY[k].en, k).toBeTruthy();
    }
  });
  it("uses the same placeholders in both languages", () => {
    for (const k of keys) expect(placeholders(COPY[k].ar), k).toEqual(placeholders(COPY[k].en));
  });
  it("Arabic strings actually contain Arabic letters", () => {
    for (const k of keys) expect(COPY[k].ar, k).toMatch(/[ء-ي]/);
  });
  it("Arabic is the default language", () => expect(t("cancelled")).toBe(COPY.cancelled.ar));
  it("interpolates variables", () =>
    expect(t("ask_which_contact", { n: 2, name: "أحمد" })).toBe("عندك 2 باسم أحمد، ياهو تقصد؟"));
  it("can render English", () => expect(t("cancelled", {}, "en")).toBe(COPY.cancelled.en));
  it("throws on a missing variable (never shows a raw {placeholder})", () =>
    expect(() => t("ask_amount", {})).toThrow(/name/));
  it("ignores unused variables", () => expect(t("cancelled", { x: 1 })).toBe(COPY.cancelled.ar));
  it("honest failure copy says nothing was sent and gives the reference", () => {
    expect(t("failed_safe", { ref: "R-1" })).toContain("ما انرسل شي");
    expect(t("failed_safe", { ref: "R-1" })).toContain("R-1");
  });
  it("never claims success in failure/unknown copy", () => {
    for (const k of ["failed_safe", "unknown_outcome", "insufficient", "biller_down", "busy", "expired"] as CopyKey[])
      expect(COPY[k].ar, k).not.toContain("✅");
  });
  it("unknown_outcome tells the user not to resend", () => expect(COPY.unknown_outcome.ar).toContain("لا تعيد"));
});

describe("copyKeyForWalletError", () => {
  it.each([
    ["INSUFFICIENT_BALANCE", "insufficient"],
    ["BILLER_UNAVAILABLE", "biller_down"],
    ["BILL_ALREADY_PAID", "bill_paid_already"],
    ["LIMIT_EXCEEDED", "limit_exceeded"],
    ["CONTACT_NOT_FOUND", "contact_not_found"],
    ["SERVICE_UNAVAILABLE", "busy"],
    ["CONFIRMATION_INVALID", "confirm_invalid"],
    ["AMOUNT_CHANGED", "amount_changed"],
    ["CONTACT_NOT_WALLET_USER", "contact_not_wallet"],
    ["INVALID_AMOUNT", "invalid_amount"],
  ])("%s -> %s", (code, key) => expect(copyKeyForWalletError(code)).toBe(key));
  it("unknown codes fall back to the safe generic message", () => expect(copyKeyForWalletError("WAT")).toBe("failed_safe"));
});
