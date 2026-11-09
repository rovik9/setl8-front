# Owner first-tier devnet proposal — scoped Rent correction

**The Rent correction passes its affected checks. Public authority data supports a future owner-approved funding proposal, but the finite quote window stopped on OnFinality 429 and did not complete all eight rent quotes. No funding, activation or signing is authorized or performed.** This report supplements, and preserves unchanged, `OWNER_FIRST_TIER_PROPOSAL.md` and all earlier evidence.

## Correction and validation

`src/buy/rentEvidence.ts` now accepts only exemption-threshold f64 bits `0x3ff0000000000000` (exact 1.0) or `0x4000000000000000` (exact 2.0). It retains the whole 17-byte sysvar layout, Sysvar owner, nonexecutability, base64 encoding, positive integer rate, burn percent ≤100 and integer-product ≤2^53−1 checks. The pinned Rust formula remains `(128 + size) × rate × threshold`; multiplication by exactly 1 or 2 within this bound is exact. There is no arbitrary-f64 support or canonical/SDK change.

`exactRent` still permits only purchase allocations **56 / 207 / 115 bytes**. A distinct `estimateClassicTokenAtaRent` function supports only the separate 165-byte classic-token ATA funding estimate; purchase preflight does not call it or add an ATA allocation. Original whole-Rent equality and paired quote corroboration requirements remain in place. Changing even between the two supported thresholds invalidates an existing review.

**99 affected tests passed in four files**, including 30 recorded-Rent/bounds/preflight cases. Recorded rate5080/threshold1.0 estimates and totals, unchanged old2.0 arithmetic, invalid threshold bits/layout/identity/rate/burn, exact-integer bounds, purchase/ATA separation and changed-Rent revalidation are covered. Production type/build and order-SDK/P30 archive/descriptor/installed-file guards passed once. AST-only graph refresh completed with no LLM/API use. No broader campaign or browser capture was run. Checkout regression measurement output went to a new directory so the original accepted measurement remains unchanged.

## One actual corroboration window

The single authorized window ran **2026-11-01 18:30:04.849–18:30:18.054 UTC** (2 November, 00:00 IST), using the fixed production endpoints, exact production parser/paired reader, polling OFF and minimum global forward spacing **1000.747 ms**. There were **11 actual RPC reads of a maximum12**: ten HTTP200 responses, then OnFinality HTTP429 on its 115-byte rent quote. Retry-After was absent. The run stopped immediately: no retry, provider substitution, final165-byte request or further acquisition.

Paired genesis matched the pinned devnet identity. Paired whole Rent/public authority/mint reads at finalized slots **517585069 / 517585075** agreed. Rent bytes still have rate **5080**, exact threshold **1.0**, burn **50**, data SHA256 `e6833309a1b7d9ce57849bd64d1d5834144a14cbc659346a9fda424a3e7ae219`.

| Allocation                 | Exact formula estimate, lamports | api.devnet.solana.com quote                   | OnFinality quote                  |
| -------------------------- | -------------------------------: | --------------------------------------------- | --------------------------------- |
| Wallet profile, 56 bytes   |                          934,720 | 200, exact match                              | 200, exact match                  |
| Trading account, 207 bytes |                        1,701,800 | 200, exact match                              | 200, exact match                  |
| Trader state, 115 bytes    |                        1,234,440 | 200, exact match                              | **429; no quote**                 |
| Separate ATA, 165 bytes    |                        1,488,440 | 200, exact match                              | **Not requested after stop**      |
| Purchase accounts total    |                    **3,870,960** | Formula sum of matching first-provider quotes | Incomplete per-size corroboration |
| Purchase plus separate ATA |                    **5,359,400** | Formula sum before transaction fees           | Incomplete per-size corroboration |

All six obtained quotes matched the paired sysvar/formula; no mismatch was combined or ignored. The totals are current paired-sysvar-derived estimates, **not fully paired RPC quote acceptance**, a network-fee quote or an exact final debit. Quotes lack context slots and these separate HTTP reads are not one atomic snapshot. No final sysvar reread was added after the stop; no ongoing Rent stability or executable admission is attested. Full preflight must obtain its own fresh required evidence.

## Public funding feasibility and concrete proposal

