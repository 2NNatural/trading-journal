-- Private personal journal schema.
-- Apply this migration to a Supabase project after creating the project.
-- All amount columns are NUMERIC because JavaScript Number is not safe for
-- token quantities, quote amounts, or wei values.

create extension if not exists pgcrypto;

create type public.position_status as enum ('OPEN', 'CLOSED', 'UNKNOWN');
create type public.thesis_event_kind as enum ('BUY', 'HOLD', 'SELL', 'GENERAL_THOUGHT', 'OPTIONAL_FILL_NOTE');
create type public.fill_kind as enum ('BUY', 'SELL', 'TRANSFER_IN', 'TRANSFER_OUT', 'UNKNOWN');

create table public.wallets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  label text not null default 'Primary wallet',
  chain text not null default 'robinhood',
  chain_id integer not null default 4663 check (chain_id = 4663),
  address text not null check (address ~ '^0x[0-9a-fA-F]{40}$'),
  created_at timestamptz not null default now(),
  unique (user_id, address),
  unique (user_id, id)
);

create table public.position_episodes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  wallet_id uuid not null references public.wallets(id) on delete cascade,
  token_address text not null check (token_address ~ '^0x[0-9a-fA-F]{40}$'),
  token_symbol text,
  status public.position_status not null default 'UNKNOWN',
  opened_at timestamptz,
  closed_at timestamptz,
  realized_quote_amount numeric,
  realized_quote_symbol text,
  realized_usd_provider numeric,
  valuation_status text not null default 'UNKNOWN',
  source_refs jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (user_id, wallet_id) references public.wallets(user_id, id) on delete cascade
);

create table public.fill_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  position_id uuid references public.position_episodes(id) on delete set null,
  wallet_id uuid not null references public.wallets(id) on delete cascade,
  tx_hash text not null check (tx_hash ~ '^0x[0-9a-fA-F]{64}$'),
  kind public.fill_kind not null,
  token_address text not null check (token_address ~ '^0x[0-9a-fA-F]{40}$'),
  token_symbol text,
  token_amount_raw numeric not null,
  token_decimals integer check (token_decimals between 0 and 255),
  quote_token_address text,
  quote_token_symbol text,
  quote_token_decimals integer check (quote_token_decimals between 0 and 255),
  quote_amount_raw numeric,
  native_value_wei numeric,
  gas_wei numeric,
  provider_usd numeric,
  valuation_status text not null default 'PROVIDER_REPORTED_ONLY',
  fee_breakdown jsonb not null default '{}'::jsonb,
  source_refs jsonb not null default '[]'::jsonb,
  block_number bigint,
  block_hash text,
  transaction_index integer,
  occurred_at timestamptz,
  observed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (user_id, tx_hash, kind, token_address),
  foreign key (user_id, wallet_id) references public.wallets(user_id, id) on delete cascade
);

create table public.thesis_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  position_id uuid references public.position_episodes(id) on delete set null,
  kind public.thesis_event_kind not null,
  original_text text not null check (length(btrim(original_text)) > 0),
  confidence text check (confidence in ('low', 'medium', 'high')),
  written_at timestamptz not null default now(),
  market_context jsonb not null default '{}'::jsonb,
  references_json jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create table public.sync_state (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  wallet_id uuid not null references public.wallets(id) on delete cascade,
  source text not null default 'gmgn',
  cursor text,
  last_success_at timestamptz,
  last_attempt_at timestamptz,
  status text not null default 'PENDING',
  error_code text,
  lock_until timestamptz,
  updated_at timestamptz not null default now(),
  unique (user_id, wallet_id, source)
);

create table public.raw_observations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  wallet_id uuid references public.wallets(id) on delete cascade,
  source text not null,
  source_response_id text,
  sha256 text not null,
  payload jsonb not null,
  observed_at timestamptz not null default now(),
  unique (user_id, source, sha256)
);

create index position_episodes_user_status_idx on public.position_episodes(user_id, status, updated_at desc);
create index fill_events_user_occurred_idx on public.fill_events(user_id, occurred_at desc);
create index thesis_events_user_written_idx on public.thesis_events(user_id, written_at desc);
create index raw_observations_user_observed_idx on public.raw_observations(user_id, observed_at desc);

alter table public.wallets enable row level security;
alter table public.position_episodes enable row level security;
alter table public.fill_events enable row level security;
alter table public.thesis_events enable row level security;
alter table public.sync_state enable row level security;
alter table public.raw_observations enable row level security;

create policy "wallet owner access" on public.wallets for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "position owner access" on public.position_episodes for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "fill owner access" on public.fill_events for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "thesis owner access" on public.thesis_events for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "sync owner access" on public.sync_state for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "raw owner access" on public.raw_observations for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger position_episodes_touch_updated_at
before update on public.position_episodes
for each row execute function public.touch_updated_at();

create trigger sync_state_touch_updated_at
before update on public.sync_state
for each row execute function public.touch_updated_at();
