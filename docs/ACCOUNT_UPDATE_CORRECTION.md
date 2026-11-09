# Account-update consistency correction — 2026-10-25

Corrects the Origin review finding in frontend milestone 1. The original `docs/MILESTONE_1.md` and its 20 existing artifact files remain historical and byte-identical. Correction evidence is isolated in `artifacts/correction-account-consistency/`.

## Changed behavior

`readAccount()` now reads only the account overview. `accountFromOverview()` derives positions and pending orders from that same committed evaluator view, including processed-through, availability, rows, account identity, basis and update cursor. It never combines independently captured positions/pending HTTP responses. An unavailable evaluator view produces `available=false/rows=null`; a committed empty list remains `available=true/rows=[]`.

The connected core bundle contains no activity, journal or publication pages. Those views fetch and paginate independently. Each core application that represents a stream refresh or changed cursor publishes a new evidence invalidation generation in the same React state update. Every accepted SSE snapshot forces invalidation, including a snapshot whose opaque cursor equals the prior overview cursor. Old rows, continuation state and open detail modals are hidden when that generation changes. Obsolete page requests are aborted and cannot repopulate the new generation.

Publication attempts now have their own loading, retry and pagination state alongside the independent activity/journal pages. Evidence reads are explicitly described as independent pages, not one atomic account/database snapshot. A panel may finish after an account update, or fail with its own error state; the account reconnect cursor does not certify that panel's contents or successful fetch.

## Applied boundary

An accepted refresh means:

1. The single overview-based core view is installed for the current account/session scope.
2. Every independent evidence view is explicitly invalidated by the associated generation change. Mounted pages show loading rather than prior-generation rows; later-opened pages fetch afresh.
3. Only then can that operation return its opaque cursor for reconnect acknowledgement.

Discarded refreshes return `null`, never a replacement/current cursor on behalf of discarded work. Stream snapshots return explicit acceptance to the SSE consumer. A snapshot cancels and supersedes an in-flight HTTP core read; late completions cannot alter the displayed core or acknowledge a cursor. An SSE snapshot-generation guard also prevents an already-resolved older HTTP continuation from overwriting the newer streamed reconnect boundary.

Rotation/disconnection closes the old source. If a refresh is in progress, recovery waits for it and preserves whether a fresh resync is required. A successfully applied refresh can supply the next reconnect cursor; a discarded read cannot. Session revalidation, six-attempt reconnect bounds/backoff, refetch coalescing, account/wallet scope cancellation and the 15-second time-derived poll remain in place. An unchanged-cursor time-only poll need not reset evidence pagination. Polling is not the repair mechanism for the corrected race.

## Files

- `src/data/account.ts`: overview-only read and complete core projection.
- `src/hooks/account.ts`: atomic core/invalidation publication, explicit discarded-read result, shared in-flight refresh and snapshot supersession.
- `src/api/updates.ts`: explicit snapshot acceptance, guarded cursor acknowledgement and pending recovery semantics.
- `src/components/AccountPanels.tsx`: generation-scoped evidence pages/details and independently paginated publication attempts.
- `src/data/demo.ts`: a demo-only evidence fixture type; runtime fixture values and product scope are unchanged.
- Focused consistency/resource/update/browser regressions. Browser configuration and artifact helpers accept `SETL8_EVIDENCE_DIR` and now default to `artifacts/current/`, so ordinary future runs also preserve the original outputs. Helper capture/authentication/measurement logic is unchanged; only output routing changed.

No backend, SDK, vendor, pin or contract edits. The copied frontend contract still matches the read-only backend contract at SHA-256 `748664d740c31f103f7cb2b443c41c45f845c4956fddfb952d82bc36da47b7ca`.

## Validation actually performed

- **36 unit/component tests passed**, including seven integrated core-view ordering cases, three additional SSE acknowledgement cases and an invalidated pagination continuation case. The original authentication/exact-value/resource/update tests remain passing.
- **25 browser tests passed**, plus one intentionally skipped duplicate phone width sweep. Six new controlled-order browser cases run on desktop and phone; the existing milestone/browser accessibility checks also pass.
- **Production TypeScript/Vite build passed** after the correction and regressions were added.
- **Formatting check and artifact-helper syntax checks passed.** Graphify updated AST-only: 380 nodes, 651 edges, 24 communities; no semantic API calls.
- Manually inspected the corrected Evidence/publication view in the in-app browser at desktop and 390×844 phone width. Also inspected controlled-transport screenshots showing stale evidence removed during loading and fresh pages rendered afterward. No product layout or action scope was expanded.

Controlled regressions verify final rendered core values and actual EventSource reconnect URL cursors for: older positions/pending endpoints alongside a newer overview (those endpoints are no longer requested); a snapshot superseding a delayed refresh; publication/journal changes between initial reads and the first stream snapshot; reconnect during refresh; account and wallet switching before delayed reads complete; rejected snapshots; discarded refreshes; and delayed evidence continuations after invalidation. Browser checks complete these transitions before the 15-second polling interval.

Commands used:

```sh
npm test -- --reporter=default --reporter=json --outputFile=artifacts/correction-account-consistency/unit-results.json
SETL8_EVIDENCE_DIR=artifacts/correction-account-consistency npm run test:e2e
npm run build
npm run format:check
graphify update .
```

Evidence: `unit-results.json`, `browser-results.json`, `screenshots/`, `historical-evidence-sha256.json` and `historical-integrity.json` in the correction directory. All 21 fingerprinted original report/artifact files were verified unchanged. The prior origin handoff is preserved as `origin-handoff-before.md`; `docs/ORIGIN_HANDOFF.md` is the updated current handoff.

## Limits and scope

The current API guarantees the committed overview, not an atomic snapshot spanning separate evidence pages or multiple pagination requests. Acknowledgement now explicitly covers core installation plus evidence invalidation. It does not claim simultaneous evidence-page completion. No new backend snapshot API is required for this correction.

Ordering tests use controlled in-memory and browser transports. They do not claim a real database-concurrency/real-wallet end-to-end test. The original milestone's eight disposable-wallet/gateway assertions remain historical and were not rerun; physical phones, extension wallets and real owned-account SSE integration remain unverified.

The existing local frontend, gateway and dedicated database were reused. No service restart, database seed/reset/restore, trading, purchases, payouts, Live lifecycle behavior, deployment, remote repository, commit or push was performed. Approved interface, product copy, exact-value handling and demo separation remain intact.
