"use client";
import { useEffect, useRef, useState } from "react";
import { t, type CopyKey, type Lang } from "@zc/core";
import { toWav16k } from "./recorder";

type Props = { maxSeconds: number; disabled: boolean; onWav: (wav: Blob) => void; onProblem: (key: CopyKey) => void; lang?: Lang };

/** Push to talk: hold (pointer, or Space/Enter on the keyboard) to record, release to send. */
export function MicButton({ maxSeconds, disabled, onWav, onProblem, lang = "ar" }: Props) {
  const [state, setState] = useState<"idle" | "starting" | "recording" | "processing">("idle");
  const [secs, setSecs] = useState(0);
  const rec = useRef<MediaRecorder | null>(null);
  const stopWanted = useRef(false);
  const timers = useRef<{ tick?: ReturnType<typeof setInterval>; cap?: ReturnType<typeof setTimeout> }>({});

  useEffect(() => () => { clearInterval(timers.current.tick); clearTimeout(timers.current.cap); rec.current?.stream.getTracks().forEach((x) => x.stop()); }, []);

  const stop = () => {
    if (state === "starting") stopWanted.current = true;
    else if (rec.current && rec.current.state === "recording") rec.current.stop();
  };

  const start = async () => {
    if (disabled || state !== "idle") return;
    stopWanted.current = false;
    setState("starting");
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true } });
    } catch {
      setState("idle");
      onProblem("mic_denied");
      return;
    }
    const chunks: Blob[] = [];
    const r = new MediaRecorder(stream);
    rec.current = r;
    r.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
    r.onstop = async () => {
      clearInterval(timers.current.tick); clearTimeout(timers.current.cap);
      stream.getTracks().forEach((x) => x.stop());
      setState("processing");
      try {
        const out = await toWav16k(new Blob(chunks, { type: r.mimeType }));
        if (out.seconds < 0.3) onProblem("mic_hold");
        else if (out.level < 0.002) onProblem("asr_low"); // near silence: do not pay for ASR
        else onWav(out.wav);
      } catch {
        onProblem("asr_low");
      } finally {
        setState("idle");
        setSecs(0);
      }
    };
    r.start();
    setState("recording");
    const began = Date.now();
    timers.current.tick = setInterval(() => setSecs(Math.floor((Date.now() - began) / 1000)), 250);
    timers.current.cap = setTimeout(() => { if (r.state === "recording") r.stop(); }, maxSeconds * 1000);
    if (stopWanted.current) r.stop();
  };

  const recording = state === "recording" || state === "starting";
  return (
    <div className="flex items-center gap-2">
      {recording && <span className="text-sm text-[var(--bad)] nums" role="status">{t("mic_listening", {}, lang)} {secs}s</span>}
      <button
        type="button"
        aria-label={t("mic_hold", {}, lang)}
        title={t("mic_hold", {}, lang)}
        aria-pressed={recording}
        disabled={disabled || state === "processing"}
        onPointerDown={(e) => { e.preventDefault(); (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId); void start(); }}
        onPointerUp={stop}
        onPointerCancel={stop}
        onKeyDown={(e) => { if ((e.key === " " || e.key === "Enter") && !e.repeat) { e.preventDefault(); void start(); } }}
        onKeyUp={(e) => { if (e.key === " " || e.key === "Enter") { e.preventDefault(); stop(); } }}
        onContextMenu={(e) => e.preventDefault()}
        className={`min-h-12 min-w-12 rounded-full text-xl select-none touch-none border-2 ${recording ? "bg-[var(--bad)] border-[var(--bad)] text-white animate-pulse" : "bg-white border-[var(--line)]"}`}
      >
        🎤
      </button>
    </div>
  );
}
