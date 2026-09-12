# Remaining validation and free hosting path

Updated 2026-09-11. The user approved Vercel Hobby for this private, personal journal. The recurring service budget remains $0. Freshness may be up to 30 minutes; the earlier 5–20 second target is removed for this MVP. This is the next work sequence; it is not a report of completed cloud testing.

## 1. Add optional independent valuation to the existing transaction evidence

Use the 20 reconciled trades, their receipts, call traces and transaction timestamps. We already have exact wallet native cashflows, quote-token logs, route legs, fee amounts and GMGN's reported USD fields. The private MVP can display those facts now with source labels. An independent free historical ETH/USD source is a later confidence improvement: verify its timestamp resolution, availability and units, retain the response and compare it against GMGN without treating GMGN as its own independent reference.

Decode the intermediate USDG movements and fee recipients to establish gross versus net amounts. Keep platform/route fees, swap costs and network gas distinct. Identify separately charged approvals; define an explicit allocation rule before producing episode P&L. Do not assume a stablecoin always equals one dollar. A missing historical rate stays unknown.

Deliverable: per-transaction comparison with exact asset amounts, fee inclusion, provider valuation and source references. Independent historical conversion remains an optional enrichment; never replace an unknown rate with zero or a current price.

## 2. Complete case coverage from existing history

Find re-entry, failed attempts and external executions where the available sources support discovery. Verify receipt status and preserve failed-attempt gas without creating fills. Distinguish unavailable examples from evidence that no such transactions exist. No new financial transactions are needed just for validation.

## 3. Measure ordinary trading freshness

The MVP does not need sub-minute detection. Run a bounded sampler that records independent RPC observation as well as GMGN's last absence and first appearance, and confirm that an ordinary sync cycle can keep the journal within a 30-minute freshness window. Existing historical transactions can validate parsing and accounting but cannot establish live indexing delay. Confirm the GMGN account allowance before sustained polling.

## 4. Build and smoke-test the free cloud design

Preferred frontend: Vercel Hobby. The user has confirmed this is a private personal tool, so the Hobby personal-use constraint is accepted for this MVP. Use the free `vercel.app` domain initially; no paid domain or plan is needed.

Backend: Supabase Free for Postgres, authentication, scheduled jobs and bounded Edge Functions. Schedule a sync every 15 minutes, which leaves margin inside the 30-minute freshness requirement. Keep GMGN/RPC credentials server-side. Persist raw source data before advancing checkpoints; use database leases to prevent overlapping work, durable retries and shared quotas. Fetch traces only for new or unreconciled transactions.

Before relying on this backend, perform a small isolated runtime probe for GMGN connectivity, scheduler timing, response capture, exact arithmetic and execution/storage budgets. For the personal MVP, a one-day smoke run is sufficient; a formal production reliability program is out of scope. Verify restart recovery, duplicate handling, provider cooldowns and the 30-minute freshness label. Track actual database/blob growth and provider consumption. Stop within free allowances and expose pending work when capacity is exhausted.

## 5. Build the core journal now

Implement authenticated wallet history, position episodes, immutable BUY/HOLD/SELL thesis events and verified P&L with explicit unknowns. The first UI can use the validated Phase 1 fixture and local drafts; connect live Supabase sync incrementally. Preserve original trader text. Speech and AI remain separate free-service feasibility work; they are not assumed to be covered by website hosting.

The immediate engineering task is the journal UI and data model, using the captured Phase 1 data as a read-only fixture while the Supabase connection is prepared. Steps 1–3 become incremental validation work; they do not block building the private MVP. No cloud resources have been provisioned by this plan update.
