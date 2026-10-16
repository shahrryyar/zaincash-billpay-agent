"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { ConfirmCard } from "./ConfirmCard";
import type { Bubble, Envelope, Reply, WalletView } from "./types";

const fmt = (n: number) => n.toLocaleString("en-US");
const SESSION = typeof crypto !== "undefined" && "randomUUID" in crypto ? "" : "web";
const EXAMPLES = ["دز خمسين ألف لأحمد", "ادفع المولدة", "شكد رصيدي", "حول لأمي ميت ألف"];

async function post(path: string, body: unknown): Promise<Envelope> {
  const r = await fetch(path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  if (!r.ok) throw new Error(`${path} ${r.status}`);
  return r.json();
}

export function PhoneApp() {
  const [sid, setSid] = useState<string>(SESSION || "web");
  const [bubbles, setBubbles] = useState<Bubble[]>([]);
  const [reply, setReply] = useState<Reply | null>(null);
  const [wallet, setWallet] = useState<WalletView | null>(null);
  const [meta, setMeta] = useState<{ model: string; mode: string; fault: string | null }>({ model: "", mode: "", fault: null });
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [waiting, setWaiting] = useState<"think" | "confirm" | null>(null);
  const [offline, setOffline] = useState(false);
  const [panel, setPanel] = useState(false);
  const [why, setWhy] = useState(false);
  const n = useRef(0);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => { setSid(crypto.randomUUID()); fetch("/api/wallet").then((r) => r.json()).then((d) => { setWallet(d.wallet); setMeta({ model: d.model, mode: d.mode, fault: d.fault }); }).catch(() => setOffline(true)); }, []);
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" }); }, [bubbles, reply?.card?.card_id, busy]);

  const apply = useCallback((env: Envelope) => {
    setOffline(false);
    setReply(env.reply);
    setWallet(env.wallet);
    setMeta({ model: env.model, mode: env.mode, fault: env.fault });
    setBubbles((b) => [
      ...b,
      ...env.reply.messages.filter((m) => m.kind !== "card").map((m) => ({ id: ++n.current, from: "agent" as const, kind: m.kind, text: m.text })),
    ]);
  }, []);

  // The user's message goes on screen immediately; only then do we wait for the agent (typing indicator).
  const run = useCallback(async (fn: () => Promise<Envelope>, userText?: string, kind: "think" | "confirm" = "think") => {
    if (userText) setBubbles((b) => [...b, { id: ++n.current, from: "user", kind: "info", text: userText }]);
    setBusy(true); setWaiting(kind);
    try { apply(await fn()); }
    catch { setOffline(true); setBubbles((b) => [...b, { id: ++n.current, from: "agent", kind: "error", text: "النظام مشغول هسه، جرب بعد شوية. ما صار أي تحويل." }]); }
    finally { setBusy(false); setWaiting(null); }
  }, [apply]);

  const send = (t: string) => { const v = t.trim(); if (!v || busy) return; setText(""); void run(() => post("/api/turn", { session_id: sid, text: v }), v); };
  const pick = (id: string, name: string) => { if (!busy) void run(() => post("/api/turn", { session_id: sid, choice: id }), name); };
  const admin = async (body: object) => { const r = await fetch("/api/admin", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ session_id: sid, ...body }) }); const d = await r.json(); if (d.wallet) setWallet(d.wallet); setMeta((m) => ({ ...m, fault: d.fault ?? null })); return d; };
  const reset = async () => { await admin({ action: "reset" }); setBubbles([]); setReply(null); setSid(crypto.randomUUID()); };

  const card = reply?.card ?? null;
  const showCandidates = reply && reply.phase === "CLARIFYING" && reply.candidates.length > 0;

  return (
    <main className="min-h-dvh flex items-center justify-center md:p-6">
      <div className="relative flex flex-col w-full max-w-[430px] h-dvh md:h-[880px] md:max-h-[94dvh] bg-[var(--paper)] md:rounded-[34px] md:border-[10px] md:border-[#1b1f1d] overflow-hidden shadow-2xl">
        <header className="bg-[var(--ink)] text-white px-4 pt-4 pb-3">
          <div className="flex items-center justify-between gap-2">
            <h1 className="text-lg font-bold">زين كاش · مساعد الدفع</h1>
            <span className="rounded-full bg-[#ffe8a3] text-[#5c3b00] text-xs font-bold px-2.5 py-1">محفظة تجريبية · بيانات وهمية</span>
          </div>
          <div className="mt-2 flex items-end justify-between">
            <div>
              <div className="text-sm opacity-80">رصيدك</div>
              <div className="text-2xl font-bold nums" aria-live="polite">{wallet ? `${fmt(wallet.balance_iqd)} د.ع` : "…"}</div>
            </div>
            <button onClick={() => setPanel((p) => !p)} aria-expanded={panel} className="text-sm underline underline-offset-4 opacity-90 min-h-11 px-2">لوحة العرض</button>
          </div>
        </header>

        {panel && (
          <section aria-label="لوحة العرض" className="bg-[#fff8e6] border-b border-[var(--line)] px-4 py-3 text-base space-y-2">
            <p className="text-sm text-[var(--muted)]">للعرض فقط: <span className="nums">{meta.model} · {meta.mode}</span></p>
            <div className="flex flex-wrap gap-2">
              <button className="rounded-lg border border-[var(--line)] bg-white px-3 min-h-11" onClick={() => admin({ action: "fault", kind: "timeout" })}>انقطاع بعد التنفيذ</button>
              <button className="rounded-lg border border-[var(--line)] bg-white px-3 min-h-11" onClick={() => admin({ action: "fault", kind: "5xx" })}>خطأ 5xx</button>
              <button className="rounded-lg border border-[var(--line)] bg-white px-3 min-h-11" onClick={() => admin({ action: "fault", kind: "biller_down" })}>المولدة واگفة</button>
              <button className="rounded-lg border border-[var(--bad)] text-[var(--bad)] bg-white px-3 min-h-11" onClick={reset}>إعادة ضبط</button>
            </div>
            {meta.fault && <p className="text-[var(--warn)] font-semibold">عطل مفعّل: {meta.fault}</p>}
            <div>
              <h2 className="font-bold mb-1">آخر العمليات</h2>
              {wallet?.transactions.length ? (
                <ul className="space-y-1 text-sm">
                  {wallet.transactions.map((t) => (
                    <li key={t.reference} className="flex justify-between gap-2"><span>{t.counterparty}</span><span className="nums">{fmt(t.amount_iqd)} · {t.reference}</span></li>
                  ))}
                </ul>
              ) : <p className="text-sm text-[var(--muted)]">ماكو عمليات</p>}
            </div>
          </section>
        )}

        <div className="flex-1 overflow-y-auto px-3 py-3 space-y-2.5" role="log" aria-live="polite">
          {bubbles.length === 0 && (
            <div className="rise text-center text-[var(--muted)] pt-6 px-4">
              <p className="text-xl font-semibold text-[var(--ink)]">اكتب طلبك بجملة وحدة</p>
              <p className="mt-1">نأكد عليك قبل ما ينرسل أي شي.</p>
              <div className="mt-5 flex flex-wrap justify-center gap-2">
                {EXAMPLES.map((e) => <button key={e} onClick={() => send(e)} className="rounded-full border border-[var(--line)] bg-white px-4 min-h-12">{e}</button>)}
              </div>
            </div>
          )}
          {bubbles.map((b) => (
            <div key={b.id} className={`rise flex ${b.from === "user" ? "justify-start" : "justify-end"}`}>
              <div className={`max-w-[88%] rounded-2xl px-4 py-2 ${b.from === "user" ? "bg-[var(--accent)] text-white rounded-ss-sm" : b.kind === "error" ? "bg-[#fde8e6] text-[var(--bad)] border border-[#f3c4bf]" : b.kind === "success" ? "bg-[#e3f4ec] text-[#0b5a42] border border-[#bfe3d3] font-semibold" : "bg-white border border-[var(--line)] rounded-se-sm"}`}>
                {b.text}
              </div>
            </div>
          ))}
          {showCandidates && reply && (
            <ul className="space-y-2" aria-label="اختر">
              {reply.candidates.map((c) => (
                <li key={c.id}>
                  <button disabled={busy} onClick={() => pick(c.id, c.name)} className="rise w-full text-start rounded-xl border-2 border-[var(--line)] bg-white px-4 min-h-14 flex items-center justify-between gap-3 hover:border-[var(--accent)]">
                    <span className="font-semibold">{c.name}{c.relation ? <span className="text-[var(--muted)] font-normal"> · {c.relation}</span> : null}</span>
                    <span className="nums text-[var(--muted)]">{c.masked}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          {card && (
            <ConfirmCard
              card={card}
              busy={busy}
              onConfirm={() => run(() => post("/api/confirm", { session_id: sid, card_id: card.card_id }), undefined, "confirm")}
              onCancel={() => run(() => post("/api/cancel", { session_id: sid }))}
              onExpire={() => { if (!busy) void run(() => post("/api/tick", { session_id: sid })); }}
            />
          )}
          {reply?.result && (
            <section className="rise rounded-2xl bg-[#e3f4ec] border-2 border-[#8ccdb3] p-4" aria-label="الإيصال">
              <h2 className="font-bold text-[#0b5a42]">✅ تمت العملية</h2>
              <dl className="mt-1 text-base">
                <div className="flex justify-between"><dt className="text-[var(--muted)]">المبلغ</dt><dd className="nums font-semibold">{fmt(reply.result.amount_iqd)} د.ع</dd></div>
                <div className="flex justify-between"><dt className="text-[var(--muted)]">رقم العملية</dt><dd className="nums font-semibold">{reply.result.reference}</dd></div>
                {reply.result.balance_after_iqd !== null && <div className="flex justify-between"><dt className="text-[var(--muted)]">رصيدك هسه</dt><dd className="nums font-semibold">{fmt(reply.result.balance_after_iqd)} د.ع</dd></div>}
              </dl>
            </section>
          )}
          {busy && waiting === "think" && (
            <div className="flex justify-end" role="status" aria-label="المساعد يكتب">
              <div className="rounded-2xl rounded-se-sm bg-white border border-[var(--line)] px-4 py-3 flex gap-1.5" aria-hidden="true">
                <span className="dot" /><span className="dot" style={{ animationDelay: "150ms" }} /><span className="dot" style={{ animationDelay: "300ms" }} />
              </div>
            </div>
          )}
          {busy && waiting === "confirm" && <p className="text-[var(--muted)] text-center" role="status">جاي نتأكد…</p>}
          {offline && !busy && <p className="text-center text-[var(--bad)]" role="alert">ماكو اتصال بالنظام.</p>}
          <div ref={endRef} />
        </div>

        {reply && (
          <div className="px-3 pb-1">
            <button onClick={() => setWhy((w) => !w)} aria-expanded={why} className="text-sm text-[var(--muted)] underline underline-offset-4 min-h-11">لماذا؟ (كيف فهم الطلب)</button>
            {why && (
              <pre dir="ltr" className="mt-1 max-h-40 overflow-auto rounded-lg bg-[#10231c] text-[#c8f0de] text-xs p-3 text-left whitespace-pre-wrap">{JSON.stringify({ phase: reply.phase, intent: reply.trace.intent, resolution: reply.trace.resolution, lookups: reply.trace.tool_calls?.map((t) => t.name), audit: reply.audit.map((a) => `${a.event} → ${a.to}${a.reason ? ` (${a.reason})` : ""}`) }, null, 2)}</pre>
            )}
          </div>
        )}

        <form onSubmit={(e) => { e.preventDefault(); send(text); }} className="flex items-center gap-2 border-t border-[var(--line)] bg-white px-3 py-2.5">
          <label htmlFor="msg" className="sr-only">اكتب طلبك</label>
          <input id="msg" value={text} onChange={(e) => setText(e.target.value)} autoComplete="off" enterKeyHint="send" placeholder="اكتب طلبك…" className="flex-1 min-w-0 min-h-12 rounded-full border-2 border-[var(--line)] bg-[var(--paper)] px-4 outline-none focus:border-[var(--accent)]" />
          <button type="submit" disabled={busy || !text.trim()} className="min-h-12 min-w-20 rounded-full bg-[var(--accent)] text-white font-bold px-5">دز</button>
        </form>
      </div>
    </main>
  );
}
