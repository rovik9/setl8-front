# Owner first-tier devnet proposal — funding read 1

**The supplied public wallet is unfunded at this paired read. The tier-0 token requirement is 30,120,000 micro test-USDC (30.12); the reviewed Rent policy rejects the current sysvar, so no current SOL rent estimate or execution readiness is established.** This is a read-only proposal. Funding, activation, wallet connection, signing and transactions remain unauthorized; the source gate remains OFF.

## Actual bounded observation

One fresh finite check ran 2026-11-01 18:20:00.263–18:20:09.536 UTC (23:50 IST). Exactly six actual JSON-RPC reads used the two fixed production devnet endpoints with minimum global forward spacing 1000.918 ms: two genesis reads, a paired 12-account funding/config/Rent read, and a paired expected-account/trader-state vacancy read. All six were HTTP 200 without RPC errors, 403/429, Retry-After, network failure, guard failure, polling, retry or alternate endpoint. Both genesis results matched the pinned devnet identity.

Funding/config finalized slots: **517582545 / 517582551**. Vacancy slots: **517582565 / 517582569**, with minContextSlot 517582551. The unchanged production `DirectRpc`, exact JSON parser and `readPair` performed the reads; the installed pinned dev.5 SDK decoded config/rules/registry/vault. The exact private production token-check body was exported only by the local TS import hook for inspection; no source body or production file changed. Capture cloned and recorded actual responses without replacing successful bytes. Offline canonical-address/derivation/module preparation made zero RPC reads.

## Exact addresses and observed funding

| Purpose               | Exact devnet public address                    | Paired observation                                                        |
| --------------------- | ---------------------------------------------- | ------------------------------------------------------------------------- |
| Owner / SOL recipient | `J95j3drvYgYNrT3cocwSoR8hWd5zsaqVr12eW7UxL7zC` | Canonical base58; system account missing, observed lamports 0             |
| Wallet profile        | `5PLCbvLCSpWRmRC3g2fFMdy75DMPrfnYZBjnrJRBNYZZ` | Missing on both providers                                                 |
| Source test-USDC ATA  | `Fo6ASykY9yr5phVCFTFt3HiV79jK3g7QHBpy76z7jHCM` | Missing on both; no existing token balance to decode                      |
| Pinned test-USDC mint | `2kBKxj3TYz2UbQfVcJ5xBbWscC5hrALq7MLzJi3c1fTx` | Present, initialized classic Token program mint, 6 decimals               |
| Ruleset               | `NFByy5LbVEvHCuEcuC1WVpZ5ModpNQb4nEXYdNhBTmj`  | SDK decoded, version 1                                                    |
| Config                | `BySmg4NH3BJfBgZcPFSGJP3acRmqySGE2LvNk8GUF8xn` | SDK decoded, currentRuleset 1, paused 0                                   |
| Registry              | `FUVukP8gz8kpxXXt3UbE4C3UCAcp31gRMqEacQvUP9pv` | SDK decoded, active true, pauseReason 0; all ten sizes/prices match rules |
| Vault                 | `G7qpP8L2kXGP7VYuvhioEQLEuWxUngxDmxqxEqnpUCbT` | SDK decoded, pinned mint/pool/platform identity links match               |
| Existing USDC pool    | `UjqJZRCALei1whzfLJbX3J5p22hRyYrVF7v3xNPiKPi`  | Initialized, usable mint/owner/state; balance 50,275,925,000 micro        |
| Existing platform ATA | `4zk4thzdPGNqYghz1orRv6JXMhCkoChhdf9M6zseTy2s` | Initialized, usable mint/owner/state; balance 148,575,000 micro           |
| Existing fee ATA      | `B8vuS9ViTSvU1YRTHfDefdD8aCaVxiiiiCyjiseC1Dvm` | Initialized, usable mint/owner/state; balance 1,698,000 micro             |
| Whole Rent sysvar     | `SysvarRent111111111111111111111111111111111`  | Present; identical complete paired bytes, unsupported threshold           |

The paired null entries establish account absence at those reads, not an RPC failure or an initialized zero-balance token account. A usable system payer and source token account have not yet been established. Pool token owner is the vault PDA above; platform token owner is `HiB78C1x7TMsHzkAzvxwaVGvkFCPFdxy4WzcV2NmE9i2`; fee token owner is `98j1TXdxt77vsDVcLmABWyMP2bWXVoYqRg85nGVGvcth`. Token program is `TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA`.

