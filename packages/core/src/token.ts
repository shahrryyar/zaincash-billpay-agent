// Confirmation-token guard (docs/07). Pure: the wallet stores records, this decides validity.
// Design basis: PSD2 RTS Art. 5 dynamic linking (approval is bound to amount + payee; any change invalidates it).
import { createHash } from "node:crypto";

export const TOKEN_TTL_MS = 120_000;

export type Payload = {
  kind: "transfer" | "bill_pay";
  from: string;
  to_id?: string;
  biller_id?: string;
  account_ref?: string;
  amount_iqd: number;
  fee_iqd: number;
  /** Scheduled payments only: the exact instant (epoch ms) the money may move. Part of the hash, so the user approves THIS time. */
  run_at?: number;
};

export type TokenRecord = {
  token: string;
  sessionId: string;
  payloadHash: string;
  expiresAt: number; // epoch ms, exclusive
  usedAt: number | null;
};

/** JSON with sorted keys and no whitespace, so equal payloads hash equally. */
export function canonicalJSON(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(canonicalJSON).join(",")}]`;
  if (v !== null && typeof v === "object") {
    const o = v as Record<string, unknown>;
    return `{${Object.keys(o).filter((k) => o[k] !== undefined).sort()
      .map((k) => `${JSON.stringify(k)}:${canonicalJSON(o[k])}`).join(",")}}`;
  }
  return JSON.stringify(v);
}

export function payloadHash(p: Payload): string {
  return createHash("sha256").update(canonicalJSON(p)).digest("hex");
}

export type TokenCheck =
  | { ok: true }
  | { ok: false; reason: "unknown_token" | "wrong_session" | "payload_mismatch" | "already_used" | "expired" };

/** Valid only if: same token, same session, same payload hash, unused, unexpired. */
export function checkToken(
  req: { presented: string; sessionId: string; payload: Payload; now: number },
  rec: TokenRecord,
): TokenCheck {
  if (!req.presented || req.presented !== rec.token) return { ok: false, reason: "unknown_token" };
  if (req.sessionId !== rec.sessionId) return { ok: false, reason: "wrong_session" };
  if (payloadHash(req.payload) !== rec.payloadHash) return { ok: false, reason: "payload_mismatch" };
  if (rec.usedAt !== null) return { ok: false, reason: "already_used" };
  if (req.now >= rec.expiresAt) return { ok: false, reason: "expired" };
  return { ok: true };
}
