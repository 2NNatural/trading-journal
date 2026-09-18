# Live Trading Journal

A private, read-only trading journal for fast crypto traders.

The goal is simple:

1. **Buy a token.**
2. Immediately write **why you bought it**.
3. The journal catches up from the chain and automatically adds context such as:
   - ticker + token name
   - amount bought
   - amount spent
   - effective entry price
   - current holdings
   - current USD value
   - realized/unrealized P&L when it can be reconstructed reliably
4. Sell whenever you want. **Exit notes are optional.**

There is no required "thesis completion" workflow and no private key is ever needed.

## Supported chains

- Robinhood Chain
- Solana
- ARC
- BNB Smart Chain / BSC

The sync is incremental. It stores a cursor for each wallet and processes only new activity instead of repeatedly re-indexing wallet history.

## Fastest setup: give this repo to an AI

This is the intended setup path for nontechnical users.

### What you need

- A GitHub account with access to this repository
- A free Supabase account/project
- A free Vercel account
- Your **public wallet addresses**
- An email/password you want to use to sign into your private journal

> **Never provide a seed phrase, private key, trading key, or wallet-signing permission.**
> This app is read-only. Public wallet addresses are enough.

### Copy/paste this into ChatGPT, Claude, Codex, or another coding agent

```text
Set up this trading-journal repository for me end-to-end.

Repository:
https://github.com/2NNatural/trading-journal

First read docs/AI_SETUP_PROMPT.md and follow it exactly.

I am not technical. Do the setup work directly using connected GitHub, Supabase, and Vercel tools when available. Do not give me a long coding tutorial.

Ask me only for:
1. the public wallet addresses I want tracked and which supported chain each one uses;
2. the email/password I want for the journal login;
3. permission to connect or create the necessary Supabase/Vercel/GitHub resources if you cannot already access them.

Never ask for a seed phrase, private key, wallet-signing key, or trading API key.

Use free-tier-compatible infrastructure. Apply the repo migrations, deploy the checked-in Supabase Edge Functions, configure the one-minute incremental cron jobs, create/configure my journal user and wallets, deploy the website to Vercel, and verify that the live site can sign in and that sync status is healthy.

Do not stop after explaining what to do. Complete every step that your tools permit, then give me only the remaining manual clicks, if any.
```

The full installer instructions are in [docs/AI_SETUP_PROMPT.md](docs/AI_SETUP_PROMPT.md).

## What gets deployed

### Vercel

A small private web app under `web/`.

Required Vercel environment variables:

```text
SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
```

### Supabase

Migrations under `supabase/migrations/` create:

- authenticated journal rows with RLS
- wallet records
- incremental per-wallet sync cursors
- immutable trade-note entries
- raw chain events
- ticker/name metadata
- holdings/value/P&L metrics
- Realtime publication for journal positions and notes
- server-only runtime state for scheduled workers

Current Edge Functions are checked into:

- `supabase/functions/journal-config/`
- `supabase/functions/journal-chain-sync-lite/`
- `supabase/functions/journal-sol-sync/`
- `supabase/functions/journal-token-metadata/`
- `supabase/functions/journal-position-metrics/`

After deployment, run:

```sql
select public.install_journal_cron('https://YOUR_PROJECT_REF.supabase.co');
```

That installs the one-minute sync/metadata/metrics jobs.

## Normal workflow

Open the journal and type your thought immediately after buying:

> TIGRINO — buying because...

You do **not** need to wait for the chain sync. The manual note is saved instantly. When the matching chain activity arrives, the journal reconciles the objective context underneath it.

A detected trade can look like:

```text
TIGRINO — Leopardus Tilcayo
Bought 20,648.305857 tokens
Spent 0.507513 SOL
Entry 0.00002458 SOL/token
Held 20,648.305857
Value $...
P/L ...
```

For a fast round trip, selling does not force another essay. The exit note is optional.

## Data model / safety

- **Read-only chain access**
- No transaction signing
- No seed phrases
- No private wallet keys
- No autonomous trading
- Wallet identity is chain-aware
- Same ticker on different contracts stays separate
- Re-buy after a full exit can create a new trade episode
- Closed positions are not repeatedly re-indexed
- P&L is left blank when it cannot be reconstructed confidently

Market metadata/prices are best-effort and may depend on public RPC/indexer/DEX data availability.

## Cost

The project is designed to run on free Supabase + Vercel tiers and public RPC/data endpoints for a small personal journal. Provider limits and pricing can change, so "free forever" is not guaranteed.

## Manual setup

If your AI cannot access GitHub/Supabase/Vercel directly, see [docs/MANUAL_SETUP.md](docs/MANUAL_SETUP.md). It is intentionally short.

## Repository history

Older research and Phase 1 validation files remain under `research/` and `docs/` for provenance. They are **not** the current installation path. The current app is the live-feed journal described in this README.
