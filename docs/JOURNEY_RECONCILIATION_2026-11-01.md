# Journey source reconciliation — 1 November 2026

## Review basis

The 31 October Journey foundation evidence is historical and its saved source hashes are preserved. This audit did not redo the milestone or its full suite. Current source has three later additions; six of the nine recorded Journey file hashes still match. No source was reverted or overwritten. Exact current hashes, file snapshots and bounded check results are in `artifacts/journey-reconciliation/reconciliation.json`.

Attribution remains **unconfirmed**. The proof page/generator/data/tests and demo-copy helper/tests have a common edit window around 31 October 15:36–15:38 UTC, but timestamps do not identify a writer or authorization. Relevant recent frontend/Origin turns and enabled Setl8 chats supplied no direct writer evidence; Origin separately confirmed the same limitation and instructed preservation. No active simultaneous edits were observed: all nine later-work snapshot hashes remained stable throughout this audit. This is not a claim that no external owner exists.

## Exact scope of the later edits

| File                    | Observed change                                                                                                                                                                                         | Effect on Journey review                                                                                                                                                                                                                                                                                                                                                     |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/main.tsx`          | Lazy import for `DevnetProof`, `/devnet-proof` route and route-specific document title.                                                                                                                 | Removing only those three additions in a temporary reconstruction, then formatting it, reproduces the saved router hash exactly: `64830443eedbdc1c379274296758fa295a26d792f8e44efb4a9d7b6bafdd63bc`. Existing Overview/Accounts/Purchase/Terminal route definitions, auth/prototype wrapper and loading behavior are otherwise identical. The working file was never edited. |
| `src/styles.css`        | Append-only static proof-page block using `.proof` / `.proof-*` selectors.                                                                                                                              | Stripping only this suffix and normalizing its final newline reproduces saved stylesheet hash `7f1cc39434b0915f4434db13aa26825217256b1aeae0faa5b4a3bd760cb1af9e`. The complete Journey/terminal/public stylesheet prefix is identical; proof selectors do not target Journey pages. The working stylesheet was never edited.                                                 |
| `src/pages/Landing.tsx` | Imports `demoBuild` / `stageCopy`; public phase tabs/intro/structure/preview/journey/FAQ copy comes from that helper. `VITE_DEMO_BUILD=1` omits the public Live-stage tab/copy; the default retains it. | Separate marketing/build-scope change. It does not alter Dashboard, Accounts, Purchase or selected-account handoff. No original full source snapshot exists for a byte-level inverse reconstruction of this file, so this scope statement comes from current source inspection and the helper tests, not a claimed exact historical diff.                                    |

Companion files: `src/pages/DevnetProof.tsx`, `src/data/devnet-proof.json`, `src/data/demoScope.ts`, `tools/gen-devnet-proof.mjs`, `tests/devnet-proof.test.tsx`, `tests/demo-scope.test.tsx`. All were preserved byte-for-byte. The generator describes public handover inputs and an allow-list; it was **not run** or used to regenerate/accept records in this audit.

Current changed-file hashes:

- Landing: `0ea5dab77410386a84a99ae61cd4907e05e829bc8ded6d1904f4fa0283dcfee9`
- Main router: `8168747b360ce5074f9f190b0fb000b540c73f10a8887eb99be0c778da9f327e`
- Styles: `21eb0ef822d2bd9444c6fe7f380975794c91cad5bf989fe9461d6d078a9361f8`

Dashboard, Accounts, Purchase, Workspace, account presentation and purchase-demo data retain the six saved Journey hashes. The original validation JSON/report/screenshots were not rewritten or relabeled as current proof/marketing evidence. No fresh Journey visual evidence is claimed because rendering changes are confined to a separate route and marketing copy; redundant automatic images from this audit's existing test helper were discarded from its new folder only. Historical screenshots are untouched.

## Bounded verification

- Four desktop/phone browser checks pass: selected-account Overview → Terminal handoff and normal purchase route isolation/payment disabled. These also execute their existing accessibility/overflow assertions. Results: `artifacts/journey-reconciliation/shared-routes/browser-results.json`.
- Six unit/component checks pass for the later demo-copy helper and standalone proof page: exact flag behavior, default Live-tab rendering, identifier/link shape, pending/null handling and no fetch from the standalone component. Results: `drift-unit-results.json` under the new evidence root.
- Production build and SDK-integrity check pass against current source, output isolated at `artifacts/journey-reconciliation/build/`. Existing `dist/` and other-owner files were not replaced. No backend service or other owner's preview was restarted.
- The former Vite11717 was absent and port5173 free before these checks. The test runner created/closed its own preview. No old service liveness is claimed.

These checks do **not** certify the proof page's source-to-binary/deployment claims, transaction finality, completed payout, future Live-stage terms or release readiness. Null/pending proof fields remain pending. The standalone component's no-fetch check does not mean the whole app wrapper makes no HTTP request: its existing authentication/session wrapper still applies to `/devnet-proof`. No chain/RPC/explorer or purchase operation was performed here.

## Missing seam added separately, still disabled

The current Purchase page consumes demonstration constants only; no typed boundary existed for a future reviewed status read. Added:

- `src/api/purchase-draft-v1.d.ts`: byte-identical copy of the backend design-only declaration, separate from implemented API route types. Provenance/hash in `src/api/purchase-draft-source.json`.
- `src/data/purchaseReadState.ts`: unused read-only projection for a future adapter. It preserves evidence purpose, client submission, chain, verification, indexing, recovery, verified-account reference and exact ns values separately. It does not derive purchase success, readiness or payout eligibility.
- Wallet/deployment/session request-current mismatches return no private result. Observations are detached from mutable response objects. **Sign, submit and repay remain literal false**, even for an indexed/verified observation.
- Five focused tests pass (`seam-unit-final.json`), covering separate finality/verification/indexing, evidence-purpose/exact-time retention, late-result identity guards, independent failure reasons and immutable disabled actions. An incomplete initial test fixture failed TypeScript's full-contract check; it was replaced with a complete typed synthetic fixture, and the final build passes. The failure log is retained.

The seam is not imported by Purchase or any runtime page/client. It performs no fetch, wallet call, persistence or broadcast; draft endpoints were not added to the implemented map. It is a TypeScript design seam, **not runtime response validation or a working purchase adapter**. Future integration still needs reviewed SDK/profile/RPC/quote/reconciliation dependencies, public attempt persistence before wallet prompt/send and owner-scoped recovery before another payment. It cannot resume or sign another wallet's draft. No SDK/vendor/canonical pin or backend source was changed; AST-only graph update completed.

## Acceptance separation

Origin can review Journey foundation on its unchanged component source plus the bounded current shared-router/style/build checks above. The later proof/marketing additions retain unconfirmed attribution and require their own acceptance; their presence does not activate purchase or certify claims. This audit's new read-state seam also awaits review independently of the delivered UI. Netting, partial-TP limitations and all prior exact-byte/reload/uncertainty protections are retained. No deployment/publication, chain transaction, commit/push or other-repository edit occurred.
