# 27 — Scheduled payments

Added 2026-10-16 (not in the original brief; the author asked for it). Scope rule still holds: only P2P transfers and bill payments, now optionally **at a later time**. Not recurring.

## What the user sees
1. «ادفع المولدة يوم 25 الساعة 9 الصبح» or «دز 50 ألف لأحمد علي باچر الساعة 8 المساء». Or any card gets a **«🕒 جدولها لوقت ثاني (ناقشها مع المساعد)»** button, or the user types «اجدولها». The header has **«🕒 المجدولة»** (list, cancel, «ناقش جدولة جديدة مع المساعد»).
2. The card says **«ما راح ينرسل شي هسه»**, the exact date and time in Baghdad time with the weekday («الأحد 25/10/2026، الساعة 9:00 صباحاً (بعد 9 أيام)»), recipient or biller, amount in digits and words, fee, and the current balance. The button says **«أكّد وجدول»**.
3. Confirm creates the schedule. **Nothing moves.** The receipt says «انجدولت» with a schedule reference (SCH-…).
4. At the time the wallet pays it once; the chat shows «✅ انرسل التحويل المجدول…» (with the transaction reference) or «⛔ ما تنفذت… ما انخصم منك شي». The user can cancel any pending schedule from the list.

## Design (why it is safe)
- **The model never computes a time.** It only copies the words about *when* into `when_text` (verbatim, checked to be in the user's message). `packages/core/src/when.ts` (`parseWhen`) turns them into one instant: relative («بعد ساعتين»), tomorrow, weekday, day of month, end/start of month, `25/10`, clock times with AM/PM words, Arabic digits. It returns `need_time` (date but no hour; hour but no AM/PM), `too_soon` (< 2 min), `too_far` (> 90 days) or `unparsed`: each is a question, never a guess. 40+ tests incl. properties (an `ok` result is always within the allowed window; never throws).
- **The approved time is part of the confirmation token.** The payload hash includes `run_at`, so the wallet only accepts a schedule for the exact instant the user saw (same token rules as docs/07: server-issued, single-use, 120 s, session-bound).
- **Exactly once.** The runner flips a row `scheduled -> executed|failed` inside one `BEGIN IMMEDIATE` transaction and pays with idempotency key `sched:<id>` (UNIQUE on transactions). Running it 20 times, or from several processes, pays once.
- **Checked again when it runs:** balance, monthly limit, biller up, bill unpaid and **same amount** (a changed bill amount fails instead of paying more), contact still a wallet user. The stored approval hash is recomputed and must match (a tampered row does not run). A schedule more than 24 h late fails as `SCHEDULE_MISSED`, never paid stale. No automatic retries: a failed run is reported honestly.
- **Money is not reserved.** The card says so. Today's balance and this month's limit do not block scheduling (card warns), but an amount above the monthly limit itself is refused now because it could never run.
- **Cancel is a button, not a model tool.** The model has no tool that creates, cancels or runs schedules (still: read-only lookups + `propose`).
- **Demo:** the demo panel has «قدّم الوقت ساعة / يوم» which moves only the caller’s sandbox clock forward so a schedule runs in seconds; «إعادة ضبط» resets it. The web server also runs `runDueSchedules()` every 3 s.

## Files
`packages/core/src/when.ts`, `machine.ts` (slot `time`, `SCHEDULE_THIS`), `apps/wallet-api/src/app.ts` (`/scheduled`, `/users/:id/scheduled`, cancel, `runDueSchedules`, `/admin/run-due`), `schedule.ts`, `packages/orchestrator` (card, execute, `scheduleCard`, `listSchedules`, `cancelSchedule`), `apps/web` (panel, buttons, notices).

## Evidence
- Unit and integration tests: core `when` (43), `machine.schedule` (8), wallet `schedule.test.ts` (19: token gating, replay, exactly-once, insufficient balance, bill changed, biller down, monthly limit, missed, tampered row, cancel), orchestrator `schedule.test.ts` (12).
- Eval: `eval/data/schedule.dev.jsonl` (26 cases, expected instants computed from the fixed clock, not labelled by a model). Haiku 5.5, tools mode: 26/26 end to end on the last run (earlier runs 23/26 and 25/26; the failures found three real bugs, fixed). **Dev only: scheduling is not in the frozen held-out set**, so no held-out number exists for it.
- Verified by hand in Chrome on 2026-10-16: schedule, confirm, list, cancel, clock advance, notification, failure notification, date-only flow, «جدولها» button, typed «اجدولها».

## Known limits
No recurring payments («كل شهر» asks for a single time). Latin-letter time words («ba3d sa3a») are not parsed (it asks again in Arabic). «12 بالليل» and «10:00» without AM/PM are asked, on purpose.

## 2026-10-21 readiness update

Scheduling is retained. Vague afternoon/day-part requests, invalid dates and unsupported 24:00 boundaries ask for clarification instead of inventing a time. Valid exact/relative schedules remain token-bound and separately approved. New developer cases cover scheduled transfers as well as bills. Current Gemini development evidence is in docs/30; historical Haiku scores above are not Gemini scores. Schedules live only as long as their in-memory hosted sandbox; a process restart/idle eviction discards them (docs/04).
