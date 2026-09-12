# Phase 1 harness runbook

The project is free-only: see [FREE_IMPLEMENTATION.md](FREE_IMPLEMENTATION.md). A separate `ROBINHOOD_TRACE_RPC_URL` can supply free traces while the existing general RPC continues serving Alchemy's indexed transfer method. Public RPC candidates can be tested with `--mode free-rpc --dir <run-directory>`.

Use Node 24 or later. From the project directory run `npm ci --ignore-scripts`, then `npm test` and `npm run typecheck`. Dependencies are pinned in the lockfile. Tests are synthetic and make no live requests.

The harness parses `.env.local`; it never executes it as shell code. Process environment values take precedence. Required: `TEST_WALLET`, `GMGN_API_KEY`. Optional: `ROBINHOOD_RPC_URL`, or `ALCHEMY_API_KEY`. Without either, it uses the public Robinhood RPC. A configured `GMGN_PRIVATE_KEY` is rejected. Existing global GMGN config and its generated authentication keypair are not loaded.

## Commands

```sh
npm run phase1
npm run phase1 -- --mode history --limit 50 --max-pages 50
```

Each creates and prints a private run directory. `inspect` is the default and fetches one activity page plus chain ID. A history run saves a durable checkpoint, observations and candidate comparisons.

Set `PHASE1_RUN_DIR` to the printed run directory, then use:

```sh
npm run phase1 -- --mode history --dir "$PHASE1_RUN_DIR" --limit 50 --max-pages 50 --resume
npm run phase1 -- --mode verify --dir "$PHASE1_RUN_DIR" --sample 20
npm run phase1 -- --mode discover --dir "$PHASE1_RUN_DIR" --max-pages 10
npm run phase1 -- --mode filters --dir "$PHASE1_RUN_DIR"
npm run phase1 -- --mode corpus --dir "$PHASE1_RUN_DIR"
npm run phase1 -- --mode market --dir "$PHASE1_RUN_DIR"
npm run phase1 -- --mode latency --dir "$PHASE1_RUN_DIR" --seconds 120
npm run phase1 -- --mode compatibility --dir "$PHASE1_RUN_DIR"
npm run phase1 -- --mode diagnose --dir "$PHASE1_RUN_DIR"
npm run phase1 -- --mode quarantine --dir "$PHASE1_RUN_DIR"
npm run phase1 -- --mode audit --dir "$PHASE1_RUN_DIR"
```

Run a separate history scan with `--limit 20`, then compare with `--mode compare --dir "$PHASE1_RUN_DIR" --compare <second-run-directory>`. Run `audit` afterward to compare normalized fields and produce the final assessment. Metadata changes can make raw multisets differ while normalized candidate fields agree.

`verify` selects up to 30 GMGN rows. `discover` separately pages external/ERC-20 and internal categories in each direction; unsupported categories are recorded. `corpus` uses independently discovered transactions and cached responses where available. `filters` is a bounded one-page capability probe per transfer direction; a nonterminal response is incomplete and needs a separate paginated traversal before claiming coverage. `market` makes three requests for one captured token. `latency` is a bounded diagnostic from the original research plan. The personal MVP uses a 15-minute sync and a 30-minute stale threshold; it does not require sub-minute detection.

`compatibility` is an offline replay through archived official client/output modules. For a live pinned CLI process, use `--mode cli --cli-entry <installed-gmgn-cli-1.6.1/dist/index.js> --dir "$PHASE1_RUN_DIR"`. The wrapper checks pinned source hashes, requires global GMGN `.env` to be absent, supplies no signing key, uses an empty working directory and restricts child filesystem reads. It records stdout/stderr and compares with a new direct request. It honors the shared cooldown; an unparseable CLI rate-limit reset places the provider on a manual hold instead of guessing a retry time.

`diagnose` makes bounded trace, same-block log, code and historical balance probes for recorded cases. `quarantine` is a contract-specific bytecode/storage verification for the captured default-balance anomaly; it fails closed if the expected bytecode branch changes. It is not a general token classifier.

Run `--mode trace --sample 2 --dir "$PHASE1_RUN_DIR"` for a bounded native-cashflow sample (maximum 20). `ROBINHOOD_TRACE_RPC_URL` now provides live SolidRPC Free traces. The reader reuses hash-verified raw responses, separates ordinary Arbitrum fee payments/refunds from EVM transfers, reconciles net wei to a transaction-state diff, and checks both block boundaries against the general RPC. If boundaries differ, it traces up to 19 other directly related wallet transactions in that block and requires every intermediate balance to connect. Unknown system purposes, missing explicit state balances and mismatches remain unresolved; successful token approvals are not fills. The extra same-block work can require more than two requests per sampled trade. No paid plan is authorized.

`audit` is offline and recomputes hashes/assessment from saved evidence. Unknown or failed checks never produce a primary-provider pass automatically.

## Evidence and restart behavior

Raw bodies and metadata are retained before checkpoints advance. Numerical JSON literals become exact strings; calculations use Decimal or BigInt. Per-response schema profiles use wire types, separately from lossless parsed profiles. Candidate IDs are observation fingerprints, not canonical transaction/fill IDs. Original bodies remain the source of truth.

Only one harness command can run at a time in this workspace. A 429 saves a provider/key-scoped cooldown shared across run directories. Wait until its timestamp before retrying; it is not a reason to rotate keys or increase traffic. The harness retries network/5xx errors conservatively and uses no more than one request per second within a process. This does not establish the account's contractual quota.

SolidRPC quota headers and exhaustion also persist across runs. Its reset header is a duration in seconds. HTTP 402 stops immediately; unknown reset data or an unexpected plan quota places the endpoint on an inspection hold. A local ceiling allows at most 8,000 attempted calls per configured endpoint per UTC day, including retries. Do not remove this state to force more traffic. Other applications' usage and actual billing configuration are not controlled by this local ceiling; use a Free account with no paid overage enabled.

On a normal exit or interruption, the process lock is removed. After a hard kill, `research/phase1/.active-run/owner.json` may remain. Verify that its PID is no longer the harness before removing that stale lock directory. Do not remove provider cooldown files to force a retry.

History resume must use the same page size and wallet. Repeated pages, cursor loops, malformed schemas or a page cap must not be treated as complete history. For a new wallet, use a new directory. Re-running analysis modes can replace derived JSON/CSV reports; raw response files and manifests remain accumulated. Run `audit` last for a coherent final assessment.

No full ledger, independent USD pricing, reorg reconciliation, failed-transaction discovery, canonical fill resolver or cloud operation is implemented. Native trace access is validated only for the recorded sample. See the results for the remaining Phase 1 work and closed Phase 2 gate.
