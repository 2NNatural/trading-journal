# Coding prompt — build Phase 1 only

You are the coding agent for a cloud-hosted, read-only trading journal for one professional meme-coin trader using GMGN on Robinhood Chain.

**Current user constraint: $0 recurring service cost.** Read `docs/FREE_IMPLEMENTATION.md`; it supersedes paid-service assumptions. Never solve an access gap with a paid upgrade or a trial that converts to paid. `ROBINHOOD_TRACE_RPC_URL` can select a separate free trace provider while preserving Alchemy Free for indexed discovery.

**Implement only the bounded ingestion proof of concept described below. Do not build the application, deploy a service, create the production database, or build AI features.** The next phases are prohibited until the ingestion path has been empirically validated. Read `docs/ARCHITECTURE.md` and `research/README.md` first, then follow this prompt.

## Objective

Given a public Robinhood Chain wallet and read-only GMGN API access, establish whether current GMGN wallet activity can accurately reconstruct historical objective trading activity. Produce a reproducible evidence bundle and a PASS / HYBRID_REQUIRED / BLOCKED / FAIL report. Treat documentation and fixtures as hypotheses until checked against the real wallet and chain.

The eventual journal groups multiple buys/sells into position episodes and preserves immutable BUY/HOLD/SELL/GENERAL_THOUGHT/OPTIONAL_FILL_NOTE events. You are **not** implementing that journal now. Your responsibility is to validate its data foundation.

## Known research facts and limits

Research date: 2026-09-10.

- Current npm package at research time: `gmgn-cli@1.6.1`; verify whether a newer version exists, inspect relevant changes and pin the tested version. Saved repository commit: `ec95135ecabfdf617c0690a28af64e84d22d5210`.
- Current CLI validator accepts `robinhood` and EVM-format wallet addresses. A local mocked-transport test proved it constructs activity queries with no private key. That was **not** an authenticated backend success.
- Candidate activity endpoint: GET `https://openapi.gmgn.ai/v1/user/wallet_activity`, query `chain=robinhood`, `wallet_address=<address>`, optional `limit`, `cursor`, `token_address`, repeatable `type`.
- Inspected auth: `X-APIKEY`, timestamp in Unix seconds and a fresh UUID `client_id`. No signature on activity. Check the pinned official source for current request construction and clock tolerance before implementing.
- CLI raw output is not the original HTTP response: the client unwraps `data`; output sanitization applies even to `--raw`. Capture the original HTTP body before parsing/transformation; retain CLI output separately for compatibility comparison. Do not disable safe rendering or expose raw token metadata as instructions to an agent.
- Candidate parsed payload: `activities` plus `next`; candidate row fields include `tx_hash`, `event_type` or `type`, `token.address`, `token.symbol`, `token_amount`, `cost_usd`, `buy_cost_usd`, `price`, `price_usd`, `timestamp`, gas/fee fields and launchpad. **Exact Robinhood field types, presence, precision and meanings have not been observed.**
- `price` is documented in quote-token units; `price_usd` in USD. `buy_cost_usd` on a sell is GMGN-assigned cost basis, not a verified cashflow.
- A synthetic 429 test of published CLI 1.6.1 observed one fetch and immediate rejection despite a short cooldown; do not rely on documented automatic retries. Own retry/cooldown logic and test it.
- Current docs require IPv4 and describe a rate/capacity of 20 weighted units, with activity weight 3. The actual API-key quota, plan cost and monthly limits remain unknown. Never saturate the service to “discover” its limit.
- `portfolio holdings` is signed and is excluded. Public-chain balances or API-key `portfolio token-balance` are alternatives.
- Public Robinhood RPC is `https://rpc.mainnet.chain.robinhood.com`; production candidate Alchemy RPC is `https://robinhood-mainnet.g.alchemy.com/v2/<key>`. Chain ID must equal 4663 (`0x1237`), not testnet 46630.
- Public chain/block/receipt/safe/finalized reads worked during research. Alchemy's documented demo failed with origin whitelist error; Blockscout API returned a browser challenge. Do not circumvent those controls or infer authenticated Alchemy failure from the demo response.
- No test wallet or GMGN/Alchemy credentials were supplied during research. The saved 13 public transaction receipts are infrastructure probes, not the 10–30 transaction wallet validation corpus.

Official references:

