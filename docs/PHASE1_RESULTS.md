# Phase 1 live results — 2026-09-10

**2026-09-11 update: the saved SolidRPC Free endpoint works.** All 20 sampled trades now have exact native-cashflow reconciliation. EVM transfers plus separately interpreted Arbitrum gas payments/refunds match transaction-level state changes from SolidRPC. Ten also match Alchemy archive block boundaries directly; the other ten reconcile after including a separate wallet transaction in the same block. Those ten additional transactions have the ERC-20 approval selector, zero traced EVM ETH movement and a balance decrease equal to receipt gas. They remain separate gas-bearing actions, not successful trade fills.

The latest provider headers report 66 calls used and 9,934 remaining in a 10,000-call daily quota. The harness reused archived results and retained its conservative daily ceiling. No account upgrade or billing change was made. All 21 synthetic tests and TypeScript checks pass. The 314 retained raw response bodies rehash successfully; credentials and response archives remain excluded from Git.

**Gate: HYBRID_REQUIRED. Phase 2 is closed.** Authentication, pagination, CLI compatibility, sampled token quantities and sampled native cashflows worked. Historical USD rates, routed token fee classification, remaining case categories, live latency, GMGN quota and free cloud operation still need validation. This sample does not establish complete wallet history or production capacity.

The user requires $0 recurring cost. Alchemy Free continues to serve supported archive/indexed reads; SolidRPC Free serves call/state traces. PublicNode and Robinhood's public RPC rejected tracing with `-32601`, and Alchemy Free rejected it as unavailable on the plan. Those restrictions remain recorded evidence, but no longer block the tested hybrid. See [FREE_IMPLEMENTATION.md](FREE_IMPLEMENTATION.md).

## What was built

A bounded TypeScript/Node 24 read-only harness with explicit `.env.local` loading, endpoint allowlists, IPv4 HTTPS, exact response bodies and SHA-256 manifests, lossless numerical parsing, durable checkpoints, decimal comparisons, independent Alchemy transfer discovery, receipt/balance verification, CSV reports, market probes and bounded latency sampling. Each source observation remains separate from a proposed economic event. No production ledger, journal UI, cloud service or AI feature was built.

Credentials were used only from the authorized local input file. The harness does not load the GMGN global configuration or generated authentication key pair. It rejects `GMGN_PRIVATE_KEY`; transaction submission and signed holdings calls are outside its allowlists. The separate live CLI check verified that global `.env` was absent, used an empty working directory and API-key-only environment, and denied filesystem access to the keypair. Data directories and credentials are excluded from Git.

## Observed live evidence

| Check | Result |
|---|---|
| GMGN authentication | Successful Robinhood activity response over IPv4 |
| Alchemy identity | Mainnet chain ID `0x1237` / 4663 |
| Default history | 457 rows: 257 buy, 198 sell, 2 add; 455 distinct transaction hashes |
| Provider time range | 2026-09-04 16:16:49 through 2026-09-10 20:45:11 UTC |
| Pagination | Limit 50: 10 pages to terminal cursor. Limit 20: 23 pages; stopped after two, then resumed to completion |
| Cross-scan comparison | All normalized candidate fields/multiplicities agree. One raw row's `token.logo` URL changed; both source versions are retained |
| GMGN-selected receipt sample | 20 rows; all base-token directions and block timestamps agree; all quantities agree within the reported decimal unit |
| Gas comparison | 19 exact matches; the other differs by one wei. Receipt amounts retain the exact integer-derived value |
| Explicit transfer filters | `type=transferIn` returned 10 rows across 9 hashes, with wire event type `transfer_in`; `transferOut` returned an empty terminal page |
| Independent indexed history | 746 external/ERC-20 transfer records across 486 transaction hashes; inbound and outbound scans reached terminal pages at a fixed block |
| Coverage difference | 31 independent hashes absent from the default feed; 9 recovered by explicit inbound filtering; 22 still absent after both filters |
| Independent corpus | 20 transactions selected from Alchemy history, including absent-transfer examples; every indexed leg matched its receipt or native transaction value |
| Historical balance checks | 18 of 19 ERC-20 cases matched receipt net movement. One default-balance contract event is explained and quarantined |
| Internal-transfer history | Both directions explicitly rejected by Alchemy: `-32602`, internal category unsupported for this network |
| Market probes | Token info and pool data returned; historical K-line request returned 59 entries for a one-hour window |
| Latency | 120-second bounded session, 12 polls, zero fresh transaction/token/side observations. N=0; p50/p95/max unavailable |
| Native trace capability | SolidRPC Free: chain 4663, live call/state traces; all 20 sampled trade cashflows reconcile to state and Alchemy archive balances, including 10 separate same-block approvals |
| Live CLI compatibility | Pinned 1.6.1 process succeeded; its 20 rows matched a fresh direct request on all normalized candidate fields |
| Evidence integrity | 314 retained raw bodies in the main run rehashed successfully |

