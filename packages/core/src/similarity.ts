// Jaro-Winkler similarity, own implementation (docs/research/03: money path keeps its own code).
// Differentially tested against the `jaro-winkler` package. Pure.

function jaro(a: string, b: string): number {
  if (a === b) return 1;
  const la = a.length, lb = b.length;
  if (la === 0 || lb === 0) return 0;
  const window = Math.max(0, Math.floor(Math.max(la, lb) / 2) - 1);
  const aMatch = new Array<boolean>(la).fill(false);
  const bMatch = new Array<boolean>(lb).fill(false);
  let matches = 0;
  for (let i = 0; i < la; i++) {
    const lo = Math.max(0, i - window), hi = Math.min(lb - 1, i + window);
    for (let j = lo; j <= hi; j++) {
      if (!bMatch[j] && a[i] === b[j]) { aMatch[i] = true; bMatch[j] = true; matches++; break; }
    }
  }
  if (matches === 0) return 0;
  let k = 0, transpositions = 0;
  for (let i = 0; i < la; i++) {
    if (!aMatch[i]) continue;
    while (!bMatch[k]) k++;
    if (a[i] !== b[k]) transpositions++;
    k++;
  }
  const t = transpositions / 2;
  return (matches / la + matches / lb + (matches - t) / matches) / 3;
}

/** 0..1. Prefix scale 0.1, up to 4 prefix chars, boost only when jaro > 0.7 (standard). */
export function jaroWinkler(a: string, b: string): number {
  if (a.length === 0 && b.length === 0) return 1;
  const j = jaro(a, b);
  if (j <= 0.7) return j;
  let prefix = 0;
  for (let i = 0; i < Math.min(4, a.length, b.length); i++) {
    if (a[i] === b[i]) prefix++; else break;
  }
  return j + prefix * 0.1 * (1 - j);
}
