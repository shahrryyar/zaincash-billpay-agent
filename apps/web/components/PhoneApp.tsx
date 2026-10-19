"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { t, type CopyKey, type Lang } from "@zc/core";
import { ConfirmCard } from "./ConfirmCard";
import { MicButton } from "./MicButton";
import { simulatorWav } from "./recorder";
import type { Bubble, Envelope, Reply, ScheduleItem, VoiceEnvelope, VoiceInfo, WalletView } from "./types";

const fmt = (n: number) => n.toLocaleString("en-US");
const SESSION = typeof crypto !== "undefined" && "randomUUID" in crypto ? "" : "web";
const EXAMPLES: Record<"ar" | "ku", string[]> = {
  ar: ["دز خمسين ألف لأحمد", "ادفع المولدة", "شكد رصيدي", "حول لأمي ميت ألف"],
  ku: ["پەنجا هەزار بنێرە بۆ ئاراس", "پسوولەی مۆلیدە بدە", "باڵانسەکەم چەندە؟", "سەد هەزار بنێرە بۆ دایکم"], // <!-- VERIFY-DIALECT -->
};
const LANGS: { id: "ar" | "ku"; label: string; html: string }[] = [{ id: "ar", label: "عربي", html: "ar" }, { id: "ku", label: "کوردی", html: "ckb" }];

async function post(path: string, body: unknown): Promise<Envelope> {
  const r = await fetch(path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body), signal: AbortSignal.timeout(25_000) });
  if (!r.ok) throw new Error(`${path} ${r.status}`);
  return r.json();
}

