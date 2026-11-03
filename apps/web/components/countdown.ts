/** What the card's screen-reader live region says: only at 30 s, 10 s and expiry (the visible timer ticks silently). */
export const countdownMilestone = (secondsLeft: number): "30" | "10" | "expired" | null =>
  secondsLeft <= 0 ? "expired" : secondsLeft <= 10 ? "10" : secondsLeft <= 30 ? "30" : null;
