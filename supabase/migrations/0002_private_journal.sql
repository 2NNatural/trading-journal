-- Private hand-entered journal layer.
-- These rows can exist before a token is linked to an on-chain position_episode.

create table public.journal_positions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  position_episode_id uuid references public.position_episodes(id) on delete set null,
  slug text not null,
  symbol text not null,
  short_label text,
  icon_class text not null default '',
  status public.position_status not null default 'UNKNOWN',
  opened_label text,
  size_label text,
  pnl_label text,
  pnl_percent_label text,
  value_label text,
  hold_thesis_required boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, slug),
  unique (user_id, id)
);

create table public.journal_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  journal_position_id uuid not null references public.journal_positions(id) on delete cascade,
  kind public.thesis_event_kind not null,
  original_text text not null check (length(btrim(original_text)) > 0),
  confidence text check (confidence in ('low', 'medium', 'high')),
  display_date text,
  context_label text,
  written_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  foreign key (user_id, journal_position_id) references public.journal_positions(user_id, id) on delete cascade
);

create index journal_positions_user_status_idx on public.journal_positions(user_id, status, updated_at desc);
create index journal_entries_user_written_idx on public.journal_entries(user_id, written_at asc);

alter table public.journal_positions enable row level security;
alter table public.journal_entries enable row level security;

create policy "journal position owner access"
on public.journal_positions
for all
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy "journal entry owner access"
on public.journal_entries
for all
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create trigger journal_positions_touch_updated_at
before update on public.journal_positions
for each row execute function public.touch_updated_at();
