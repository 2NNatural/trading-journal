# Agent Instructions

This repository's current product is the live, read-only trading journal described in `README.md`.

For installation or deployment, **start with `docs/AI_SETUP_PROMPT.md` and follow it exactly**.

Important:

- Do not use the old Phase 1 / GMGN research as the installation path.
- Never request or store seed phrases, wallet private keys, signing keys, or trading permissions.
- Public wallet addresses are sufficient.
- Preserve the incremental per-wallet cursor architecture.
- Deploy the checked-in Supabase functions and migrations before changing behavior.
- P&L should remain null when it cannot be reconstructed reliably.
- Prefer doing setup work directly with connected GitHub/Supabase/Vercel tools instead of giving a nontechnical user a coding tutorial.
