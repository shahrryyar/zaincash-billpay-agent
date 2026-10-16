import type { Reply } from "@zc/orchestrator";

export type WalletView = {
  balance_iqd: number;
  transactions: { reference: string; kind: string; amount_iqd: number; counterparty: string; created_at: string | number }[];
};
export type ScheduleItem = {
  id: string; reference: string; kind: "transfer" | "bill_pay"; status: "scheduled" | "executed" | "failed" | "cancelled"; run_at: number;
  amount_iqd: number; fee_iqd: number; counterparty: string; when_text: string; relative: string | null; notice: string | null; failure_code: string | null;
};
export type Envelope = { reply: Reply; wallet: WalletView; schedules: ScheduleItem[]; fault: string | null; model: string; mode: string };
export type Bubble = { id: number; from: "user" | "agent"; kind: "info" | "ask" | "success" | "error" | "status" | "card"; text: string };
export type { Reply };
