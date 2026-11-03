// Honest copy for HTTP refusals of the app's own routes (503 busy / session_lost, 413). Lives here until moved to
// packages/core/src/copy.ts (keys below). <!-- VERIFY-DIALECT --> Arabic and Sorani wording needs a native check.
import type { Lang } from "@zc/core";

export const HTTP_ERROR_COPY = {
  http_busy_nothing_sent: { ar: "الخدمة مشغولة هسه. ما انرسل شي، جرّب بعد شوية.", en: "The service is busy right now. Nothing was sent; try again shortly.", ku: "خزمەتگوزارییەکە ئێستا قەرەباڵغە. هیچ نەنێردرا، کەمێکی تر هەوڵ بدەرەوە." }, // VERIFY-DIALECT
  http_session_lost: { ar: "انتهت جلسة المحفظة التجريبية. حدّث الصفحة حتى تبدي بمحفظة تجريبية جديدة.", en: "This demo wallet session has ended. Reload the page to start a fresh demo wallet.", ku: "دانیشتنی جزدانی تاقیکاری کۆتایی هات. پەڕەکە نوێ بکەرەوە بۆ دەستپێکردن بە جزدانێکی تاقیکاری نوێ." }, // VERIFY-DIALECT
  http_too_large: { ar: "الطلب كبير هواية. ما انرسل شي، اكتبه أقصر.", en: "That request is too large. Nothing was sent; please make it shorter.", ku: "داواکارییەکە زۆر گەورەیە. هیچ نەنێردرا، کورتتری بنووسە." }, // VERIFY-DIALECT
} as const;
export type HttpErrorKey = keyof typeof HTTP_ERROR_COPY;

/** A route refused the request with a known code. */
export class HttpError extends Error {
  constructor(readonly status: number, readonly code: string | null) { super(`http ${status}${code ? ` ${code}` : ""}`); }
}

/** Copy for a refusal, or null when the outcome is not known (network loss, 5xx without a code): the caller stays uncertain.
 *  busy and 413 are refused before anything runs, so "nothing was sent" is true; session_lost makes no claim about money. */
export function httpErrorKey(e: unknown): HttpErrorKey | null {
  if (!(e instanceof HttpError)) return null;
  if (e.status === 413) return "http_too_large";
  if (e.status === 503 && e.code === "busy") return "http_busy_nothing_sent";
  if (e.status === 503 && e.code === "session_lost") return "http_session_lost";
  if (e.status === 429 && e.code === "rate_limited") return "http_busy_nothing_sent";
  return null;
}
export const httpErrorText = (k: HttpErrorKey, lang: Lang): string => HTTP_ERROR_COPY[k][lang];
