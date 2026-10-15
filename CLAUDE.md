# CLAUDE.md

Read and follow [AGENTS.md](AGENTS.md). It is the single source of rules for every AI assistant in this repo.

Quick reminders:
- Spec lives in `docs/`. Start with `README.md` for the map.
- LLM understands; deterministic code moves money. No payment tool for the model.
- Invariants: confirmation token, idempotency key, ask-don't-guess, fail closed, Zod on every model output.
- Commit small and often. Never invent eval numbers.
