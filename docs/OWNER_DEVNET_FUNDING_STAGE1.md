# Owner-approved devnet funding — stage 1 source review

**The isolated helper and unsigned staging are ready for Origin review. All16 authorized RPC calls succeeded and the advisory simulation matched the exact approved funding. No actual signature or submission was created. The funding stage-2 release and all app purchase gates remain OFF.** Rovik's funding approval covers this exact intent; Origin's technical source release is still required before using the keeper to sign/send.

## Helper and offline checks

Frontend-local code:

- `tools/owner-funding/core.mjs` — exact immutable intent, three legacy instructions, message decoding, exact budget, authorized keeper loader, freshness checks and durable one-shot public journal. SHA256 `26cfdc446e0d471dcaa05f1551494179973875eb1ee9701989156c8994e9b718`.
- `tools/owner-funding/run.mjs` — fixed-endpoint finite stage1 runner and closed stage2 route. Current SHA256 `ce69b4d8cff238db510f2ec487f300e4f98d60b1364cd741dd93e2f7300008d6`.
- `tools/owner-funding/production-loader.mjs` — reviewed import-only translation of unchanged production TypeScript; production DirectRpc/readPair/exact integer parser/Rent helper are reused.

**25 scoped offline tests passed.** They check exact decoded instruction/message/payer/recipient/mint/amount/signers; altered programs, recipients, amounts, decimals, extra instructions/signers; exact cap boundary and excess; stale/missing/malformed state and simulation; unexpected prior funding; durable public intent/signature/message ordering; restart/second-sign/second-send refusal; and the closed actual stage2 gate. Tests generated no real keys or signatures and made no chain calls. Node syntax checks passed. No root build, dependency change or broad campaign was run. The required local graph refresh used AST processing only; previous graph bytes were archived before it.

The exact code used for the successful stage1 is archived in `artifacts/owner-funding-stage1/used-source/`. Its core is identical to the current core. The used runner SHA256 is `0ccacf5effd82cfda50364c6ac184a273b95c5f96631646aa7cf0ad8e456f25b`; afterward only future-stage2 error diagnostics were made conservative about a signing claim without durable signature and signed-but-not-submitted states, and submission responses/errors were prevented from persisting a possible echoed raw signed packet. That isolated diff and syntax check are recorded; no second read/simulation run occurred.

## Exact approved legacy transaction

Payer and sole required signer: **`98j1TXdxt77vsDVcLmABWyMP2bWXVoYqRg85nGVGvcth`**.

Owner/SOL recipient: **`J95j3drvYgYNrT3cocwSoR8hWd5zsaqVr12eW7UxL7zC`**.

Mint: **`2kBKxj3TYz2UbQfVcJ5xBbWscC5hrALq7MLzJi3c1fTx`**.

Canonical classic-token ATA: **`Fo6ASykY9yr5phVCFTFt3HiV79jK3g7QHBpy76z7jHCM`**.

| Order | Native program / instruction                                  | Exact decoded intent                                                                      |
| ----- | ------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| 1     | Associated Token, CreateIdempotent, data `01`                 | Keeper pays to create the canonical owner/mint ATA; System and classic Token program only |
| 2     | Classic SPL Token, MintToChecked, data `0e4098cb010000000006` | Mint **30,120,000 micro**, exactly **6 decimals**, to that ATA; keeper authority          |
| 3     | Native System, Transfer, data `02000000002d310100000000`      | Transfer **20,000,000 lamports**, exactly **0.02 devnet SOL**, from keeper to owner       |

There are exactly three instructions and one required signer. No compute-budget/priority-fee instruction, purchase, admin, evaluator, upgrade or user-wallet signing operation is included. Message bytes must equal a fresh compilation of this exact immutable template for the selected original blockhash. Public source references/hashes record installed web3.js1.98.4 System/keypair/legacy code, the pinned SDK ATA derivation, the read-only rehearsal ATA instruction and cached public spl-token8.0.0 MintToChecked source. No canonical driver or broad Keys::load was used.

## Actual stage1 result

