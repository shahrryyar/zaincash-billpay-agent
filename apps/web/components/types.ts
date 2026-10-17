import type { Reply } from "@zc/orchestrator";

export type WalletView = {
  balance_iqd: number;
  transactions: { reference: string; kind: string; amount_iqd: number; counterparty: string; created_at: string | number }[];
};
export type ScheduleItem = {
  id: string; reference: string; kind: "transfer" | "bill_pay"; status: "scheduled" | "executed" | "failed" | "cancelled"; run_at: number;
  amount_iqd: number; fee_iqd: number; counterparty: string; when_text: string; relative: string | null; notice: string | null; failure_code: string | null;
};
export type VoiceInfo = { enabled: boolean; provider: string; max_seconds: number; simulator: boolean };
export type Envelope = { reply: Reply; wallet: WalletView; schedules: ScheduleItem[]; fault: string | null; model: string; mode: string; voice?: VoiceInfo };
export type VoiceEnvelope = Envelope & { transcript: { text: string; confidence: number | null; provider: string; latency_ms: number } };
export type Bubble = { id: number; from: "user" | "agent"; kind: "info" | "ask" | "success" | "error" | "status" | "card"; text: string };
export type { Reply };
