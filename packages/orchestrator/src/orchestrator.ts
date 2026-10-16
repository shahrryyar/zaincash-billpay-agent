// The orchestrator (docs/03): performs the state machine's effects and feeds results back as events.
// The machine decides; this file only does the I/O. The model never reaches the wallet from here:
// its output enters ONLY through the LLM_OUTPUT event, which the machine validates before anything else.
import { randomUUID } from "node:crypto";
import {
  TERMINAL, amountInWords, copyKeyForWalletError, formatIQD, initialState, normaliseArabic, normaliseDigits, parseAmount, payloadHash, resolveContact, t,
  transition, type Contact, type CopyKey, type Effect, type MachineEvent, type Payload, type Config,
} from "@zc/core";
import type { ToolHost, Understander } from "@zc/llm";
import { isCancel, isNo, isYes, matchChoice } from "./clarify";
import { createToolHost } from "./tool-host";
import type { AgentMessage, AuditEntry, BillAccount, CandidateView, CardInfo, CardView, Draft, Quote, Reply, Session } from "./types";
import { WalletUnreachable, type WalletClient } from "./wallet-client";

export type OrchestratorOptions = {
  wallet: WalletClient;
  /** Built per turn so the model's tools are bound to that session's handles. */
  understanderFor: (host: ToolHost) => Understander;
  userId?: string;
  now?: () => number;
  newId?: () => string;
  sleep?: (ms: number) => Promise<void>;
  retryDelayMs?: number;
  config?: Partial<Config>;
};

export type TurnInput = { text?: string; choice?: string; asrConfidence?: number };

type TurnCtx = { text: string; asr: number | undefined; reply: Reply; auditFrom: number; suppressAsk: boolean };

const mask = (phone: string) => `••••${phone.slice(-4)}`;
const num = (n: number) => n.toLocaleString("en-US");
const STATUS_KEYS = new Set<CopyKey>(["cancelled", "expired", "checking"]);
const ERROR_KEYS = new Set<CopyKey>(["busy", "confirm_invalid", "unknown_outcome", "usd_unsupported", "out_of_scope"]);

