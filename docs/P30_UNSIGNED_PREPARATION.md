# P30 unsigned purchase preparation — 1 November 2026

The scope-reviewed dev.5 npm artifact is installed **additively** as `@setl8/p30-sdk`, alongside the unchanged `@setl8/order-codec` dev.4 package. The new module compiles actual unsigned legacy purchase packets through the pinned SDK. It is unused by app routes/payment controls. No wallet/signing/send/API/storage/session implementation or purchase activation was added.

## Artifact and dependency review

- npm artifact: `3e33090cf9193fd909f57ed75e10f9e59b9409e3c8a8f6c186272d8ee185f86d`
- Public descriptor: `077ff530b2e8b48e676622dd1d5b1369e9c99d5c3ddcd8e5e7edd315783bd6b6`
- Reviewed source archive: `b95cd2ccc6351c393e98db4acd069df7df23ee027e155d85b04c5559fec4e84f`
- Profile: `p30-devnet-2026-10-31-v1`; SDK `0.1.0-dev.5`.

All three supplied artifacts were hashed before adoption. npm archive and descriptor are copied under `dependencies/p30/<npm-sha256>/`; no mutable SDK checkout is a runtime dependency and no SDK source was edited/copied over the old codec. The source archive hash is adoption provenance, not fresh deployment/build attestation. `interfaces/p30-unsigned-sdk-pin.json` records exact hashes for all 79 npm files. `tools/verify-p30-sdk.mjs` checks local archive, descriptor, browser identity, installed package and lock binding; the existing original order-SDK verifier runs first. Both checks run before dev/build/tests.

The lock adds **56 packages**. All pre-existing versions, resolved locations and integrity values are unchanged. npm reclassified **24 existing entries** from development-only to also required by the new dependency graph; that metadata change is retained explicitly in `artifacts/p30-unsigned/dependency-delta.json`. No dependency upgrade/deprecation workaround was applied. Install scripts were disabled. Original codec source/pins/archive remain unchanged.

## Reviewable module API

[`src/purchase/prepareUnsigned.ts`](/Users/rovik/Documents/setl8-front/src/purchase/prepareUnsigned.ts) exports `P30PreparationInput`, `P30PreparationError` and `prepareP30UnsignedPurchase(value: unknown)`. Its runtime boundary validates the entire explicit shape before lazy SDK loading.

| Public input                                | Validation / meaning                                                                                                                                                                     |
| ------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `inputKind`, `sdkProfile`, `descriptor`     | Exact unsigned-input purpose and reviewed historical public tuple. Unknown/missing fields, altered tuple, inherited objects and accessors are rejected. Matching is not RPC attestation. |
| `connectedWallet`, `trader`, `sessionEpoch` | Canonical base58 public keys, identical wallet/trader and explicit safe nonnegative session epoch. These are caller-supplied context, not ownership/session authentication.              |
| `nextChallengeId`, `tierIndex`, `mint`      | Explicit canonical u64 decimal string; string tier 0–9; only SDK test-mint selectors `usdc`/`usdt`. No allocation/default challenge ID, amount, price or arbitrary destination.          |
| `expectedAccount`                           | Explicit base58 expectation compared with the account actually derived by the reviewed SDK from trader/challenge ID. No silent replacement.                                              |
| `recentBlockhash`                           | Explicit canonical 32-byte value. No fallback, freshness, validity-height or chain check is performed.                                                                                   |
| `priorityFee`                               | Required explicit tagged choice: `{kind:"omitted"}` or `{kind:"micro_lamports_per_cu",value:"<exact u64>"}`. Omitted and zero generate different messages. No automatic fee estimate.    |

SDK purchase construction/validation derives the twenty account metas; the compiler owns its 400,000-CU limit and optional priority-price instruction, with legacy-only format and 1,232-byte bound. The wrapper checks a single required trader signer and zero-filled signature slot, and confirms the unsigned packet contains the exact serialized message. It does not feed the already-budgeted plan to a second compiler.

