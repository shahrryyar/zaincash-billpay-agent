import type { Reply } from "@zc/orchestrator";

export type WalletView = {
  balance_iqd: number;
  transactions: { reference: string; kind: string; amount_iqd: number; counterparty: string; created_at: string | number }[];
};
export type Envelope = { reply: Reply; wallet: WalletView; fault: string | null; model: string; mode: string };
export type Bubble = { id: number; from: "user" | "agent"; kind: "info" | "ask" | "success" | "error" | "status" | "card"; text: string };
export type { Reply };
