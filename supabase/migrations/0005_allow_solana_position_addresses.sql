-- Allow journal positions to identify both EVM contracts and Solana mints.
alter table public.journal_positions
  drop constraint if exists journal_positions_token_address_format;

alter table public.journal_positions
  add constraint journal_positions_token_address_format
  check (
    token_address is null
    or token_address ~ '^0x[0-9a-fA-F]{40}$'
    or token_address ~ '^[1-9A-HJ-NP-Za-km-z]{32,44}$'
  );
