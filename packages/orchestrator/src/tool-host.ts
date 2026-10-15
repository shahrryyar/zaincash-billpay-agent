// The model's read-only window into the wallet (docs/05 §Tools). Masked data, opaque handles, no side effects.
import { normaliseArabic, resolveContact, type Contact } from "@zc/core";
import type { ToolHost, QuoteArgsT } from "@zc/llm";
import type { WalletClient } from "./wallet-client";
import type { BillAccount, Session } from "./types";

const mask = (phone: string) => `••••${phone.slice(-4)}`;
const looksLikePhone = (t: string) => /^[+\d٠-٩\s-]{9,}$/.test(t.trim());

export function createToolHost(deps: { wallet: WalletClient; userId: string; session: Session }): ToolHost {
  const { wallet, userId, session } = deps;
  const alloc = (type: "contact" | "bill", id: string): string => {
    for (const [h, v] of session.handles) if (v.type === type && v.id === id) return h;
    const h = `${type === "contact" ? "c" : "b"}${[...session.handles.values()].filter((v) => v.type === type).length + 1}`;
    session.handles.set(h, { type, id });
    return h;
  };
  const need = (handle: string, type: "contact" | "bill"): string => {
    const v = session.handles.get(handle);
    if (!v || v.type !== type) throw new Error(`unknown handle: ${handle} (use handles from search_contacts / list_bills)`);
    return v.id;
  };
  const contacts = async (): Promise<Contact[]> => ((await wallet.contacts(userId)).json.contacts as any[]).map((c) => ({ id: c.id, display_name: c.display_name, phone: c.phone, relation: c.relation ?? undefined }));
  const accounts = async (): Promise<BillAccount[]> => (await wallet.billAccounts(userId)).json.bill_accounts as BillAccount[];
  const view = (c: Contact) => ({ handle: alloc("contact", c.id), name: c.display_name, masked: mask(c.phone), relation: c.relation ?? null });

  return {
    async searchContacts({ mention, qualifier }) {
      const r = resolveContact({ kind: looksLikePhone(mention) ? "phone" : "name", text: mention, ...(qualifier ? { qualifier } : {}) }, await contacts());
      if (r.status === "resolved") return { match: "exact", candidates: [view(r.contact)] };
      if (r.status === "ambiguous") return { match: "ambiguous", candidates: r.candidates.map(view) };
      if (r.status === "fuzzy") return { match: "fuzzy_only", candidates: r.candidates.map(view) };
      return { match: r.status === "unknown_number" ? "unknown_number" : "none", candidates: [] };
    },
    async listBills({ biller }) {
      const q = biller ? normaliseArabic(biller) : "";
      const billers = ((await wallet.billers()).json.billers as any[]);
      const matchesBiller = (a: BillAccount) => {
        if (!q) return true;
        const b = billers.find((x) => x.id === a.biller_id);
        return a.biller_code === q || normaliseArabic(a.biller_name_ar).includes(q) || (b?.aliases ?? []).some((al: string) => normaliseArabic(al).includes(q) || q.includes(normaliseArabic(al)));
      };
      return {
        bills: (await accounts()).filter(matchesBiller).map((a) => ({
          handle: alloc("bill", a.id), biller: a.biller_code, name: a.biller_name_ar, account_ref_masked: `••••${a.account_ref.slice(-3)}`,
          outstanding_iqd: a.bill && a.bill.status === "unpaid" ? a.bill.amount_iqd : null, status: a.bill ? a.bill.status : "open_amount",
        })),
      };
    },
    async getBalance() {
      return { balance_iqd: (await wallet.user(userId)).json.balance_iqd };
    },
    async getHistory({ limit, contact_handle }) {
      const contactId = contact_handle ? need(contact_handle, "contact") : null;
      const rows = ((await wallet.transactions(userId, { limit: 50 })).json.transactions as any[])
        .filter((t) => !contactId || t.counterparty.id === contactId).slice(0, limit ?? 5);
      return { transactions: rows.map((t) => ({ reference: t.reference, kind: t.kind, amount_iqd: t.amount_iqd, to: t.counterparty.name, date: new Date(t.created_at).toISOString().slice(0, 10) })) };
    },
    async quote(a: QuoteArgsT) {
      const q = a.kind === "transfer"
        ? { kind: "transfer", from: userId, to_contact: need(a.contact_handle as string, "contact"), amount_iqd: a.amount_iqd }
        : { kind: "bill_pay", from: userId, bill_account: need(a.bill_handle as string, "bill"), ...(a.amount_iqd !== undefined ? { amount_iqd: a.amount_iqd } : {}) };
      const j = (await wallet.quote(q)).json;
      return { ok: j.ok, errors: j.errors, amount_iqd: j.amount_iqd, fee_iqd: j.fee_iqd, balance_after_iqd: j.balance_after_iqd };
    },
  };
}