Only the corroborated absent profile permits using next counter **0** for this proposal. There is no stored active/banned profile to decode; the initial active count is inferred as 0, below the production cap of 5. Expected challenge-0 PDA **`9aLv8BzUCAjYWnAav75K9aeSHnZAKKFu26VmEVyhcYxT`** and vault trader-state PDA **`3pcW1HgBLXVFKiBfK2dLoBW4M7xuwjc3UJpUYZDGMqZS`** were both missing/vacant in the later paired read. These are dated observations, not reservations or authenticated ownership proof. Separate HTTP reads are not one atomic snapshot; the profile/counter and vacancies must be revalidated before any separately authorized purchase.

## Tier-0 proposal and minimal funding checklist

| Item                             | Exact integer amount              | Display value                |
| -------------------------------- | --------------------------------- | ---------------------------- |
| Challenge size                   | 2,500,000,000 micro account units | 2,500.00 account units       |
| Base price                       | 30,000,000 micro test-USDC        | 30.00 test-USDC              |
| Fee, 40 basis points             | 120,000 micro test-USDC           | 0.12 test-USDC               |
| Total required source tokens     | **30,120,000 micro test-USDC**    | **30.12 test-USDC**          |
| Current system-wallet lamports   | **0** (paired absent account)     | 0 devnet SOL                 |
| Current source token amount      | No ATA / no decodable balance     | Spendable source unavailable |
| Required token funding shortfall | **30,120,000 micro test-USDC**    | **30.12 test-USDC**          |

If funding is separately approved, the concrete test-only preparation is:

1. Use **Solana devnet**, owner/SOL recipient `J95j3drvYgYNrT3cocwSoR8hWd5zsaqVr12eW7UxL7zC`, and the exact pinned test-USDC mint `2kBKxj3TYz2UbQfVcJ5xBbWscC5hrALq7MLzJi3c1fTx`. Mainnet USDC or another devnet mint will not satisfy this proposal.
2. Create/initialize its canonical source ATA `Fo6ASykY9yr5phVCFTFt3HiV79jK3g7QHBpy76z7jHCM` for the classic Token program, then arrange **30,120,000 micro** of that exact test mint from an authorized existing test-token holder or mint-authority process. This read did not establish access to any funder or authority and did not create/fund the ATA.
3. The owner also needs devnet SOL for new-account rent and transaction fees. The purchase would create the absent 56-byte wallet profile, 207-byte trading account and 115-byte trader state; the source ATA needs separate token-account rent and creation fees. **The current rent amount is unresolved because the reviewed helper rejects the observed policy.** Do not use an old rent estimate or treat this proposal as an exact final SOL debit. Have the current Rent policy reviewed and obtain the required rent/fee evidence during separately authorized preparation/full preflight before deciding a funding amount.
4. Any activation/purchase decision is separate. Recheck current funding, counter/vacancies and reviewed program admission with the accepted full preflight once its Rent policy can support the observed sysvar. This check downloaded no executable images, obtained no blockhash/network-fee quote and ran no simulation.

## Rent-policy blocker

The paired whole 17-byte Rent sysvar has lamports_per_byte_year **5080**, exemption-threshold f64 bits **`0x3ff0000000000000`** (exact literal 1.0), and burn percent **50**. The reviewed strict `exactRent` helper supports threshold bits **`0x4000000000000000`** (2.0) only; it returned **“Unsupported Rent parameters; obtain a newly reviewed rent policy.”** Accordingly there is no accepted current rent estimate for the required sizes, no fresh RPC rent quote and no fresh network-fee quote. The helper and source gate were not changed or bypassed. Raw bytes and an offline diagnostic are preserved in `rent-policy-observation.json`.

## Evidence and preservation

`artifacts/owner-funding-read-1/results.json` records exact methods/parameters/status/request hashes/response hashes, slots, full decoded public observations and process identities; six public raw responses are retained. Earlier public-read manifests and source hashes were checked unchanged. Normal5173 PID25827 and all recorded readonly/prototype/P30 process identities are unchanged. No UI build, browser capture or broader test campaign was needed for this read-only proposal.

There was no wallet extension connection, key access, signing, simulation, checkout send, release/gate edit, funding, activation, transaction, new fixture, provider switch, service restart, backend/SDK/vendor/contracts/pin edit, commit, push or deployment. No further RPC read is scheduled. The result is a dated funding/configuration observation and a concrete blocked first-tier proposal; it does not establish executable-program admission, authenticated ownership, payment or payout completion.
