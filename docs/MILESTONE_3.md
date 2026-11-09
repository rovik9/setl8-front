# Frontend milestone 3 — exact unsigned order drafts

Completed locally on 2026-10-26 (Asia/Calcutta) in `/Users/rovik/Documents/setl8-front`. Origin's recent human messages authorize automatic coordination and completion reports. This milestone prepares and reviews development bytes only. No connected order signature or order POST was added. Isolated prototype submission awaits Origin's separately reviewed backend handoff.

## Delivered ticket

The existing terminal Order tab now has working Market/Limit/Stop, Buy/Sell, quantity and optional SL/TP controls. The approved terminal/phone layout, logo, loading bar, reduced-motion behavior, account-update correction and recorded-chart contract remain in place. The ticket does not take an executable price from the chart or compute margin, lots, notional amounts or eligibility.

Units were checked against the accepted SDK and read-only retained runtime references (`engine/src/units.rs`, `evaluator/src/codec.rs`) plus `FRONTEND_API.md`:

- Quantity is a plain decimal in base units, converted exactly to u64 millionths (six decimal places). One base unit produces qty=1000000.
- Limit/stop and optional SL/TP prices convert exactly to u64 10⁻¹² USD (twelve decimal places). Market drafts encode priceE12=0. Turning SL/TP off encodes zero. A selected protective price must be nonzero; no direction, quote-distance or eligibility rule is invented.
- Buy/long is side 0; Sell/short is side 1. Only the three opening kinds are exposed. targetNonce=0 is explicitly unused for these kinds.
- Nonce is an explicit development integer from 1 through 4294967295. It starts blank, is never allocated or inferred from incomplete account history, and is not checked for availability.
- Client time is an explicit signed-i64 Unix-second value. “Use device time” is an optional user action, not a server freshness claim.

Text validation uses strings and BigInt, rejecting precision loss, overflows, exponents, spaces, malformed/noncanonical integers and zero opening amounts. No amount passes through Number. Only validated u16 market and u32 nonce convert to safe integer Number values to satisfy the SDK types. Preview structure checks do not reproduce the evaluator's business/admission checks: for example, the codec's u64 quantity capacity does not establish that a resulting position would meet runtime limits.

The account comes from the selected workspace account and must be explicitly confirmed for each scope. SDK profile is labeled historical `setl8-sdk-dev-v1`, with a placeholder option that clears its selection. The review shows account, market/side, nonce, all SDK-decoded order fields, exact 48-byte order hex and exact 93-byte signing-message hex. Both byte strings are unsigned. There is no signing or submission callback in the ticket.

## SDK provenance and reproducibility

Consumed the existing backend-owned accepted archive as a read-only reference, then copied it inside this frontend:

- SDK **0.1.0-dev.4**, profile **setl8-sdk-dev-v1**.
- Archive `dependencies/setl8-sdk-0.1.0-dev.4.tar.gz` SHA-256 **`5acde8df3fc4be31dbcb80106b7a7d491a5e60bd8d37d67da62dda0d19e33fbd`**.
- Accepted complete-content fingerprint **`4467253fc555a2f64822e15341f36297f4b32225078ac6891850b7f270daace1`**.
- All **294 archive file members** were verified against the accepted source manifest before extracting the selected files.
- Unchanged TypeScript `order.ts`: **`504e485852db9a8a716461620b524bcc80e562c8347b3e38bf2a7978a65f7c6c`**.
- Unchanged TypeScript `generated.ts`: **`9e203a5e9d534c0fc2c8ea1f458dcc7ab327837505fc7d57329545cedb86a5b4`**.
- Unchanged accepted `fixtures/orders.json`: **`2ce2578c62e06aa5b4cee216f922fa3eba70723368591893bff18c5485445074`**.

`interfaces/order-sdk-pin.json` records these inputs. The frontend-owned private package `@setl8/order-codec` is an order-only wrapper with the two source modules unchanged. It is not the full upstream SDK package and adds no wallet/RPC/transaction compiler dependencies. The frontend lockfile refers to `file:packages/setl8-order-codec`, inside this repository, rather than a mutable external SDK checkout. Offline installation added one local package; existing third-party versions were not repinned.

`npm run verify:sdk` checks the accepted archive and selected file hashes plus the order-only package shape. It runs before development, build and unit tests. Prettier excludes the copied SDK sources and immutable dependency artifacts. All canonical order encoding, decoding and signing-message construction call the accepted SDK functions; the application implements only exact text validation and hex display/transport conversion.

The accepted fixture contains public historical test signatures. They are retained as fixed SDK parity evidence, not newly requested signatures. No real authority, new order signature, session token, private key or CSRF value is saved by this milestone.

## Invalidation and loading behavior

