# Setl8 frontend

Default development now runs the real app at **http://localhost:3000** with its isolated Rust/PostgreSQL backend. Historical milestone: [opt-in synthetic browser prototype](docs/MILESTONE_4.md), following [exact unsigned order drafts](docs/MILESTONE_3.md), following [recorded candle charts](docs/MILESTONE_2.md). The accepted [account-update correction](docs/ACCOUNT_UPDATE_CORRECTION.md) remains in place. Original milestone and correction evidence remain historical.

A local React / TypeScript / Vite implementation of the Setl8 public site, authorized account reads and terminal workspace. Development API v1. This milestone is read-only; it sends no orders, transactions, purchases, resets or payouts.

## Run the real local app

Node **22.23.2**, npm **10.9.8** (see `.nvmrc`). Dependencies remain exact-pinned. After `npm ci` once:

```sh
cd /Users/rovik/Documents/setl8-front
npm run dev
```

Open **http://localhost:3000/** in the browser containing your wallet. This single foreground command starts or reuses the real isolated Rust gateway at **http://localhost:8792** and PostgreSQL on **55456** through the backend-owned `tools/dev3000.py` helper. It waits for the real database/schema and API readiness before launching Vite. Vite binds only IPv4 loopback; the launcher verifies that the actual `localhost` URL reaches its own server. Use `localhost` consistently for the site and API so Strict cookies are same-site. No API proxy, Origin/Host rewrite or synthetic account is used.

Ctrl+C closes this frontend and asks the helper to stop only backend resources created by the same invocation. Borrowed services stay running and database data persists. An occupied IPv4/IPv6 port, stale ownership record, conflicting `.env` API/synthetic flag or missing backend dependency produces an explicit failure; unknown services are never killed or taken over. Use `npm run dev:status` for frontend ownership and backend readiness. Full logs for the new backend are retained under `/Users/rovik/Documents/setl8-back/.local/dev3000/`.

- `/` — public landing, visible wallet sign-in and the current five-phase devnet scope.
- `/my-account` — signed-in wallet's account workspace; explicit public explorer is read-only. Public chain observations are distinct from server-indexed accounts.
- `/buy` — same-wallet devnet purchase review; signing/sending remain OFF after the previous grant expired.
- `/app/accounts/list` — authenticated server-indexed account list; a new unseeded database can honestly be empty.
- `/app/terminal` — authenticated recorded candles and account panels. Missing recordings remain empty; there is no invented history or live admission.
- `/demo/accounts` and `/demo/terminal` — clearly separate deterministic visual demos.

Wallet login signs the exact server nonce message and uses an HttpOnly cookie. It does not spend tokens, create an on-chain challenge or trigger a payment. Private keys stay in the wallet. An extension installed in Chrome is available only in that browser, not the Codex in-app browser. Payment can only use the same authenticated connected wallet and an explicit transaction approval; there is no manual transfer/claim path. No tokens or filled accounts are created by startup.

## Isolated services and explicit web-only modes

The backend-owned contract is `/Users/rovik/Documents/setl8-back/docs/DEV3000_HANDOFF.json`. This profile owns only the marked database `setl8_back_dev3000` on port 55456 and gateway8792, with separate `setl8_dev3000_login` / `setl8_dev3000_session` cookies. Its helper may initialize/build/migrate only its own new profile and preserves later data. Frontend code never builds, migrates, seeds, resets or restarts historical stores or services.

`npm run dev:web` starts only Vite at localhost3000 for controlled frontend development; it uses the same actual8792 API and does not start/stop backend resources. It is not a synthetic profile. `npm run dev:legacy` explicitly retains the historical normal web-only **127.0.0.1:5173 → 127.0.0.1:8788** pairing, and does not manage its gateway. Existing fixture browser tests use that explicit legacy web-only command. The separately opt-in prototype launcher below keeps its exact5173/8790 contract and is never selected by `npm run dev`.

No private key or credential belongs in Vite configuration. `.env.example` documents the public localhost8792 URL. Do not point the default dev command at the old gateway or a synthetic profile; remove conflicting overrides or use their explicit launcher.

## Validate

```sh
npm run build
npm test
npx playwright install chromium
npm run test:e2e
npm run test:integration
```

`npm run check` combines build, unit/component tests and browser tests. Current browser/helper outputs default to `artifacts/current/`; use `SETL8_EVIDENCE_DIR` to choose another output folder. Original milestone files at the top level of `artifacts/` are preserved as historical.

Browser tests use explicit mocked transport, not a hidden production demo flag. They cover desktop and an emulated iPhone viewport, plus a 320/360/430/768 width sweep. One duplicate phone-project width-sweep test is intentionally skipped.

The historical `test:integration` helper requires the legacy5173/8788 gateway and frontend already running; it is not part of default startup and must not be run as an unapproved campaign. It generates an Ed25519 key in process memory, installs a disposable mock wallet into an isolated Chromium context, signs the exact real challenge, restores a real cookie session and revokes it. It creates no challenge trading account or market record. It exercises ordinary authentication writes only. It never saves private keys, cookie values or CSRF tokens. Real extension wallets and physical phones remain unverified.

`node tools/measure-build.mjs` records built chunk sizes and a local browser diagnostic sample. Its conditions are in `artifacts/current/performance.json`; it is not a field performance or frame-rate certification.

## Implementation map

