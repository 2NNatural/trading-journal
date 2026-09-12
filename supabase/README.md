# Supabase backend

This directory contains the private journal schema only. No Supabase project or account was created by Codex.

The first migration stores exact raw quantities as Postgres `NUMERIC`, keeps the original thesis text, links objective fills to their source evidence and protects every row with `auth.uid()` RLS policies. `raw_observations` is intentionally source-addressable so a sync can retain the provider response before advancing its cursor.

The next backend implementation is a small Edge Function that:

1. claims an unexpired `sync_state` lease;
2. fetches one bounded GMGN page using server-side secrets;
3. writes the raw observation and manifest metadata;
4. upserts objective candidates by transaction identity;
5. advances the cursor only after durable writes; and
6. releases the lease with `last_success_at` or a visible error state.

Run it every 15 minutes with Supabase Cron. Vercel serves the UI; it does not receive GMGN or RPC credentials.