export function PhoneApp() {
  const [sid, setSid] = useState<string>(SESSION || "web");
  // The language picker (top bar). Remembered per browser (a convenience only); every request carries it to the server.
  const [lang, setLangState] = useState<"ar" | "ku">("ar");
  const langRef = useRef(lang);
  langRef.current = lang;
  const tt = useCallback((key: CopyKey, vars: Record<string, string | number> = {}) => t(key, vars, lang as Lang), [lang]);
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
  const [sim, setSim] = useState<{ text: string; conf: string }>({ text: EXAMPLES.ar[0] as string, conf: "" });
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
    try { const d = await (await fetch(`/api/wallet?session_id=${encodeURIComponent(sidRef.current)}&lang=${langRef.current}`, { cache: "no-store" })).json(); setWallet(d.wallet); setMeta({ model: d.model, mode: d.mode, fault: d.fault }); setVoice(d.voice ?? null); syncSchedules(d.schedules ?? []); if (typeof d.server_now === "number") setSkewMs(Date.now() - d.server_now); setOffline(false); }
    catch { setOffline(true); }
  }, [syncSchedules]);
  // one sandbox per tab: the id survives a reload of this tab (sessionStorage), a new tab gets a fresh wallet
  useEffect(() => {
    let id = "";
    try { id = sessionStorage.getItem("zc_session") ?? ""; } catch { /* storage blocked: a fresh id each load */ }
    if (!id) { id = crypto.randomUUID(); try { sessionStorage.setItem("zc_session", id); } catch { /* ignore */ } }
    sidRef.current = id; setSid(id);
    let saved: string | null = null;
    try { saved = localStorage.getItem("zc_lang"); } catch { /* storage blocked: Arabic */ }
    if (saved === "ku" || saved === "ar") { langRef.current = saved; setLangState(saved); setSim((x) => ({ ...x, text: EXAMPLES[saved as "ar" | "ku"][0] as string })); }
    void refresh();
  }, [refresh]);
  useEffect(() => {
    const l = LANGS.find((x) => x.id === lang);
    if (l) document.documentElement.lang = l.html; // Kurdish is RTL too: dir stays rtl
    document.title = `${t("ui_title", {}, lang)} (${lang === "ku" ? "تاقیکاری" : "تجريبي"})`;
  }, [lang]);
  const chooseLang = (l: "ar" | "ku") => {
    if (l === lang) return;
    langRef.current = l; setLangState(l);
    try { localStorage.setItem("zc_lang", l); } catch { /* fine: it just is not remembered */ }
    setSim((x) => ({ ...x, text: EXAMPLES[l][0] as string }));
    void refresh(); // schedules panel in the new language
  };
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
      setBubbles((b) => [...b, { id: ++n.current, from: "agent", kind: "error", text: afterConfirm ? tt("unknown_outcome") : tt("busy") }]);
    }
    finally { setBusy(false); setWaiting(null); }
  }, [apply, tt]);
  const confirmCard = (cardId: string) => run(() => post("/api/confirm", { session_id: sid, card_id: cardId, lang }), undefined, "confirm", cardId);

  // While the wallet has not told us what happened to a payment, ask it again every few seconds (by the same key; never re-sends).
  const phase = reply?.phase;
  useEffect(() => {
    if (phase !== "UNKNOWN_OUTCOME") return;
    const timer = setInterval(() => { if (!busy) void post("/api/recheck", { session_id: sid, lang: langRef.current }).then(apply).catch(() => undefined); }, 5000);
    return () => clearInterval(timer);
  }, [phase, busy, sid, apply]);

  const send = (msg: string) => { const v = msg.trim(); if (!v || busy) return; setText(""); void run(() => post("/api/turn", { session_id: sid, text: v, lang }), v); };
  const say = (kind: Bubble["kind"], text: string) => setBubbles((b) => [...b, { id: ++n.current, from: "agent", kind, text }]);
  // Voice: the recording goes to our own server (the ASR key never reaches the browser). What the ASR heard is shown
  // as the user's bubble; the reply may be a read-back that waits for «صح» before anything else happens.
  const sendVoice = async (wav: Blob, simulate?: { text: string; conf: string }) => {
    if (busy) return;
    setBusy(true); setWaiting("voice");
    try {
      const f = new FormData();
      f.append("session_id", sid);
      f.append("lang", lang);
      f.append("file", wav, "utterance.wav");
      if (simulate) { f.append("sim_text", simulate.text); if (simulate.conf) f.append("sim_confidence", simulate.conf); }
      const r = await fetch("/api/voice", { method: "POST", body: f });
      const d = await r.json().catch(() => null);
      if (!r.ok || !d?.reply) { say("error", d?.message || tt("asr_unavailable")); return; }
      const env = d as VoiceEnvelope;
      if (env.transcript.text.trim()) setBubbles((b) => [...b, { id: ++n.current, from: "user", kind: "info", text: `🎤 ${env.transcript.text}` }]);
      apply(env);
    } catch { setOffline(true); say("error", tt("asr_unavailable")); }
    finally { setBusy(false); setWaiting(null); }
  };
  const answerReadback = (v: "accept" | "reject") => { if (!busy) void run(() => post("/api/turn", { session_id: sid, readback: v, lang }), tt(v === "accept" ? "readback_yes" : "readback_no")); };
  const editReadback = (heard: string) => { setText(heard); setReply((r) => (r ? { ...r, readback: null } : r)); inputRef.current?.focus(); };
  const micProblem = (key: CopyKey) => say(key === "mic_hold" ? "info" : "error", tt(key));
  const pick = (id: string, name: string) => { if (!busy) void run(() => post("/api/turn", { session_id: sid, choice: id, lang }), name); };
  const admin = async (body: object) => {
    try {
      const r = await fetch("/api/admin", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ session_id: sid, lang, ...body }), signal: AbortSignal.timeout(15_000) });
      const d = await r.json(); if (d.wallet) setWallet(d.wallet); if (d.schedules) syncSchedules(d.schedules); setMeta((m) => ({ ...m, fault: d.fault ?? null }));
      if (typeof d.server_now === "number") setSkewMs(Date.now() - d.server_now); // «قدّم الوقت» moves the card's countdown too
      return d;
    } catch { setOffline(true); return null; }
  };
  const cancelSchedule = async (id: string) => {
    let d: any = null;
    try { d = await (await fetch("/api/schedules/cancel", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ session_id: sid, id, lang }), signal: AbortSignal.timeout(15_000) })).json(); }
    catch { setOffline(true); }
    if (d?.schedules) { pending.current.delete(id); syncSchedules(d.schedules); }
    if (d?.cancelled) setReply((r) => (r && r.result?.scheduled?.id === id ? { ...r, result: null } : r));
    say(d?.cancelled ? "info" : "error", d?.cancelled ? tt("schedule_cancelled") : d ? tt("ui_cancel_schedule_failed") : tt("busy"));
  };
  const discussSchedule = () => { setSchedPanel(false); send(tt("ui_sched_request")); };
  const reset = async () => { await admin({ action: "reset" }); pending.current.clear(); setBubbles([]); setReply(null); setUncertain(null); };

  const card = reply?.card ?? null;
  const showCandidates = reply && reply.phase === "CLARIFYING" && reply.candidates.length > 0;

  return (
    <main className="min-h-dvh flex items-center justify-center md:p-6">
      <div className="relative flex flex-col w-full max-w-[430px] h-dvh md:h-[880px] md:max-h-[94dvh] bg-[var(--paper)] md:rounded-[34px] md:border-[10px] md:border-[#1b1f1d] overflow-hidden shadow-2xl">
        <header className="bg-[var(--ink)] text-white px-4 pt-4 pb-3">
          <div className="flex items-center justify-between gap-2">
            <h1 className="text-lg font-bold">{tt("ui_title")}</h1>
            <div role="group" aria-label={tt("ui_language")} className="flex shrink-0 rounded-full border border-white/40 p-0.5">
              {LANGS.map((l) => (
                <button key={l.id} lang={l.html} onClick={() => chooseLang(l.id)} aria-pressed={lang === l.id} disabled={busy}
                  className={`rounded-full px-3 min-h-9 text-sm font-semibold ${lang === l.id ? "bg-white text-[var(--ink)]" : "text-white/90"}`}>{l.label}</button>
              ))}
            </div>
          </div>
          <span className="mt-1 inline-block rounded-full bg-[#ffe8a3] text-[#5c3b00] text-xs font-bold px-2.5 py-1">{tt("ui_demo_badge")}</span>
          <div className="mt-2 flex items-end justify-between">
            <div>
              <div className="text-sm opacity-80">{tt("ui_balance")}</div>
              <div className="text-2xl font-bold nums" aria-live="polite">{wallet ? `${fmt(wallet.balance_iqd)} ${tt("ui_currency")}` : "…"}</div>
            </div>
            <div className="flex items-center gap-1">
              <button onClick={() => { setSchedPanel((p) => !p); setPanel(false); }} aria-expanded={schedPanel} className="text-sm rounded-full border border-white/40 px-3 min-h-11">{tt("ui_scheduled")}{schedules.filter((x) => x.status === "scheduled").length ? ` (${schedules.filter((x) => x.status === "scheduled").length})` : ""}</button>
              <button onClick={() => { setPanel((p) => !p); setSchedPanel(false); }} aria-expanded={panel} className="text-sm underline underline-offset-4 opacity-90 min-h-11 px-2">{tt("ui_demo_panel")}</button>
            </div>
          </div>
        </header>

        {schedPanel && (
          <section aria-label={tt("ui_scheduled")} className="bg-[#eef7f2] border-b border-[var(--line)] px-4 py-3 space-y-2 max-h-[45%] overflow-y-auto">
            <div className="flex items-center justify-between gap-2">
              <h2 className="font-bold">{tt("ui_sched_heading")}</h2>
              <button onClick={discussSchedule} disabled={busy} className="rounded-full bg-[var(--accent)] text-white text-sm font-semibold px-3 min-h-11">{tt("ui_sched_new")}</button>
            </div>
            {schedules.length === 0 && <p className="text-sm text-[var(--muted)]">{tt("ui_sched_empty")}</p>}
            <ul className="space-y-2">
              {schedules.map((x) => (
                <li key={x.id} className="rounded-xl bg-white border border-[var(--line)] p-3">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="font-semibold">{x.kind === "transfer" ? tt("ui_transfer_to", { name: x.counterparty }) : x.counterparty}</span>
                    <span className="nums font-semibold">{fmt(x.amount_iqd)} {tt("ui_currency")}</span>
                  </div>
                  <div className="text-sm text-[var(--muted)]">{x.when_text}{x.relative ? ` · ${x.relative}` : ""}</div>
                  <div className="mt-1 flex items-center justify-between gap-2">
                    <span className={`text-sm font-semibold ${x.status === "executed" ? "text-[#0b5a42]" : x.status === "failed" ? "text-[var(--bad)]" : x.status === "cancelled" ? "text-[var(--muted)]" : "text-[var(--warn)]"}`}>
                      {tt(x.status === "scheduled" ? "ui_status_scheduled" : x.status === "executed" ? "ui_status_executed" : x.status === "failed" ? "ui_status_failed" : "ui_status_cancelled")}
                    </span>
                    {x.status === "scheduled" && <button onClick={() => cancelSchedule(x.id)} className="text-sm rounded-lg border border-[var(--bad)] text-[var(--bad)] px-3 min-h-11">{tt("ui_cancel_schedule")}</button>}
                  </div>
                </li>
              ))}
            </ul>
          </section>
        )}

        {panel && (
          <section aria-label={tt("ui_demo_panel")} className="bg-[#fff8e6] border-b border-[var(--line)] px-4 py-3 text-base space-y-2">
            <p className="text-sm text-[var(--muted)]">{tt("ui_demo_only")} <span className="nums">{meta.model} · {meta.mode}</span></p>
            <div className="flex flex-wrap gap-2">
              <button className="rounded-lg border border-[var(--line)] bg-white px-3 min-h-11" onClick={() => admin({ action: "fault", kind: "timeout" })}>{tt("ui_fault_timeout")}</button>
              <button className="rounded-lg border border-[var(--line)] bg-white px-3 min-h-11" onClick={() => admin({ action: "fault", kind: "5xx" })}>{tt("ui_fault_5xx")}</button>
              <button className="rounded-lg border border-[var(--line)] bg-white px-3 min-h-11" onClick={() => admin({ action: "fault", kind: "biller_down" })}>{tt("ui_fault_biller")}</button>
              <button className="rounded-lg border border-[var(--line)] bg-white px-3 min-h-11" onClick={() => admin({ action: "advance", ms: 3_600_000 })}>{tt("ui_advance_hour")}</button>
              <button className="rounded-lg border border-[var(--line)] bg-white px-3 min-h-11" onClick={() => admin({ action: "advance", ms: 86_400_000 })}>{tt("ui_advance_day")}</button>
              <button className="rounded-lg border border-[var(--bad)] text-[var(--bad)] bg-white px-3 min-h-11" onClick={reset}>{tt("ui_reset")}</button>
            </div>
            {meta.fault && <p className="text-[var(--warn)] font-semibold">{tt("ui_fault_on")} {meta.fault}</p>}
            <p className="text-sm text-[var(--muted)]">{tt("ui_voice")} <span className="nums">{voice ? (voice.enabled ? voice.provider : "off") : "…"}</span></p>
            {voice?.simulator && (
              <div className="rounded-lg border border-dashed border-[var(--line)] bg-white p-2 space-y-2">
                <p className="text-sm text-[var(--muted)]">{tt("ui_sim_title")}</p>
                <input aria-label={tt("ui_sim_text")} value={sim.text} onChange={(e) => setSim((s) => ({ ...s, text: e.target.value }))} className="w-full min-h-11 rounded-lg border border-[var(--line)] px-3" />
                <div className="flex gap-2">
                  <select aria-label={tt("ui_sim_conf")} value={sim.conf} onChange={(e) => setSim((s) => ({ ...s, conf: e.target.value }))} className="min-h-11 rounded-lg border border-[var(--line)] px-2">
                    <option value="">{tt("ui_sim_noconf")}</option><option value="0.3">0.3</option><option value="0.6">0.6</option><option value="0.95">0.95</option>
                  </select>
                  <button disabled={busy} onClick={() => sendVoice(simulatorWav(), sim)} className="rounded-lg border border-[var(--line)] bg-[#fff8e6] px-3 min-h-11">{tt("ui_sim_send")}</button>
                </div>
              </div>
            )}
            <div>
              <h2 className="font-bold mb-1">{tt("ui_last_tx")}</h2>
              {wallet?.transactions.length ? (
                <ul className="space-y-1 text-sm">
                  {wallet.transactions.map((x) => (
                    <li key={x.reference} className="flex justify-between gap-2"><span>{x.counterparty}</span><span className="nums">{fmt(x.amount_iqd)} · {x.reference}</span></li>
                  ))}
                </ul>
              ) : <p className="text-sm text-[var(--muted)]">{tt("ui_no_tx")}</p>}
            </div>
          </section>
        )}

        <div className="flex-1 overflow-y-auto px-3 py-3 space-y-2.5" role="log" aria-live="polite">
          {bubbles.length === 0 && (
            <div className="rise text-center text-[var(--muted)] pt-6 px-4">
              <p className="text-xl font-semibold text-[var(--ink)]">{tt("ui_empty_title")}</p>
              <p className="mt-1">{tt("ui_empty_sub")}</p>
              <div className="mt-5 flex flex-wrap justify-center gap-2">
                {EXAMPLES[lang].map((e) => <button key={e} onClick={() => send(e)} className="rounded-full border border-[var(--line)] bg-white px-4 min-h-12">{e}</button>)}
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
            <ul className="space-y-2" aria-label={tt("ui_choose")}>
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
              lang={lang}
              busy={busy}
              skewMs={skewMs}
              onConfirm={() => confirmCard(card.card_id)}
              onCancel={() => run(() => post("/api/cancel", { session_id: sid, lang }))}
              onExpire={() => { if (!busy) void run(() => post("/api/tick", { session_id: sid, lang })); }}
              onSchedule={() => run(() => post("/api/schedule-card", { session_id: sid, card_id: card.card_id, lang }))}
            />
          )}
          {reply?.result && (
            <section className="rise rounded-2xl bg-[#e3f4ec] border-2 border-[#8ccdb3] p-4" aria-label={tt("ui_receipt")}>
              <h2 className="font-bold text-[#0b5a42]">{tt(reply.result.scheduled ? "ui_receipt_scheduled" : "ui_receipt_done")}</h2>
              <dl className="mt-1 text-base">
                <div className="flex justify-between"><dt className="text-[var(--muted)]">{tt("ui_amount")}</dt><dd className="nums font-semibold">{fmt(reply.result.amount_iqd)} {tt("ui_currency")}</dd></div>
                {reply.result.scheduled && <div className="flex justify-between gap-3"><dt className="text-[var(--muted)] shrink-0">{tt("ui_when")}</dt><dd className="font-semibold text-end">{reply.result.scheduled.when_text}</dd></div>}
                <div className="flex justify-between"><dt className="text-[var(--muted)]">{tt(reply.result.scheduled ? "ui_ref_sched" : "ui_ref_tx")}</dt><dd className="nums font-semibold">{reply.result.reference}</dd></div>
                {reply.result.balance_after_iqd !== null && <div className="flex justify-between"><dt className="text-[var(--muted)]">{tt("ui_balance_now")}</dt><dd className="nums font-semibold">{fmt(reply.result.balance_after_iqd)} {tt("ui_currency")}</dd></div>}
              </dl>
            </section>
          )}
          {busy && waiting === "think" && (
            <div className="flex justify-end" role="status" aria-label={tt("ui_typing")}>
              <div className="rounded-2xl rounded-se-sm bg-white border border-[var(--line)] px-4 py-3 flex gap-1.5" aria-hidden="true">
                <span className="dot" /><span className="dot" style={{ animationDelay: "150ms" }} /><span className="dot" style={{ animationDelay: "300ms" }} />
              </div>
            </div>
          )}
          {reply?.readback && (
            <section className="rise rounded-2xl border-2 border-[var(--accent)] bg-white p-4 space-y-3" aria-label={tt("ui_heard_confirm")}>
              <p className="text-lg font-semibold">«{reply.readback.text}»</p>
              <div className="flex flex-wrap gap-2">
                <button disabled={busy} onClick={() => answerReadback("accept")} className="rounded-full bg-[var(--accent)] text-white font-bold px-5 min-h-12">{tt("readback_yes")}</button>
                <button disabled={busy} onClick={() => answerReadback("reject")} className="rounded-full border-2 border-[var(--line)] px-5 min-h-12">{tt("readback_no")}</button>
                <button disabled={busy} onClick={() => editReadback(reply.readback!.text)} className="rounded-full border-2 border-[var(--line)] px-5 min-h-12">{tt("readback_edit")}</button>
              </div>
            </section>
          )}
          {uncertain && !busy && (
            <button onClick={() => confirmCard(uncertain)} className="rise w-full min-h-12 rounded-xl border-2 border-[var(--warn)] text-[var(--warn)] bg-white font-semibold">
              {tt("ui_recheck")}
            </button>
          )}
          {busy && waiting === "voice" && <p className="text-[var(--muted)] text-center" role="status">{tt("mic_transcribing")}</p>}
          {busy && waiting === "confirm" && <p className="text-[var(--muted)] text-center" role="status">{tt("ui_checking")}</p>}
          {offline && !busy && <p className="text-center text-[var(--bad)]" role="alert">{tt("ui_offline")}</p>}
          <div ref={endRef} />
        </div>

        {reply && (
          <div className="px-3 pb-1">
            <button onClick={() => setWhy((w) => !w)} aria-expanded={why} className="text-sm text-[var(--muted)] underline underline-offset-4 min-h-11">{tt("ui_why")}</button>
            {why && (
              <pre dir="ltr" className="mt-1 max-h-40 overflow-auto rounded-lg bg-[#10231c] text-[#c8f0de] text-xs p-3 text-left whitespace-pre-wrap">{JSON.stringify({ phase: reply.phase, intent: reply.trace.intent, resolution: reply.trace.resolution, lookups: reply.trace.tool_calls?.map((x) => x.name), audit: reply.audit.map((a) => `${a.event} → ${a.to}${a.reason ? ` (${a.reason})` : ""}`) }, null, 2)}</pre>
            )}
          </div>
        )}

        <form onSubmit={(e) => { e.preventDefault(); send(text); }} className="flex items-center gap-2 border-t border-[var(--line)] bg-white px-3 py-2.5">
          <label htmlFor="msg" className="sr-only">{tt("ui_placeholder")}</label>
          <input id="msg" ref={inputRef} value={text} onChange={(e) => setText(e.target.value)} autoComplete="off" enterKeyHint="send" placeholder={tt("ui_placeholder")} className="flex-1 min-w-0 min-h-12 rounded-full border-2 border-[var(--line)] bg-[var(--paper)] px-4 outline-none focus:border-[var(--accent)]" />
          {voice?.enabled && !text.trim() && <MicButton lang={lang} maxSeconds={voice.max_seconds} disabled={busy} onWav={(w) => void sendVoice(w)} onProblem={micProblem} />}
          <button type="submit" disabled={busy || !text.trim()} className="min-h-12 min-w-20 rounded-full bg-[var(--accent)] text-white font-bold px-5">{tt("ui_send")}</button>
        </form>
      </div>
    </main>
  );
}