The paired authority system account **`98j1TXdxt77vsDVcLmABWyMP2bWXVoYqRg85nGVGvcth`** is a usable, nonexecutable System-owned account with **7,426,816,240 lamports**. The actual initialized six-decimal classic-token mint authority field equals that public address; this was decoded from mint bytes, not assumed from its fee-wallet label. Mint freeze authority is separately `6zhMZXJo6HXxcVjEp6nwVtnLwLYwv7XMH4w7Wb8KwuC`. Public state does not establish possession of either authority's key or approval to use it.

The owner/funding/tier observations below are from the earlier successful read at **2026-11-01 18:20:00–18:20:09 UTC**, funding slots517582545/517582551; this rent window did not reread the owner or tier config. At that earlier read, the owner system account, profile and source ATA were corroborated absent. Tier0 was size **2,500,000,000 micro account units**, base price **30,000,000 micro test-USDC**, fee **120,000 micro** at40bps, total **30,120,000 micro (30.12 tokens)**. The expected challenge0 and trader state were vacant at slots517582565/517582569; those are dated observations, not reservations.

| Funding target              | Exact devnet public address / amount                                 |
| --------------------------- | -------------------------------------------------------------------- |
| Owner / SOL recipient       | `J95j3drvYgYNrT3cocwSoR8hWd5zsaqVr12eW7UxL7zC`                       |
| Exact test-USDC mint        | `2kBKxj3TYz2UbQfVcJ5xBbWscC5hrALq7MLzJi3c1fTx`                       |
| Owner classic-token ATA     | `Fo6ASykY9yr5phVCFTFt3HiV79jK3g7QHBpy76z7jHCM`                       |
| Required source test tokens | **30,120,000 micro — 30.12**, based on dated tier0 observation       |
| Proposed owner SOL buffer   | **20,000,000 lamports — 0.02 devnet SOL**                            |
| Candidate payer             | Public mint authority `98j1TXdxt77vsDVcLmABWyMP2bWXVoYqRg85nGVGvcth` |

If Origin obtains explicit owner approval for the existing throwaway devnet setup, the concrete candidate funding transaction would create/initialize the owner ATA if still absent, mint **30,120,000 micro** of this exact test mint to it, and transfer the proposed **20,000,000 lamport** buffer to the owner. The candidate payer's known transfer plus ATA-rent estimate is **21,488,440 lamports before unquoted fees**, leaving **7,405,327,800 lamports before those fees** at the observed balance. Thus the public mint-authority/payer state supports technical funding feasibility; key control, current eligibility and execution permission remain unverified. No other assets or mainnet funds are part of this proposal.

The 0.02 SOL is a proposed funding amount, **not an exact fee/debit or sufficiency promise**. If the funding payer creates the ATA, the owner's later purchase rent estimate is3,870,960 lamports before its own network fees; if the owner instead creates the ATA, the combined estimate is5,359,400 before creation/purchase fees. Neither path has a fresh transaction-fee quote. No funding transaction was constructed, signed, simulated or submitted. Approval for funding must not release purchase signing/sending; that remains a separate decision after complete fresh preflight.

## Evidence and preservation

Correction evidence is in `artifacts/rent-policy-correction/`; actual responses, quote matrix, exact request/response hashes, slots, public authority/mint observations and stop analysis are in `artifacts/owner-rent-corroboration-1/`. Raw actual results remain unchanged. Historical reports, raw responses, manifests and accepted checkout measurement were preserved. Historical manifest references to the two intentionally corrected live source files now differ; the manifest files themselves were not rewritten. The earlier owner-runbook change remains the separately authorized historical difference.

The only existing implementation file changed is the Rent helper; the checkout test gained an evidence-output directory override, and a new focused Rent regression file was added. Gate/checkout/preflight/compiler/proof/package/pins and recorded service identities are unchanged; normal5173 remains PID25827. No private wallet/keyfile or `~/.setl8-devnet-lev` contents were accessed. There was no wallet connection, image fetch, blockhash, simulation, airdrop, ATA creation, mint, transfer, funding, activation, chain action, new synthetic account fixture, backend/SDK/vendor/contracts edit, service restart, commit, push or deployment. No more reads are scheduled. **Default activation/sign/send stays OFF.**
