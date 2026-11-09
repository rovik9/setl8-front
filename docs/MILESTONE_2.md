# Frontend milestone 2 — authenticated recorded candle chart

Completed locally on 2026-10-25 (client timezone Asia/Calcutta) in `/Users/rovik/Documents/setl8-front`. The terminal now renders actual recorded candles through the existing lazy-loaded Lightweight Charts component. The approved interface, demo separation, account-update correction and disabled order submission remain in place. This work adds read-only chart behavior.

## Source handoff and ownership

Read the backend-owned `RECORDED_MARKET_HISTORY.md`, `FRONTEND_API.md`, `contracts/frontend-v1.d.ts` and `MILESTONE_5.md` as references. The additive declarations were copied byte-for-byte to `src/api/frontend-v1.d.ts`.

**New source/copy SHA-256:** `5814b74f4d750a094dcc62c2f677104bfb53b05b9aef94192030ed7c4c44dfeb`.

Reference hashes are recorded in `artifacts/milestone-2/backend-reference-sha256.json`. The old declaration hash remains in the historical milestone/correction reports. Backend, SDK, vendor, dependency pins and contract source were not edited. No packages were installed or repinned.

Port 8788 initially had no listener. Implementation proceeded with explicit controlled fixtures. The separate backend owner activated its reviewed milestone-5 gateway and migration 0012; its report is `/Users/rovik/Documents/setl8-back/docs/MILESTONE_5_LOCAL_ACTIVATION.md`. This frontend task did not build, migrate, stop or restart the backend, database or recorder. A 404 is presented as a missing route/market/stream integration prerequisite, never as empty history.

## Delivered behavior

- Explicit stream and accepted-market selection; no automatic live/synthetic choice or cross-stream merge.
- Intervals 1, 60, 300, 900 and 3600 seconds. UTC start/end controls describe `[from,to)`; the end is excluded. The optional last-recorded hour/15-minute shortcut uses the selected stream's latest stored source timestamp, not the current clock.
- Manual bounded pages of **25 nonempty candles**, using returned opaque cursors without decoding or constructing them. Continuations repeat the complete scope and validate the original cutoff/anchors, observation cursor, ordering and counts before application.
- A deliberate fresh read omits the cursor. While pending, the old cutoff is explicitly labeled; success replaces all loaded buckets from page one, including revisions to earlier buckets. It never appends a fresh prefix to an old one. Users can then load more under the new cutoff. Failed continuations stop and require a deliberate fresh read or narrower range.
- Stream, market, range, interval and session changes abort obsolete work and synchronously hide old results. Request generations reject responses that arrive despite cancellation. Fresh reads supersede old in-flight pagination. Duplicate load-more clicks coalesce to one active request.
- Each fetch has a 12-second client abort bound. Scope preflight enforces seven days and 2,000 intersected bucket positions, including absent positions. The backend enforces 10,000 total price inputs; returned counts are checked too. Requests cap cursor/URI length and success response decoding at 256 KiB. A work/response failure offers an explicit draft narrower range, which the user then applies. No automatic truncation, downsampling, interval change or partial-input OHLC is accepted.
- Empty, unavailable/timeout, oversized-range/work/response, expired-session, missing-route and 409/410 resync states are distinct. No automatic fresh-cutoff jump follows an invalid continuation. Logout/expiry retains the existing workspace identity boundary.
- Ordinary refresh/pagination keeps the chart instance and its logical zoom/pan window, including blank space if a fresh first page contains fewer points. “Fit / reset view” (and keyboard Home) explicitly fits content. Candles do not follow an automatic live feed.

## Exactness, provenance and honest coverage

`src/data/history.ts` keeps e18 prices and ns times as decimal strings/BigInt. Candle details show all 18 USD decimal places and full nine-digit ns fractions; raw exact fields and OHLC references remain expandable. Missing provider timestamps remain null.

The only recorded-price floating conversion is explicitly bounded approximate chart presentation: zero or absolute USD values from `1e-12` through `1e12`. Chart timestamps convert only aligned integral Unix seconds within u64 ns. Out-of-presentation-bound prices retain exact details while the plot reports its limitation. Plotted values are never used for amounts, OHLC aggregation or financial decisions. Millisecond Date conversion is likewise limited to presentation; exact fractional ns text is constructed from BigInt.

The view identifies purpose, feed/source, provider-time versus receive-time basis, recorded date/age, unknown coverage and archived/non-executable/non-finalized status. GMX uses provider updatedAt; HL states provider time is absent and uses receive time. Older recordings are visibly aged, including hours before a whole day has elapsed.

Only returned nonempty buckets are plotted. No missing bucket values, interpolation, carry-forward, volume, bid/ask or exchange-trade claims are introduced. Chart spacing follows stored buckets and can compress gaps; this is explained. Partial boundary buckets retain their clipped sample windows. Later recorded data may revise earlier candles. Receive diagnostics use their separate receive-time window, report inspected-prefix truncation and unknown uninspected counts, and distinguish omitted evidence inside the inspected prefix. A complete receive scan never becomes a market-coverage claim. Full diagnostic/cutoff data remains in an expandable view.

## Files and validation

