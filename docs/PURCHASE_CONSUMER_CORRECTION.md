# Controlled purchase consumer correction — 1 November 2026

Origin's three scoped findings are corrected in the standalone preview at `http://127.0.0.1:5173/purchase-preview.html`. Default transport stays disabled. No live frontend connection, wallet action, repayment unlock or backend/SDK/contract-source edit is included.

The prior checkpoint is historical: `docs/PURCHASE_CONSUMER_PREVIEW.md` and all `artifacts/purchase-consumer/` results/screenshots remain unchanged. Before edits, 19 checkpoint code/test/tool/report/result files were copied with exact hashes into `artifacts/purchase-consumer-correction/before/` and `before-sha256.json`. Current correction evidence is exclusively under `artifacts/purchase-consumer-correction/`.

## Full captured attempt identity

`client.ts` uses one comparison for request ID, quote ID, expected account, expected message hash, recent blockhash and last valid block height. Once supplied and accepted, canonical purchase ID and nonnull signature are also retained; a signature cannot disappear or change. A bounded per-scope canonical-history cache checks acknowledgment, status, initial history refresh and recovery pages before learning any new identity. It validates the entire result before updating that cache. Wallet/deployment/session isolation and cancellation remain in place.

Inputs for blockhash/validity and priority fee are copied before asynchronous work; the retained public attempt request is frozen. A changed acknowledgment/status/recovery row is rejected, preserving the original displayed status, captured request and uncertainty lock. A missing uncertain attempt remains unknown. There is no automatic attempt replacement, payment retry or new unlock path.

## Supplied success evidence

The frozen frontend foundation declaration remains unchanged at SHA256 `e2a5cd5b8a69699646036e2f4492ebc27b6566ddbb44de96fbbecdcf4a8a529b`. Semantic rules use its fields together with the backend's read-only frozen `PURCHASE_API_DRAFT_V1_BASELINE_2026-10-31.md` definitions:

- `chain=finalized` requires finalized commitment, a slot, signature, message hash, evidence reference and no transaction error. `chain=failed` requires finalized unsuccessful evidence, including slot/signature/reference/error.
- `verification=verified` requires that finalized success, a nonnull checked actual charge, matched quote, matching expected message and expected verified account.
- `quote_match=different` is blocked verification with actual charge and null `verified_account`, as the frozen prose specifies. The synthetic mismatch scenario was corrected accordingly.
- `indexing=indexed` requires its ownership-origin reference and nonnull finalized-scan checkpoint. It does **not** require successful quote matching, evaluator registration or complete discovery coverage. Independently supplied owned accounts remain visible on quote mismatch and partial coverage.

These are consistency requirements on supplied DTO evidence. They do not authenticate a provider, signature, execution receipt or chain finality in the frontend. No authenticity or admission is inferred from labels/hashes.

## Trader-facing presentation and historical offers

One persistent **Simulated purchase preview** banner identifies historical examples and no payment/wallet/account creation. The headline is **Start your SETL8 challenge**; actions are **Review this account**, **Preview purchase progress** and **Check purchase progress**. Main cards use purchase request, network confirmation, purchase checks, account phase and trading setup pending. DTO/schema/evaluator terminology and technical failures stay in collapsed diagnostics. Trading access remains unavailable in every scenario.

`historical-offers.json` copies only the first three offers from the reviewed recorded backend USDC candidate:

Source: `/Users/rovik/Documents/setl8-back/.local/p30-acquisition/run-1793503578075041000/usdc-candidate.json`, SHA256 `a73f6f5bb58cd8efa0aa3cef5cc00e22d3cad299548fa8072d975ce467056bba`.

| Account size | Base Test USDC | Fee Test USDC | Exact total Test USDC |
| ------------ | -------------: | ------------: | --------------------: |
| $2,500       |          30.00 |          0.12 |                 30.12 |
| $5,000       |          55.00 |          0.22 |                 55.22 |
| $10,000      |          99.00 |         0.396 |                99.396 |

These are illustrative historical prices recorded 1 November 2026, not current offers or admission. Fixture owned-account sizes come from the same selected offer. Exact atoms remain strings; the local display helper formats all six decimal positions before removing trailing zeroes to a minimum of two decimals. It never rounds away a nonzero atom, including values beyond JavaScript's safe integer range.

## Focused validation

- **54 focused consumer tests pass** (`unit-results.json`). New cases cover tampered blockhash/height acknowledgments; status/recovery changes to blockhash, height, canonical ID, signature, request, quote, account and message; disappearing signatures; impossible finalized/verified/indexed payloads; partial coverage with mismatch-independent ownership; exact atom display boundaries and historical size/price coherence. The two status/recovery test cases each exercise eight mutations. No old SDK or Journey campaign was run.
- **Eight final compiled desktop/phone browser cases pass**, zero failed/flaky/skipped (`compiled-browser/browser-results.json`). Review checks assert the task headline, one example banner, no DTO/evaluator jargon in visible main text, historical tier selection and exact `99.396` total. Recovery, wallet/scenario isolation, expiry, mismatch ownership, WCAG audits and phone overflow including 320 px remain covered. No fetch/XHR/service requests or page errors were observed.
- Production app TypeScript/build, separate static preview build, both existing SDK integrity guards, scoped formatting and AST-only graph update pass. The temporary compiled server on5175 is closed after testing.
- Final desktop review and phone account-handoff screenshots were visually inspected. Both accepted 53-file preservation manifests still have zero changed files. Normal main/router/styles, package/lock/config, proof/demo additions, old signing paths and accepted unsigned module remain untouched.

Exact before/after hashes, backend-reference hashes, final screenshot hashes, preservation checks and preview liveness are in `validation-summary.json`. The current Origin handoff points to this correction; its prior form is preserved in `before/docs/ORIGIN_HANDOFF.md`.

## Contract points retained for live review

1. The frozen TypeScript fields are nullable and do not formally enumerate all cross-field implications. The frozen prose supplies the success/mismatch meaning above. `chain.blockhash` stays optional even on finalized evidence; the DTO does not establish it as universally required. Indexing is an independent ownership axis: the frontend does not invent a rule requiring it to share the reported transaction's slot or require complete history/registered evaluator. A live adapter needs reviewed fixtures for any differently intended combinations.
2. The frozen attempt comment describes after-wallet reporting, while the requested future architecture requires a durable public attempt before a wallet prompt/send. This correction keeps only an abstract fixture acknowledgment; it does not infer a live route or persistence guarantee.
3. Backend `purchase/observed.rs` currently labels its SDK artifact with source-archive SHA `b95cd2cc…`; the frontend unsigned prerequisite uses npm-artifact SHA `3e33090c…`. They are separately accepted identities, not interchangeable hashes. Future live mapping must represent/check the correct identity explicitly, without loosening either pin or rewriting this contract snapshot.

The future8791/backend,5174/browser-origin and isolated P30 cookies remain unused prerequisites. Real auth/routes, database durability, current quote/config/token/blockhash admission, wallet/sign/send, RPC receipt/ownership and crash recovery remain unverified. No deployment, source seeding, transaction, remote, commit or push occurred.
