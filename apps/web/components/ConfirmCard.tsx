"use client";
import { useEffect, useState } from "react";
import type { Reply } from "./types";

type Card = NonNullable<Reply["card"]>;
const fmt = (n: number) => n.toLocaleString("en-US");

/** The hero component (docs/15). Shows exactly what will happen, says nothing has been sent, and has a visible countdown. */
export function ConfirmCard({ card, busy, onConfirm, onCancel, onExpire }: { card: Card; busy: boolean; onConfirm: () => void; onCancel: () => void; onExpire: () => void }) {
  const [left, setLeft] = useState(() => Math.max(0, Math.ceil((card.expires_at - Date.now()) / 1000)));
  useEffect(() => {
    setLeft(Math.max(0, Math.ceil((card.expires_at - Date.now()) / 1000)));
    const t = setInterval(() => setLeft(Math.max(0, Math.ceil((card.expires_at - Date.now()) / 1000))), 500);
    return () => clearInterval(t);
  }, [card.card_id, card.expires_at]);
  useEffect(() => { if (left === 0) onExpire(); }, [left]); // eslint-disable-line react-hooks/exhaustive-deps
  const expired = left === 0;
  const mm = `${Math.floor(left / 60)}:${String(left % 60).padStart(2, "0")}`;

  const row = (label: string, value: React.ReactNode) => (
    <div className="flex items-baseline justify-between gap-3 py-1.5 border-b border-[var(--line)] last:border-0">
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
        {card.recipient && row("إلى", <>{card.recipient.name} <span className="nums text-[var(--muted)]">{card.recipient.masked}</span></>)}
        {card.biller && row("الفاتورة", <>{card.biller.name} <span className="nums text-[var(--muted)]">{card.biller.account_ref}</span></>)}
        {row("المبلغ", <><span className="nums text-2xl">{card.amount_text}</span><div className="text-sm font-normal text-[var(--muted)]">({card.amount_words})</div></>)}
        {row("الرسوم", <span className="nums">{card.fee_text}</span>)}
        {row("الرصيد", <span className="nums">{fmt(card.balance_before_iqd)} → {fmt(card.balance_after_iqd)} د.ع</span>)}
      </dl>
      {card.first_time_recipient && (
        <p role="note" className="mt-2 rounded-lg bg-[#fff3d6] px-3 py-2 text-[var(--warn)] font-semibold">⚠ أول مرة تدز لهذا الشخص. تأكد من الاسم والرقم.</p>
      )}
      <p className="mt-2 text-[var(--muted)] text-base" aria-live="polite">{expired ? "انتهى الوقت" : <>⏱ <span className="nums">{mm}</span></>}</p>
      <div className="mt-3 flex gap-3">
        <button disabled={busy || expired} onClick={onConfirm} className="flex-1 min-h-14 rounded-xl bg-[var(--accent)] text-[var(--accent-ink)] font-bold text-lg px-4">
          {card.labels.confirm}
        </button>
        <button disabled={busy} onClick={onCancel} className="min-h-14 rounded-xl border-2 border-[var(--line)] bg-white font-semibold px-5">
          {card.labels.cancel}
        </button>
      </div>
    </section>
  );
}
