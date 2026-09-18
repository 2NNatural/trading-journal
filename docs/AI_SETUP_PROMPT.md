# AI Installer Prompt

Use this file as the authoritative installation runbook for the current trading journal.

## Objective

Deploy a private, read-only, near-real-time trading journal for a nontechnical user.

The end result must:

- let the user write a buy thesis instantly without waiting for sync;
- detect new on-chain trades incrementally;
- automatically attach ticker/name and entry context;
- track current holdings/value;
- calculate P&L when the source data is sufficiently reliable;
- update the browser via Supabase Realtime;
- never require or accept a wallet private key.

## Safety requirements

Hard requirements:

- Ask for **public wallet addresses only**.
- Never ask for or store seed phrases, private keys, wallet-signing keys, browser-wallet approvals, or transaction permissions.
- Do not add trading/execution code.
- Do not expose the Supabase service-role key to the browser or Vercel client.
- Use the checked-in RLS policies.
- Treat market prices/P&L as best-effort. Leave fields null rather than inventing values.

## Information to collect from the user

Ask only for missing items:

1. Login email.
2. Login password.
3. One or more public wallet addresses with a chain:
   - `robinhood`
   - `sol`
   - `arc`
   - `bsc`
4. Optional labels for each wallet.
5. Optional preferred Vercel project name.

Do not force exactly five wallets. The backend supports 1-10 wallet records.

## Preferred tool-driven installation

If GitHub, Supabase, and Vercel connectors/tools are available, perform the work directly.

### 1. Repository

Work from the user's fork/copy of this repository if they want independent ownership. Do not commit their wallet addresses or secrets to GitHub.

### 2. Supabase project

Create/select a Supabase project.

Apply every SQL migration in `supabase/migrations/` in filename order.

Verify that these tables exist:

- `wallets`
- `journal_positions`
- `journal_entries`
- `sync_state`
- `chain_events`
- `sync_runtime`

Verify `journal_positions` contains at least:

- `token_address`
- `token_name`
- `wallet_id`
- `chain`
- `current_token_balance`
- `current_price_usd`
- `current_value_usd`
- `realized_pnl_quote`
- `unrealized_pnl_quote`
- `total_pnl_quote`
- `return_pct`

### 3. Deploy Supabase Edge Functions

Deploy these checked-in functions:

- `journal-config`
- `journal-chain-sync-lite`
- `journal-sol-sync`
- `journal-token-metadata`
- `journal-position-metrics`

Use the repository source exactly. These functions intentionally use custom/internal authentication patterns; preserve each checked-in deployment configuration when adapting to the platform.

### 4. Authentication user

Create one Supabase Auth email/password user for the trader.

If your available Supabase tool cannot create Auth users, give the user exactly this minimal manual step:

> Supabase Dashboard → Authentication → Users → Add user → enter the journal email/password.

Then retrieve that user's UUID before inserting wallets.

### 5. Insert the user's public wallets

Insert/upsert wallet rows using the Auth user UUID.

Chain IDs:

- Robinhood: `4663`
- ARC: `5042`
- BSC: `56`
- Solana: `NULL`

Example shape only:

```sql
insert into public.wallets
  (user_id, label, chain, chain_id, address, sync_enabled)
values
  ('USER_UUID', 'Solana main', 'sol', null, 'PUBLIC_ADDRESS', true)
on conflict (user_id, chain, address)
do update set
  label = excluded.label,
  chain_id = excluded.chain_id,
  sync_enabled = true;
```

Normalize EVM addresses to lowercase. Keep Solana addresses unchanged.

### 6. Install cron

After the five functions are deployed:

```sql
select public.install_journal_cron('https://YOUR_PROJECT_REF.supabase.co');
```

Verify these jobs are active:

- `journal-robinhood-sync-1m`
- `journal-arc-sync-1m`
- `journal-bsc-sync-1m`
- `journal-sol-sync-1m`
- `journal-token-metadata-1m`
- `journal-position-metrics-1m`

It is fine if a chain job has no corresponding wallet; the worker should simply have nothing to process.

### 7. Realtime

Verify `journal_positions` and `journal_entries` are in the `supabase_realtime` publication. Migration 0007 should do this.

### 8. Vercel

Create/import a Vercel project from the repo.

Set:

```text
SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
SUPABASE_PUBLISHABLE_KEY=<project publishable key>
```

Do **not** put the service-role key in Vercel client configuration.

Deploy using the checked-in `vercel.json`.

### 9. Verification

Before declaring success:

1. Open the deployed site.
2. Confirm email/password sign-in works.
3. Confirm `/api/config` returns project URL + publishable key, not secrets.
4. Confirm the header eventually shows healthy live-chain sync.
5. Query `sync_state` filtered to `source='chain-rpc'`.
6. Confirm each configured wallet has a current/advancing cursor or healthy successful state.
7. Confirm cron jobs are active.
8. Confirm no seed/private key exists anywhere in repo, Vercel env, or Supabase tables.
9. Add one temporary manual thesis note and verify it appears without a page refresh if practical.

## Current runtime architecture

### EVM chains

Robinhood / ARC / BSC use keyless public RPCs. The worker stores a block cursor and processes only new blocks. It identifies wallet-initiated transactions, decodes ERC-20 transfers, and derives entry context.

### Solana

Solana stores a signature cursor and processes signatures newer than the cursor. It derives wallet token-balance deltas from the transaction.

### Metadata

The metadata worker resolves ticker/name using public market/token metadata sources and contract calls where appropriate.

### Metrics

The metrics worker stores holdings/current value and calculates realized/unrealized P&L only when the entry/exit quote units can be compared safely.

### UI

The UI is deliberately note-first:

- quick symbol + chain + thesis input;
- Ctrl/Cmd + Enter saves;
- chronological newest-first trade feed;
- exit note optional;
- Realtime updates;
- no mandatory thesis-completion workflow.

## Troubleshooting

### "Sync needs attention"

Query only current sync rows:

```sql
select w.chain,w.label,s.status,s.error_code,s.cursor,s.last_success_at
from public.wallets w
left join public.sync_state s
  on s.wallet_id=w.id
 and s.source='chain-rpc'
where w.sync_enabled=true
order by w.chain,w.label;
```

Do not diagnose current chain sync from retired GMGN rows.

### Missing ticker/name

Run/inspect `journal-token-metadata`. Do not replace a contract-specific identifier based only on ticker text.

### Missing P&L

This can be legitimate. P&L must remain null when proceeds/cost basis cannot be compared reliably.

### RPC provider limit

Do not fall back to repeatedly re-indexing full wallet history. Preserve the incremental cursor architecture and reduce request size/frequency if necessary.

## Completion message to the user

Keep it short. State:

- deployed URL;
- configured chains/wallet count;
- whether all current sync states are healthy;
- whether Realtime is working;
- any data limitations that remain.

Do not dump implementation details unless asked.
