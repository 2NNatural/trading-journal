-- Expand the journal from Robinhood-only autosync to multi-chain wallets.
-- Supported GMGN chain keys: robinhood, sol, arc, bsc.

alter table public.wallets drop constraint if exists wallets_address_check;
alter table public.wallets drop constraint if exists wallets_chain_id_check;
alter table public.wallets drop constraint if exists wallets_user_id_address_key;
alter table public.wallets alter column chain_id drop not null;

alter table public.wallets add constraint wallets_chain_address_check check (
  (chain in ('robinhood','arc','bsc') and address ~ '^0x[0-9a-fA-F]{40}$')
  or (chain = 'sol' and address ~ '^[1-9A-HJ-NP-Za-km-z]{32,44}$')
);

alter table public.wallets add constraint wallets_chain_id_check check (
  (chain='robinhood' and chain_id=4663)
  or (chain='bsc' and (chain_id is null or chain_id=56))
  or (chain in ('sol','arc') and chain_id is null)
);

alter table public.wallets add constraint wallets_user_chain_address_key unique (user_id, chain, address);

alter table public.journal_positions
  add column if not exists wallet_id uuid references public.wallets(id) on delete set null;

drop index if exists public.journal_positions_user_chain_token_idx;
drop index if exists public.journal_positions_user_token_open_idx;

create unique index if not exists journal_positions_open_wallet_chain_token_idx
on public.journal_positions(user_id, wallet_id, chain, lower(token_address))
where token_address is not null and wallet_id is not null and status='OPEN';

create index if not exists journal_positions_wallet_chain_token_idx
on public.journal_positions(user_id, wallet_id, chain, lower(token_address));

update public.wallets
set chain='robinhood', chain_id=4663
where chain is null or chain='';

-- Legacy single-wallet RPC helpers are no longer used by the JWT-protected
-- journal-config Edge Function. Keep them inaccessible from the Data API.
revoke all on function public.journal_configure_gmgn_sync(text,text) from public, anon, authenticated;
revoke all on function public.journal_disable_gmgn_sync() from public, anon, authenticated;
revoke all on function public.journal_request_sync() from public, anon, authenticated;