The single finite run was **2026-11-01 19:27:01.115–19:27:17.199 UTC** (2 November, 00:57 IST). Exactly **16 RPC calls**, allHTTP200, used the two fixed production devnet endpoints with minimum forward interval **1001.209ms**. The prior OnFinality429 cooldown was honored. No denial, Retry-After, RPC error, network/harness failure, retry, polling or provider substitution occurred.

Only the authorized existing keeper file was loaded in memory, with O_NOFOLLOW and no path override. Its vetted keypair derivation returned public key **`98j1TXdxt77vsDVcLmABWyMP2bWXVoYqRg85nGVGvcth`**, matching the approved payer. Only that public identity was recorded. Private bytes were not printed, exported, copied to disk, hashed into evidence or included in errors; owned temporary raw/array/secret buffers were cleared. No other private key or keyfile was accessed and no private key directory was modified.

Paired genesis matched pinned devnet. Initial finalized slots **517599307 / 517599311** established the keeper as a usable System wallet with **7,426,816,240 lamports**, the mint's actual authority as keeper, six initialized classic-token decimals, and owner/ATA absence. Current whole Rent and both165-byte quotes agreed. Final paired reads at **517599356 / 517599361** returned identical complete payer/owner/ATA/mint/Rent state after simulation; the real owner/ATA remained absent.

| Budget for this exact unsigned message               |       Lamports |
| ---------------------------------------------------- | -------------: |
| Owner SOL transfer                                   |     20,000,000 |
| ATA rent — paired whole Rent and paired actual quote |      1,488,440 |
| Exact-message fee — both providers                   |          5,000 |
| **Expected aggregate rehearsal-payer debit**         | **21,493,440** |
| Approved aggregate cap                               |     25,000,000 |
| **Headroom below cap**                               |  **3,506,560** |

Original blockhash `68RRjcyfe8JM4zWJoifRyLEP1Hnn2PXgAhCGbZKdcCji` was corroborated valid. Last valid block height was504768832; checked heights were504768703/504768708. Exact message SHA256 **`f0e15fab4ba85bbd88c5f09aec26e524a484d90e478c3af163ef083d3b261063`**.

The simulation used that exact unsigned packet with a zero signature, `sigVerify:false` and `replaceRecentBlockhash:false`. It returned **err:null,13,816units**, slot517599352. Exact post-account checks established simulated owner20,000,000lamports, simulated ATA30,120,000micro, mint supply increased by exactly that amount, and simulated payer debit21,493,440lamports. This is advisory unsigned evidence, not an actual signature, transaction, authenticated user-wallet action or committed funding result.

## Release boundary, durability and stale context

The public intent journal exists at `artifacts/owner-funding-execution/intent.json`, with public events/context and a stage1 snapshot in the evidence directory. There is **no sign-once marker, signature.json or submit-once marker**. Stage2 is hard-closed in source, with no environment/query/CLI unlock.

The staged context expired at **2026-11-01 19:27:47.182 UTC** (00:57:47.182 IST), as designed; its evidence is preserved, not silently renewed. This recorded context cannot now authorize execution. After source review, Origin must supply the next explicit fresh-context/release scope using this same guarded template. The runner refuses stale context before key use or new execution reads, and its consumed stage1 marker prevents an automatic rerun. No refresh/rebuild/sign/send is scheduled.

The implemented execution route requires an unexpired original context, paired unchanged complete funding state, exact original-message fee, original blockhash validity/heights and the cap before signing. It records the public intent before the signing claim, verifies the exact signed message/signature locally, durably records public signature+message hash before claiming the single send, and stores no raw signed packet. Persistent exclusive signing/submission markers prevent automatic double-sign or double-send across restarts. A lost or mismatched send response is uncertain: reconcile the durable exact signature only; never remint, rebuild or resend automatically. Any later fresh preparation must preserve these approval-wide one-shot markers.

## Preserved scope

All recorded process identities are unchanged; normal5173 remains PID25827. App gates, accepted Rent helper, preflight/checkout/compiler/proof/packages/pins and canonical/backend/SDK sources are unchanged. Earlier reports/raw responses/manifests remain preserved; old live graph entries have matching archived bytes and an explicit audit. No actual signature, submission, funding, ATA creation, mint, SOL transfer, app activation, new synthetic account fixture, private key creation/replacement, service restart, root/canonical build, commit, push or deployment occurred.
