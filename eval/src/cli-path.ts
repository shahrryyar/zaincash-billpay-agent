import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
/** A path as the user typed it: pnpm runs scripts in eval/, so resolve against the caller's cwd (INIT_CWD), then the repo root. */
export const userPath = (p: string): string => { const a = resolve(process.env.INIT_CWD ?? process.cwd(), p); return existsSync(a) ? a : resolve(repoRoot, p); };
/** Non-flag arguments; `valueFlags` consume the next argument. pnpm may forward a literal "--". */
export const positional = (argv: string[], valueFlags: string[]): string[] =>
  argv.filter((a, i) => a !== "--" && !a.startsWith("--") && !valueFlags.some((f) => argv[i - 1] === `--${f}`));
export const flag = (argv: string[], name: string): string | undefined => { const i = argv.indexOf(`--${name}`); const eq = argv.find((a) => a.startsWith(`--${name}=`)); return eq ? eq.slice(name.length + 3) : i >= 0 ? argv[i + 1] : undefined; };
