import type { Lang } from "@zc/core";
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
  /** Scheduled payments only: the card says WHEN, and that nothing is sent now. */
  schedule: { due_at: number; when_text: string; relative: string; note: string; low_balance_warning: string | null } | null;
};

export type AuditEntry = { ts: number; session_id: string; from: Phase; to: Phase; event: string; reason?: string };

export type Trace = {
  intent?: unknown; model?: string; mode?: string; tool_calls?: ToolTrace[]; usage?: Usage;
  resolution?: unknown; quote?: unknown; issues?: string[]; llm_error?: string; previous_amount?: { reference: string; amount_iqd: number } | null;
};

export type Reply = {
  session_id: string;
  phase: Phase;
  messages: AgentMessage[];
  card: CardView | null;
  candidates: CandidateView[];
  result: { reference: string; amount_iqd: number; fee_iqd: number; counterparty: string; created_at: number; balance_after_iqd: number | null; scheduled?: { id: string; due_at: number; when_text: string } } | null;
  audit: AuditEntry[];
  trace: Trace;
  /** Voice only: what the ASR heard, shown back for a «صح» / «لا» tap before anything else happens (docs/09). */
  readback: { text: string } | null;
};

export type BillAccount = {
  id: string; biller_id: string; biller_code: string; biller_name_ar: string; account_ref: string; fee_iqd: number;
  bill: { id: string; amount_iqd: number; due_date: string; status: string } | null;
};
export type Quote = { ok: boolean; limit_iqd?: number; amount_iqd: number; fee_iqd: number; total_iqd: number; balance_after_iqd: number; errors: string[]; counterparty_name: string | null };

export type Draft = {
  action: Action;
  amountIqd: number | null;
  recipient?: Contact;
  billerCode?: string;
  account?: BillAccount;
  quote?: Quote;
  firstTime?: boolean;
  lowBalance?: boolean;
};

export type CardInfo = {
  cardId: string; token: string; payloadHash: string; idempotencyKey: string;
  kind: "transfer" | "bill_pay"; payload: Payload; execBody: Record<string, unknown>; view: CardView; scheduled: { dueAt: number } | null;
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
  /** The previous exchange as plain text, given to the model as read-only context for pronouns («ادفعها»). */
  recent: string | null;
  /** A voice transcript waiting for the user's «صح» (mid or unknown ASR confidence). Never reaches the model before that tap. */
  pendingVoice: { text: string; at: number } | null;
  /** Reply language, set by the language picker: "ar" (default, Iraqi Arabic) or "ku" (Central Kurdish). */
  lang: Lang;
  handles: Map<string, { type: "contact" | "bill"; id: string }>;
  audit: AuditEntry[];
  lock: Promise<unknown>;
};
