# Frontend milestone 1 — 2026-10-25

## Outcome

The frontend is implemented and runnable in `/Users/rovik/Documents/setl8-front` at **http://127.0.0.1:5173/**. It is a cohesive public site and read workspace, including connected authentication/account reads and an explicitly separate populated demo.

No deployment, transactions, account purchases, payouts, resets, remote repository, commits or pushes were performed. No backend, SDK or contract source/pin/vendor edits were made. Existing account and market history were not reset, restored or seeded.

## Delivered behavior

| Area                 | Implemented                                                                                                                                                                                                                                                                                                                         |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Public site          | Approved headline/composition, supplied raster logo unchanged, Outfit typography, black/blue/rose identity, interactive demo preview, challenge and Live features, accessible FAQ, responsive navigation. No invented customer statistics, testimonials or pricing.                                                                 |
| Application          | Account directory and selector, dashboard metrics from persisted state, phase/status view, positions, pending-order bytes, paginated activity/journals, prepared-attempt and origin/config diagnostics. Unavailable, empty, error and populated states are distinct.                                                                |
| Terminal             | Tradesea-informed account strip, narrow navigation, chart toolbar, resizable side/lower panels, focus/hide/restore actions, tabbed read panels, order-layout controls with disabled submission and recording-stream inspection. DOM and pSpark are omitted.                                                                         |
| Charts               | Lazy TradingView Lightweight Charts 5.2.1 integration in demo only. Deterministic market/timeframe fixtures, candles/line selection, pan/zoom, reset/fit, crosshair and keyboard pan/reset. Connected mode shows actual latest recorded observations and provenance, with no fabricated candles or quotes.                          |
| Authentication       | Wallet Standard discovery and injected Phantom/Solflare compatibility; exact returned login message review/signing; credentialed requests; memory-only CSRF; cookie restoration, fixed expiry, logout, wallet change/disconnect, rejected/cancelled flow handling and late-login cleanup. Session controls work at phone widths.    |
| Updates              | One active account SSE subscription, initial snapshot application, coalesced invalidation reads, opaque applied-read cursor, reconnect/session inspection, fresh-read resync, bounded exponential backoff and cleanup. Private views are remounted/disposed on the session epoch; obsolete fetches are aborted.                     |
| Market reads         | Backend market catalog, explicitly selected recording stream, bounded 5-second observations polling and signed ages/provider-time distinctions. Account time-derived fields refresh at 15 seconds; session checks at focus/60 seconds and fixed expiry. Generic resource failures back off and stop after six consecutive failures. |
| Administration       | Server-derived `admin_read` navigation and read-only diagnostics. A direct URL does not grant a missing role. No admin mutation/trading authority.                                                                                                                                                                                  |
| Accessibility/motion | Keyboard-visible focus, native dialog focus/Escape/return, arrow-key tabs, focusable scrolling tables, resizable splitters, reduced motion/transparency/contrast preferences and actual-work loading bar. No fake percentages, artificial delays or background video.                                                               |

## Product decisions added by the user

Phase 1 is unpaid. Phases 2–5 show **100% profit split** and **8% target each phase**. After Phase 5 comes **Live**, with **75% profit split**, **no profit target**, **no per-payout limit**, **unrestricted account scaling**, **minimal rules**, **negligible spreads**, **unrestricted news trading** and **multiple payouts per day**.

The user's instruction was to show features for now. These additions do not implement phase close, Live admission, scaling or payout behavior. The exact canonical interpretation of the user's closing-balance wording remains an interface question for the runtime/backend; no UI rule engine was added. Target achievement is not displayed as automatic payout. Request, queued claim and completed payout remain distinct concepts.

## Sources and integrity

Read the required design skills, approved landing reference, backend FRONTEND_API/typed contracts/MILESTONE_4/SERVICE_CONTRACTS and SDK STATUS/manifest. Ran graphify queries first in the backend and SDK. Inspected the official Tradesea Station screenshot and the user's authenticated sandbox demo, including its chart/order/account layouts; no reference-platform orders were placed. TopstepX access was offered and was not needed.

Backend accepted development SDK remains **0.1.0-dev.4**, profile **setl8-sdk-dev-v1**, historical runtime export **2c70883ac805f02844530cab5989a98f769ef73e**. No SDK package dependency is needed for browser read authentication. No pending canonical APIs were substituted.

The backend-owned `frontend-v1.d.ts` is copied byte-identically, excluded from formatting, SHA-256 **748664d740c31f103f7cb2b443c41c45f845c4956fddfb952d82bc36da47b7ca**. The supplied logo copy has SHA-256 **a79167219521cbbe6ded4e7a386408b2a611e94d08188dddba56df7f36b72923**. Its black background and proportions remain intact.

Graphify was updated AST-only: **327 nodes, 565 edges, 21 communities**, no semantic API calls or cost. Its installed skill/package version warning was recorded; the graph update itself completed.

## Validation

