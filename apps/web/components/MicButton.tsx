"use client";
import { useEffect, useRef, useState } from "react";
import { t, type CopyKey, type Lang } from "@zc/core";
import { toWav16k } from "./recorder";

type Props = { maxSeconds: number; disabled: boolean; onWav: (wav: Blob) => void; onProblem: (key: CopyKey) => void; onPhase?: (phase: "starting" | "recording" | "processing") => void; onCancel?: () => void; lang?: Lang };

/** Push to talk: hold (pointer, or Space/Enter on the keyboard) to record, release to send. */
export function MicButton({ maxSeconds, disabled, onWav, onProblem, onPhase, onCancel, lang = "ar" }: Props) {
  const [state, setState] = useState<"idle" | "starting" | "recording" | "processing">("idle");
  const [secs, setSecs] = useState(0);
  const rec = useRef<MediaRecorder | null>(null);
  const stopWanted = useRef(false);
  const active = useRef(false);
  const cancelled = useRef(false);
  const mounted = useRef(true);
  const timers = useRef<{ tick?: ReturnType<typeof setInterval>; cap?: ReturnType<typeof setTimeout> }>({});

  useEffect(() => { mounted.current = true; return () => { mounted.current = false; cancelled.current = true; clearInterval(timers.current.tick); clearTimeout(timers.current.cap); rec.current?.stream.getTracks().forEach((x) => x.stop()); }; }, []);

  const stop = () => {
    if (active.current && !rec.current) stopWanted.current = true;
    else if (rec.current && rec.current.state === "recording") rec.current.stop();
  };

  const start = async () => {
    if (disabled || active.current) return;
    active.current = true;
    cancelled.current = false;
    stopWanted.current = false;
    setState("starting");
    onPhase?.("starting");
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true } });
    } catch {
      active.current = false;
      if (!mounted.current) return;
      setState("idle");
      if (cancelled.current) return;
      onProblem("mic_denied");
      return;
    }
    if (!mounted.current || cancelled.current || stopWanted.current) {
      stream.getTracks().forEach((x) => x.stop()); active.current = false;
      if (mounted.current) { setState("idle"); onCancel?.(); }
      return;
    }
    const chunks: Blob[] = [];
    let r: MediaRecorder;
    try { r = new MediaRecorder(stream); }
    catch { stream.getTracks().forEach((x) => x.stop()); active.current = false; setState("idle"); onProblem("asr_unavailable"); return; }
    rec.current = r;
    r.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
    r.onerror = () => {
      cancelled.current = true; active.current = false; rec.current = null;
      clearInterval(timers.current.tick); clearTimeout(timers.current.cap);
      stream.getTracks().forEach((x) => x.stop());
      if (mounted.current) { setState("idle"); setSecs(0); onProblem("asr_unavailable"); }
    };
    r.onstop = async () => {
      clearInterval(timers.current.tick); clearTimeout(timers.current.cap);
      stream.getTracks().forEach((x) => x.stop());
      if (!mounted.current || cancelled.current) { active.current = false; rec.current = null; if (mounted.current) { setState("idle"); setSecs(0); } return; }
      setState("processing");
      onPhase?.("processing");
      try {
        const out = await toWav16k(new Blob(chunks, { type: r.mimeType }));
        if (!mounted.current || cancelled.current) return;
        if (out.seconds < 0.3) onProblem("mic_hold");
        else if (out.level < 0.002) onProblem("asr_low"); // near silence: do not pay for ASR
        else onWav(out.wav);
      } catch {
        onProblem("asr_low");
      } finally {
        active.current = false; rec.current = null;
        if (mounted.current) { setState("idle"); setSecs(0); }
      }
    };
    try { r.start(); }
    catch { stream.getTracks().forEach((x) => x.stop()); rec.current = null; active.current = false; setState("idle"); onProblem("asr_unavailable"); return; }
    setState("recording");
    onPhase?.("recording");
    const began = Date.now();
    timers.current.tick = setInterval(() => setSecs(Math.floor((Date.now() - began) / 1000)), 250);
    timers.current.cap = setTimeout(() => { if (r.state === "recording") r.stop(); }, maxSeconds * 1000);
    if (stopWanted.current) r.stop();
  };

  const recording = state === "recording" || state === "starting";
  return (
    <div className="flex items-center gap-2">
      {state === "recording" && <span className="text-sm text-[var(--bad)] nums" role="status">{t("mic_listening", {}, lang)} {secs}s</span>}
      <button
        type="button"
        aria-label={t("mic_hold", {}, lang)}
        title={t("mic_hold", {}, lang)}
        aria-pressed={recording}
        disabled={disabled || state === "processing"}
        onPointerDown={(e) => { e.preventDefault(); (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId); void start(); }}
        onPointerUp={stop}
        onPointerCancel={() => { cancelled.current = true; stop(); onCancel?.(); }}
        onKeyDown={(e) => { if ((e.key === " " || e.key === "Enter") && !e.repeat) { e.preventDefault(); void start(); } }}
        onKeyUp={(e) => { if (e.key === " " || e.key === "Enter") { e.preventDefault(); stop(); } }}
        onContextMenu={(e) => e.preventDefault()}
        className={`min-h-12 min-w-12 rounded-full text-xl select-none touch-none border-2 ${recording ? "bg-[var(--bad)] border-[var(--bad)] text-white animate-pulse" : "bg-white border-[var(--line)]"}`}
      >
        🎤
      </button>
      {recording && <button type="button" onClick={() => { cancelled.current = true; stop(); onCancel?.(); }} className="min-h-12 px-2 underline text-sm">{t("voice_discard", {}, lang)}</button>}
    </div>
  );
}
