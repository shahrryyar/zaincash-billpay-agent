// The ONLY tools the model has (docs/03, docs/05, docs/14). Read-only lookups plus `propose`.
// There is deliberately no execute / confirm / token / wallet-write tool: payment is not something the model can do.
import { z } from "zod";
import { Intent } from "@zc/core";
import type { ToolDef } from "./types";

export const SearchContactsArgs = z.strictObject({ mention: z.string().min(1).max(100), qualifier: z.string().max(100).optional() });
export const ListBillsArgs = z.strictObject({ biller: z.string().max(60).optional() });
export const GetBalanceArgs = z.strictObject({});
export const GetHistoryArgs = z.strictObject({ limit: z.number().int().min(1).max(5).optional(), contact_handle: z.string().max(20).optional() });
export const QuoteArgs = z
  .strictObject({
    kind: z.enum(["transfer", "bill_pay"]),
    contact_handle: z.string().min(1).max(20).optional(), // transfer: a handle from search_contacts
    bill_handle: z.string().min(1).max(20).optional(), // bill_pay: a handle from list_bills
    amount_iqd: z.number().int().positive().optional(), // required for transfers; optional for bills (the wallet knows the bill)
  })
  .superRefine((v, ctx) => {
    if (v.kind === "transfer" && (!v.contact_handle || v.amount_iqd === undefined)) ctx.addIssue({ code: "custom", message: "transfer quote needs contact_handle and amount_iqd" });
    if (v.kind === "bill_pay" && !v.bill_handle) ctx.addIssue({ code: "custom", message: "bill_pay quote needs bill_handle" });
  });

/** Read-only tool names. Anything outside this list (plus `propose`) must never be offered to the model. */
export const READ_TOOLS = ["search_contacts", "list_bills", "get_balance", "get_history", "quote"] as const;
export type ReadToolName = (typeof READ_TOOLS)[number];
export const FINAL_TOOL = "propose";

function jsonSchema(schema: z.ZodType): Record<string, unknown> {
  const { $schema: _drop, ...rest } = z.toJSONSchema(schema) as Record<string, unknown>;
  return rest;
}

export const TOOL_DEFS: Record<ReadToolName | typeof FINAL_TOOL, ToolDef> = {
  search_contacts: {
    name: "search_contacts",
    description: "Look up the user's saved contacts by the name or relation the user said (e.g. «أحمد», «أمي»). Returns masked candidates with handles (c1, c2...). Use it to see whether a name is ambiguous. Read-only.",
    input_schema: jsonSchema(SearchContactsArgs),
  },
  list_bills: {
    name: "list_bills",
    description: "List the user's bill accounts and the outstanding amount of each (electricity, generator, internet, water, mobile credit). Read-only.",
    input_schema: jsonSchema(ListBillsArgs),
  },
  get_balance: { name: "get_balance", description: "The user's current balance in IQD. Read-only.", input_schema: jsonSchema(GetBalanceArgs) },
  get_history: {
    name: "get_history",
    description: "The user's most recent transactions (max 5), optionally only for one contact handle. Read-only.",
    input_schema: jsonSchema(GetHistoryArgs),
  },
  quote: {
    name: "quote",
    description: "Check, without side effects, whether a transfer or bill payment would be possible (balance, limits, biller status) and what the fee would be. Read-only; it does NOT send anything.",
    input_schema: jsonSchema(QuoteArgs),
  },
  propose: {
    name: "propose",
    description: "Your ANSWER. Return the structured intent for the user's message. It only describes what the user asked for; it never sends money. Call this exactly once when you are done.",
    input_schema: jsonSchema(Intent),
  },
};

export const argSchemas: Record<ReadToolName, z.ZodType> = {
  search_contacts: SearchContactsArgs, list_bills: ListBillsArgs, get_balance: GetBalanceArgs, get_history: GetHistoryArgs, quote: QuoteArgs,
};

export type QuoteArgsT = z.infer<typeof QuoteArgs>;

/** Implemented by the orchestrator. Every method is read-only and returns masked, JSON-able data. */
export interface ToolHost {
  searchContacts(a: z.infer<typeof SearchContactsArgs>): Promise<unknown>;
  listBills(a: z.infer<typeof ListBillsArgs>): Promise<unknown>;
  getBalance(): Promise<unknown>;
  getHistory(a: z.infer<typeof GetHistoryArgs>): Promise<unknown>;
  quote(a: QuoteArgsT): Promise<unknown>;
}

export const toolsFor = (mode: "tools" | "workflow"): ToolDef[] =>
  mode === "workflow" ? [TOOL_DEFS.propose] : [...READ_TOOLS.map((n) => TOOL_DEFS[n]), TOOL_DEFS.propose];
