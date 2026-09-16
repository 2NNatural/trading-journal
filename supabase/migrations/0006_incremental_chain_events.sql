-- Durable incremental chain-ingestion state.
-- Objective wallet activity is stored once and positions are derived from new chain events.

create table if not exists public.chain_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  wallet_id uuid not null references public.wallets(id) on delete cascade,
  chain text not null,
  tx_id text not null,
  event_index text not null,
  token_address text not null,
  direction text not null check (direction in ('IN', 'OUT')),
  block_ref text,
  occurred_at timestamptz,
  raw_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (user_id, wallet_id, chain, tx_id, event_index, token_address, direction)
);

create index if not exists chain_events_wallet_created_idx
on public.chain_events(wallet_id, created_at desc);

alter table public.chain_events enable row level security;

drop policy if exists "chain event owner access" on public.chain_events;
create policy "chain event owner access"
on public.chain_events
for select
to authenticated
using ((select auth.uid()) = user_id);

grant select on public.chain_events to authenticated;
