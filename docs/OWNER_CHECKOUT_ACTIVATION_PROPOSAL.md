# Proposed first-tier owner checkout — default OFF

**The eventual owner checkout release is now constrained in the production execution path to the exact proposed first-tier test. No purchase activation is configured or authorized by this change.** Funding approval and the finalized funding transaction remain separate from purchase-test activation, which Origin will request only after reviewing this preparation.

## Proposed source-controlled scope

| Predicate                                               | Exact permitted value / ceiling                                 |
| ------------------------------------------------------- | --------------------------------------------------------------- |
| Owner wallet                                            | `J95j3drvYgYNrT3cocwSoR8hWd5zsaqVr12eW7UxL7zC`                  |
| Tier                                                    | `0`                                                             |
| Account size                                            | `2500000000` micro account units — 2,500.00                     |
| First challenge counter                                 | `0`                                                             |
| Expected trading-account PDA                            | `9aLv8BzUCAjYWnAav75K9aeSHnZAKKFu26VmEVyhcYxT`                  |
| Test-token choice                                       | Pinned USDC mint `2kBKxj3TYz2UbQfVcJ5xBbWscC5hrALq7MLzJi3c1fTx` |
| Maximum total test-token debit                          | **30,120,000 micro — 30.12 test-USDC**                          |
| Maximum owner network fee + purchase-account rent       | **10,000,000 lamports — 0.01 devnet SOL**                       |
| Grant authorization reference and explicit UTC deadline | **Unconfigured until separate activation approval**             |

`REVIEWED_OWNER_SCOPE` is a frozen proposal record. `OWNER_RELEASE` remains exactly **enabled:false, wallet:null, authorizationReference:null, validUntilMs:null**. `DIRECT_GATE.sign` and `.send` remain false. The isolated funding release also remains closed. There is no query, environment, storage or remote acceptance switch.

The last actual funded-state observation remains the accepted receipt/current-state evidence, slot517604830 and later slots517604855/517604860: owner0.02devnetSOL and canonical ATA30.12test-USDC. No new network read or preflight was performed for this proposal. Current funding, counter0, vacancies, executable admission and prices must be checked afresh if purchase activation is separately approved; the PDA is not a reservation.

## Enforced production behavior

The pure `assertReviewedOwnerCheckoutScope` invariant checks an enabled, matching, referenced, unexpired grant; exact wallet/tier/size/counter/PDA; the prepared message's matching wallet/trader/epoch/tier/counter/PDA/mint/sole-signer context; exact integer token/SOL ceilings; reconciled price+fee and network-fee+rent sums; valid bounded timestamps; and the existing fresh exact owner review and devnet/no-signed-cap acknowledgements.

Production `CheckoutPort.assertExecution` applies the invariant in addition to the actual source gate. Existing approval and broadcast boundaries call it. The bound owner review is now passed into simulation; live simulation calls the same full `assertExecution` both before its RPC and after completion. Thus signed simulation cannot rely on a wallet-only release. Immediate pre-send authorization through the existing `DirectRpc.sendExact` callback also repeats the full scope/review check. These checks are in the execution path, not only the UI. The explicitly separate offline demo path retains its prior review/simulation behavior.

The ceilings and grant expiry are **local source-enforced checks**. The pinned purchase transaction has **no signed maximum debit or signed expiry**. Nothing in this correction changes that on-chain contract or adds such a field. The owner must still review the fresh exact account, costs and message and acknowledge that limitation before wallet approval. Original unsigned and signed simulations, current-state revalidation, exact signature/message verification, durable signature-before-send and uncertain-outcome/no-repay behavior remain in place.

## Remaining browser steps after separate approval

1. Origin first reviews this scoped correction. A distinct owner approval for this exact purchase test is required; the earlier funding approval does not activate it. Only then may Origin configure the source release with the matching wallet, approval reference and explicit reviewed future UTC deadline, alongside the existing sign/send gates. No deadline or active grant is set now and no automatic renewal is added.
2. In the normal app at `http://127.0.0.1:5173/buy`, connect the owner's Wallet Standard wallet on **devnet**, confirm its public address is exactly the permitted wallet, and choose tier0 / 2,500.00. No rehearsal keeper or private user key is involved in checkout.
3. Obtain one fresh read-only exact purchase review. It must establish current identity/program/configuration, source/destination tokens, counter0/PDA vacancies, exact fees/rent and funds within both source ceilings. Any mismatch or unavailable evidence stops the test; no alternate tier, account, wallet or silent quote substitution is allowed.
4. Inspect the exact account/PDA, token total, SOL cost and message. Acknowledge devnet test tokens and the absence of a signed maximum debit/expiry. The checkbox/review is bound to the current wallet epoch, fingerprint, message, account, cost and checked timestamp; a changed/expired review needs a new explicit review.
5. On the explicit approval action, the existing sequence is pre-wallet revalidation → durable public attempt → exact unsigned simulation → owner wallet approval → exact signature/message verification and durable public signature → post-wallet revalidation → exact signed simulation → local/scope/storage guards → at most one app submission. No new full discovery check is inserted after simulations.
6. Verify the exact purchase signature and resulting account using existing reconciliation. Missing response, expiry, changed state or incomplete evidence does not authorize another payment. Retain/reconcile the exact public attempt/signature; do not automatically resend or repay. Close the test release after the controlled attempt.

These are proposed remaining steps; none were performed in this task.

## Validation, type integration and preservation

**38 relevant offline checks passed in two files**, including19 new meaningful scope cases and the existing19 checkout-readiness cases. They cover every requested mismatch, inclusive cap boundaries and one-unit excess, exact prepared context, reconciled integer amounts, closed/unconfigured/expired grants, missing/stale owner review/acknowledgement, and production approval/signed-simulation/send refusal with zero fetch calls. The pure scoped fixture does not mutate production gates or expose a new offline port.

The build's SDK/P30 guards passed. The initial type phase found missing declarations for the earlier isolated funding JS helper and legacy test typing gaps. A new `core.d.mts` and two erased test annotations resolved those integration errors; the original test bytes are archived. Typecheck and the production Vite bundle then completed successfully. This was continuation of the relevant build, not another test campaign. No runtime funding helper, funding release or receipt was modified. A local AST-only graph refresh completed without API use.

All73 accepted finalized-funding manifest entries remain byte-for-byte valid. The funded receipt, raw/public evidence, recovery markers, intent journal, expired contexts and closed funding runtime source are preserved. Backend/SDK/vendor/contracts/proof/pins/packages and recorded services remain unchanged. Only checkout scope/review plumbing plus type-only integration files and scoped tests changed; no UI styling or product behavior was added. There was no real wallet connection, private-key access, signing, actual preflight, RPC, funding, purchase, trading, payout, lifecycle action, service restart, deployment, commit or push. **Current public checkout gate is false.**
