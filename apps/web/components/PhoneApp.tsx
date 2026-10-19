"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { t, type CopyKey } from "@zc/core";
import { ConfirmCard } from "./ConfirmCard";
import { MicButton } from "./MicButton";
import { simulatorWav } from "./recorder";
import type { Bubble, Envelope, Reply, ScheduleItem, VoiceEnvelope, VoiceInfo, WalletView } from "./types";

const fmt = (n: number) => n.toLocaleString("en-US");
const SESSION = typeof crypto !== "undefined" && "randomUUID" in crypto ? "" : "web";
const EXAMPLES = ["دز خمسين ألف لأحمد", "ادفع المولدة", "شكد رصيدي", "حول لأمي ميت ألف"];

async function post(path: string, body: unknown): Promise<Envelope> {
  const r = await fetch(path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body), signal: AbortSignal.timeout(25_000) });
  if (!r.ok) throw new Error(`${path} ${r.status}`);
  return r.json();
}

export function PhoneApp() {
  const [sid, setSid] = useState<string>(SESSION || "web");
  const sidRef = useRef(sid);
  sidRef.current = sid;
  const [bubbles, setBubbles] = useState<Bubble[]>([]);
  const [reply, setReply] = useState<Reply | null>(null);
  const [wallet, setWallet] = useState<WalletView | null>(null);
  const [meta, setMeta] = useState<{ model: string; mode: string; fault: string | null }>({ model: "", mode: "", fault: null });
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [waiting, setWaiting] = useState<"think" | "confirm" | "voice" | null>(null);
  const [voice, setVoice] = useState<VoiceInfo | null>(null);
  const [sim, setSim] = useState<{ text: string; conf: string }>({ text: "دز خمسين ألف لأحمد", conf: "" });
  const inputRef = useRef<HTMLInputElement>(null);
  const [offline, setOffline] = useState(false);
  const [panel, setPanel] = useState(false);
  const [schedPanel, setSchedPanel] = useState(false);
  const [schedules, setSchedules] = useState<ScheduleItem[]>([]);
  const pending = useRef<Set<string>>(new Set());
  const [why, setWhy] = useState(false);
  /** Browser clock minus server clock: the card's countdown follows the server (the demo clock can be moved forward). */
  const [skewMs, setSkewMs] = useState(0);
  /** Confirm was tapped but no answer came back: the payment may or may not have happened. Holds the card id to re-ask. */
  const [uncertain, setUncertain] = useState<string | null>(null);
  const n = useRef(0);
  const endRef = useRef<HTMLDivElement>(null);

  // Schedules that were pending and have now run (or failed) are announced in the chat, once.
  const syncSchedules = useCallback((list: ScheduleItem[]) => {
    setSchedules(list);
    const fresh: Bubble[] = [];
    for (const x of list) {
      if (x.status === "scheduled") pending.current.add(x.id);
      else if (pending.current.has(x.id) && x.notice) { pending.current.delete(x.id); fresh.push({ id: ++n.current, from: "agent", kind: x.status === "executed" ? "success" : "error", text: x.notice }); }
      else pending.current.delete(x.id);
    }
    if (fresh.length) setBubbles((b) => [...b, ...fresh]);
  }, []);
  const refresh = useCallback(async () => {
    try { const d = await (await fetch(`/api/wallet?session_id=${encodeURIComponent(sidRef.current)}`, { cache: "no-store" })).json(); setWallet(d.wallet); setMeta({ model: d.model, mode: d.mode, fault: d.fault }); setVoice(d.voice ?? null); syncSchedules(d.schedules ?? []); if (typeof d.server_now === "number") setSkewMs(Date.now() - d.server_now); setOffline(false); }
    catch { setOffline(true); }
  }, [syncSchedules]);
  // one sandbox per tab: the id survives a reload of this tab (sessionStorage), a new tab gets a fresh wallet
  useEffect(() => {
    let id = "";
    try { id = sessionStorage.getItem("zc_session") ?? ""; } catch { /* storage blocked: a fresh id each load */ }
    if (!id) { id = crypto.randomUUID(); try { sessionStorage.setItem("zc_session", id); } catch { /* ignore */ } }
    sidRef.current = id; setSid(id); void refresh();
  }, [refresh]);
  useEffect(() => { const t = setInterval(() => { if (document.visibilityState === "visible") void refresh(); }, 4000); return () => clearInterval(t); }, [refresh]);
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" }); }, [bubbles, reply?.card?.card_id, busy]);

  const apply = useCallback((env: Envelope) => {
    setOffline(false);
    setUncertain(null);
    if (typeof env.server_now === "number") setSkewMs(Date.now() - env.server_now);
    setReply(env.reply);
    setWallet(env.wallet);
    setMeta({ model: env.model, mode: env.mode, fault: env.fault });
    if (env.voice) setVoice(env.voice);
    if (env.schedules) syncSchedules(env.schedules);
    setBubbles((b) => [
      ...b,
      ...env.reply.messages.filter((m) => m.kind !== "card").map((m) => ({ id: ++n.current, from: "agent" as const, kind: m.kind, text: m.text })),
    ]);
  }, [syncSchedules]);

  // The user's message goes on screen immediately; only then do we wait for the agent (typing indicator).
  // `afterConfirm`: the request was a Confirm, so a lost answer means "we don't know", never "nothing was sent".
  const run = useCallback(async (fn: () => Promise<Envelope>, userText?: string, kind: "think" | "confirm" = "think", afterConfirm?: string) => {
    if (userText) setBubbles((b) => [...b, { id: ++n.current, from: "user", kind: "info", text: userText }]);
    setBusy(true); setWaiting(kind);
    try { apply(await fn()); }
    catch {
      setOffline(true);
      if (afterConfirm) setUncertain(afterConfirm);
      setBubbles((b) => [...b, { id: ++n.current, from: "agent", kind: "error", text: afterConfirm ? t("unknown_outcome") : t("busy") }]);
    }
    finally { setBusy(false); setWaiting(null); }
  }, [apply]);
  const confirmCard = (cardId: string) => run(() => post("/api/confirm", { session_id: sid, card_id: cardId }), undefined, "confirm", cardId);

  // While the wallet has not told us what happened to a payment, ask it again every few seconds (by the same key; never re-sends).
  const phase = reply?.phase;
  useEffect(() => {
    if (phase !== "UNKNOWN_OUTCOME") return;
    const timer = setInterval(() => { if (!busy) void post("/api/recheck", { session_id: sid }).then(apply).catch(() => undefined); }, 5000);
    return () => clearInterval(timer);
  }, [phase, busy, sid, apply]);

  const send = (t: string) => { const v = t.trim(); if (!v || busy) return; setText(""); void run(() => post("/api/turn", { session_id: sid, text: v }), v); };
  const say = (kind: Bubble["kind"], text: string) => setBubbles((b) => [...b, { id: ++n.current, from: "agent", kind, text }]);
  // Voice: the recording goes to our own server (the ASR key never reaches the browser). What the ASR heard is shown
  // as the user's bubble; the reply may be a read-back that waits for «صح» before anything else happens.
  const sendVoice = async (wav: Blob, simulate?: { text: string; conf: string }) => {
    if (busy) return;
    setBusy(true); setWaiting("voice");
    try {
      const f = new FormData();
      f.append("session_id", sid);
      f.append("file", wav, "utterance.wav");
      if (simulate) { f.append("sim_text", simulate.text); if (simulate.conf) f.append("sim_confidence", simulate.conf); }
      const r = await fetch("/api/voice", { method: "POST", body: f });
      const d = await r.json().catch(() => null);
      if (!r.ok || !d?.reply) { say("error", d?.message || t("asr_unavailable")); return; }
      const env = d as VoiceEnvelope;
      if (env.transcript.text.trim()) setBubbles((b) => [...b, { id: ++n.current, from: "user", kind: "info", text: `🎤 ${env.transcript.text}` }]);
      apply(env);
    } catch { setOffline(true); say("error", t("asr_unavailable")); }
    finally { setBusy(false); setWaiting(null); }
  };
  const answerReadback = (v: "accept" | "reject") => { if (!busy) void run(() => post("/api/turn", { session_id: sid, readback: v }), t(v === "accept" ? "readback_yes" : "readback_no")); };
  const editReadback = (heard: string) => { setText(heard); setReply((r) => (r ? { ...r, readback: null } : r)); inputRef.current?.focus(); };
  const micProblem = (key: CopyKey) => say(key === "mic_hold" ? "info" : "error", t(key));
  const pick = (id: string, name: string) => { if (!busy) void run(() => post("/api/turn", { session_id: sid, choice: id }), name); };
  const admin = async (body: object) => {
    try {
      const r = await fetch("/api/admin", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ session_id: sid, ...body }), signal: AbortSignal.timeout(15_000) });
      const d = await r.json(); if (d.wallet) setWallet(d.wallet); if (d.schedules) syncSchedules(d.schedules); setMeta((m) => ({ ...m, fault: d.fault ?? null }));
      if (typeof d.server_now === "number") setSkewMs(Date.now() - d.server_now); // «قدّم الوقت» moves the card's countdown too
      return d;
    } catch { setOffline(true); return null; }
  };
  const cancelSchedule = async (id: string) => {
    let d: any = null;
    try { d = await (await fetch("/api/schedules/cancel", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ session_id: sid, id }), signal: AbortSignal.timeout(15_000) })).json(); }
    catch { setOffline(true); }
    if (d?.schedules) { pending.current.delete(id); syncSchedules(d.schedules); }
    if (d?.cancelled) setReply((r) => (r && r.result?.scheduled?.id === id ? { ...r, result: null } : r));
    say(d?.cancelled ? "info" : "error", d?.cancelled ? t("schedule_cancelled") : d ? "ما گدرت ألغيها، يمكن تنفذت أو انلغت من قبل." : t("busy"));
  };
  const discussSchedule = () => { setSchedPanel(false); send("اريد أجدول دفعة"); };
  const reset = async () => { await admin({ action: "reset" }); pending.current.clear(); setBubbles([]); setReply(null); setUncertain(null); };

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
            <div className="flex items-center gap-1">
              <button onClick={() => { setSchedPanel((p) => !p); setPanel(false); }} aria-expanded={schedPanel} className="text-sm rounded-full border border-white/40 px-3 min-h-11">🕒 المجدولة{schedules.filter((x) => x.status === "scheduled").length ? ` (${schedules.filter((x) => x.status === "scheduled").length})` : ""}</button>
              <button onClick={() => { setPanel((p) => !p); setSchedPanel(false); }} aria-expanded={panel} className="text-sm underline underline-offset-4 opacity-90 min-h-11 px-2">لوحة العرض</button>
            </div>
          </div>
        </header>

        {schedPanel && (
          <section aria-label="المجدولة" className="bg-[#eef7f2] border-b border-[var(--line)] px-4 py-3 space-y-2 max-h-[45%] overflow-y-auto">
            <div className="flex items-center justify-between gap-2">
              <h2 className="font-bold">دفعاتك المجدولة</h2>
              <button onClick={discussSchedule} disabled={busy} className="rounded-full bg-[var(--accent)] text-white text-sm font-semibold px-3 min-h-11">ناقش جدولة جديدة مع المساعد</button>
            </div>
            {schedules.length === 0 && <p className="text-sm text-[var(--muted)]">ماكو دفعات مجدولة. اكتب مثلاً «ادفع المولدة باچر الساعة 9 الصبح».</p>}
            <ul className="space-y-2">
              {schedules.map((x) => (
                <li key={x.id} className="rounded-xl bg-white border border-[var(--line)] p-3">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="font-semibold">{x.kind === "transfer" ? `تحويل لـ${x.counterparty}` : x.counterparty}</span>
                    <span className="nums font-semibold">{fmt(x.amount_iqd)} د.ع</span>
                  </div>
                  <div className="text-sm text-[var(--muted)]">{x.when_text}{x.relative ? ` · ${x.relative}` : ""}</div>
                  <div className="mt-1 flex items-center justify-between gap-2">
                    <span className={`text-sm font-semibold ${x.status === "executed" ? "text-[#0b5a42]" : x.status === "failed" ? "text-[var(--bad)]" : x.status === "cancelled" ? "text-[var(--muted)]" : "text-[var(--warn)]"}`}>
                      {x.status === "scheduled" ? "بالانتظار" : x.status === "executed" ? "✅ تنفذت" : x.status === "failed" ? "⛔ ما تنفذت" : "ملغية"}
                    </span>
                    {x.status === "scheduled" && <button onClick={() => cancelSchedule(x.id)} className="text-sm rounded-lg border border-[var(--bad)] text-[var(--bad)] px-3 min-h-11">إلغاء الجدولة</button>}
                  </div>
                </li>
              ))}
            </ul>
          </section>
        )}

        {panel && (
          <section aria-label="لوحة العرض" className="bg-[#fff8e6] border-b border-[var(--line)] px-4 py-3 text-base space-y-2">
            <p className="text-sm text-[var(--muted)]">للعرض فقط: <span className="nums">{meta.model} · {meta.mode}</span></p>
            <div className="flex flex-wrap gap-2">
              <button className="rounded-lg border border-[var(--line)] bg-white px-3 min-h-11" onClick={() => admin({ action: "fault", kind: "timeout" })}>انقطاع بعد التنفيذ</button>
              <button className="rounded-lg border border-[var(--line)] bg-white px-3 min-h-11" onClick={() => admin({ action: "fault", kind: "5xx" })}>خطأ 5xx</button>
              <button className="rounded-lg border border-[var(--line)] bg-white px-3 min-h-11" onClick={() => admin({ action: "fault", kind: "biller_down" })}>المولدة واگفة</button>
              <button className="rounded-lg border border-[var(--line)] bg-white px-3 min-h-11" onClick={() => admin({ action: "advance", ms: 3_600_000 })}>قدّم الوقت ساعة</button>
              <button className="rounded-lg border border-[var(--line)] bg-white px-3 min-h-11" onClick={() => admin({ action: "advance", ms: 86_400_000 })}>قدّم الوقت يوم</button>
              <button className="rounded-lg border border-[var(--bad)] text-[var(--bad)] bg-white px-3 min-h-11" onClick={reset}>إعادة ضبط</button>
            </div>
            {meta.fault && <p className="text-[var(--warn)] font-semibold">عطل مفعّل: {meta.fault}</p>}
            <p className="text-sm text-[var(--muted)]">الصوت: <span className="nums">{voice ? (voice.enabled ? voice.provider : "off") : "…"}</span></p>
            {voice?.simulator && (
              <div className="rounded-lg border border-dashed border-[var(--line)] bg-white p-2 space-y-2">
                <p className="text-sm text-[var(--muted)]">محاكاة صوت (ASR وهمي، ما يسمع شي): نص + ثقة</p>
                <input aria-label="نص المحاكاة" value={sim.text} onChange={(e) => setSim((s) => ({ ...s, text: e.target.value }))} className="w-full min-h-11 rounded-lg border border-[var(--line)] px-3" />
                <div className="flex gap-2">
                  <select aria-label="الثقة" value={sim.conf} onChange={(e) => setSim((s) => ({ ...s, conf: e.target.value }))} className="min-h-11 rounded-lg border border-[var(--line)] px-2">
                    <option value="">بدون ثقة</option><option value="0.3">0.3</option><option value="0.6">0.6</option><option value="0.95">0.95</option>
                  </select>
                  <button disabled={busy} onClick={() => sendVoice(simulatorWav(), sim)} className="rounded-lg border border-[var(--line)] bg-[#fff8e6] px-3 min-h-11">🎤 أرسل كصوت</button>
                </div>
              </div>
            )}
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
              skewMs={skewMs}
              onConfirm={() => confirmCard(card.card_id)}
              onCancel={() => run(() => post("/api/cancel", { session_id: sid }))}
              onExpire={() => { if (!busy) void run(() => post("/api/tick", { session_id: sid })); }}
              onSchedule={() => run(() => post("/api/schedule-card", { session_id: sid, card_id: card.card_id }))}
            />
          )}
          {reply?.result && (
            <section className="rise rounded-2xl bg-[#e3f4ec] border-2 border-[#8ccdb3] p-4" aria-label="الإيصال">
              <h2 className="font-bold text-[#0b5a42]">{reply.result.scheduled ? "🕒 انجدولت العملية" : "✅ تمت العملية"}</h2>
              <dl className="mt-1 text-base">
                <div className="flex justify-between"><dt className="text-[var(--muted)]">المبلغ</dt><dd className="nums font-semibold">{fmt(reply.result.amount_iqd)} د.ع</dd></div>
                {reply.result.scheduled && <div className="flex justify-between gap-3"><dt className="text-[var(--muted)] shrink-0">الموعد</dt><dd className="font-semibold text-end">{reply.result.scheduled.when_text}</dd></div>}
                <div className="flex justify-between"><dt className="text-[var(--muted)]">{reply.result.scheduled ? "رقم الجدولة" : "رقم العملية"}</dt><dd className="nums font-semibold">{reply.result.reference}</dd></div>
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
          {reply?.readback && (
            <section className="rise rounded-2xl border-2 border-[var(--accent)] bg-white p-4 space-y-3" aria-label="تأكيد اللي سمعته">
              <p className="text-lg font-semibold">«{reply.readback.text}»</p>
              <div className="flex flex-wrap gap-2">
                <button disabled={busy} onClick={() => answerReadback("accept")} className="rounded-full bg-[var(--accent)] text-white font-bold px-5 min-h-12">{t("readback_yes")}</button>
                <button disabled={busy} onClick={() => answerReadback("reject")} className="rounded-full border-2 border-[var(--line)] px-5 min-h-12">{t("readback_no")}</button>
                <button disabled={busy} onClick={() => editReadback(reply.readback!.text)} className="rounded-full border-2 border-[var(--line)] px-5 min-h-12">{t("readback_edit")}</button>
              </div>
            </section>
          )}
          {uncertain && !busy && (
            <button onClick={() => confirmCard(uncertain)} className="rise w-full min-h-12 rounded-xl border-2 border-[var(--warn)] text-[var(--warn)] bg-white font-semibold">
              تحقق شصار بالعملية (ما راح ينرسل مرتين)
            </button>
          )}
          {busy && waiting === "voice" && <p className="text-[var(--muted)] text-center" role="status">{t("mic_transcribing")}</p>}
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
          <input id="msg" ref={inputRef} value={text} onChange={(e) => setText(e.target.value)} autoComplete="off" enterKeyHint="send" placeholder="اكتب طلبك…" className="flex-1 min-w-0 min-h-12 rounded-full border-2 border-[var(--line)] bg-[var(--paper)] px-4 outline-none focus:border-[var(--accent)]" />
          {voice?.enabled && !text.trim() && <MicButton maxSeconds={voice.max_seconds} disabled={busy} onWav={(w) => void sendVoice(w)} onProblem={micProblem} />}
          <button type="submit" disabled={busy || !text.trim()} className="min-h-12 min-w-20 rounded-full bg-[var(--accent)] text-white font-bold px-5">دز</button>
        </form>
      </div>
    </main>
  );
}
