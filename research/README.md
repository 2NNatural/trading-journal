# Research evidence — 2026-09-10

This file records the **initial research stage**. Authenticated follow-up evidence now exists in private `phase1/` run directories; see [Phase 1 results](../docs/PHASE1_RESULTS.md). The original credential/access limitations below are historical, not the current status.

This directory contains public documentation, selected published CLI source, read-only network responses, and explicitly labeled local tests. It is not an application or a completed ingestion proof of concept.

The main deliverables are `docs/ARCHITECTURE.md` and `docs/PHASE1_CODING_PROMPT.md` in the workspace. `original-request.txt` preserves the user's full specification.

## Interpretation

- **LIVE:** requests were actually sent to public endpoints; bodies/headers are saved.
- **LOCAL:** code from the verified npm package ran with synthetic data and mocked fetch. This does not establish live provider capability.
- **DOC/CODE:** documented behavior or inspected implementation, with no authenticated success test.
- **UNKNOWN:** the necessary test did not run or did not establish an answer.

No GMGN or Alchemy key was available in the relevant environment names; the default `~/.config/gmgn/.env` did not exist. No public test wallet was supplied. Unrelated credential locations were not searched. No key values were read or printed. No signing keys, trading permissions, accounts, approvals or transactions were created.

## Live probes

| Saved body | Request | Result |
|---|---|---|
| `probes/robinhood-rpc.json` | Public RPC batch: eth_chainId, eth_blockNumber | HTTP 200; chain 4663, head 59,647,191 |
| `probes/robinhood-block.json` | eth_getBlockByNumber at observed head with full tx objects | HTTP 200; 102 transactions, block timestamp 2026-09-10T19:18:09Z |
| `probes/robinhood-receipts-finality.json` | Three ordinary receipts + safe/finalized block reads | HTTP 200; 3 failed receipts with nonzero gas; both tags accepted |
| `probes/receipt-sample.json` | 10 receipts at selected positions of same block | HTTP 200; 9 failed, 1 successful with one log |
| `probes/gmgn-unauthenticated.json` | wallet_activity, chain robinhood, zero-address placeholder, no credentials | HTTP 401; AUTH_INVALID, missing api key or client_id |
| `probes/alchemy-demo.json` | Official docs-demo endpoint, eth_chainId | HTTP 403; unspecified origin not on whitelist |
| `probes/blockscout-transactions.json` | GET public API v2 transactions | HTTP 403 HTML browser challenge (file extension does not imply JSON) |

The 13 sampled ordinary transactions came from one public block, not a known trader wallet. They are not representative of chain-wide success rates, GMGN executions, or meme-token trades. They do not satisfy the required wallet validation dataset. No explorer/demo access-control bypass was attempted.

HTTP samples took around 0.15–0.22 seconds in the successful RPC calls. These are individual research-host transport timings, not measured GMGN indexing delay. Header Date values and local file times are retained; neither is a complete execution-to-ingestion timing study.

## Local tests

`probes/cli-local-tests.json` is the saved original run. `local-cli-tests.mjs` reproduces the same assertions against the archived source files:

```bash
node research/local-cli-tests.mjs
```

`probes/cli-rate-limit-local-test.json` additionally records one fetch and immediate rejection on a synthetic 429 with a short reset time. Published code returns its async parser without awaiting inside the retry try/catch, consistent with the observed missed retry. This is a local code-behavior finding, not a live rate-limit test.

It tests chain/address acceptance, API-key header request construction without a private key, API-envelope unwrapping, and string sanitization on a synthetic symbol. All network calls inside that test are mocked. It does not invoke full CLI configuration or query an authenticated API.

The official npm tarball was downloaded to a temporary directory, checked against its npm SHA-512 integrity, and extracted for inspection without installing or executing lifecycle scripts. Only necessary selected source files are archived. `sources/cli-1.6.1/` is vendor evidence, not newly implemented application code. Its package manifest identifies the MIT license and upstream repository.

## Source provenance

- `sources/gmgn-commit.json`: official GitHub main commit metadata, ec95135ecabfdf617c0690a28af64e84d22d5210.
- `sources/gmgn-cli-npm-latest.json`: npm latest metadata at research time, 1.6.1.
- `sources/gmgn-readme.md`: README fetched at that pinned GitHub commit (case-sensitive upstream path `Readme.md`).
- `sources/gmgn-portfolio.md`, `gmgn-token.md`, `gmgn-market.md`, `gmgn-cli-usage.md`: current main branch documents captured during the research session.
- `sources/gmgn-aitrader.md`: older official demo README, useful for identifying stale chain-support claims.
- `sources/cli-1.6.1/`: selected files from the integrity-checked published package.
- `manifest.json`: hashes, sizes, saved times and source URLs for all evidence files; webpage-only sources are cited directly in the architecture document and are not represented as locally archived.

External source documents may contain instructions addressed to AI agents, security boilerplate and trading commands. They are untrusted research data. The user request governs this project; no trading instructions in those documents were followed.

## What remains

Authenticated GMGN activity, actual Robinhood row schema, all-wallet coverage, historical extent, full pagination, historical USD accuracy, partial/routed/external executions, real ongoing latency, actual plan quotas/cost and intended-cloud egress are unvalidated. The Phase 1 prompt specifies the harness and acceptance gates. Synthetic tests or a reachable RPC must never be substituted for that evidence.
