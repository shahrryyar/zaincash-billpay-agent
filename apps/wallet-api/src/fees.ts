// Fee and limit schedule of the MOCK wallet, copied from ZainCash's public "Fees & Limits (Individual Wallet)" page.
// Source: https://www.zaincash.iq/individual-wallet (read 2026-10-16 in a normal browser; the page changes, re-check before reuse).
// Rows used:
//   Send money to other wallets (individual wallets): 0.5% (min 300 IQD, max 2,500 IQD), limit 2,500,000 IQD monthly
//   Pay government bills such as electricity, housing funds: no additional fees, limit 10,000,000 IQD monthly
//   Paying to ZainCash in-app partners (service providers): free, limit 5,000,000 IQD monthly
//   Mobile top-up / mobile bill payment: no fee listed, limit 2,000,000 IQD monthly
//   Maximum wallet capacity: 10,000,000 IQD
export const FEE_SOURCE = { url: "https://www.zaincash.iq/individual-wallet", read: "2026-10-16" } as const;

export const P2P_FEE = { rate: 0.005, minIqd: 300, maxIqd: 2_500 } as const;

/** 0.5% of the amount, never below 300 and never above 2,500 IQD. Integer IQD, rounded up. */
export function p2pFee(amountIqd: number): number {
  return Math.min(P2P_FEE.maxIqd, Math.max(P2P_FEE.minIqd, Math.ceil(amountIqd * P2P_FEE.rate)));
}

/** Monthly limits per calendar month (UTC), in IQD. */
export const MONTHLY_LIMIT_IQD = { transfer: 2_500_000, bill: 10_000_000, mobile_topup: 2_000_000 } as const;
export const WALLET_CAPACITY_IQD = 10_000_000;
