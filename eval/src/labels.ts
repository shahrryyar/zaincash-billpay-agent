/** Who made a split's labels, printed in every report so a number is never read as human-labelled (docs/19). */
export function labelsCaption(split: string): string {
  const who =
    split === "readiness-dev" ? "AI-authored developer fixtures against seed, including subsequent actions"
    : split === "codeswitch-dev" ? "Claude Code developer fixtures (2026-10-25), Arabic mixed with English words, against seed"
    : split.endsWith("-ku") ? "three Claude labellers (opus, sonnet, haiku), adjudicated"
    : split === "heldout2" ? "three Claude labellers (fable, sonnet, haiku), adjudicated"
    : "three LLM labellers (agy, fable, haiku), adjudicated";
  return `Labels: ${who}; no human labeller (docs/19).`;
}
