// Limits of the scheduler (docs/27). Times are epoch milliseconds.
export const SCHEDULE_MIN_LEAD_MS = 5_000; // the card asked for >= 2 minutes; this only rejects "already in the past"
export const SCHEDULE_MAX_LEAD_MS = 91 * 86_400_000; // a little more than the 90 days the parser allows (confirm happens later)
export const SCHEDULE_MISSED_AFTER_MS = 24 * 3_600_000; // a schedule more than a day late is failed, never paid
