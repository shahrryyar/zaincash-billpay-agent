// Word and character error rates for the voice subset (docs/09, docs/12). Own implementation (Levenshtein), no
// dependency. "raw" compares the strings as given; "norm" first applies the same Arabic/digit normalisation the agent
// uses (core normaliseArabic) and drops punctuation, so «أحمد،» and «احمد» count as the same word.
import { normaliseArabic, parseAmount } from "@zc/core";

export type EditCounts = { sub: number; del: number; ins: number; ref: number };

/** Levenshtein alignment counts between two token sequences. */
export function editCounts(ref: readonly string[], hyp: readonly string[]): EditCounts {
  const n = ref.length, m = hyp.length;
  // dp over (cost, sub, del, ins) so we can report the breakdown of one optimal alignment
  type Cell = [number, number, number, number];
  let prev: Cell[] = Array.from({ length: m + 1 }, (_, j) => [j, 0, 0, j] as Cell);
  for (let i = 1; i <= n; i++) {
    const cur: Cell[] = [[i, 0, i, 0]];
    for (let j = 1; j <= m; j++) {
      const same = ref[i - 1] === hyp[j - 1];
      const d = prev[j - 1] as Cell, up = prev[j] as Cell, left = cur[j - 1] as Cell;
      const diag: Cell = [d[0] + (same ? 0 : 1), d[1] + (same ? 0 : 1), d[2], d[3]];
      const del: Cell = [up[0] + 1, up[1], up[2] + 1, up[3]];
      const ins: Cell = [left[0] + 1, left[1], left[2], left[3] + 1];
      cur[j] = [diag, del, ins].reduce((a, b) => (b[0] < a[0] ? b : a));
    }
    prev = cur;
  }
  const last = prev[m] as Cell;
  return { sub: last[1], del: last[2], ins: last[3], ref: n };
}

export const words = (s: string): string[] => s.split(/\s+/).filter(Boolean);
export const chars = (s: string): string[] => [...s.replace(/\s+/g, " ").trim()];

/** Normalised form for scoring: agent normaliser + no punctuation (Arabic and Latin). */
export function normForScore(s: string): string {
  return normaliseArabic(s).replace(/[.,!?؟،؛:;"'«»()\[\]{}\-–—…]/g, " ").replace(/\s+/g, " ").trim();
}

export function errorRate(c: EditCounts): number {
  return c.ref === 0 ? (c.ins > 0 ? 1 : 0) : (c.sub + c.del + c.ins) / c.ref;
}

export type UtteranceScore = { wer: number; cer: number; werNorm: number; cerNorm: number; w: EditCounts; c: EditCounts; wN: EditCounts; cN: EditCounts };

export function scoreUtterance(reference: string, hypothesis: string): UtteranceScore {
  const w = editCounts(words(reference), words(hypothesis));
  const c = editCounts(chars(reference), chars(hypothesis));
  const rn = normForScore(reference), hn = normForScore(hypothesis);
  const wN = editCounts(words(rn), words(hn));
  const cN = editCounts(chars(rn), chars(hn));
  return { wer: errorRate(w), cer: errorRate(c), werNorm: errorRate(wN), cerNorm: errorRate(cN), w, c, wN, cN };
}

/** Corpus-level rate: total errors over total reference length (not the mean of per-utterance rates). */
export function corpusRate(counts: readonly EditCounts[]): number {
  const t = counts.reduce((a, x) => ({ sub: a.sub + x.sub, del: a.del + x.del, ins: a.ins + x.ins, ref: a.ref + x.ref }), { sub: 0, del: 0, ins: 0, ref: 0 });
  return errorRate(t);
}

/** Did the amount survive ASR? True if some 1-4 word span of the hypothesis parses to the expected value. */
export function amountSurvived(hypothesis: string, expected: number): boolean {
  const ws = words(hypothesis);
  for (let len = 1; len <= 4; len++) {
    for (let i = 0; i + len <= ws.length; i++) {
      const p = parseAmount(ws.slice(i, i + len).join(" "));
      if (p.kind === "ok" && p.value === expected) return true;
    }
  }
  return false;
}

/** Did a name survive ASR? Compared after normalisation, as the resolver would see it. */
export function nameSurvived(hypothesis: string, name: string): boolean {
  const h = ` ${normForScore(hypothesis)} `, n = normForScore(name);
  return n.length > 0 && (h.includes(` ${n} `) || h.includes(` ل${n} `));
}
