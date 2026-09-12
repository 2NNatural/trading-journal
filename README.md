# Trading Journal — Phase 1 validation

Planning deliverables for a read-only Robinhood Chain journal centered on immutable thesis timelines.

**Budget: $0 recurring service cost.** The private journal will use Vercel Hobby for the website and Supabase Free for storage/scheduled sync. The [free-only implementation constraint](docs/FREE_IMPLEMENTATION.md) supersedes earlier paid-service assumptions. SolidRPC Free now serves live native traces; Alchemy Free continues serving archive and indexed reads.

- [Architecture and phase-by-phase plan](docs/ARCHITECTURE.md)
- [Phase 1 only coding prompt](docs/PHASE1_CODING_PROMPT.md)
- [Research evidence and test limitations](research/README.md)
- [Evidence manifest](research/manifest.json)
- [Live Phase 1 results and remaining gates](docs/PHASE1_RESULTS.md)
- [Harness commands and operating limits](docs/PHASE1_RUNBOOK.md)

Current gate: **HYBRID_REQUIRED — Phase 2 closed**. Authentication works. The harness captured 457 default activity rows and checked 20 trade rows against receipts. A transfer/balance anomaly is explained and quarantined. All 20 sampled native cashflows reconcile against transaction state and archive balances using free RPCs; historical USD, routed token fees and latency validation remain pending. See the results for the passing checks and remaining gates.

The Phase 1 TypeScript harness is implemented under `scripts/phase1`. The journal MVP is now the next implementation step; it will start with a read-only fixture backed by the validated evidence, then add Supabase persistence. Exact live responses are kept in ignored, private `research/phase1` run directories. Synthetic tests are labeled separately.

## Journal MVP

The Vercel-compatible shell is in [`web/`](</Users/noahneri/Documents/ChatGPT/Trading Journal/web/README.md>). It starts with the initial Sep 10–11 trade notes, marks the imported legacy holdings that still need hold theses, and provides an immutable-style thesis timeline plus a local draft workflow without putting wallet credentials or private evidence in the browser bundle.

Run it locally with `npm run web:dev`, then open `http://localhost:3000`. `npm run web:check` validates the browser and Vercel function scripts. To deploy the current shell, import this repository into a Vercel Hobby project using the checked-in `vercel.json`; it serves `web/` and exposes `/api/health`. The initial private database schema is in [`supabase/migrations/0001_journal.sql`](</Users/noahneri/Documents/ChatGPT/Trading Journal/supabase/migrations/0001_journal.sql>). Live wallet syncing will be added through Supabase Free and will use a 15-minute schedule with a 30-minute stale threshold.

## Add your inputs

1. Fill `TEST_WALLET` and `GMGN_API_KEY` in `.env.local`. Optional Alchemy/RPC credentials go there too.
2. Add any known transaction examples, GMGN plan details and preferences to `docs/PROJECT_INPUTS.local.md`.
3. Use the runbook to reproduce or extend Phase 1 validation.

Both local input files are excluded from Git. `.env.example` is a safe blank template. The harness loads these settings and rejects `GMGN_PRIVATE_KEY`. It uses read-only endpoints and stops after each bounded command.
