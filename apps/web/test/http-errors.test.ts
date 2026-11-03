import { describe, it, expect } from "vitest";
import { HTTP_ERROR_COPY, HttpError, httpErrorKey } from "../components/http-errors";

describe("route refusals get honest copy; an unknown outcome stays unknown", () => {
  it("maps the server's codes", () => {
    expect(httpErrorKey(new HttpError(503, "busy"))).toBe("http_busy_nothing_sent");
    expect(httpErrorKey(new HttpError(503, "session_lost"))).toBe("http_session_lost");
    expect(httpErrorKey(new HttpError(413, "too_large"))).toBe("http_too_large");
    expect(httpErrorKey(new HttpError(429, "rate_limited"))).toBe("http_busy_nothing_sent");
  });
  it("a network loss or an uncoded 5xx is not claimed as 'nothing was sent'", () => {
    expect(httpErrorKey(new TypeError("Failed to fetch"))).toBeNull();
    expect(httpErrorKey(new HttpError(500, null))).toBeNull();
    expect(httpErrorKey(new HttpError(503, null))).toBeNull();
  });
  it("every string exists in Arabic, Sorani and English; session_lost makes no claim about money", () => {
    for (const v of Object.values(HTTP_ERROR_COPY)) for (const l of ["ar", "ku", "en"] as const) expect(v[l].length).toBeGreaterThan(5);
    expect(HTTP_ERROR_COPY.http_session_lost.ar).not.toContain("ما انرسل");
  });
});
