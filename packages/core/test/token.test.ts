import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { canonicalJSON, payloadHash, checkToken, TOKEN_TTL_MS, type Payload, type TokenRecord } from "../src/token";

const payload: Payload = { kind: "transfer", from: "u_001", to_id: "c_ahmed_ali", amount_iqd: 50000, fee_iqd: 0 };
const now = 1_000_000;
const rec = (over: Partial<TokenRecord> = {}): TokenRecord => ({
  token: "ct_abc", sessionId: "s1", payloadHash: payloadHash(payload), expiresAt: now + TOKEN_TTL_MS, usedAt: null, ...over,
});
const check = (r: TokenRecord, p: Payload = payload, over: Partial<{ token: string; sessionId: string; now: number }> = {}) =>
  checkToken({ presented: over.token ?? "ct_abc", sessionId: over.sessionId ?? "s1", payload: p, now: over.now ?? now }, r);

describe("canonicalJSON / payloadHash", () => {
  it("is independent of key order", () =>
    expect(canonicalJSON({ b: 1, a: { d: 2, c: 3 } })).toBe(canonicalJSON({ a: { c: 3, d: 2 }, b: 1 })));
  it("hash changes when amount changes", () =>
    expect(payloadHash({ ...payload, amount_iqd: 500000 })).not.toBe(payloadHash(payload)));
  it("hash changes when recipient changes", () =>
    expect(payloadHash({ ...payload, to_id: "c_ahmed_mohammed" })).not.toBe(payloadHash(payload)));
  it("hash changes when fee changes", () =>
    expect(payloadHash({ ...payload, fee_iqd: 250 })).not.toBe(payloadHash(payload)));
  it("hash is stable (64 hex chars)", () => expect(payloadHash(payload)).toMatch(/^[0-9a-f]{64}$/));
  it("any single-field change changes the hash (property)", () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 10_000_000 }), fc.integer({ min: 1, max: 10_000_000 }), (a, b) => {
        fc.pre(a !== b);
        return payloadHash({ ...payload, amount_iqd: a }) !== payloadHash({ ...payload, amount_iqd: b });
      }),
    );
  });
});

describe("checkToken: confirmation gate (docs/07)", () => {
  it("accepts a fresh, unused token for the same payload and session", () => expect(check(rec())).toEqual({ ok: true }));
  it("rejects a different token value", () => expect(check(rec(), payload, { token: "ct_other" })).toEqual({ ok: false, reason: "unknown_token" }));
  it("rejects a token for a different payload (tampered amount)", () =>
    expect(check(rec(), { ...payload, amount_iqd: 500000 })).toEqual({ ok: false, reason: "payload_mismatch" }));
  it("rejects a token for a different payload (swapped recipient)", () =>
    expect(check(rec(), { ...payload, to_id: "x" })).toEqual({ ok: false, reason: "payload_mismatch" }));
  it("rejects a reused token", () => expect(check(rec({ usedAt: now - 1 }))).toEqual({ ok: false, reason: "already_used" }));
  it("rejects an expired token", () => expect(check(rec(), payload, { now: now + TOKEN_TTL_MS + 1 })).toEqual({ ok: false, reason: "expired" }));
  it("accepts at the exact expiry instant? no: expiry is exclusive", () =>
    expect(check(rec(), payload, { now: now + TOKEN_TTL_MS })).toEqual({ ok: false, reason: "expired" }));
  it("rejects a token from another session", () =>
    expect(check(rec(), payload, { sessionId: "s2" })).toEqual({ ok: false, reason: "wrong_session" }));
  it("rejects an empty presented token", () => expect(check(rec(), payload, { token: "" })).toEqual({ ok: false, reason: "unknown_token" }));
  it("TTL is 120 s", () => expect(TOKEN_TTL_MS).toBe(120_000));
});
