# Manual Setup (short version)

Use this only if an AI agent cannot deploy the project directly.

## 1. Create Supabase

Create a Supabase project.

Apply all files in `supabase/migrations/` in order.

## 2. Deploy Edge Functions

Deploy:

- `journal-config`
- `journal-chain-sync-lite`
- `journal-sol-sync`
- `journal-token-metadata`
- `journal-position-metrics`

Their source is under `supabase/functions/`.

## 3. Create your login

Supabase Dashboard → Authentication → Users → Add user.

Create the email/password you will use on the journal site.

Copy the resulting user UUID.

## 4. Add public wallets

In Supabase SQL Editor, insert one row per public wallet:

```sql
insert into public.wallets
  (user_id, label, chain, chain_id, address, sync_enabled)
values
  ('YOUR_USER_UUID', 'Main Solana', 'sol', null, 'YOUR_PUBLIC_WALLET', true);
```

Use these values:

| Chain | `chain` | `chain_id` |
|---|---|---:|
| Robinhood | `robinhood` | 4663 |
| Solana | `sol` | NULL |
| ARC | `arc` | 5042 |
| BSC | `bsc` | 56 |

Only public addresses are needed.

## 5. Install scheduled sync

Run:

```sql
select public.install_journal_cron('https://YOUR_PROJECT_REF.supabase.co');
```

## 6. Deploy Vercel

Import this GitHub repo into Vercel.

Add:

```text
SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
SUPABASE_PUBLISHABLE_KEY=YOUR_PUBLISHABLE_KEY
```

Deploy.

## 7. Verify

Sign in to the deployed URL.

Then query:

```sql
select w.chain,w.label,s.status,s.error_code,s.last_success_at
from public.wallets w
left join public.sync_state s
  on s.wallet_id=w.id
 and s.source='chain-rpc'
where w.sync_enabled=true;
```

Healthy wallets should show `OK` after sync begins.

## Security

Never enter a seed phrase or wallet private key anywhere in this project.