export function createOrchestrator(opts: OrchestratorOptions) {
  const { wallet } = opts;
  const userId = opts.userId ?? "u_001";
  const now = opts.now ?? Date.now;
  const newId = opts.newId ?? (() => randomUUID());
  const sleep = opts.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const retryDelayMs = opts.retryDelayMs ?? 400;
  const sessions = new Map<string, Session>();
  let billerNamesCache: string[] | null = null;

  const fresh = (id: string): Session => ({
    id, machine: initialState(), draft: null, candidates: [], fuzzy: null, amountCandidates: null, card: null, exec: null,
    handles: new Map(), audit: [], lock: Promise.resolve(), recent: null,
  });
  const getSession = (id: string): Session => { let s = sessions.get(id); if (!s) { s = fresh(id); sessions.set(id, s); } return s; };
  const resetRequest = (s: Session) => {
    s.machine = initialState(); s.draft = null; s.candidates = []; s.fuzzy = null; s.amountCandidates = null; s.card = null; s.exec = null;
  };
  const locked = <T>(s: Session, fn: () => Promise<T>): Promise<T> => { const run = s.lock.then(fn, fn); s.lock = run.catch(() => undefined); return run; };

  const newReply = (s: Session): Reply => ({ session_id: s.id, phase: s.machine.phase, messages: [], card: null, candidates: [], result: null, audit: [], trace: {} });
  const say = (tc: TurnCtx, kind: AgentMessage["kind"], text: string) => tc.reply.messages.push({ kind, text });
  const sayKey = (tc: TurnCtx, key: CopyKey, vars: Record<string, string | number> = {}) =>
    say(tc, STATUS_KEYS.has(key) ? "status" : ERROR_KEYS.has(key) ? "error" : "info", t(key, vars));

  const candidateView = (c: Contact): CandidateView => ({ id: c.id, name: c.display_name, masked: mask(c.phone), relation: c.relation ?? null });
  const toContacts = (rows: any[]): Contact[] => rows.map((c) => ({ id: c.id, display_name: c.display_name, phone: c.phone, relation: c.relation ?? undefined }));

  async function billerNames(): Promise<string[]> {
    if (!billerNamesCache) {
      const bs = (await wallet.billers()).json.billers as any[];
      billerNamesCache = bs.map((b) => `${b.code}: ${(b.aliases as string[])[0] ?? b.name_ar}`);
    }
    return billerNamesCache;
  }
  const balanceOf = async (): Promise<number> => { try { return (await wallet.user(userId)).json.balance_iqd as number; } catch { return 0; } };

  function ensureDraft(s: Session): Draft | null {
    const cur = s.machine.current;
    if (!cur) return null;
    if (!s.draft || s.draft.action !== cur) {
      const amount = cur.type === "info" ? null : cur.amount?.value ?? null;
      s.draft = { action: cur, amountIqd: amount };
    }
    return s.draft;
  }

  function awaitingText(s: Session): string | undefined {
    if (s.machine.phase === "AWAITING_CONFIRM") return "a confirmation card is pending; the user must press the Confirm button (a spoken yes does nothing)";
    if (s.machine.phase === "CLARIFYING") return `the system asked the user to clarify the ${s.machine.clarifySlot}; this message may be the answer`;
    return undefined;
  }

  // ------------------------------------------------------------------ effects
  async function perform(s: Session, ef: Effect, tc: TurnCtx): Promise<MachineEvent[]> {
    switch (ef.type) {
      case "AUDIT": {
        const e: AuditEntry = { ts: now(), session_id: s.id, from: ef.from, to: ef.to, event: ef.event, ...(ef.reason ? { reason: ef.reason } : {}) };
        s.audit.push(e);
        return [];
      }
      case "CALL_LLM": {
        s.handles.clear();
        const u = opts.understanderFor(createToolHost({ wallet, userId, session: s }));
        try {
          const res = await u.understand({ text: tc.text, context: { billers: await billerNames(), awaiting: awaitingText(s), recent: s.recent ?? undefined } });
          tc.reply.trace = { ...tc.reply.trace, intent: res.raw, model: res.model, mode: res.mode, tool_calls: res.toolCalls, usage: res.usage };
          return [{ type: "LLM_OUTPUT", raw: res.raw, input: tc.text }];
        } catch (e) {
          // provider down / budget reached: honest "busy", nothing changes, nothing was sent
          tc.reply.trace.llm_error = (e as Error).message;
          sayKey(tc, "busy");
          return [];
        }
      }
      case "SAY": sayKey(tc, ef.key, ef.vars ?? {}); return [];
      case "ASK": {
        ensureDraft(s);
        if (ef.key === "ask_amount_thousands" && s.draft) {
          const v = Number(ef.vars.value);
          s.amountCandidates = [v, v * 1000];
          s.draft.amountIqd = null;
        }
        if (ef.slot === "recipient") tc.reply.candidates = (s.fuzzy ? [s.fuzzy] : s.candidates).map(candidateView);
        if (tc.suppressAsk) { tc.suppressAsk = false; return []; }
        say(tc, "ask", t(ef.key, ef.vars));
        return [];
      }
      case "RESOLVE": return resolve(s, ef.slot, tc);
      case "PRECHECK": return precheck(s, tc);
      case "ISSUE_CARD": return issueCard(s, tc);
      case "EXECUTE": return execute(s, ef.idempotencyKey, ef.token);
      case "RETRY": await sleep(retryDelayMs); return execute(s, ef.idempotencyKey, ef.token);
      case "LOOKUP_OUTCOME": {
        try {
          const r = await wallet.transactions(userId, { idempotencyKey: ef.idempotencyKey });
          const hit = (r.json?.transactions as any[] | undefined)?.[0];
          if (hit) { s.exec = { transaction: hit, balance_after_iqd: null, from_lookup: true }; return [{ type: "LOOKUP_RESULT", found: "executed" }]; }
          return [{ type: "LOOKUP_RESULT", found: r.status === 200 ? "not_found" : "unknown" }];
        } catch { return [{ type: "LOOKUP_RESULT", found: "unknown" }]; }
      }
      case "REVOKE_TOKEN":
        if (s.card?.token === ef.token) s.card = null;
        await wallet.revokeToken(s.id, ef.token).catch(() => undefined); // best effort: an unused token also expires by itself
        return [];
      case "ANSWER_INFO": return answerInfo(s, ef.query, tc);
      case "SAY_ERROR": await sayError(s, ef.code, tc); return [];
      case "APPLY_CLARIFY": {
        // «لا قصدي حسين» after a fuzzy guess (or after «ما لگيت X»): the typed name is resolved against the real contacts.
        if (s.machine.clarifySlot === "recipient" && (s.fuzzy || s.candidates.length === 0)) {
          const fresh = await answerUnknownContact(s, ef.choice_text, tc);
          if (fresh) return fresh;
        }
        return answerClarification(s, ef.choice_text, tc, false) ?? [];
      }
      case "REJECT":
        if (ef.reason === "confirmation_invalid") sayKey(tc, "confirm_invalid");
        else if (ef.reason === "busy") sayKey(tc, "checking");
        return [];
      default: return [];
    }
  }

  async function resolve(s: Session, slot: "recipient" | "biller", tc: TurnCtx): Promise<MachineEvent[]> {
    const d = ensureDraft(s);
    if (!d) return [];
    try {
      if (slot === "recipient" && d.action.type === "transfer" && d.action.recipient) {
        const contacts = toContacts((await wallet.contacts(userId)).json.contacts);
        const m = d.action.recipient;
        const r = resolveContact({ kind: m.kind, text: m.text, ...(m.qualifier ? { qualifier: m.qualifier } : {}) }, contacts);
        tc.reply.trace.resolution = { slot, status: r.status, candidates: r.candidates?.map((c) => c.id) };
        s.candidates = []; s.fuzzy = null;
        if (r.status === "resolved") { d.recipient = r.contact; return [{ type: "RESOLUTION", slot, result: "resolved" }]; }
        if (r.status === "ambiguous") { s.candidates = r.candidates; return [{ type: "RESOLUTION", slot, result: "ambiguous", count: r.candidates.length, name: m.text }]; }
        if (r.status === "fuzzy") { s.candidates = r.candidates; s.fuzzy = r.candidates[0] as Contact; return [{ type: "RESOLUTION", slot, result: "fuzzy", name: (r.candidates[0] as Contact).display_name }]; }
        return [{ type: "RESOLUTION", slot, result: "none", name: m.text }]; // unknown contact, a bare phone number or «نفس المرة»: ask, never guess
      }
      if (slot === "biller" && d.action.type === "bill_pay") {
        const code = d.billerCode ?? d.action.biller;
        const accounts = (await wallet.billAccounts(userId)).json.bill_accounts as BillAccount[];
        const hits = accounts.filter((a) => a.biller_code === code);
        if (hits.length === 1) { d.account = hits[0] as BillAccount; return [{ type: "RESOLUTION", slot, result: "resolved" }]; }
        return [{ type: "RESOLUTION", slot, result: hits.length === 0 ? "none" : "ambiguous" }];
      }
    } catch (e) {
      if (e instanceof WalletUnreachable) return [{ type: "RESOLUTION", slot, result: "none" }];
      throw e;
    }
    return [];
  }

  async function precheck(s: Session, tc: TurnCtx): Promise<MachineEvent[]> {
    const d = s.draft;
    if (!d) return [{ type: "PRECHECK", ok: false, code: "precheck_failed" }];
    const body = d.action.type === "transfer" && d.recipient && d.amountIqd !== null
      ? { kind: "transfer", from: userId, to_contact: d.recipient.id, amount_iqd: d.amountIqd }
      : d.action.type === "bill_pay" && d.account
        ? { kind: "bill_pay", from: userId, bill_account: d.account.id, ...(d.amountIqd !== null ? { amount_iqd: d.amountIqd } : {}) }
        : null;
    if (!body) return [{ type: "PRECHECK", ok: false, code: "AMOUNT_REQUIRED" }];
    try {
      const r = await wallet.quote(body);
      if (r.status !== 200) return [{ type: "PRECHECK", ok: false, code: r.json?.error?.code ?? "precheck_failed" }];
      const q = r.json as Quote;
      d.quote = q;
      tc.reply.trace.quote = q;
      return q.ok ? [{ type: "PRECHECK", ok: true }] : [{ type: "PRECHECK", ok: false, code: q.errors[0] ?? "precheck_failed" }];
    } catch { return [{ type: "PRECHECK", ok: false, code: "SERVICE_UNAVAILABLE" }]; }
  }

  async function issueCard(s: Session, tc: TurnCtx): Promise<MachineEvent[]> {
    const d = s.draft;
    const q = d?.quote;
    if (!d || !q) return [{ type: "PRECHECK", ok: false, code: "precheck_failed" }];
    const isTransfer = d.action.type === "transfer";
    const payload: Payload = isTransfer
      ? { kind: "transfer", from: userId, to_id: (d.recipient as Contact).id, amount_iqd: q.amount_iqd, fee_iqd: q.fee_iqd }
      : { kind: "bill_pay", from: userId, biller_id: (d.account as BillAccount).biller_id, account_ref: (d.account as BillAccount).account_ref, amount_iqd: q.amount_iqd, fee_iqd: q.fee_iqd };
    try {
      let firstTime = false;
      if (isTransfer) {
        const hist = (await wallet.transactions(userId, { limit: 100 })).json.transactions as any[];
        firstTime = !hist.some((x) => x.counterparty.id === (d.recipient as Contact).id);
      }
      const issued = await wallet.issueToken(s.id, payload);
      if (issued.status !== 201 || issued.json.payload_hash !== payloadHash(payload)) return [{ type: "PRECHECK", ok: false, code: "SERVICE_UNAVAILABLE" }]; // fail closed on any disagreement
      const cardId = newId();
      const idempotencyKey = newId();
      const view: CardView = {
        card_id: cardId, kind: payload.kind, title: t(isTransfer ? "card_title_transfer" : "card_title_bill"),
        recipient: isTransfer ? { name: (d.recipient as Contact).display_name, masked: mask((d.recipient as Contact).phone) } : null,
        biller: isTransfer ? null : { name: (d.account as BillAccount).biller_name_ar, account_ref: (d.account as BillAccount).account_ref },
        amount_iqd: q.amount_iqd, amount_text: formatIQD(q.amount_iqd),
        amount_words: q.amount_iqd % 250 === 0 ? amountInWords(q.amount_iqd) : "",
        fee_iqd: q.fee_iqd, fee_text: formatIQD(q.fee_iqd), total_iqd: q.total_iqd,
        balance_before_iqd: q.balance_after_iqd + q.total_iqd, balance_after_iqd: q.balance_after_iqd,
        first_time_recipient: firstTime, expires_at: issued.json.expires_at, ttl_seconds: 120,
        nothing_sent: t("card_nothing_sent"),
        labels: { confirm: t(isTransfer ? "confirm_button_transfer" : "confirm_button_bill"), cancel: t("cancel_button") },
      };
      const execBody: Record<string, unknown> = isTransfer
        ? { session_id: s.id, from: userId, to_contact: (d.recipient as Contact).id, amount_iqd: q.amount_iqd }
        : { session_id: s.id, from: userId, bill_account: (d.account as BillAccount).id, amount_iqd: q.amount_iqd }; // always the amount the user saw
      s.card = { cardId, token: issued.json.token, payloadHash: issued.json.payload_hash, idempotencyKey, kind: payload.kind, payload, execBody, view } satisfies CardInfo;
      d.firstTime = firstTime;
      say(tc, "card", t("confirm_prompt"));
      if (firstTime) say(tc, "info", t("first_time_recipient"));
      return [{ type: "CARD_ISSUED", payloadHash: issued.json.payload_hash, token: issued.json.token, idempotencyKey }];
    } catch { return [{ type: "PRECHECK", ok: false, code: "SERVICE_UNAVAILABLE" }]; }
  }

  async function execute(s: Session, key: string, token: string): Promise<MachineEvent[]> {
    const card = s.card;
    if (!card) return [{ type: "EXEC_RESULT", outcome: "rejected", code: "CONFIRMATION_INVALID" }];
    try {
      const r = await wallet.execute(card.kind, card.execBody, key, token);
      if (r.status === 200) { s.exec = r.json; return [{ type: "EXEC_RESULT", outcome: "ok" }]; }
      const code: string = r.json?.error?.code ?? "rejected";
      // 5xx other than "biller unavailable" is an UNKNOWN outcome: retry with the same key, never assume nothing happened
      if (r.status >= 500 && code !== "BILLER_UNAVAILABLE") return [{ type: "EXEC_RESULT", outcome: "timeout" }];
      return [{ type: "EXEC_RESULT", outcome: "rejected", code }];
    } catch (e) {
      if (e instanceof WalletUnreachable) return [{ type: "EXEC_RESULT", outcome: "timeout" }];
      throw e;
    }
  }

  async function answerInfo(s: Session, query: string, tc: TurnCtx): Promise<MachineEvent[]> {
    const a = s.machine.current;
    try {
      if (query === "balance") say(tc, "info", t("info_balance", { balance: num(await balanceOf()) }));
      else if (query === "bill_amount" && a?.type === "info") {
        const q = normaliseArabic(a.biller ?? "");
        const accounts = (await wallet.billAccounts(userId)).json.bill_accounts as BillAccount[];
        const billers = (await wallet.billers()).json.billers as any[];
        const hit = accounts.find((x) => x.biller_code === q || billers.find((b) => b.id === x.biller_id)?.aliases.some((al: string) => q && (normaliseArabic(al).includes(q) || q.includes(normaliseArabic(al)))));
        if (hit && hit.bill && hit.bill.status === "unpaid") say(tc, "info", t("info_bill", { biller: hit.biller_name_ar, amount: num(hit.bill.amount_iqd) }));
        else say(tc, "info", t("info_bill_none", { biller: a.biller ?? hit?.biller_name_ar ?? "" }));
      } else if (query === "last_transfer") {
        const tx = ((await wallet.transactions(userId, { limit: 1 })).json.transactions as any[])[0];
        say(tc, "info", tx ? t("info_last_transfer", { amount: num(tx.amount_iqd), name: tx.counterparty.name }) : t("info_last_transfer_none"));
      }
    } catch { sayKey(tc, "busy"); }
    return [];
  }

  async function sayError(s: Session, code: string, tc: TurnCtx): Promise<void> {
    const key: CopyKey = code === "SERVICE_UNAVAILABLE" ? "busy" : copyKeyForWalletError(code);
    const d = s.draft;
    const name = d?.recipient?.display_name ?? (d?.action.type === "transfer" ? d.action.recipient?.text : undefined) ?? "";
    const vars = {
      balance: num(await balanceOf()),
      amount: num(d?.quote?.amount_iqd ?? d?.amountIqd ?? 0),
      biller: d?.account?.biller_name_ar ?? "",
      name,
      ref: (s.card?.idempotencyKey ?? newId()).slice(0, 8),
    };
    say(tc, "error", t(key, vars));
    if (key !== "failed_safe" && key !== "busy" && key !== "insufficient") return; // those already say "nothing was sent"
  }

  async function onExecuted(s: Session, tc: TurnCtx): Promise<void> {
    const e = s.exec;
    const d = s.draft;
    if (!e) return;
    const tx = e.transaction;
    const balance = e.balance_after_iqd ?? (await balanceOf());
    const isTransfer = tx.kind === "transfer";
    say(tc, "success", isTransfer
      ? t("success_transfer", { amount: num(tx.amount_iqd), name: tx.counterparty?.name ?? d?.recipient?.display_name ?? "", ref: tx.reference, balance: num(balance) })
      : t("success_bill", { biller: tx.counterparty?.name ?? d?.account?.biller_name_ar ?? "", amount: num(tx.amount_iqd), ref: tx.reference }));
    tc.reply.result = { reference: tx.reference, amount_iqd: tx.amount_iqd, balance_after_iqd: balance };
  }

  // ------------------------------------------------------------------ clarification answers (deterministic, no LLM)
  /** Returns events, or null when the answer is unusable and the caller may fall back to the LLM. */
  /**
   * The question was «ما لگيت X، تريد تكتب رقمه؟» (nothing matched, so there is no candidate set to protect).
   * A typed answer is resolved against the wallet's real contacts exactly like a first request: a full phone number or
   * a name that matches a saved contact. Still only existing contacts, still ambiguity => ask, and the card + token follow.
   * Returns null when it did not resolve to a contact, so the normal path (model / re-ask, 2 turns max) continues.
   */
  async function answerUnknownContact(s: Session, text: string, tc: TurnCtx): Promise<MachineEvent[] | null> {
    if (s.candidates.length > 0 && !s.fuzzy) return null; // a real candidate list is answered by matchChoice only
    if (s.fuzzy && (isYes(text) || isNo(text))) return null; // yes/no belong to the «تقصد X؟» question
    const d = ensureDraft(s);
    if (!d || d.action.type !== "transfer") return null;
    const digits = normaliseDigits(text).replace(/[\s\-()]/g, "");
    const mention = /^07[3-9]\d{8}$/.test(digits) ? { kind: "phone" as const, text: digits } : { kind: "name" as const, text: text.trim() };
    if (!mention.text || mention.text.length > 40) return null;
    try {
      const contacts = toContacts((await wallet.contacts(userId)).json.contacts);
      const r = resolveContact(mention, contacts);
      tc.reply.trace.resolution = { slot: "recipient", status: r.status, candidates: r.candidates?.map((c) => c.id), via: "typed_answer" };
      if (r.status === "resolved") { d.recipient = r.contact; s.candidates = []; s.fuzzy = null; return [{ type: "RESOLUTION", slot: "recipient", result: "resolved" }]; }
      if (r.status === "ambiguous") { s.candidates = r.candidates; s.fuzzy = null; return [{ type: "RESOLUTION", slot: "recipient", result: "ambiguous", count: r.candidates.length, name: mention.text }]; }
      return null; // fuzzy-only or nothing: not accepted from a bare typed answer
    } catch (e) {
      if (e instanceof WalletUnreachable) return null;
      throw e;
    }
  }

  function answerClarification(s: Session, text: string, tc: TurnCtx, allowFallback: boolean): MachineEvent[] | null {
    const slot = s.machine.clarifySlot;
    const d = ensureDraft(s);
    if (!d || !slot) return null;
    const rawName = d.action.type === "transfer" ? d.action.recipient?.text ?? "" : "";

    if (slot === "recipient") {
      if (s.fuzzy) {
        if (isYes(text)) { d.recipient = s.fuzzy; s.fuzzy = null; s.candidates = []; return [{ type: "RESOLUTION", slot, result: "resolved" }]; }
        if (isNo(text)) { s.fuzzy = null; s.candidates = []; return [{ type: "RESOLUTION", slot, result: "none", name: rawName }]; }
      }
      const m = matchChoice(text, s.candidates);
      if (m.status === "resolved") { d.recipient = m.contact; s.candidates = []; s.fuzzy = null; return [{ type: "RESOLUTION", slot, result: "resolved" }]; }
      if (m.status === "ambiguous") { s.candidates = m.candidates; return [{ type: "RESOLUTION", slot, result: "ambiguous", count: m.candidates.length, name: rawName }]; }
      return allowFallback ? null : [{ type: "RESOLUTION", slot, result: "none", name: text }];
    }

    if (slot === "amount") {
      if (s.amountCandidates) {
        if (isYes(text)) { d.amountIqd = s.amountCandidates[1]; s.amountCandidates = null; return [{ type: "SLOT_ANSWER", slot, filled: true }]; }
        if (isNo(text)) { s.amountCandidates = null; say(tc, "ask", t("ask_amount", { name: rawName })); tc.suppressAsk = true; return [{ type: "SLOT_ANSWER", slot, filled: false }]; }
      }
      const p = parseAmount(text);
      if (p.kind === "ok" && p.value % 250 === 0) { d.amountIqd = p.value; s.amountCandidates = null; return [{ type: "SLOT_ANSWER", slot, filled: true }]; }
      if (p.kind === "ambiguous") {
        s.amountCandidates = p.candidates;
        say(tc, "ask", t("ask_amount_thousands", { value: p.candidates[0] }));
        tc.suppressAsk = true;
        return [{ type: "SLOT_ANSWER", slot, filled: false }];
      }
      return allowFallback ? null : [{ type: "SLOT_ANSWER", slot, filled: false }];
    }

    // biller
    const q = normaliseArabic(text);
    const known = billerNamesCache ?? [];
    const code = known.map((k) => k.split(": ")).find(([c, alias]) => q && (c === q || normaliseArabic(alias ?? "").includes(q) || q.includes(normaliseArabic(alias ?? ""))))?.[0];
    if (code) { d.billerCode = code; return [{ type: "SLOT_ANSWER", slot, filled: true }]; }
    return allowFallback ? null : [{ type: "SLOT_ANSWER", slot, filled: false }];
  }

  // ------------------------------------------------------------------ the loop
  async function dispatch(s: Session, first: MachineEvent, tc: TurnCtx): Promise<void> {
    const queue: MachineEvent[] = [first];
    while (queue.length) {
      const ev = queue.shift() as MachineEvent;
      const prev = s.machine.phase;
      if (ev.type === "NEXT_ACTION") { s.card = null; s.exec = null; s.candidates = []; s.fuzzy = null; s.amountCandidates = null; s.draft = null; }
      const r = transition(s.machine, ev, { now: now(), ...(opts.config ? { config: opts.config } : {}) });
      s.machine = r.state;
      for (const ef of r.effects) queue.push(...(await perform(s, ef, tc)));
      if (s.machine.phase === "EXECUTED" && prev !== "EXECUTED") await onExecuted(s, tc);
    }
    // each queued action runs the full chain separately: next one starts when the previous finished
    while (TERMINAL.has(s.machine.phase) && s.machine.queue.length > 0) await dispatch(s, { type: "NEXT_ACTION" }, tc);
  }

  function finalize(s: Session, tc: TurnCtx): Reply {
    const reply = tc.reply;
    reply.phase = s.machine.phase;
    reply.card = s.machine.phase === "AWAITING_CONFIRM" && s.card ? s.card.view : null;
    reply.audit = s.audit.slice(tc.auditFrom);
    const said = reply.messages.map((m) => m.text).join(" | ");
    if (said) s.recent = `User: «${tc.text || "(tapped a button)"}» / Assistant: «${said}»`.slice(0, 500);
    return reply;
  }
  const begin = (s: Session, text = "", asr?: number): TurnCtx => ({ text, asr, reply: newReply(s), auditFrom: s.audit.length, suppressAsk: false });

  return {
    /** One user message (typed, transcribed) or a tap on a candidate card. */
    turn(sessionId: string, input: TurnInput): Promise<Reply> {
      const s = getSession(sessionId);
      return locked(s, async () => {
        const text = (input.text ?? "").trim();
        const tc = begin(s, text, input.asrConfidence);

        if (input.choice !== undefined) {
          const pick = (s.fuzzy ? [s.fuzzy] : s.candidates).find((c) => c.id === input.choice);
          if (s.machine.phase === "CLARIFYING" && s.machine.clarifySlot === "recipient" && pick && s.draft) {
            s.draft.recipient = pick; s.candidates = []; s.fuzzy = null;
            await dispatch(s, { type: "RESOLUTION", slot: "recipient", result: "resolved" }, tc);
          } else sayKey(tc, "ask_rephrase");
          return finalize(s, tc);
        }
        if (!text) { sayKey(tc, "ask_rephrase"); return finalize(s, tc); }

        if (TERMINAL.has(s.machine.phase) && s.machine.queue.length === 0) resetRequest(s); // a finished request: start a new one

        const phase = s.machine.phase;
        if (phase === "EXECUTING" || phase === "UNKNOWN_OUTCOME") { sayKey(tc, "checking"); return finalize(s, tc); }

        if (phase === "AWAITING_CONFIRM") {
          if (isCancel(text) || isNo(text)) await dispatch(s, { type: "CANCEL" }, tc);
          else if (isYes(text)) say(tc, "info", t("press_confirm_button")); // a typed or spoken «yes» never executes
          else await dispatch(s, { type: "INPUT_RECEIVED", text, asrConfidence: input.asrConfidence }, tc); // an edit: new request replaces the card
          return finalize(s, tc);
        }

        if (phase === "CLARIFYING") {
          if (isCancel(text)) { await dispatch(s, { type: "CANCEL" }, tc); return finalize(s, tc); }
          if (input.asrConfidence !== undefined && input.asrConfidence < (opts.config?.asrLow ?? 0.5)) { await dispatch(s, { type: "INPUT_RECEIVED", text, asrConfidence: input.asrConfidence }, tc); return finalize(s, tc); }
          await billerNames();
          const fresh = s.machine.clarifySlot === "recipient" ? await answerUnknownContact(s, text, tc) : null;
          if (fresh) { for (const e of fresh) await dispatch(s, e, tc); return finalize(s, tc); }
          const events = answerClarification(s, text, tc, true);
          if (events) { for (const e of events) await dispatch(s, e, tc); }
          else {
            // not an answer: maybe a new request, so ask the model. If it changed nothing, the user still used up a turn
            // (at most 2 per slot), otherwise garbage input could keep the question open forever.
            const slot = s.machine.clarifySlot as "recipient" | "amount" | "biller";
            const before = s.machine.clarifyTurns[slot] ?? 0;
            await dispatch(s, { type: "INPUT_RECEIVED", text, asrConfidence: input.asrConfidence }, tc);
            if (s.machine.phase === "CLARIFYING" && s.machine.clarifySlot === slot && (s.machine.clarifyTurns[slot] ?? 0) === before && !tc.reply.trace.llm_error)
              await dispatch(s, slot === "recipient" ? { type: "RESOLUTION", slot, result: "none", name: text } : { type: "SLOT_ANSWER", slot, filled: false }, tc);
          }
          return finalize(s, tc);
        }

        await dispatch(s, { type: "INPUT_RECEIVED", text, asrConfidence: input.asrConfidence }, tc);
        return finalize(s, tc);
      });
    },

    /** The Confirm button. The token never leaves the server: the UI only knows card_id. */
    confirm(sessionId: string, cardId: string): Promise<Reply> {
      const s = getSession(sessionId);
      return locked(s, async () => {
        const tc = begin(s);
        const card = s.card;
        if (card && card.cardId === cardId && s.machine.phase === "AWAITING_CONFIRM") {
          await dispatch(s, { type: "CONFIRM", token: card.token, payloadHash: card.payloadHash }, tc);
        } else if (card && card.cardId === cardId && (s.machine.phase === "EXECUTING" || s.machine.phase === "UNKNOWN_OUTCOME")) {
          sayKey(tc, "checking");
        } else if (card && card.cardId === cardId && s.machine.phase === "EXECUTED" && s.exec) {
          await onExecuted(s, tc); // double tap after success: show the same result, execute nothing
        } else sayKey(tc, "confirm_invalid");
        return finalize(s, tc);
      });
    },

    cancel(sessionId: string): Promise<Reply> {
      const s = getSession(sessionId);
      return locked(s, async () => { const tc = begin(s); await dispatch(s, { type: "CANCEL" }, tc); return finalize(s, tc); });
    },

    /** The UI's countdown reached zero. */
    tick(sessionId: string): Promise<Reply> {
      const s = getSession(sessionId);
      return locked(s, async () => { const tc = begin(s); await dispatch(s, { type: "TICK" }, tc); return finalize(s, tc); });
    },

    reset(sessionId: string): void { sessions.delete(sessionId); },
    /** For tests and the judge-facing "Why?" panel. */
    inspect(sessionId: string): Session { return getSession(sessionId); },
  };
}

export type Orchestrator = ReturnType<typeof createOrchestrator>;
