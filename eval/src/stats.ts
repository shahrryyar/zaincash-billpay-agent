/** Wilson 95% score interval for a rate k/n. Returns fractions in [0,1]. */
export function wilson(k: number, n: number, z = 1.959964): { rate: number; lo: number; hi: number; n: number } {
  if (n === 0) return { rate: NaN, lo: NaN, hi: NaN, n };
  const p = k / n, z2 = z * z, d = 1 + z2 / n;
  const c = (p + z2 / (2 * n)) / d, h = (z * Math.sqrt((p * (1 - p)) / n + z2 / (4 * n * n))) / d;
  return { rate: p, lo: Math.max(0, c - h), hi: Math.min(1, c + h), n };
}

/** Upper 95% bound for a zero-event rate (rule of three): 0/n => about 3/n. */
export const ruleOfThree = (n: number): number => (n === 0 ? NaN : Math.min(1, 3 / n));

export function percentile(xs: number[], q: number): number {
  if (xs.length === 0) return NaN;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.max(0, Math.ceil(q * s.length) - 1))] as number;
}

export const fmtRate = (w: { rate: number; lo: number; hi: number; n: number }): string =>
  Number.isNaN(w.rate) ? "n/a" : `${(w.rate * 100).toFixed(1)}% [${(w.lo * 100).toFixed(1)}, ${(w.hi * 100).toFixed(1)}] n=${w.n}`;

/** Upstream model requests per model turn over the cases that counted them; null when none did. */
export function requestsPerTurn(rs: { model_requests: number | null; model_turns: number }[]):
  { cases: number; turns: number; requests: number; mean: number; max_per_case: number } | null {
  const m = rs.filter((r) => r.model_requests !== null && r.model_turns > 0);
  if (m.length === 0) return null;
  const turns = m.reduce((a, r) => a + r.model_turns, 0), requests = m.reduce((a, r) => a + (r.model_requests as number), 0);
  return { cases: m.length, turns, requests, mean: requests / turns, max_per_case: Math.max(...m.map((r) => r.model_requests as number)) };
}
