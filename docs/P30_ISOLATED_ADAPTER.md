# P30 isolated adapter preparation — 1 November 2026

The explicit SDK identity mapping and isolated HTTP/auth adapter are prepared for review. They remain **disabled for real use**. No API8791 request, browser5174 startup/connection, wallet prompt/sign/send or durable attempt submission occurred. The normal5173 preview and approved simulated journey remain intact.

Read-only decision: `/Users/rovik/Documents/ChatGPT/Setl8/coordination/P30_INTEGRATION_CONTRACT.md`, including Origin's ownership projection clarification. Frozen frontend declarations, both SDK pins, package/lock, backend and SDK sources are unchanged.

## Exact SDK source-to-browser mapping

`src/purchase/isolated/identity.ts` permits one complete immutable tuple:

| Identity                             | Exact accepted value                                               |
| ------------------------------------ | ------------------------------------------------------------------ |
| Release                              | `0.1.0-dev.5`                                                      |
| Profile                              | `p30-devnet-2026-10-31-v1`                                         |
| Browser alias                        | `@setl8/p30-sdk`                                                   |
| API source-release archive SHA256    | `b95cd2ccc6351c393e98db4acd069df7df23ee027e155d85b04c5559fec4e84f` |
| Installed browser npm archive SHA256 | `3e33090cf9193fd909f57ed75e10f9e59b9409e3c8a8f6c186272d8ee185f86d` |
| Descriptor SHA256                    | `077ff530b2e8b48e676622dd1d5b1369e9c99d5c3ddcd8e5e7edd315783bd6b6` |

The mapping checks service source hash/version/profile/compatibility against the browser public identity and installed immutable pin; prepared-module SDK metadata has its own exact comparison, including source/npm/descriptor/alias/version/profile. No arbitrary accepted-hash set or source/npm substitution is used. Descriptor raw bytes are hashed with Web Crypto. The existing build/start integrity guard independently verifies the npm archive, descriptor, public identity and79installed SDK files; browser metadata checks do not replace that disk-byte guard.

`DeploymentRef.sdk_artifact_sha256` means the **source release archive**. It is never compared as if it were the npm artifact. A prepared-module metadata check is available without invoking that module or compiling any unsigned bytes. No new SDK/unsigned runtime is included in the isolated entry bundle.

## Separate, default-disabled profile

`profile.ts` fixes API/audience `http://127.0.0.1:8791`, browser Origin `http://127.0.0.1:5174`, deployment `p30-devnet-rehearsal-v1` and named P30 cookies. Route descriptions are a **mocked current-source contract awaiting running-profile review**, read from the backend's existing router/auth/purchase sources. They are not a claim of reviewed live capability. No configuration accepts another API host/port or falls back to8788,8790,fixtures or another browser Origin.

`new IsolatedPurchaseAdapter()` is disabled and has no global/default fetch. Its only HTTP-capable constructor requires `kind=explicit_mock_http_contract`, an injected fetch and an explicit browser-Origin provider. There is no environment flag, UI button or live activation constructor. Quote, unsigned preparation, durable attempt, wallet, sign/send and signature reporting all remain false, including in mock mode.

The separate `p30-isolated.html` entry displays only an unavailable connection and a link to the existing simulated preview. It instantiates the disabled adapter and performs no session restore/request. Main app/router/global styles and normal preview configuration are untouched. The entry can be viewed on the existing5173 development server without starting5174.

## Mocked HTTP/auth behavior

`adapter.ts` implements read-only request behavior against exact numeric8791, using the accepted protocol pattern only where the inspected source specifies it:

- Session restore uses GET `/v1/auth/session`. Its exact frozen session fields are validated: wallet/base58↔hex, non-admin isolated scope, canonical live expiry, CSRF hex, version and authority/lifecycle literals. `chain_observation` scope is created from that session response with a local epoch; caller-supplied wallets/epochs/purposes cannot take over. No wallet-selection/login signing code is imported or invoked.
- Catalogue uses its required `deployment_id` query. Purchase/owned lists request25rows, and single purchase/account paths require canonical hex IDs; account detail includes its required deployment query. DTOs pass the existing strict runtime parser and the new SDK mapping, including nested purchase deployments. Internal provenance additions are rejected rather than admitted as public fields.
- Requests use credentials include, CORS mode, no-store and redirect error. The browser owns Cookie/Origin headers; the adapter never reads/writes cookies or sets those headers manually. The accepted source specifies `X-Setl8-Csrf` on logout. Its exact POST `{}` and `{api_version:"1",logged_out:true}` acknowledgment are checked. Cookie names/HTTP-only behavior are not verified by these mocked tests.
- Bodies are streamed within256KiB for successful responses and16KiB for error responses, with bounded Content-Length parsing, fatal UTF-8/JSON validation, JSON media type, API version, redirect/final-URL checks and at most5seconds per HTTP/body request. There are no automatic retries/backoff sends. Caller abort, channel replacement and session epoch invalidate work; a read-generation check also surrounds asynchronous identity validation.
- Logout immediately clears session/read data and cancels requests before acknowledgment. A missing/malformed logout acknowledgment retains a private revocation barrier until an explicit retry succeeds. Wallet/network/browser-Origin changes clear read data and authenticated scope; returned foreign-wallet/owner data also retires the scope.401expires session;404is an integration prerequisite, not empty ownership;409/410require resync. Other failed/malformed reads expose errors while any retained data remains the last validated result, not a successful fresh read.
- Opaque cursors are encoded without interpretation, scoped to their channel/session, consumed only once, checked against one unchanged cutoff and bounded to10pages/25rows per page. Repeated rows/cursor cycles/foreign cursors are refused. A fresh read clears its prior continuation chain only when accepted; resync clears the affected page/cursors. Independent lists do not claim an atomic cross-endpoint database snapshot.

