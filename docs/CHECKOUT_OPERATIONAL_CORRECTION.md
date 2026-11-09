# Checkout operational correction — OFFLINE, default OFF

The repeated-discovery blocker is corrected. `approve()` now performs **two direct original-dependency checks**, before the wallet and after signing/before send. It does not call `check()` at either boundary, discover another counter/account, compile another message, fetch another latest blockhash or rerun rent discovery. After simulations it performs local cancellation/time/context/retained-signature checks. Original bytes/blockhash, signature verification, simulation requirements, durable attempt/signature recovery, no-repay rules and receipt checks stay intact. Real execution remains source-gated OFF.

## Measured bounded plan

Exact per-request UTF-8 request-byte and decoded response-byte counters are recorded in `DirectRpc` by phase. Payload/header compression overhead is not claimed; incomplete/aborted response bodies are marked incomplete. The diagnostic buffer is bounded to256 entries; this finite complete run uses45, with no truncation. `artifacts/checkout-correction/measured-success.json` retains every measurement.

| Phase                                                            | JSON-RPC calls | Decoded response bytes in deterministic run |
| ---------------------------------------------------------------- | -------------: | ------------------------------------------: |
| Initial review, absent profile                                   |             18 |                                   3,741,120 |
| Pre-wallet original-dependency check                             |              8 |                                   3,740,382 |
| Original unsigned simulation                                     |              1 |                                         148 |
| Post-wallet/pre-send original-dependency check                   |              8 |                                   3,740,382 |
| Exact signed simulation                                          |              1 |                                         148 |
| One app send                                                     |              1 |                                         134 |
| **Total through send**                                           |         **37** |                              **11,222,314** |
| Successful finalized-origin reconciliation, separately requested |              8 |                                   3,742,244 |

Existing-profile initial review uses16 calls and the full through-send path35. Reconciliation can stop earlier on absent/unfinalized status; the full checked-success path above uses8, including full program-data reads. These counts replace the rejected117-request plan; they are not permission to run a live checkout. No actual acquisition was made for this correction.

Each boundary is one paired `getMultipleAccounts` over the exact original addresses, plus paired original-message fee, original-blockhash validity and block height. The three independent fee/validity/height calls have at most3 in flight at one provider; siblings are aborted on an RPC error and the next provider group is not launched after failure/denial. Already-dispatched bounded siblings are counted. No retry, alternate provider or background loop is introduced.403/429 regressions verify the stop behavior.

Initial profile/counter discovery is small; full images are downloaded once per provider at creation. Both boundaries fetch **complete program/program-data bytes** and compare every byte, owner, executable flag and lamports against the initially fully verified pinned snapshot. Full-image envelopes fall20→6 through send. No header-only/dataSlice equivalence is assumed. An image-body mutation with the identical loader header is rejected in a regression.

## Original lease and evidence reuse

`checkedAt` is completed review creation, after expensive reads/compilation/verification. The immutable original expiry is `min(completed_creation +30s, oldest_decision_evidence +60s)`. Revalidation never changes the creation time, expiry, original message/hash, blockhash or decision fingerprint. A creation taking over30s receives only the remaining oldest-evidence allowance; a creation beyond60s fails. Slower approval paths still expire and remain retained; there is no silent renewal or replacement purchase.

Reused only inside the same request-local original-review object: immutable compiled bytes and derived addresses; initial genesis observations under the original evidence bound; initial decoder/image-hash results only after both providers freshly return **identical complete bytes and identities**; and corroborated per-size rent values only under fresh identical whole Rent sysvar state and the exact supported rent invariant. No evidence is imported from disk, another wallet/epoch/review, arbitrary cached page or old receipt.

Re-read at each boundary: full programs/program data, config/ruleset/registry/vault, mint and all source/destination token state, payer/profile/counter, exact expected-account/trader-state vacancies and whole Rent sysvar. Any change fails closed. Original-message fee, original-blockhash validity, heights and context floors are independently rechecked. No current-state decision is substituted by a newly compiled/discarded quote.

Rent reuse is backed by the local `solana-rent2.2.1` implementation pinned by both canonical lockfiles (read-only). Its minimum-balance formula is `(128+size)*rate*threshold`. The frontend supports only the exact f64=2.0 encoding, positive integer rate, size56/115/207 and products within2^53-1; BigInt then equals the Rust calculation exactly. Every initial per-size quote must also match BOTH RPC rent responses. Fresh full sysvar equality plus unchanged complete program bytes preserves those same allocation requirements within the original bounded review. Unsupported layout/threshold/range, changed sysvar or initial RPC disagreement blocks. Source paths/hashes, exact subset and derivation: `artifacts/checkout-correction/rent-source-invariant.json`. Canonical files were not edited.

## Deterministic latency and failure evidence

The real checkout/preflight/simulation/send/reconciliation implementation passes an offline deterministic model with **250ms latency per RPC**, a shared **2MiB/s decoded-response link**, **1s explicit terms review** and **20s owner-wallet delay**. Shared bandwidth serializes response bytes; bounded parallel groups overlap only latency. No20-second sleep or success interception of a live service is used.

Measured creation6.300s; approval-to-send26.333s including the20s wallet delay; send occurs27.333s after completed creation with **2.667s remaining** on the unchanged30-second lease. Current and older-evidence60s caps both hold. This is a documented offline model, not a live-provider performance guarantee. A31s owner delay, original blockhash expiry, cancellation, config/counter/token/Rent change, or changed program body still prevents send and retains the known signature where applicable.

**124 focused tests across six files pass**, including16 correction cases,19 checkout cases and existing F2/wallet/F3/unsigned checks. Added assertions prove exact37/35-call paths, full decoded-response byte equality against fixture transport, no image data slicing, only one latest-blockhash discovery, no re-entry into check(), fixed quote identity, successful8-call reconciliation, rent subset/RPC agreement,60s age cap and bounded denial stop. Nine isolated offline browser checks pass with no errors/chain-network attempts; corrected desktop/phone screenshots remain watermarked and were inspected. Demo production build/types/SDK guards, formatting and AST update are recorded separately.

## Preservation and remaining boundary

Prior checkout, F3, actual synthetic and real4-request A1 evidence remain historical and unchanged. The A1 read’s OnFinality429 blocker remains unresolved; no new RPC, wallet prompt, transaction, funding, provider substitution, synthetic fixture, backend/SDK/contract/pin edit or service restart occurred. F1/F3 UI and immutable compiler remain unchanged. Exact diffs/hashes and process identities are in this correction’s preservation/validation records.

Public sign/send flags and the source-scoped owner release stay OFF. This correction is ready for Origin review of code and offline operational behavior only. A permitted RPC window, a separately approved bounded actual request plan, explicit wallet-scoped source activation and fresh owner review/signature remain separate requirements. Simulation remains advisory; there is no instruction-level signed debit cap or explicit expiry and no unknown-status repayment shortcut.