Output is an immutable JSON-safe public preparation: exact `messageHex` / `unsignedTransactionHex`, SHA-256 for both byte sequences, expected account, wallet/trader/session, explicit challenge/tier/mint/blockhash/fee context, required signer, packet size, compute limit and artifact identities. Mutable SDK message/transaction objects and byte arrays are not exposed. `actions.sign` and `actions.submit` are always false; admission is explicitly unverified.

A quote object, demo-credit catalog, recorded chart value or extra price field is rejected rather than converted into purchase input. The function accepts no quote and performs no economic calculation. The caller must eventually map independently reviewed/admitted backend data into this interface; field matching does not prove freshness, ownership, a valid next ID or a viable purchase.

## Focused verification

- **34 frontend unit cases pass:** all eight immutable synthetic vectors; exact pinned TypeScript message/packet bytes and SHA; independent legacy framing/meta/data checks against the SDK source archive's official-oracle vectors; expected PDA, signer/zero signature, size; omitted-versus-zero priority price; wrong wallet/profile/account/mint/integer/context; getter refusal; async input snapshot and frozen output; no fetch; frozen-page/dependency guards.
- **55 existing order-draft checks pass**, plus original dev.4 artifact integrity. These are focused compatibility checks, not the full Journey or SDK campaigns.
- Compiled Chromium harness passes **eight exact vectors and 32 wrong-context rejections**. Browser output matches the pinned TypeScript compiler byte-for-byte. There are no functional fetch/XHR/WebSocket/API/RPC, wallet or storage calls, page errors, or required Node globals (`Buffer`, `process`, `global` remain undefined). Static ES-module downloads are allowed. Rust/universal transaction ordering or real chain execution is not claimed.
- Bundle entry **7,821 bytes** (about 4.16 kB gzip); separate SDK chunk **261,313 bytes** (about 79.92 kB gzip). SDK code is not downloaded until preparation is called. The standalone harness bundles the module explicitly; normal app routes do not import it or emit that SDK chunk.
- Production app build, format and AST-only graph update pass. **53 existing source/public/old-codec files** match their pre-work hashes, including the later proof/demo edits. No screenshots or UI campaign were needed.

Evidence: `artifacts/p30-unsigned/validation-summary.json`, `unit-results.json`, `old-codec-results.json`, `browser-results.json`, `browser-manifest.json`, `dependency-delta.json`, and logs. Synthetic vectors were copied from the reviewed immutable source archive with their own hash recorded in the pin; they are not live purchases/account captures or economic validation. The first browser harness saw Vite's injected HMR client under its network trap; the final harness serves only its own static document without HMR, still loading compiled chunks from the owned preview. Failed attempt logs are retained.

## Preview and integration boundary

The old PID78416 was absent and port5173 free. A new owned **normal** preview is running: PID **33218**, identity `Sun Nov  1 08:52:35 2026     node /Users/rovik/Documents/setl8-front/node_modules/.bin/vite --host 127.0.0.1 --port 5173 --strictPort`. Public served configuration confirms API8788, no prototype opt-in. HTTP200 confirmed for `/demo/accounts` and `/purchase`; ownership/liveness record `artifacts/p30-unsigned/review-preview.json`, log `artifacts/p30-unsigned/logs/review-preview.log`. No backend was restarted or P30 payment control enabled.

Before UI wiring, require the stable reviewed backend DTO/SDK adapter, fresh genesis/program/config/ruleset/registry/vault/wallet/token-account and blockhash admission, and an exact quote. Canonical classic token accounts must already exist/initialize. No supplied descriptor or copied source hash proves ongoing deployed image identity, token balances, fees, price or eligibility. No automatic token-account creation/funding or quote substitution exists here.

A future controller must discard this result if its wallet/session context changed, persist the reviewed public attempt identity before any wallet prompt/send, recheck the exact message/hash at that boundary, and reconcile unknown outcomes before offering another payment. That controller, runtime response validation, wallet approval, signing, submission, persistence, finality/receipt/ownership indexing and lifecycle remain unimplemented in this slice. The earlier draft status snapshot is untouched; no current-backend equality claim is made.

Netting/partial-TP limitations and all accepted exact-byte/reload/uncertainty protections remain. No canonical/vendor/runtime repin, backend/SDK source edit, chain transaction, deployment/publication, remote, commit or push.