The adapter's read cache is session scoped and cleared by its own lifecycle. It is not wired into the normal app or accepted synthetic controller. A future UI binding must use the adapter scope/epoch and clear its own derived state as those change. No real authenticated wallet or cookie session has been exercised here.

## Pre-wallet ordering, still gated

`handshake.ts` supplies a pure **unsent** description of POST `/v1/purchase-attempts` with the exact public request fields and CSRF header. It snapshots data properties, rejects missing blockhash/height and extra fields, and validates an acknowledgment against request/quote/account/exact message/blockhash/height plus known canonical purchase/signature identities and SDK mapping. This is the coordination decision's **durable pre-wallet public-context** operation, distinct from future post-wallet signature reporting at POST `/v1/purchases`.

The pure description does not establish freshness, persistence or admission and cannot send itself. `transport.prepareAttempt` always rejects at the action gate. No unsigned preparation module is imported as runtime code. Real quote/config/token-account/blockhash admission, database persistence and wallet-boundary review must precede any future execution path.

The accepted synthetic `PurchaseClient.recordAttempt` remains untouched, including its historical fixture-only npm comparison. Before any future real preparation uses that controller, the exact scoped edit is to replace that inline SDK comparison with `assertReleaseMapping(quote.deployment)` and add `assertPreparedRelease(quote.deployment, prepared.sdk)` after asynchronous preparation, alongside separately reviewed admission/durable-attempt ordering. This is a future gated integration point, not a pin relaxation or an active route in this slice.

## Ownership scan clarification

Only the overconstraint identified by Origin was removed from `consumer/runtime.ts`: indexed ownership still requires `ownership_origin_ref`, but `finalized_scanned_through_slot` can be null. No scan cursor is fabricated. Focused tests accept origin-only indexed/null-scan evidence, including blocked verification with unknown actual-charge parameters and `quote_match=not_checked`; extra public fields still fail. Other finalized/verified/mismatch checks, independent ownership/evaluator axes and disabled admission remain intact. This supersedes only the earlier correction report's nonnull-scan requirement; that report/results stay historical.

## Validation and preservation

- **37 new adapter/identity/handshake tests pass**, plus **55 focused consumer tests** including the scan clarification:92total (`unit-results.json`). Exact mocked requests/responses, immutable tuple mutations, scope/session/CSRF/logout barriers, cancellation/out-of-order data, response/time bounds, opaque fixed-cutoff pages, HTTP401/404/409/410/503, strict keys, source/npm refusal and gated pre-wallet plans are covered. No actual HTTP server/cookie jar/chain/wallet durability claim follows these mocks.
- **Two compiled desktop/phone disabled-entry and mapping checks pass** (`browser-results.json`): real Web Crypto descriptor bytes, complete mapping, bad mapping rejection, no SDK/unsigned runtime, no API/fetch/XHR/WebSocket or page errors, WCAG automated checks and overflow probes including320px. A temporary local static server is closed afterward; it is not5174. Desktop/phone screenshots are separate under `screenshots/`; phone inspected visually.
- Production TypeScript/app build and separate isolated-entry build, both SDK integrity guards, scoped formatting and AST-only graph update pass. No old SDK/Journey/browser campaign was rerun. Initial test/harness failures are retained separately in logs and corrected final results are identified.
- Both original53-file manifests remain unchanged. Accepted purchase-client/preview/fixtures/formatting code and public SDK identity are unchanged; only the explicitly authorized runtime scan predicate and its focused test file differ. No protected baseline edit was needed. Current/prior coordination-file hashes are recorded separately because Origin appended its ownership clarification during this slice; the frontend did not edit that source.

Before/after and added-file SHA256, frozen preservation, source-reference hashes, final screenshots, current preview identity and checks are in `artifacts/p30-isolated-adapter/validation-summary.json`. Earlier milestone/correction evidence is preserved.

## Required running-service handshake

Before connecting5174/8791, Origin still needs to review the running profile and confirm:

1. Exact marked isolated listener/store/profile/build and read-only feature gates; the complete source-release/version/profile mapping and immutable descriptor/deployment identities.
2. Actual route/query/body/response/error behavior against frozen public DTOs, with internal provenance projected away; origin-only null scan and ambiguous actual-charge/not_checked shapes; fixed-cutoff cursor scope, expiry/resync and response limits.
3. Credentialed CORS for exactly5174→8791; dedicated cookie selection/flags/path and rejection of normal/prototype auth; session CSRF and logout/revocation/expiry/wallet-switch semantics. Existing-source login challenge/login routes need a separate reviewed login integration; this slice has no wallet prompt or signature operation.
4. Permitted disposable login-only browser procedure and exact evidence to distinguish real service reads from these mocks. No private key, source-data seeding or financial transaction is needed for read validation.
5. Independently reviewed quote/blockhash admission and durable PRE-WALLET database acknowledgment before any later SDK preparation/prompt/send path. Quote/attempt/submission remain disabled in the current read-only scope.

No backend restart/edit, SDK/vendor/pin/contract-source change, real gateway integration, deployment, transaction, funding, lifecycle/payout/scaling behavior, remote creation, commit or push occurred.
