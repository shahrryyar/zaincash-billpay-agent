import type { Action, Contact, MachineState, Payload, Phase } from "@zc/core";
import type { ToolTrace, Usage } from "@zc/llm";

export type AgentMessage = { kind: "info" | "ask" | "success" | "error" | "status" | "card"; text: string };
export type CandidateView = { id: string; name: string; masked: string; relation: string | null };

/** What the UI shows on the confirmation card. Never contains the token, the payload hash or the idempotency key. */
export type CardView = {
  card_id: string;
  kind: "transfer" | "bill_pay";
  title: string;
  recipient: { name: string; masked: string } | null;
  biller: { name: string; account_ref: string } | null;
  amount_iqd: number;
  amount_text: string;
  amount_words: string;
  fee_iqd: number;
  fee_text: string;
  total_iqd: number;
  balance_before_iqd: number;
  balance_after_iqd: number;
  first_time_recipient: boolean;
  expires_at: number;
  ttl_seconds: number;
  nothing_sent: string;
  labels: { confirm: string; cancel: string };
};

export type AuditEntry = { ts: number; session_id: string; from: Phase; to: Phase; event: string; reason?: string };

export type Trace = {
  intent?: unknown; model?: string; mode?: string; tool_calls?: ToolTrace[]; usage?: Usage;
  resolution?: unknown; quote?: unknown; issues?: string[]; llm_error?: string;
};

export type Reply = {
  session_id: string;
  phase: Phase;
  messages: AgentMessage[];
  card: CardView | null;
  candidates: CandidateView[];
  result: { reference: string; amount_iqd: number; balance_after_iqd: number | null } | null;
  audit: AuditEntry[];
  trace: Trace;
};

export type BillAccount = {
  id: string; biller_id: string; biller_code: string; biller_name_ar: string; account_ref: string; fee_iqd: number;
  bill: { id: string; amount_iqd: number; due_date: string; status: string } | null;
};
export type Quote = { ok: boolean; amount_iqd: number; fee_iqd: number; total_iqd: number; balance_after_iqd: number; errors: string[]; counterparty_name: string | null };

export type Draft = {
  action: Action;
  amountIqd: number | null;
  recipient?: Contact;
  billerCode?: string;
  account?: BillAccount;
  quote?: Quote;
  firstTime?: boolean;
};

export type CardInfo = {
  cardId: string; token: string; payloadHash: string; idempotencyKey: string;
  kind: "transfer" | "bill_pay"; payload: Payload; execBody: Record<string, unknown>; view: CardView;
};

export type Session = {
  id: string;
  machine: MachineState;
  draft: Draft | null;
  candidates: Contact[];
  fuzzy: Contact | null;
  amountCandidates: [number, number] | null;
  card: CardInfo | null;
  exec: any | null;
  handles: Map<string, { type: "contact" | "bill"; id: string }>;
  audit: AuditEntry[];
  lock: Promise<unknown>;
};
