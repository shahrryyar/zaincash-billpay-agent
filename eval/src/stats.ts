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

/** Exact two-sided McNemar test: binomial(b + c, 1/2) on the discordant pairs (b: only A passed, c: only B passed). */
export function mcnemarExact(b: number, c: number): number {
  if (!Number.isInteger(b) || !Number.isInteger(c) || b < 0 || c < 0) throw new Error("mcnemarExact needs non-negative integer counts");
  const n = b + c, k = Math.min(b, c);
  if (n === 0) return 1;
  // sum_{i<=k} C(n,i) / 2^n in log space (stable for large n)
  let lnC = 0, tail = 0;
  for (let i = 0; i <= k; i++) { if (i > 0) lnC += Math.log(n - i + 1) - Math.log(i); tail += Math.exp(lnC - n * Math.LN2); }
  return Math.min(1, 2 * tail);
}

/** Pair two runs' per-case outcomes by case id (same dataset). Unpaired ids are counted, never silently dropped. */
export function pairedOutcomes(a: { id: string; ok: boolean }[], b: { id: string; ok: boolean }[]) {
  const index = (rs: { id: string; ok: boolean }[]) => { const m = new Map<string, boolean>(); for (const r of rs) { if (m.has(r.id)) throw new Error(`duplicate case id ${r.id}`); m.set(r.id, r.ok); } return m; };
  const A = index(a), B = index(b);
  let both = 0, aOnly = 0, bOnly = 0, neither = 0;
  for (const [id, x] of A) { if (!B.has(id)) continue; const y = B.get(id) as boolean; if (x && y) both++; else if (x) aOnly++; else if (y) bOnly++; else neither++; }
  const n = both + aOnly + bOnly + neither;
  return { n, both, a_only: aOnly, b_only: bOnly, neither, unpaired_a: [...A.keys()].filter((id) => !B.has(id)).length, unpaired_b: [...B.keys()].filter((id) => !A.has(id)).length,
    a_rate: wilson(both + aOnly, n), b_rate: wilson(both + bOnly, n), p_value: mcnemarExact(aOnly, bOnly) };
}