- [GMGN repository](https://github.com/GMGNAI/gmgn-skills)
- [Portfolio reference](https://github.com/GMGNAI/gmgn-skills/blob/main/skills/gmgn-portfolio/SKILL.md)
- [Token reference](https://github.com/GMGNAI/gmgn-skills/blob/main/skills/gmgn-token/SKILL.md)
- [Market reference](https://github.com/GMGNAI/gmgn-skills/blob/main/skills/gmgn-market/SKILL.md)
- [Robinhood connection details](https://docs.robinhood.com/chain/connecting/)
- [Alchemy Robinhood products](https://www.alchemy.com/rpc/robinhood)

## Required inputs and security

Local input locations are `.env.local` in the project root (credentials and TEST_WALLET), plus `docs/PROJECT_INPUTS.local.md` (optional transaction examples, plan details and preferences). Both are ignored by Git. `.env.example` contains the non-secret template. Read these specific locations when beginning Phase 1, without printing secret values. Implement explicit dotenv loading of `.env.local` with existing process environment taking precedence; do not execute/source the file as shell code. If a variable is blank, treat it as absent. Prefer an explicitly configured RPC URL, then configured Alchemy access, then the public Robinhood RPC; verify chain ID in every case.

Use a public `TEST_WALLET` address and a secret `GMGN_API_KEY` supplied through an authorized environment/secret file. Optional `ALCHEMY_API_KEY` or `ROBINHOOD_RPC_URL` supports independent verification. Read only the authorized credential location; do not search unrelated files for secrets. Report only whether a credential is available, never its value.

If inputs are missing, implement and test the offline harness, document the exact run command and missing inputs, and report **BLOCKED_INPUT_OR_ACCESS**. Do not invent live results or use the zero address as a real trading wallet. Do not ask the trader to send funds or execute a transaction for the test; observe normal activity or existing history. Do not create accounts, generate signing keys, configure trading permissions, or purchase plans.

No wallet seed/private key, `GMGN_PRIVATE_KEY`, signature, approvals, wallet connect or transaction submission. Endpoint/method allowlists are mandatory. Avoid importing the full trading client into production-style harness execution when a narrow reader suffices. If running official CLI as comparison, use a pinned installation with install scripts disabled where feasible, isolated from any existing signing configuration; never globally overwrite the user's config. Reject unexpected signing credentials in the child runtime. Avoid shell interpolation: pass command arguments as arrays.

## Implement

1. **Small TypeScript probe project.** Use a currently supported Node runtime compatible with inspected dependencies, a pinned lockfile, strict TypeScript and decimal/lossless numeric handling. Keep it small. No Next.js, Supabase, queue service, model SDK or deployed worker.
2. **Read-only provider boundary.** Define captured activity/page and verification result interfaces. Represent unsupported, unknown, partial, auth failure and rate-limited states explicitly. Do not force Alchemy/RPC into a fake activity schema.
3. **HTTP capture.** Save exact body bytes, safe response headers, redacted request metadata, URL with no secrets, timing, HTTP status, provider/client version, chain/wallet, response SHA-256, schema fingerprint and original source identity/row pointer where available. Save malformed/non-JSON/error responses too. API keys, authorization headers and sensitive URL tokens are never persisted.
4. **Raw store and checkpoints.** File-backed append-only run directories; write body and manifest durably before moving a checkpoint. Atomic checkpoint replacement, resumable traversal, clear scan boundaries. Separate responses/row observations from candidate economic events. Do not overwrite previous runs.
5. **Initial inspection.** First fetch an unfiltered activity page and generate field/type/null/precision statistics. Read its actual shape before writing the row adapter. Compare with equivalent pinned CLI command `gmgn-cli portfolio activity --chain robinhood --wallet <TEST_WALLET> --raw` when credentials permit. Preserve stdout/stderr separately and redact secrets.
6. **Pagination.** Follow the observed opaque cursor; initial no-cursor page, then `next`. Do not stop at one duplicate or timestamp tie. Detect cursor loops, expired cursors, empty-but-continuable pages, no progress, malformed data and safety caps. Any cap produces incomplete status. Separate historical traversal from repeated head sampling and use overlap to handle late-indexed events. Repeat with another observed-safe page size; compare multisets, not just hash sets.
7. **Normalization prototype.** Produce conservative candidates after inspecting data, with source mappings and nullable values. Parse decimal strings/lossless JSON; preserve exact original numeric text. Transfers, liquidity operations, wraps/bridges and failed attempts are distinct from fills. Unknown side/event type is not silently dropped. Never assume one hash equals one event or that duplicate-looking values are the same fill.
8. **Chain verification.** Verify chain ID, receipts/status/block ordering, token identities, raw movements, decimals and balances. Record full receipts. Recognize that ERC-20 logs do not reveal every native/internal movement; request only verified supported trace/indexed methods where necessary. Quantity discrepancies and route ambiguity are issues, not guessed corrections. Account for failed-attempt gas without successful fills.
9. **Independent validation corpus.** Create a case manifest of 10–30 actual transactions, target 20, independently expected from wallet history/chain evidence. Required categories: normal buy/sell, scale-in, partial sell, full close, re-entry, transfer; include unusual quote, routed swap, external trade and failure if available. Cases can overlap categories. Mark unobserved categories explicitly. Do not count API-returned hashes alone as an independent completeness reference.
10. **USD and costs.** Compare provider notional/price to quote movements and historical quote/USD valuation, never current price. Investigate fee inclusion, gas overlap, transfer taxes and stablecoin depegs. Preserve GMGN basis/P&L only as provider comparison fields. Generate a comparison report; do not implement the full production position ledger.
11. **Latency sampling.** Bounded mode, initially 10-second polling with jitter, user-configurable duration/request cap and secret redaction. Observe ordinary new actions. Record last absent / first present timestamps, RPC first observation, block timestamp, capture completion and candidate availability. Distinguish HTTP latency from indexing delay. Print N/p50/p95/max, missed/pending events, polling uncertainty and clock caveats. Do not leave a local daemon running after the run.
12. **Rate/reliability behavior.** Shared conservative request budget for all GMGN endpoints, backoff for network/5xx, persistent key-wide cooldown for 429. Honor `Retry-After`, `X-RateLimit-Reset`, body `reset_at`; do not issue requests during cooldown from another job. Simulate rate errors offline instead of forcing a ban. Report observed actual headers/limits without claiming saturation-measured capacity.
13. **Optional bounded market probes.** For one or two actual traded tokens, capture token info/pool and past K-lines. Profile availability and units; supply/market cap/liquidity/times; holder or security calls only within budget. Mark untested fields. Do not start a market database or backfill exotic metrics.
14. **Fallback evaluation only if needed.** Probe account-enabled Alchemy indexed historical transfer methods before writing any scanner. Test inbound/outbound and internal categories separately. If unsupported, document it; bounded known-hash receipts/logs are allowed, chain-wide scanning is not. A hybrid recommendation must identify exact missing GMGN coverage and the evidence-backed recovery method.

## Suggested files

```text
scripts/phase1/run.ts
scripts/phase1/config.ts
scripts/phase1/capture.ts
scripts/phase1/gmgn.ts
scripts/phase1/paginate.ts
scripts/phase1/profile.ts
scripts/phase1/normalize.ts
scripts/phase1/verify.ts
scripts/phase1/compare.ts
scripts/phase1/latency.ts
scripts/phase1/report.ts
fixtures/synthetic/
fixtures/public/                         # only suitable public fixtures
research/phase1/<run-id>/manifest.json
research/phase1/<run-id>/responses/
research/phase1/<run-id>/activity-candidates.jsonl
research/phase1/<run-id>/validation-cases.json
research/phase1/<run-id>/comparison.csv
research/phase1/<run-id>/schema-profile.json
research/phase1/<run-id>/latency.json
research/phase1/<run-id>/checkpoint.json
research/phase1/<run-id>/report.md
docs/PHASE1_RESULTS.md
```

CSV comparison columns: case/category, chain, wallet, tx_hash, source event/log/leg identifier, expected side, GMGN side, contract, token, expected/raw reported amount, quote asset/amount, independent USD, GMGN USD, price/unit, block timestamp, provider timestamp, receipt status, fees, match status, confidence and notes. Escape spreadsheet formula-like strings in CSV display/export without changing raw evidence.

## Required tests

Use a small meaningful suite, with synthetic fixtures explicitly labeled and real golden fixtures added only after inspection:

- Normal page, enveloped response, empty terminal page and malformed body.
- Two distinct events sharing one hash; duplicate page; same fields but unresolved multiplicity.
- Transfer versus buy/sell; unknown `add/remove`; reverted receipt with gas.
- Pagination restart, loop, late row insertion, partial coverage and changed payload revision.
- Big raw quantity and extremely small decimal price preserved without rounding through JavaScript Number.
- Key redaction from paths/headers/errors, no signing method accessible and isolated CLI environment.
- 429 reset shared across callers; fake timers, no live rate-limit stress.
- Historical-USD unknown remains unknown; no current-price fallback disguised as historical value.
- Exact raw body survives CLI output transformations; replay produces the same candidate/report version.

## Acceptance and stop conditions

A **PASS_GMGN_PRIMARY** requires:

- Real authenticated Robinhood activity, retained raw HTTP responses and independently identified trading wallet.
- The actual response schema documented from data.
- At least two pages exercised with stable traversal and restart behavior; oldest expected activity reached, or a declared boundary that does not conceal missing necessary basis.
- All observed required validation cases match direction, token, chain order, multiplicity and raw quantity with no unexplained omission/duplication. Provider display rounding is documented and exact chain quantity remains available.
- Fee/quote/USD semantics understood. Investigate any difference above `max($0.01, 1% of independent notional)`; this is an investigation threshold, not a blanket allowable trading error. Every material discrepancy resolved or the affected USD path explicitly unvalidated.
- Ongoing latency measured on at least 20 ordinary new actions across at least two active periods where feasible; p95 ≤20 seconds target. If samples are insufficient, leave latency gate pending rather than claim pass.
- IPv4 authenticated request success, actual account quota information or observed operating limits recorded, no secret exposure or signing requirement.
- Known limitations and unobserved edge cases stated.

If accurate event capture needs Alchemy/RPC recovery, report **HYBRID_REQUIRED** with concrete failing examples. Do not proceed to Phase 2 until that minimal hybrid is validated against the affected cases. If credentials/wallet/live samples are missing, report **BLOCKED_INPUT_OR_ACCESS** or clearly named pending subgates. If unexplained integrity failures remain, report **FAIL_INTEGRITY**.

Final response must state what was built, actual tests run, where the evidence lives, findings that are observed versus inferred, any missing input and the gate result. Stop after the Phase 1 report. Do not scaffold later phases, deploy infrastructure, build a journal UI or begin AI analytics.
