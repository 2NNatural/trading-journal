-- Bring a fresh clone up to the current live journal runtime.
-- Safe to run after 0001-0006.

create extension if not exists pgcrypto;
create extension if not exists pg_cron;
create extension if not exists pg_net;

alter table public.wallets
  add column if not exists sync_enabled boolean not null default true,
  add column if not exists last_sync_status text,
  add column if not exists last_sync_error text;

alter table public.sync_state
  add column if not exists retry_after timestamptz;

alter table public.journal_positions
  add column if not exists token_address text,
  add column if not exists chain text not null default 'robinhood',
  add column if not exists sync_source text not null default 'manual',
  add column if not exists first_synced_at timestamptz,
  add column if not exists last_synced_at timestamptz,
  add column if not exists sync_net_token_amount numeric,
  add column if not exists last_activity_at timestamptz,
  add column if not exists source text not null default 'manual',
  add column if not exists wallet_id uuid references public.wallets(id) on delete set null,
  add column if not exists token_name text,
  add column if not exists current_token_balance numeric,
  add column if not exists current_price_usd numeric,
  add column if not exists current_value_usd numeric,
  add column if not exists cost_basis_quote numeric,
  add column if not exists cost_basis_quote_symbol text,
  add column if not exists current_value_quote numeric,
  add column if not exists realized_pnl_quote numeric,
  add column if not exists unrealized_pnl_quote numeric,
  add column if not exists total_pnl_quote numeric,
  add column if not exists return_pct numeric,
  add column if not exists metrics_updated_at timestamptz;

create unique index if not exists journal_positions_open_wallet_chain_token_idx
on public.journal_positions(user_id, wallet_id, chain, lower(token_address))
where token_address is not null and wallet_id is not null and status='OPEN';

create index if not exists journal_positions_wallet_chain_token_idx
on public.journal_positions(user_id, wallet_id, chain, lower(token_address));

create table if not exists public.sync_config (
  user_id uuid primary key references auth.users(id) on delete cascade,
  wallet_address text,
  gmgn_api_key text,
  enabled boolean not null default false,
  updated_at timestamptz not null default now()
);

create table if not exists public.sync_runtime (
  id integer primary key,
  sync_key text not null,
  updated_at timestamptz not null default now()
);

insert into public.sync_runtime(id, sync_key)
values (1, encode(gen_random_bytes(32), 'hex'))
on conflict (id) do nothing;

alter table public.sync_config enable row level security;
alter table public.sync_runtime enable row level security;
revoke all on public.sync_config from anon, authenticated;
revoke all on public.sync_runtime from anon, authenticated;

-- Realtime makes new trades/notes appear without manually refreshing.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname='supabase_realtime' and schemaname='public' and tablename='journal_positions'
  ) then
    alter publication supabase_realtime add table public.journal_positions;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname='supabase_realtime' and schemaname='public' and tablename='journal_entries'
  ) then
    alter publication supabase_realtime add table public.journal_entries;
  end if;
end $$;

-- Run once after Edge Functions are deployed:
-- select public.install_journal_cron('https://YOUR_PROJECT_REF.supabase.co');
create or replace function public.install_journal_cron(p_project_url text)
returns void
language plpgsql
security invoker
set search_path = public, cron, net
as $$
declare
  v_url text := rtrim(p_project_url, '/');
begin
  if v_url !~ '^https://[a-z0-9-]+[.]supabase[.]co$' then
    raise exception 'Expected a Supabase project URL like https://abc.supabase.co';
  end if;

  perform cron.unschedule(jobid) from cron.job
    where jobname in (
      'journal-robinhood-sync-1m','journal-arc-sync-1m','journal-bsc-sync-1m',
      'journal-sol-sync-1m','journal-token-metadata-1m','journal-position-metrics-1m'
    );

  perform cron.schedule('journal-robinhood-sync-1m','* * * * *',format(
    $job$select net.http_post(url := %L, headers := jsonb_build_object('Content-Type','application/json','x-sync-key',(select sync_key from public.sync_runtime where id=1)), body := '{"chain":"robinhood"}'::jsonb);$job$,
    v_url || '/functions/v1/journal-chain-sync-lite'
  ));
  perform cron.schedule('journal-arc-sync-1m','* * * * *',format(
    $job$select net.http_post(url := %L, headers := jsonb_build_object('Content-Type','application/json','x-sync-key',(select sync_key from public.sync_runtime where id=1)), body := '{"chain":"arc"}'::jsonb);$job$,
    v_url || '/functions/v1/journal-chain-sync-lite'
  ));
  perform cron.schedule('journal-bsc-sync-1m','* * * * *',format(
    $job$select net.http_post(url := %L, headers := jsonb_build_object('Content-Type','application/json','x-sync-key',(select sync_key from public.sync_runtime where id=1)), body := '{"chain":"bsc"}'::jsonb);$job$,
    v_url || '/functions/v1/journal-chain-sync-lite'
  ));
  perform cron.schedule('journal-sol-sync-1m','* * * * *',format(
    $job$select net.http_post(url := %L, headers := jsonb_build_object('Content-Type','application/json','x-sync-key',(select sync_key from public.sync_runtime where id=1)), body := '{}'::jsonb);$job$,
    v_url || '/functions/v1/journal-sol-sync'
  ));
  perform cron.schedule('journal-token-metadata-1m','* * * * *',format(
    $job$select net.http_post(url := %L, headers := jsonb_build_object('Content-Type','application/json','x-sync-key',(select sync_key from public.sync_runtime where id=1)), body := '{}'::jsonb);$job$,
    v_url || '/functions/v1/journal-token-metadata'
  ));
  perform cron.schedule('journal-position-metrics-1m','* * * * *',format(
    $job$select net.http_post(url := %L, headers := jsonb_build_object('Content-Type','application/json','x-sync-key',(select sync_key from public.sync_runtime where id=1)), body := '{}'::jsonb);$job$,
    v_url || '/functions/v1/journal-position-metrics'
  ));
end;
$$;

revoke all on function public.install_journal_cron(text) from public, anon, authenticated;
