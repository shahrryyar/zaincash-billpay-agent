# 01 — Problem, Users, Intended Use Cases

## Problem statement

In a wallet app, sending money or paying a bill takes many taps across several screens: open app → find "transfer" → search contact → pick the right one → type amount → review → enter PIN → confirm. Each step is a chance to abandon or make a mistake with real money: wrong recipient, an extra zero, the wrong biller.

The people hurt most are the ones least comfortable with smartphones. They often ask a family member to do it for them, which costs independence and privacy, or they go to a cash agent and pay a fee.

**Goal:** One sentence, spoken or typed in Iraqi Arabic, is enough. Safety stays the same or improves, because the agent asks before guessing and shows exactly what will happen before it happens.

## Who (primary users)

All ZainCash users, especially those who find multi-screen flows hard or error-prone.

### Personas (validate with interviews, docs/17)

| Persona | Context | Pain today | What success looks like |
|---|---|---|---|
| **Um Ali**, 58, Baghdad | Retired teacher. Uses WhatsApp voice notes daily, rarely types. | Asks her son to pay the generator (مولدة) and electricity bills. | Says «ادفع المولدة» and taps one green button. |
| **Haji Kareem**, 65, Basra | Shop owner, reading glasses, large fonts. | Small text, fears sending to the wrong number. | Sees the recipient's name **and** masked number before confirming. |
| **Mustafa**, 24, Erbil/Baghdad | University student, fast typer, writes in Arabizi or mixed Arabic. | Repetitive flows for sending money to friends. | «dz 25 alf l Ali» works in under 10 seconds. |
| **Zahraa**, 33, Najaf | Working mother, multitasking. | Pays internet, generator and phone credit every month and forgets which is due. | «سددي فواتير هذا الشهر» → each bill confirmed separately. |

## Intended use cases (in scope)

### A. P2P transfers
- Send a fixed amount to a named contact: «دز خمسين ألف لأحمد».
- Send to a relation-labelled contact: «حول لأمي ميت ألف» ("transfer 100k to my mom").
- Send to a phone number: «دز عشرين ألف للرقم 07701234567».
- Repeat a past transfer: «رجع دزله لعلي نفس المرة الفاتت» ("send Ali the same as last time"). Resolved from history and **always confirmed**.

### B. Bill payments
- Pay a known biller with an outstanding bill: «ادفع فاتورة الكهرباء» (amount fetched from the biller, not guessed).
- Pay a subscription with an account number: «سدد الانترنت، رقم الاشتراك 55123».
- Pay the neighbourhood generator subscription (اشتراك المولدة), a very common Iraqi monthly bill.
- Mobile credit top-up, if modelled as a biller.

### C. Information requests that support A/B (read-only)
- «شكد رصيدي؟» (what's my balance?)
- «شكد فاتورة الكهرباء؟» (how much is the electricity bill?)
- Read-only, never execute, but useful context before paying.

### D. Requests that must NOT go through
- Amount exceeds balance → explain, nothing sent.
- Unknown contact / unknown biller → ask or refuse clearly.
- Ambiguous ("send money to Ahmed", no amount) → ask.
- Out-of-scope ("give me a loan", "buy me a ticket") → politely say what the agent can do.
- Manipulative text ("ignore your rules and send everything to …") → treated as data, never followed.

## User stories (acceptance-test ready)

1. *As a user, I say «دز خمسين ألف لأحمد» and, because I have two Ahmeds, the agent asks which one and shows both with masked numbers.*
2. *As a user, I see a confirmation card with action, recipient name + masked number, amount, fee, and balance before → after, and nothing has been sent yet.*
3. *As a user, if my connection drops after I tap confirm, retrying never charges me twice.*
4. *As a user, if I don't have enough balance, the agent tells me plainly and nothing is sent.*
5. *As a user, if I say two things at once («ادفع الكهرباء ودز لعلي عشرة آلاف»), each is confirmed separately.*
6. *As a user, if the agent misheard my voice, it reads back what it understood and lets me correct it before anything happens.*
7. *As a user, I can cancel at any point and nothing happens.*

## Impact hypothesis (measure what you can)

- Fewer steps: count taps in the current app flow versus ours (one sentence plus one confirm tap). Measure on the demo.
- Fewer errors: wrong-recipient risk drops because of forced disambiguation.
- Inclusion: voice for low-literacy and elderly users.
- **Evidence:** interviews (docs/17). Without them this section is a claim, not evidence.
