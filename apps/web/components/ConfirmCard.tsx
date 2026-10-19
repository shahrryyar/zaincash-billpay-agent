"use client";
import { useEffect, useState } from "react";
import { t, type CopyKey, type Lang } from "@zc/core";
import type { Reply } from "./types";

type Card = NonNullable<Reply["card"]>;
const fmt = (n: number) => n.toLocaleString("en-US");

/** The hero component (docs/15). Shows exactly what will happen (and WHEN, for a schedule), says nothing is sent now, has a visible countdown. */
// `skewMs` = browser clock minus server clock, so the countdown matches the server's expiry even when the demo clock moved.
export function ConfirmCard({ card, lang = "ar", busy, skewMs = 0, onConfirm, onCancel, onExpire, onSchedule }: { card: Card; lang?: Lang; busy: boolean; skewMs?: number; onConfirm: () => void; onCancel: () => void; onExpire: () => void; onSchedule: () => void }) {
  const tt = (k: CopyKey) => t(k, {}, lang);
  const secondsLeft = () => Math.max(0, Math.ceil((card.expires_at - (Date.now() - skewMs)) / 1000));
  const [left, setLeft] = useState(secondsLeft);
  useEffect(() => {
    const tick = () => setLeft(secondsLeft());
    tick();
    const t = setInterval(tick, 500);
    return () => clearInterval(t);
  }, [card.card_id, card.expires_at, skewMs]); // eslint-disable-line react-hooks/exhaustive-deps
  // if the app was busy when the time ran out, tell the server as soon as it is free
  useEffect(() => { if (left === 0 && !busy) onExpire(); }, [left, busy]); // eslint-disable-line react-hooks/exhaustive-deps
  const expired = left === 0;
  const mm = `${Math.floor(left / 60)}:${String(left % 60).padStart(2, "0")}`;
  const sched = card.schedule;

  const row = (label: string, value: React.ReactNode, strong = false) => (
    <div className={`flex items-baseline justify-between gap-3 py-1.5 border-b border-[var(--line)] last:border-0 ${strong ? "bg-[#eef7f2] -mx-2 px-2 rounded-lg" : ""}`}>
      <dt className="text-[var(--muted)] text-base shrink-0">{label}</dt>
      <dd className="font-semibold text-end">{value}</dd>
    </div>
  );

  return (
    <section aria-label={card.title} className={`rise rounded-2xl bg-[var(--card)] border-2 ${expired ? "border-[var(--line)] opacity-60" : "border-[var(--accent)]"} p-4 shadow-sm`}>
      <header className="flex items-center justify-between gap-2 mb-2">
        <h2 className="text-xl font-bold">{card.title}</h2>
        <span className="rounded-full bg-[#fff3d6] text-[var(--warn)] px-3 py-0.5 text-sm font-semibold">{card.nothing_sent}</span>
      </header>
      <dl>
        {sched && row(tt("ui_when"), <>{sched.when_text}<div className="text-sm font-normal text-[var(--muted)]">({sched.relative})</div></>, true)}
        {card.recipient && row(tt("ui_card_to"), <>{card.recipient.name} <span className="nums text-[var(--muted)]">{card.recipient.masked}</span></>)}
        {card.biller && row(tt("ui_card_bill"), <>{card.biller.name} <span className="nums text-[var(--muted)]">{card.biller.account_ref}</span></>)}
        {row(tt("ui_amount"), <><span className="nums text-2xl">{card.amount_text}</span><div className="text-sm font-normal text-[var(--muted)]">({card.amount_words})</div></>)}
        {row(tt("ui_card_fee"), <span className="nums">{card.fee_text}</span>)}
        {sched
          ? row(tt("ui_card_balance_now"), <span className="nums">{fmt(card.balance_before_iqd)} {tt("ui_currency")}</span>)
          : row(tt("ui_card_balance"), <span className="nums">{fmt(card.balance_before_iqd)} → {fmt(card.balance_after_iqd)} {tt("ui_currency")}</span>)}
      </dl>
      {sched && <p className="mt-2 text-sm text-[var(--muted)]">{sched.note}</p>}
      {sched?.low_balance_warning && <p role="note" className="mt-2 rounded-lg bg-[#fff3d6] px-3 py-2 text-[var(--warn)] font-semibold">{sched.low_balance_warning}</p>}
      {card.first_time_recipient && (
        <p role="note" className="mt-2 rounded-lg bg-[#fff3d6] px-3 py-2 text-[var(--warn)] font-semibold">⚠ {tt("first_time_recipient")}</p>
      )}
      <p className="mt-2 text-[var(--muted)] text-base" aria-live="polite">{expired ? tt("ui_card_expired") : <>⏱ <span className="nums">{mm}</span></>}</p>
      <div className="mt-3 flex gap-3">
        <button disabled={busy || expired} onClick={onConfirm} className="flex-1 min-h-14 rounded-xl bg-[var(--accent)] text-[var(--accent-ink)] font-bold text-lg px-4">
          {card.labels.confirm}
        </button>
        <button disabled={busy} onClick={onCancel} className="min-h-14 rounded-xl border-2 border-[var(--line)] bg-white font-semibold px-5">
          {card.labels.cancel}
        </button>
      </div>
      {!sched && (
        <button disabled={busy || expired} onClick={onSchedule} className="mt-2 w-full min-h-12 rounded-xl border-2 border-dashed border-[var(--accent)] text-[var(--accent)] bg-white font-semibold">
          {tt("ui_card_schedule")}
        </button>
      )}
    </section>
  );
}
