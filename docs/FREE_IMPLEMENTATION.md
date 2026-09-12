# Free-only implementation constraint

User requirement, 2026-09-10: **$0 recurring service cost is mandatory.** This supersedes earlier paid RPC, persistent worker, model API and hosting assumptions. No paid upgrades, credit-card trials, automatic overage billing or paid fallbacks are authorized. Preserve journal accuracy and source history; if a free limit prevents processing, report the gap and defer work instead of guessing data or charging money.

## RPC options checked

| Provider | Free capability | Evidence and limitation |
|---|---|---|
| Alchemy Free | Historical standard RPC and indexed external/ERC-20 transfers | Already worked for this wallet. Published allowance is 30M compute units/month; Trace/Debug APIs are excluded. Keep it for the methods that work. [Plan reference](https://www.alchemy.com/docs/reference/pricing-plans) |
| Robinhood public RPC | Keyless standard reads | Live chain ID and the sampled historical receipt matched. `debug_traceTransaction` returned `-32601`; previous historical balance probes also failed. [Official endpoint](https://docs.robinhood.com/chain/connecting/) |
| PublicNode | Keyless standard reads | `https://robinhood-rpc.publicnode.com` returned chain 4663 and the same historical receipt; tracing returned `-32601`. Its archive availability advertisement does not prove keyless tracing. [Operator page](https://robinhood.publicnode.com/) |
| SolidRPC Free | Live Robinhood call/state traces | Provider says Free includes 10K calls/day, 10 calls/sec and one key, without a card. **Live-tested 2026-09-11:** saved endpoint returned chain 4663, `callTracer` and `prestateTracer` results. Response headers report a 10,000-call daily quota. [Robinhood support](https://solidrpc.io/docs/chains/robinhood-chain), [Free limits](https://solidrpc.io/docs/pricing), [Setup](https://solidrpc.io/docs/getting-started) |

The tested read path combines GMGN activity, Alchemy Free indexed discovery/standard reads, and SolidRPC Free call/state traces. This establishes bounded native-accounting access, not production throughput or the full journal acceptance gate. Do not upgrade Alchemy to resolve this. The general and trace RPC endpoints are now independently configurable, and the trace endpoint's chain ID is checked before tracing.

For a free SolidRPC account, copy its full Robinhood endpoint into `ROBINHOOD_TRACE_RPC_URL` in `.env.local`. The documented format is `https://rpc.solidrpc.io/YOUR_API_KEY/evm/4663`. Keep the API key private. Leave `ROBINHOOD_RPC_URL` unchanged so configured Alchemy discovery continues working. Account creation was not performed by the agent.

Only request a trace when there is a new or unreconciled transaction; retain and reuse captured results. Do not spend a trace-provider allowance polling block height or re-reading unchanged trades. Daily budgets, retries and quota accounting must be measured before cloud rollout.

Implemented 2026-09-11: the SolidRPC reader preserves quota headers, interprets `X-Quota-Reset` as seconds until reset, and persists exhaustion across runs. HTTP 402 is not retried. Missing/malformed reset data and quota shapes inconsistent with the documented Free plan cause a persistent inspection hold. A conservative local ceiling stops after 8,000 attempted requests per configured endpoint per UTC day, counting retries. This is workspace-local protection; provider headers are needed to account for other applications using the account, and these checks cannot prove an account's billing configuration. No code enables paid plans or overage. All 21 synthetic tests and TypeScript checks pass. The saved endpoint now passes live chain and trace requests with daily quota headers; see PHASE1_RESULTS.md for the evidence.

The public RPC probe is reproducible with `--mode free-rpc --dir <existing-run-directory>`. Evidence is `free-rpc-probes.json` and the raw response manifest in the main Phase 1 run. No API keys were sent to either public endpoint.

## Vercel hosting option — checked 2026-09-11

User decision: use Vercel Hobby for the website. This is a private, personal trading journal intended to improve the user's own trading, so the noncommercial personal-use condition is accepted for the MVP. Use the free `vercel.app` domain and do not start a Pro trial or add a paid domain. [Hobby](https://vercel.com/docs/plans/hobby), [fair-use terms](https://vercel.com/docs/limits/fair-use-guidelines)

Vercel Hobby cron runs at most once per day per job, with timing anywhere within the selected hour. It is suitable for the UI, but not for the journal's 30-minute sync requirement. Put the sync schedule in Supabase Cron. [Cron limits](https://vercel.com/docs/cron-jobs/usage-and-pricing)

The backend candidate is **Supabase Free Postgres/Auth + Cron + Edge Functions**. Supabase documents second-level scheduling and HTTP invocation of Edge Functions. For this MVP, schedule one sync every 15 minutes: 2,880 invocations over 30 days, far below the 500,000 free invocation allowance. This arithmetic does not establish compute, storage, provider quotas, timing or reliability. [Cron](https://supabase.com/docs/guides/cron), [scheduling functions](https://supabase.com/docs/guides/functions/schedule-functions), [pricing](https://supabase.com/pricing)

This candidate preserves cloud operation with the browser closed. The cloud worker must use durable database leases, shared provider budgets and saved cursors; local filesystem locks/checkpoints from the harness cannot be copied into ephemeral functions. Split ingestion and expensive verification into bounded jobs. Test GMGN IPv4 egress, lossless response storage and runtime limits before adopting it. The current Free Edge runtime allows 150 seconds wall time and 2 seconds CPU per request, so each sync must stay bounded and must not overlap. [Runtime limits](https://supabase.com/docs/guides/functions/limits)

The concrete validation sequence is in [VALIDATION_NEXT_STEPS.md](VALIDATION_NEXT_STEPS.md). No cloud account, database or deployment was created during this hosting assessment.

## Whole-project implications

The original cloud requirement is retained. A no-subscription core journal is a plausible design target, not yet an empirically verified deployment:

- Supabase Free can retain the existing Postgres/Auth approach within its 500 MB database and 1 GB file-storage allowances. It pauses after a week of inactivity and does not include automatic backups. Raw captures, audio retention and independent exports need explicit storage budgets. [Supabase pricing](https://supabase.com/pricing)
- Cloudflare Workers Free is a candidate for the frontend/API and small ingestion jobs, replacing the assumed paid persistent worker. It lists 100K requests/day and 10 ms CPU per invocation. A runtime/IPv4/CPU feasibility probe is required before selection. [Workers pricing](https://developers.cloudflare.com/workers/platform/pricing/)
- Simple Cloudflare Cron triggers have minute granularity. That alone cannot establish the original ≤20-second detection target. A free event-driven or other scheduling design must be validated, or the user must accept a cadence change; no change to that target is assumed. [Cron reference](https://developers.cloudflare.com/workers/configuration/cron-triggers/)
- Do not attach a paid model/transcription API to the core journal. Deterministic statistics and original thesis text do not require model calls. Requested speech/AI features still need a separate free implementation and privacy/quota assessment; they have not been silently removed or promised unlimited capacity.
- Use free service subdomains initially. Do not provision a paid domain, database tier, worker subscription or trial that later charges. Enforce free quotas and show pending/stale data when capacity is unavailable.

GMGN describes its API key as free, but this account's exact operational allowance still needs confirmation; free access is not an unlimited-throughput promise. [GMGN's official announcement](https://gmgn.ai/blog/gmgn-skills-for-ai-agents/)

Phase 2 remains closed until the free ingestion path and the outstanding quantity, cashflow, USD/fee and latency requirements are validated. If the full original feature set cannot meet its requirements at $0, surface the specific tradeoff before implementation instead of substituting a paid dependency.
