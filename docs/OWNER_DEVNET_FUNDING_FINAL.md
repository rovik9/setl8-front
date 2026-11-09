# Owner-approved devnet funding — finalized

**The single approved funding transaction finalized successfully. Both fixed providers corroborated the exact signed message, successful receipt and later funded state. The isolated funding release is closed again; app purchase activation/sign/send remains OFF.**

Transaction: [View finalized devnet funding on Solana Explorer](https://explorer.solana.com/tx/QDf3awvjKbMDmgV9ZZ5uD41ndvSJehmkEww9PsZSP71s2LP9oUhbT1wULy1QgW4HPcUu8QzvTBD99udZm1bWP6f?cluster=devnet).

Signature: `QDf3awvjKbMDmgV9ZZ5uD41ndvSJehmkEww9PsZSP71s2LP9oUhbT1wULy1QgW4HPcUu8QzvTBD99udZm1bWP6f`.

Finalized transaction slot: **517604830**. Receipt/current-state verification completed **2026-11-01 19:49:20.241 UTC**, or **2 November 2026, 01:19:20.241 IST**.

## Exact funding and actual debit

The one atomic legacy transaction contained exactly three approved instructions: canonical ATA CreateIdempotent, classic SPL MintToChecked **30,120,000 micro / 6 decimals**, and native System transfer **20,000,000 lamports**. Payer and sole required signer were the approved keeper public key `98j1TXdxt77vsDVcLmABWyMP2bWXVoYqRg85nGVGvcth`; no owner-wallet signature or other authority was used.

| Transaction-specific receipt result        |                                    Exact amount |
| ------------------------------------------ | ----------------------------------------------: |
| Owner SOL credit                           |       **20,000,000 lamports — 0.02 devnet SOL** |
| Owner ATA test-USDC                        |        **30,120,000 micro — 30.12 test tokens** |
| New ATA rent                               |                          **1,488,440 lamports** |
| Actual network fee                         |                              **5,000 lamports** |
| **Actual aggregate rehearsal-payer debit** | **21,493,440 lamports — 0.02149344 devnet SOL** |
| Approved aggregate cap                     |                             25,000,000 lamports |
| **Headroom below approved cap**            |                          **3,506,560 lamports** |

Owner: `J95j3drvYgYNrT3cocwSoR8hWd5zsaqVr12eW7UxL7zC`.

Exact devnet test-USDC mint: `2kBKxj3TYz2UbQfVcJ5xBbWscC5hrALq7MLzJi3c1fTx`.

Canonical classic-token ATA: `Fo6ASykY9yr5phVCFTFt3HiV79jK3g7QHBpy76z7jHCM`.

Both normalized receipts matched: `err:null`; exact original legacy message and valid sole-payer signature; exactly the three intended instructions; owner delta20,000,000; new ATA rent1,488,440; exact ATA mint/owner/amount/decimals; fee5,000; and payer debit21,493,440 below the25,000,000 cap. The amount above is established from paired transaction receipt deltas, not inferred from unrelated current balances.

The later paired current-state read at finalized slots **517604855 / 517604860** independently observed owner20,000,000lamports, initialized canonical ATA30,120,000micro with1,488,440lamports, payer7,405,322,800lamports and current mint supply750,030,120,000micro. Those are dated current observations, separate from the transaction-specific movements.

## Guard correction and one controlled attempt

Before execution, the requested post-pacing send-boundary correction was added. The sending branch now rechecks the isolated release, current intent/message/signature and `assertFreshContext(c)` after any pacing wait and synchronously before native forwarding. **One focused fake-clock regression passed:** crossing expiry while waiting prevents any forward. Syntax checks passed; no root build or broad test campaign was run.

Origin's exact technical release reference was `Origin explicit owner funding approval call_a4ffc9f5174d4864914321a7fc71fcd2; source review 2026-11-02`. The reviewed source was archived before changes; released execution source is separately retained. Only that isolated release was temporarily enabled. The sequence closed it on exit, before receipt verification; current `STAGE2_RELEASE.enabled` is false and its reference is null.

The expired stage1 context remains unchanged and archived. A new literal final root/context was used. Before refreshing, both the controller and runner proved that no sign/signature/submit marker existed. The same global public intent journal and all one-shot markers were preserved throughout.

One fresh preparation used **16 RPC calls**, followed immediately by **9 execution RPC calls including exactly one send**, then **6 authorized read-only verification RPC calls**. All **31 calls returned HTTP200** without RPC errors, denial, Retry-After, network failure or retry. Global forward spacing across all child-process phases was at least **1001ms**. Extra inter-phase pacing preserved the global one-request-per-second limit. Finalized status was already reported by both providers on the first status pair; no nonfinalized wait or second status round was needed.

The fresh context was immutable through execution. The exact-message fee was5,000 at both providers; both165-byte rent quotes were1,488,440. Fresh unsigned simulation succeeded with the exact approved post-state, then the execution phase rechecked original paired state, blockhash validity/heights and exact-message fees. Actual forwarding occurred with approximately **19,727ms** remaining on that original new context; the old expired message was never used.

Fresh signed message SHA256: **`5ce2b12f76dad4108f1cfb18d803a1ae669d3b13265de2b4ad0439752a72ccb2`**.

Submitted packet SHA256: **`d19cf326a7313c705199af5de762cd028d1d8b286587b1978f9fca6baf15ba6a`**.

## Durability, recovery and preserved scope

The public intent existed before signing. The verified public signature and message hash were fsync-durable before the exclusive submit claim and native send. The journal has exactly one signed event, one submission-started event and one submitted event. Global `approved-final-attempt.marker`, `sign-once.marker`, `signature.json` and `submit-once.marker` remain intact for recovery. No markers were deleted/reset and no automatic rebuild, remint, resend or second submission occurred. Node submission used `maxRetries:0` and `skipPreflight:false`.

Only the specifically authorized existing keeper key was read in memory and verified against its approved public identity. No other private key, canonical driver, broad Keys::load, user-wallet key or extension was used. No key was created, replaced, copied, exported or printed. Secrets and raw signed packets were not retained. Submission responses and full transaction receipt bodies were not persisted; response hashes plus normalized public receipt/message/signature/balance metadata record the checks without storing a raw signed packet. Unsigned preparation bytes and public journal snapshots are retained separately.

Evidence is in `artifacts/owner-funding-final-2026-11-02/`, including released/before source, the boundary regression, exact request metadata and response hashes, fresh context, execution result, verified public receipt, later current-state observations, public journal snapshot and audit. Earlier reports, expired contexts, raw responses and manifests remain historical and unchanged. Historical live helper source references now differ by the authorized correction/release/closure; matching before-source bytes preserve the reviewed stage1 versions.

App gates, Rent policy, preflight/checkout/compiler/proof/package/pins, canonical/backend/SDK sources and recorded service identities are unchanged; normal5173 remains PID25827. A local AST-only graph update records changed frontend-local helper code. There was no app purchase, product/account lifecycle action, trading, payout, scaling, extra funding, new synthetic fixture, service restart, root/canonical build, commit, push or deployment. The owner wallet is funded for the separately reviewed next step; **app purchase activation stays OFF**. No further chain calls or actions are scheduled.