Terminal pagination establishes the provider traversal boundary, not complete historical wallet accounting. Missing indexed hashes include funding and incoming tokens; they are **not automatically missing trades**. Failed transactions, internal native transfers and some asset categories are outside the indexed discovery coverage.

## Integrity and cashflow findings

1. **The default activity feed omits transfers that an explicit filter returns.** The reader must independently traverse relevant filters. Returned names differ from filter values: `transferIn` requests produced `transfer_in` rows. Both forms normalize to a transfer, never a buy. The two `add` observations remain unclassified liquidity candidates.

2. **The transfer/balance anomaly is explained by default-balance contract behavior.** Transaction `0x25a26002b5146158cb675abb305670307b6360a7ba71a7326526dfce71b5ef13` emits an incoming raw amount of `8000000000000000000` for contract `0x7ec1ffe06c5fe6145035af1fdbc1b186792a22e0`. Historical `balanceOf` returns that same amount before and after the block. Bounded `eth_getLogs` queries confirm one incoming and zero outgoing wallet logs in that block. The captured runtime routes `balanceOf` through a mapping at storage slot 8; when its entry is zero, the function returns slot 4. Historical storage queries returned mapping=0 and default=8000000000000000000 both before and after, reproducing both balance answers. Thus the event is not an observed balance increase. It is quarantined from fills, acquired quantity and cost basis, and the initial FAIL_INTEGRITY assessment is superseded. This establishes contract-specific accounting limitations, not malicious intent or transferability. The public RPC could not independently serve these historical balance calls (`metadata is not found`), so the historical state evidence is from Alchemy. Exact code bytes, hashes and storage response IDs are in `quarantine.json` and `conflict-bytecode-analysis.md`.

3. **Pool quote amounts are not necessarily wallet cashflows.** In sampled INFINITE transactions, the wallet's ERC-20 receipt delta contains the meme token, while USDG is exchanged between intermediate contracts. For sell `0xd8372c43b438148f01664bfe83e39abe628ba5414b96289f436228958950d19e`, receipt USDG transfers show 0.697275 to one recipient and 69.030247 to the router, totaling GMGN's 69.727522 quote amount. This arithmetic is observed; assigning contractual fee roles still requires route interpretation. Wrapped-native transfers/burns also occur. Plain wallet ERC-20 deltas cannot validate final native proceeds.

4. **The transactions contain enough quote and fee evidence for the personal MVP, while independent USD is optional enrichment.** The first sell reports `quote_amount=cost_usd=69.727522`, and its receipt contains exactly `0.697275` USDG to the fee recipient plus `69.030247` USDG to the router. The two values sum to the reported quote amount. The buy immediately before it contains `24.416238` USDG gross, with `0.24416238` USDG separated as the 1% fee and `24.17207562` USDG matching the reported net quote. The 20 sampled transactions retain these quote-token/native flows, route legs and gas. The journal can display exact quote amounts and GMGN's reported USD as a provider valuation, clearly labeled; it must not call that an independent historical USD rate or silently use `buy_cost_usd` as cashflow. An independent rate source remains useful for higher-confidence P&L, but it no longer blocks the private MVP.

5. **Metadata revisions must not create fills.** The page-size comparison found a logo change with identical normalized economic fields. Raw payload fingerprints identify observations, not permanent fill IDs. Cross-page and same-transaction multiplicity still need canonical chain identities.

The minimum hybrid needs independently paginated funding/token movements and receipt verification, plus a supported means of reconstructing routed native cashflows and failed-attempt gas. Alchemy external/ERC-20 discovery is empirically available. Its indexed internal category is not. The live call-trace reader excludes reverted subtrees and inherited delegate-call value. Ordinary root-level fee payments, gas refunds and fee collections must conserve value and agree exactly with receipt gas; unknown system purposes remain rejected. Gas is not subtracted a second time when already included in system transfers. The 20-trade sample and 10 associated approval transactions reconcile using call traces, transaction state and archive balances. No chain-wide scanner was built, and no billing plan was changed.