Changing account, wallet/session epoch, market, demo/connected mode or gateway scope remounts the ticket and clears its fields, explicit account confirmation, nonce and prepared preview. Any field/profile/side/kind/SL/TP change clears the preview immediately, even when a previous input value is restored. Hook results are also tagged by the full scope/field key and generation.

A delayed SDK preparation cannot publish after a selector edit, identity change, newer preparation or unmount. Lazy module loading cannot be cancelled at the network layer, but obsolete results are discarded. Actual preparation uses the existing real-work loading counter; invalidation/unmount ends the obsolete work indicator without leaking a count. No fake delay or percentage was added. Drafts and byte strings exist only in component memory.

The signing/execution action remains disabled with the reviewed combined runtime/SDK and admission prerequisites. Read-only connected and clearly labeled demo draft scopes remain distinct. Closing/hiding the ticket discards its local draft; there is no persistent draft store.

## Validation and inspection

Final results and full command output are separate under `artifacts/milestone-3/`:

- **84 targeted unit/component checks passed** across five files: **55 new order-draft checks**, plus the relevant 29 existing account-consistency, auth, candle and chart-navigation checks. All 17 accepted signed-order fixtures round-trip and their Ed25519 signatures verify over the SDK-generated signing message. Tests cover Market/Limit/Stop parity, u64/u32/i64 boundaries, exact decimal rejection, invalid scopes/fields, disabled protective fields, 18 field/scope invalidation cases, delayed completion, ABA revival prevention, unmount and real loading-counter cleanup.
- **22 targeted desktop/phone browser checks passed.** Four new order-ticket cases prepare all three kinds and compare displayed hex directly with the pinned SDK. They check keyboard Enter preparation, disabled execution, invalid precision, account/market/profile invalidation and demo separation, zero order/signature calls, phone widths and Axe accessibility. Relevant recorded-candle, initial account-snapshot/evidence, demo terminal, account Activity and reduced-motion checks also pass. Existing unrelated landing/product/admin campaigns were not rerun.
- **Production TypeScript/Vite build passed**, including the local codec module. SDK integrity and formatting checks passed; graph maintenance and preservation results are in the validation summary.
- Inspected captured connected-mode draft reviews at desktop and phone sizes. Initial inspection found unstable input names when inline errors entered labels, then overly wide checkbox inputs inherited from old ticket CSS; both were corrected. The final browser checks pass. Account/chart tests use explicit controlled read transports; no live order endpoint was exercised.

Commands used, with full logs retained:

```sh
npm run verify:sdk
npm run build
npm test -- tests/order-draft.test.tsx tests/account-consistency.test.tsx tests/candles.test.tsx tests/chart-navigation.test.tsx tests/auth.test.ts --reporter=default --reporter=json --outputFile=artifacts/milestone-3/unit-results.json
SETL8_EVIDENCE_DIR=artifacts/milestone-3 npm run test:e2e -- tests/e2e/order-draft.spec.ts tests/e2e/candles.spec.ts tests/e2e/account-consistency.spec.ts tests/e2e/milestone.spec.ts --grep 'draft|candle|cutoff|snapshot|demo terminal|reduced motion'
npm run format:check
graphify update .
```

See `unit-results.json`, `browser-results.json`, `logs/`, `screenshots/` and `validation-summary.json`. This is not a new claim of real extension-wallet, actual-gateway trading or deployed compatibility. M2 real recorded-chart evidence remains historical and was not rerun unnecessarily.

## Preservation and dependencies

**90 prior report/evidence files** were hashed before modification and remain unchanged. The previous current handoff is preserved at `artifacts/milestone-3/origin-handoff-before.md`. The immutable frontend API declaration copy and untouched M2 implementation files are checked against their accepted M2 hashes. Historical reports/evidence remain in their original locations; new results are separate.

Main edits: `src/data/orderDraft.ts`, `src/hooks/orderDraft.ts`, `src/components/OrderDraftTicket.tsx`, ticket wiring in `src/pages/Terminal.tsx`, scoped styles, the local order-only package/integrity tooling and focused tests. No account core/evidence/SSE or recorded-chart data logic was changed. Backend/SDK source/contracts/vendor are read-only; no other repository or service was edited or restarted. No backend prototype integration, deployment, publication, transaction, commit or push occurred.

Remaining dependencies: Origin must review the isolated prototype gateway/driver before any prototype submission integration. Actual connected trading still needs the reviewed combined runtime/SDK, enabled admission and authorized per-intent signing. Nonce allocation, executable quotes, account eligibility, full outcomes and lifecycle/purchase/reset/payout/scaling remain unavailable. A structural byte preview proves neither order acceptance nor financial authority. Real extension wallets, physical phones and hosted/load behavior remain unverified.
