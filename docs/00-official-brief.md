# 00 — Official Brief (Topic 04) and Challenge Rules

Source: *Agentic AI Challenge Iraq: Topic Briefs*, draft for review, 17/09/2026. Organisers: ZainCash with the Arab Young Leaders Foundation, Zain, and Onxsis. Prize: 30,000,000 IQD.

## Topic 04 — Bill Pay & Transfer Agent

*Turns "pay my electricity bill" into a completed, confirmed transaction.*

### The problem
Paying a bill or sending money in a wallet app takes many taps and several screens. Users who are less comfortable with smartphones abandon the flow or make mistakes. A single sentence, spoken or typed, should be enough.

### What you build
An agent that takes a natural-language request in Iraqi Arabic ("pay my electricity bill", "send 50,000 to Ahmed"), works out the intent, gathers anything missing (which Ahmed, which biller, which amount), shows a clear confirmation, executes against a **mock wallet API**, and reports the result. When something goes wrong, it fails safely and says so.

### Must have
- Nothing executes without an **explicit confirmation step** the user can read and understand.
- Ambiguity is resolved by **asking, not guessing**. Two contacts named Ahmed means a question, not a coin flip.
- Retries **never cause a double payment**. Show how you prevent it.
- Clear, **honest failure messages** when a payment cannot go through.

### Out of scope
Connecting to real payment systems. You build and run a mock wallet API with contacts, billers, balances and transaction history. The agent talks to that.

### Data
Your mock wallet: users, contacts (including duplicates and similar names), billers, balances and history, generated with an LLM from a schema you define. Plus a test set of **at least 50 requests** in Iraqi dialect, including **ambiguous and malformed** ones, generated the same way and then edited by hand for realism.

### What a strong submission shows
- The confirmation step is **designed, not bolted on**. It shows the right information at the right moment.
- Edge cases are **handled deliberately**: insufficient balance, unknown contact, a request that is really two requests.
- Test set results, including how it behaves on requests that **should not go through**.

### Stretch
Voice input. The same agent driven by spoken Iraqi Arabic.

---

## Rules for every topic

- **Leverage what LLMs can do** — prompting, retrieval, tool use, agents, evaluation. How far can a modern model go on a real problem?
- **Simulate your data with an LLM.** No real customer records, IDs or transaction histories. Generate more than needed, check a sample by hand, hold part back for testing.
- **Build a test set.** Held-out, not tuned on, with results. "A demo without numbers is a demo, not evidence."
- **Iraqi Arabic is the default.** Show how dialect is handled.
- **Disclose everything** — models, tools, libraries, data sources, AI coding assistants. Using AI is expected; hiding it is not.
- **Simple and reliable beats complex.**

## Judging (build & demo round)

| Dimension | Weight | Judges look for |
|---|---|---|
| Working prototype and reliability | 25% | Runs live on judge-supplied input, holds up |
| Technical judgment and architecture | 20% | Right tool, sensible failure handling, no unjustified complexity |
| Problem and impact | 20% | Real user, real problem, **evidence you spoke to someone** |
| Grounding, security and responsibility | 15% | Outputs traceable to data, safe failure, privacy handled |
| Evaluation evidence | 15% | Held-out test set, honest results |
| Demo clarity | 5% | Understood in the first minute |

## Gates (must pass before scoring)

1. Repository with commit history spanning the build period.
2. Live run on judge-supplied input.
3. Full disclosure of models, tools and data.
4. At least three documented failure modes with how you handle them.

## How our plan maps to the brief

| Brief requirement | Where handled |
|---|---|
| Explicit confirmation | docs/07, docs/15 confirmation card |
| Ask, don't guess | docs/04 `CLARIFYING` state, docs/08 resolver |
| No double payment | docs/07 idempotency |
| Honest failures | docs/13, docs/15 copy |
| Mock wallet with duplicates/similar names | docs/06, docs/11 |
| ≥50 dialect requests incl. ambiguous/malformed | docs/11 (we target 150–200) |
| Requests that should not go through | docs/12 `must_not_execute` category |
| Voice stretch | docs/09 RegaLabs ASR |
