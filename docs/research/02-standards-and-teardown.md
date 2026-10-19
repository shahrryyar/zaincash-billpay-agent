# R2 — Standards and real products: problem → solution → adopt / reject

Evidence grades: **[P]** read the primary page this session · **[S]** search-result summary only, not yet read in full · **[U]** unverified / not found.

## A. Standards that match our safety design

| Source | What it says | Our decision |
|---|---|---|
| **PSD2 RTS Art. 5 dynamic linking** (EU 2018/389; EBA Q&A 2020_5133 **[P-EBA]**, Art.5 text **[S]**) | Payer must be made aware of amount and payee; the authentication code is specific to them; **any change to amount or payee invalidates it**. If the final amount is **higher** than the one agreed → re-authenticate or decline; equal/lower → OK. | **Adopt.** Our payload-bound token is the same idea. **New:** a bill's outstanding amount can change between card and execute → treat as payload mismatch → new card (docs/07). |
| **UK Confirmation of Payee** **[S]** | Pre-payment name check, 4 results: match / close match / no match / unavailable. Close match shows the **actual** account name. **A warning does not block the payment.** Covers sort code + account only. | **Adopt** the 4-way idea in the resolver (exact / fuzzy "تقصد…؟" / none / wallet-unavailable). **Improve:** ours blocks until an explicit tap on a card that shows the stored name. |
| **IETF draft-ietf-httpapi-idempotency-key-header-07** **[P]** (Internet-Draft, Standards Track, **states it expires 18 Apr 2026**; not an RFC) | Key = String, UUID recommended. Same key + **different payload → SHOULD 422**. Original **still in flight → SHOULD 409**. Servers should publish key expiry. | **Adopt, and fix our docs:** mismatch → **422** (was 409); add in-flight **409 `IDEMPOTENCY_IN_PROGRESS`**; document key TTL. Cite as "draft", not RFC. |
| **OWASP LLM06:2025 Excessive Agency** **[P]** | Three root causes: excessive functionality, permissions, autonomy. Fixes: minimal tools, **granular not open-ended** tools, minimal permissions, **human approval for high-impact actions**, **authorise downstream (complete mediation), not by the LLM**. | **Adopt.** This is exactly our design: read-only tools, `propose` that only creates a pending card, execution gated downstream by token. Cite in risks. |
| OWASP LLM Top 10 (rest) **[U]** | Not yet read item by item. | To do in docs/26 threat model. |

## B. Local landscape

| Fact | Source | Note |
|---|---|---|
| ZainCash: SIM-linked wallet; P2P, cash in/out, bill payment, merchant payments, cards, Western Union; licensed by the CBI; CEO: ~95% of mobile payments (per CBI data, CEO's claim). | Zain page **[P]**, AGBI/Forbes ME via search **[S]** | CEO claim, not independently verified. |
| Cash dominates: ~85–90% of transactions; formal bank accounts ~23% of adults. | Academic study + AGBI via search **[S]** | Figures differ between sources; definitions unknown. |
| CEO: "five years" behind regional digital-payments level; electricity-bill mobile settlements launched recently. | AGBI 2026-06 via search **[S]** (page itself blocked) | Electricity-via-ZainCash **not confirmed** by a second source **[U]**. |
| Wallet balance cap 10,000,000 IQD/month. | ZainCash FAQ **[P]** | Matches our 50M per-transaction sanity bound being too high; **lower the mock cap**. |
| Transfer flow, PIN/OTP on transfer, wrong-recipient and failed-transaction policy, fee table, per-transaction limits. | Pages did not say **[U]** | Must be learned by **installing the app** and recording the flow (see TODO). |
| Qi Card / SuperQi: state-linked, card and bill payments (electricity, water, telecom). | search **[S]**, third-party | SuperQi 2.85★ iOS. |
| FIB app 4.17★ (1,382 ratings), Qi Services 4.45★ (15,288). | iTunes API **[P]** | Feature teardown not done **[U]**. |
| Ministry of Electricity has its own bill app (2.5★, 64 ratings): card payments. | App Store via search **[S]** | Evidence that people pay electricity outside wallets too. |
| CBI **Electronic Payment Services Regulation No. 2 of 2024** governs providers; light-KYC cards criticised. | academic summary **[S]** | Primary text not read **[U]**. |

## C. International products

| Product | Evidence | Lesson |
|---|---|---|
| **Hello! UPI (NPCI, India, 2023)** **[S]** | Voice/conversational payments in Hindi, English; built with AI4Bharat; PIN still entered by the user; later IRCTC/CoRover voice flow. NPCI page itself blocked **[U]**. | Voice **initiates**; **authentication stays separate**. Same as our confirm. Regional-language models were purpose-built, a point for our dialect eval. |
| **Venmo / Cash App** **[S]** | Payments "typically final"; Consumer Reports (via NBC): **12% of weekly P2P users sent money to the wrong person**. Advice: send a request first. | Strong impact stat for wrong-recipient (verify the original CR survey **[U]**). Supports forced disambiguation + name + masked number. |
| Alexa / Google Assistant payments, Wise, PayPal, M-Pesa, Alipay | **[U]** not researched | Open. Candidates for the 5-product teardown. |

## D. Adopt / reject summary (feeds design)
1. **Adopt:** payload-bound token (PSD2), 4-way recipient result (CoP), 422/409 idempotency semantics (IETF), minimal read-only tools + downstream authorisation (OWASP LLM06), voice-initiates/user-authenticates (UPI).
2. **Add:** bill-amount drift check; first-time-recipient flag; reference id on every failure; screenshot-able receipt.
3. **Reject:** CoP's "warn but allow"; any model-callable payment tool.

## TODO (can't be done from here)
- [ ] Install ZainCash, Qi Services, FIB; record transfer + bill flows; count taps; note PIN/OTP, wrong-recipient handling. (≥5 products incl. 2 intl.)
- [ ] Google Play reviews (blocked). Facebook/Telegram complaint threads (not searchable here).
- [ ] Read CBI Regulation No. 2 of 2024 and the ZainCash Fees & Limits page.
- [ ] Original Consumer Reports survey.