- **Production build:** TypeScript check and Vite build passed. Exact dependency versions and npm lockfile are present. Node 22.23.2 / npm 10.9.8 were used.
- **25 focused tests passed** across authentication, credentials/CSRF, exact UTF-8 signing, rejection, expiry, failed logout, wallet switching/disconnect, obsolete-request cancellation, late login cleanup, large/signed exact formatting, private-scope isolation, pagination and SSE snapshot/invalidation/cursor/rotation/resync/session-closure/backoff/disposal.
- **19 browser tests passed**, no unexpected/flaky failures. One duplicate phone-project width-sweep case is intentionally skipped. Desktop viewport 1440×1000; emulated iPhone viewport 390×664, DPR 3; additional route sweeps at 320, 360, 430 and 768 px. All major views stay within the viewport; dense tables scroll internally.
- **Axe checks passed** for landing, dashboard and terminal on desktop/phone using the tested WCAG 2 A/AA and 2.1 AA tags. Issues discovered during work—hidden account labels, nested chart attribution, scrolling table keyboard focus and phase-counter contrast—were fixed. This is targeted automated evidence, not a comprehensive accessibility certification.
- **Eight real-gateway browser integration checks passed** using a fresh disposable Ed25519 wallet in an isolated Chromium context. Actual challenge signing, exact origin/CORS, HttpOnly SameSite Strict cookie, authorized empty account list, session restoration, real 21-market catalog and bounded recordings, server role navigation, no local/session-storage secrets and CSRF-protected logout were exercised. No trading account, market or history fixture was inserted.
- Manual in-app browser inspection covered desktop landing/terminal and a 390×844 phone dashboard/terminal, including scrolling through the order panel and fixed navigation. Final automated landing/terminal routes reported no uncaught page errors. Expected unauthenticated HTTP 401 responses are normal session-restoration behavior.
- `npm run format:check` passed. Sources/tests/tools are formatted; the backend contract copy is intentionally excluded.

Evidence: `artifacts/browser-results.json`, `artifacts/integration-results.json`, `artifacts/performance.json`, and `artifacts/screenshots/`.

## Performance sample

The final measured production chunks total **215,028 bytes gzip for all JavaScript routes combined**; the separately lazy-loaded chart chunk is **53,414 bytes gzip**. CSS is **53,022 raw bytes / 12,362 gzip bytes**. This is total emitted code, not initial-page transfer. Fonts are self-hosted. The original unmodified logo is **1,443,004 bytes** and is a material asset cost.

A single local Chromium sample at 1440×1000 against the Vite development server, warm OS cache and no network/CPU throttling observed LCP **468 ms** and CLS **0** at capture. These conditions are recorded in the artifact; they do not establish field performance, production mobile speed or any frame-rate claim. Expensive routes/charts and the below-fold terminal preview load separately. Screenshot capture uses reduced motion for stable still images.

## Limits and next interfaces

Real browser-extension wallets and physical phones/Safari were not exercised. The real disposable identity owned no existing accounts, so real populated-account/SSE browser integration is unverified; those branches have typed integration code plus explicit mocked browser/unit evidence. No invented records were added to make a connected screenshot look populated. Demo screenshots are labeled as such.

Current backend admission remains disabled. Complete outcomes, independent verdicts, publication finality and deployed compatibility remain unavailable; lifecycle application is operator-only. Historical OHLCV, product/pricing/effective-rules/Live/scaling/payout interfaces, reviewed combined SDK/runtime integration and production origin/TLS policies are outstanding. See `INTERFACE_GAPS.md`.

## Services left running

For immediate review, the services started during this milestone remain running:

| Service                            | Bind            | PID at handoff |
| ---------------------------------- | --------------- | -------------- |
| Vite development frontend          | 127.0.0.1:5173  | 1439           |
| Existing built Setl8 gateway       | 127.0.0.1:8788  | 95113          |
| Dedicated local PostgreSQL cluster | 127.0.0.1:55438 | 94665          |

The gateway uses the existing `config/gateway-local.json` and `SETL8_DATABASE_URL=postgresql://127.0.0.1:55438/setl8_back_local`. No migrations, reset/restore, provider recorder, signer, indexer, worker or recurring automation was started. To stop the services, stop the frontend/gateway foreground processes, then use `tools/local-postgres.sh stop` from the backend folder when the dedicated cluster is no longer needed.

## Screenshots

- [Landing, desktop](../artifacts/screenshots/landing-desktop.png)
- [Account dashboard, desktop demo](../artifacts/screenshots/dashboard-desktop.png)
- [Terminal, desktop demo](../artifacts/screenshots/terminal-desktop.png)
- [Landing, phone](../artifacts/screenshots/landing-phone.png)
- [Dashboard, phone demo](../artifacts/screenshots/dashboard-phone.png)
- [Terminal, phone demo](../artifacts/screenshots/terminal-phone.png)
- [Live features, desktop](../artifacts/screenshots/live-features-desktop.png)
- [Live features, phone](../artifacts/screenshots/live-features-phone.png)
- [Real connected account-list empty state](../artifacts/screenshots/connected-real-empty-desktop.png)

Smaller `*-viewport.png` variants are also saved for direct review. Populated screenshots are deterministic demo data, never user financial history.
