// Route plumbing: size-capped bodies (checked before anything is buffered), the client IP for per-IP limits, and the
// honest answer when a sandbox cannot be had. Kept out of the Next routes so it is unit-tested.
import { isLang, t } from "@zc/core";
import { SandboxBusyError, SandboxGoneError } from "./sandboxes";

/** 413 too large, 400 unreadable. */
export class BodyError extends Error {
  override readonly name = "BodyError";
  constructor(readonly status: 400 | 413, message: string) { super(message); }
}

/** JSON bodies of the demo routes are tiny (a 400-character message at most). */
export const JSON_LIMIT = 16 * 1024;

/** The body as bytes, refusing a declared Content-Length over `max` without reading, and stopping a chunked one at `max`. */
export async function readCapped(req: Request, max: number): Promise<Uint8Array> {
  const declared = Number(req.headers.get("content-length") ?? NaN);
  if (Number.isFinite(declared) && declared > max) throw new BodyError(413, `body of ${declared} bytes is over ${max}`);
  if (!req.body) return new Uint8Array(0);
  const reader = req.body.getReader();
  const parts: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > max) { void reader.cancel().catch(() => undefined); throw new BodyError(413, `body is over ${max} bytes`); } // not awaited: a tee'd stream resolves only when both sides cancel
    parts.push(value);
  }
  const out = new Uint8Array(size);
  let at = 0;
  for (const p of parts) { out.set(p, at); at += p.byteLength; }
  return out;
}

/** A JSON object body, at most `max` bytes. */
export async function readJson<T extends object = Record<string, unknown>>(req: Request, max = JSON_LIMIT): Promise<T> {
  const raw = new TextDecoder().decode(await readCapped(req, max));
  let v: unknown;
  try { v = JSON.parse(raw || "{}"); } catch { throw new BodyError(400, "body is not JSON"); }
  if (!v || typeof v !== "object" || Array.isArray(v)) throw new BodyError(400, "body is not a JSON object");
  return v as T;
}

/** A multipart form, at most `max` bytes (read capped first, parsed after). */
export async function readForm(req: Request, max: number): Promise<FormData> {
  const bytes = await readCapped(req, max);
  try { return await new Response(bytes as BodyInit, { headers: { "content-type": req.headers.get("content-type") ?? "" } }).formData(); }
  catch { throw new BodyError(400, "body is not a form"); }
}

/** The first X-Forwarded-For hop (Render's proxy puts the client there), else one shared bucket. */
export function clientIp(req: Request): string {
  const first = (req.headers.get("x-forwarded-for") ?? "").split(",")[0]?.trim() ?? "";
  return first ? first.slice(0, 64) : "unknown";
}

/** Body and sandbox failures become honest answers; nothing was sent in any of them. Anything else propagates. */
export async function guard(fn: () => Promise<Response>, lang?: unknown): Promise<Response> {
  const l = isLang(lang) ? lang : "ar";
  try { return await fn(); }
  catch (e) {
    if (e instanceof BodyError) return Response.json({ error: e.status === 413 ? "too_large" : "bad_request", message: "" }, { status: e.status });
    if (e instanceof SandboxBusyError) return Response.json({ error: "busy", message: t("busy", {}, l) }, { status: 503 });
    // Never shown with a freshly seeded wallet: the client reloads its state on the next call.
    if (e instanceof SandboxGoneError) return Response.json({ error: "session_lost", message: "" }, { status: 503 });
    throw e;
  }
}