- `src/api/frontend-v1.d.ts`: byte-identical copy of the backend-owned frontend contract, SHA-256 `5814b74f4d750a094dcc62c2f677104bfb53b05b9aef94192030ed7c4c44dfeb`.
- `src/api/client.ts`: credentialed fetch, exact POST bodies, memory-only CSRF, abort signals and sanitized error handling.
- `src/auth/`: Wallet Standard discovery, injected Phantom/Solflare compatibility, reviewed login challenge, exact message signing, restoration, fixed expiry and logout/identity cleanup.
- `src/api/updates.ts`: account SSE snapshot/invalidation consumer, applied-read opaque cursors, session checks, bounded reconnect, resync and disposal.
- `src/hooks/`: scoped reads and pagination, coalesced overview refreshes and evidence invalidation, actual-work progress indicator. Private resource state is scoped to a session epoch and disposed on identity changes.
- `src/data/exact.ts`: BigInt financial formatting. `src/data/history.ts` retains exact e18/ns strings, checks range/page/cutoff bounds and defines the explicit approximate chart-coordinate conversion. Prices outside the conservative plotting bounds remain available in exact details.
- `src/hooks/candles.ts`: cancellable fixed-cutoff pages, deliberate fresh-cutoff replacement and session/selector isolation. `src/components/RecordedChart.tsx` supplies range controls, exact details and expandable provenance/diagnostics.
- `src/data/demo.ts`: deterministic, explicitly separate illustrative account/market fixtures. No backend write path imports these fixtures.
- `src/components/` and `src/styles.css`: reusable controls, dialogs, tabs, status badges, tables, surfaces, tokens and responsive composition.
- `src/pages/`: landing, dashboard, terminal and admin read view. Expensive routes and the chart integration are lazy-loaded.

TradingView Lightweight Charts 5.2.1 supplies separate demo charts and authenticated recorded candle charts. Advanced Charts is not assumed licensed or available. Connected candles aggregate stored observations; coverage is unknown and the view is archived, non-finalized and non-executable. Empty buckets remain absent. No volume, bid/ask, market depth or AI assistant is added.

Recorded chart controls support 1/60/300/900/3600-second intervals, UTC half-open ranges, 25 points/page, seven days, 2,000 intersected bucket positions, 10,000 total input samples and a 256 KiB response bound. “Load more” retains one cutoff; “Refresh recording” starts a fresh one and replaces all loaded buckets from page one. Ordinary data updates retain the chart’s logical zoom/pan window; use “Fit / reset view” explicitly. No automatic market polling is added to the candle view.

Run `node tools/recorded-market-check.mjs` with the frontend and reviewed gateway running for an actual-gateway browser check against existing recordings. It uses an isolated disposable mock wallet and writes to `artifacts/milestone-2/real-gateway/` by default. No source records are seeded and only its disposable login session is logged out. Fixture browser/unit evidence for milestone 2 is separate under `artifacts/milestone-2/`.

The original logo is preserved byte-for-byte as `public/setl8-logo.png`, including its black background. It is a raster asset. Chart attribution is on the public footer and chart link.

See [milestone 2 report](docs/MILESTONE_2.md), [historical milestone 1 report](docs/MILESTONE_1.md), [origin handoff](docs/ORIGIN_HANDOFF.md), [interface gaps](docs/INTERFACE_GAPS.md) and [design decisions](docs/DESIGN.md).

## Development order preview (M3)

The terminal Order tab prepares unsigned Market/Limit/Stop drafts with exact base-unit quantity (six decimals) and USD price/SL/TP (twelve decimals). Explicitly confirm the selected account and enter a development nonce and client time. “Prepare development preview” shows SDK-decoded fields and exact 48-byte order/93-byte signing-message hex. Any field or scope edit invalidates the preview. It never requests an order signature or sends an order POST. Execution remains gated on the reviewed runtime/SDK/admission and Origin-reviewed prototype handoff.

The private local `@setl8/order-codec` package wraps unchanged order-only TypeScript sources from accepted SDK 0.1.0-dev.4. `interfaces/order-sdk-pin.json` records the verified archive and file hashes; `npm run verify:sdk` runs before dev/build/test. The artifact and package are frontend-owned, reproducible inputs, not a mutable SDK checkout. Existing third-party versions stay pinned. See `docs/MILESTONE_3.md` and `artifacts/milestone-3/` for targeted checks and full logs.

## Opt-in local synthetic prototype (M4)

Run `npm run prototype` against the already reviewed/running backend8790/PG55450. It opens a dedicated interactive Chromium window with a disposable in-memory wallet and local CLI controller. Port5173 must be free; occupied/unowned processes are never taken over. `npm run prototype:status` shows public ownership and `npm run prototype:stop` stops only that frontend/controller/browser. Backend services stay running. Normal `npm run dev` uses the separate real localhost3000/8792 profile; this prototype remains explicitly opt-in. See [prototype walkthrough](docs/PROTOTYPE_FRONTEND.md).

Synthetic execution requires the exact8790 URL, explicit development opt-in, Origin5173 and the launcher-owned bridge; a URL or backend readiness claim alone is insufficient. Only supported inspected Market/whole-position Close is signable; other M3 drafts remain previews. Receipt, evaluation evidence and unavailable full outcomes/finality remain distinct. No real authority, provider feed, purchase/reset/payout/scaling/lifecycle or chain transaction is involved.