The official [Alchemy Robinhood overview](https://www.alchemy.com/docs/robinhood-chain/robinhood-chain-api-overview) lists Debug API support, and the [trace reference](https://www.alchemy.com/docs/chains/debug-api/debug-api-endpoints/debug-trace-transaction) documents transaction tracing. Network support is separate from account access; the saved live error establishes this account's restriction.

### Native reconciliation example and source semantics

The first INFINITE sell returned `0.027731539883915805` ETH to the wallet. Receipt gas was `0.000044250066092` ETH, producing a transaction-level net increase of `0.027687289817823805` ETH. A preceding approval in the same block consumed another `0.000006035358364` ETH. Including that separate action connects the transaction states exactly to Alchemy's balances before and after the block. Its gas must not be silently lost or folded into the sell without an explicit allocation rule.

The reader follows Nitro's distinction between [EVM call frames and root-level system transfers](https://raw.githubusercontent.com/OffchainLabs/go-ethereum/master/eth/tracers/native/call.go), with [fee distribution outside ordinary EVM execution](https://raw.githubusercontent.com/OffchainLabs/nitro/master/arbos/tx_processor.go). Support is deliberately limited to the observed ordinary-transaction scheme; retryable/bridge and future system purposes require separate validation. These current source references were inspected on 2026-09-11; they do not establish the deployed node's exact software revision. Live response/state comparisons are retained as the empirical check.

## Corpus coverage and limits

The independent corpus contains opening inflows, additional inflows, full-balance outflows, a partial outflow, native funding, and incoming tokens absent from the default GMGN feed. After quarantine it includes 5 full outflows, 4 additional inflows, 8 opening inflows, 1 partial outflow, 1 native-only case and 1 balance/log conflict. These are movement classifications; they do not prove every action is a trade. Block-boundary balances may include other transactions within a block.

Re-entry, external execution venue, failed attempts and routed quote-token fee roles have not been independently classified. Native movement reconciliation is now established for the 20-trade sample only. The 20-row GMGN receipt sample and the 20-transaction independent corpus are separate, overlapping samples. Neither is a production reconciliation of every historical action.

## Tests and remaining gates

`npm test`: **21 passing synthetic tests**. They cover exact large/small numbers, restart after failure, cursor loops, empty continuable pages, duplicate multiplicity and payload revisions, transfer/unknown-kind separation, prohibited signing/submission, secret reflection/redaction, persistent cooldown across runs, 5xx retry, malformed raw-body preservation, failed-attempt gas, unknown USD and native-trace reverted/delegate-call handling, Arbitrum fee/refund conservation, transaction-state boundaries and same-block reconciliation. `npm run typecheck` and `npm run web:check` pass.

Official CLI 1.6.1 activity-client and raw-output modules were first replayed offline against a captured body. Original and output bytes differ, as expected from unwrapping/output transformation. A subsequent full CLI process comparison succeeded with `portfolio activity --chain robinhood --wallet <configured wallet> --limit 20 --raw`; normalized candidate fields matched a fresh direct HTTP request. Sources were checked against archived pinned files. The child received only the API key, PATH and LANG, used an empty working directory, and had filesystem permissions limited to dependencies, that directory and the absent global `.env` path; it could not read `keypair.pem`. Stdout/stderr are retained separately, with empty stderr. This comparison is sequential, not an atomic snapshot. Existing mock vendor tests remain separate from these live results.

No rate-limit saturation was attempted. Conservative requests succeeded, but no account quota headers were returned. The actual GMGN plan/monthly quota, cloud IPv4 egress, clock accuracy, independent RPC-first-observation latency and two active periods totaling at least 20 new actions remain unvalidated. The latency implementation currently samples the head page and cannot measure events omitted from it. It stops automatically and no daemon remains running.

The next work is the private MVP: connect the journal shell to durable storage, import the validated objective history, and preserve the quote/fee evidence alongside each fill. Independent historical USD, remaining case categories, GMGN allowance and free cloud smoke testing can continue incrementally. The saved `ROBINHOOD_TRACE_RPC_URL` supplies working free traces, preserving Alchemy Free for indexed discovery. No paid upgrade is authorized. No new trades are needed just for testing.

## Evidence locations

Main run: `research/phase1/2026-09-10T21-36-54.842Z-4fd2e6df/`.

Smaller-page restart run: `research/phase1/2026-09-10T21-39-21.483Z-27851fec/`.

The main run contains `final-assessment.json`, `report.md`, `comparison.csv`, `independent-comparison.csv`, `validation-cases.json`, `verification.json`, `independent-coverage.json`, `transfer-filter-probes.json`, `page-size-comparison.json`, `cli-compatibility.json`, `cli-live-comparison.json`, `diagnosis.json`, `quarantine.json`, `native-cashflow-verification.json`, `latency.json`, `manifest.jsonl`, and exact `responses/*.body`. Per-response `.schema.json` files preserve wire JSON types; higher-level parsed profiles intentionally see numerical literals as exact strings. These private evidence files are ignored by Git.