Main implementation: `src/data/history.ts`, `src/hooks/candles.ts`, `src/components/RecordedChart.tsx`, `src/components/MarketChart.tsx`, `src/pages/Terminal.tsx`, the opt-in bounded response reader in `src/api/client.ts`, and responsive styles. Existing account core/evidence/SSE logic was not changed. `tools/recorded-market-check.mjs` provides the separate existing-history browser check.

Commands completed:

```sh
npm run build
npm test -- --reporter=default --reporter=json --outputFile=artifacts/milestone-2/unit-results.json
SETL8_EVIDENCE_DIR=artifacts/milestone-2 npm run test:e2e
node tools/recorded-market-check.mjs
npm run format:check
graphify update .
```

- **63 unit/component tests passed** across eight files. Added exact value/coordinate/age boundaries, range/bucket/page/input/response bounds, clipped and absent buckets, opaque cursor requests, fixed-prefix pages, prefix mismatch, fresh-cutoff replacement, stale responses after each selector/session change, 401 cleanup and chart-instance/logical-range preservation.
- **31 desktop/phone browser tests passed; one duplicate phone width sweep intentionally skipped.** Six new chart cases cover exact UI values, clipping, missing provider time, unknown coverage/truncated diagnostics, pagination, new-cutoff replacement, cancellation, empty history, range/work/503/404-prerequisite/409/410/401 states, fit/reset and responsive rendering. Existing accepted account correction regressions, demo isolation, Axe accessibility checks, keyboard/reduced-motion behavior and 320/360/430/768 width checks still pass.
- Production TypeScript/Vite build passed. Formatting and graph maintenance results are recorded in `artifacts/milestone-2/validation-summary.json`.

Controlled fixture evidence: `artifacts/milestone-2/unit-results.json`, `browser-results.json`, `screenshots/`. The synthetic fixture is test-only and is not selected by a production connected-mode fallback. During development, new browser tests initially hit Playwright's datetime-local normalization behavior for zero seconds; test inputs were normalized and the complete final suite passed.

## Actual-gateway browser evidence — separate

`artifacts/milestone-2/real-gateway/results.json` and its `screenshots/` directory contain actual Chromium rendering against the activated loopback gateway/database, without intercepted API responses. Used an isolated in-memory disposable Ed25519 mock wallet, normal credentialed login and existing immutable recording **`m3-live-final-1792878850054617000`**, purpose **live_record_only**.

| Existing source                   | Range `[from_ns,to_ns)`                        | Actual one-second candles               | Basis                                   |
| --------------------------------- | ---------------------------------------------- | --------------------------------------- | --------------------------------------- |
| Market 0, BTC / GMX source 2      | `1792878006000000000` to `1792878906000000000` | **9 candles, one page** at limit 25     | `provider_updatedAt_ms`                 |
| Market 9, xyz:JP225 / HL source 4 | `1792878011000000000` to `1792878911000000000` | **57 candles, three pages** at limit 25 | Receive time; provider timestamp absent |

Seven actual-gateway check groups passed: anonymous route authentication, actual browser wallet challenge/login, both source render/detail/pagination/refresh/observation-cursor groups, absence of page errors/demo mixture/phone overflow, disabled order submission and disposable-session logout. The source-4 pages retained identical cutoffs; bucket identities were unique. Exact JSON values and ns fields were checked in the rendered details, and observation history was read using the candle's observation_cursor at that same cutoff. Desktop 1440×1000 and resized 390×844 phone views were inspected and captured.

The records cover roughly 2026-10-24 21:54–21:55 UTC, visibly about 13 hours old at validation. Requested windows include leading absent history; no data was created to fill it. The independently owned backend activation report also compares these records with read-only SQL and independently calculates integer OHLC; this frontend report claims browser/API integration, not a new independent aggregation audit.

No provider request, recorder, source seed, trading account, intent, purchase, payout, scaling or lifecycle operation was used. No private keys, cookie values or CSRF tokens were saved. Only the disposable session was logged out; subsequent session access returned 401. Real extension-wallet signing and physical phones remain unverified.

## Preservation, services and limits

Before editing, hashed the two accepted reports plus all prior milestone/correction evidence: **48 files**, listed in `historical-evidence-sha256.json`. All remain byte-identical; the result is in `historical-integrity.json`. The prior current handoff is archived as `artifacts/milestone-2/origin-handoff-before.md`. All new outputs are separate. No deployment, remote creation, transaction, commit or push occurred.

The frontend was initially stopped and was started on **127.0.0.1:5173** for browser validation, then left running. The backend-owned reviewed gateway on **127.0.0.1:8788** and existing dedicated PostgreSQL on **127.0.0.1:55438** were left untouched. Current listener details are recorded in the validation summary.

Remaining limits: recorded history is sparse/archived and coverage remains unknown; chart floats are approximate; pages are manual and fresh reads restart pagination; chart time spacing compresses absent buckets. Revisions/failure/order races and diagnostic truncation are tested using controlled responses, without mutating source history or forcing real storage failures. Mock-wallet Chromium does not certify extension/mobile wallets, physical-device gestures, hosted/load behavior or current/full-session provider acquisition. Product/rules, enabled trading and all payout/scaling/lifecycle/finality/SDK-runtime integration gaps remain outside this milestone. The accepted account-update correction is preserved and its tests pass; independent account evidence pages still do not form an atomic database snapshot.
