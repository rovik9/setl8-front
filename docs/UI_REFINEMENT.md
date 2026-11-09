# Terminal UI refinement — 26 October 2026

The terminal now leads with the chart and a compact order ticket, using the approved black, cerulean, rose and Outfit / IBM Plex Mono system. This is a frontend presentation refinement of the accepted local synthetic prototype, not production trading readiness.

## Result

At 1440×1000, the chart occupies about 1,046 pixels beside a 300-pixel ticket. A restrained account strip, horizontal market watchlist and aligned lower positions/orders/activity/evidence panels replace the previous form-heavy first impression. Simulation status is compact and persistent; its full status and resync controls expand on demand. Errors remain visible outside the collapsed details.

The launcher opens `/app/terminal`, with an independent **Illustrative / Recorded** chart choice. Illustrative defaults only in the explicitly opted-in prototype and supplies labeled BTC fixture candlesticks immediately, even before login. The account, positions, evidence and order scope still come from the actual disposable account. Other markets do not borrow BTC prices. Recorded mode requires explicit dataset selection and has no illustrative fallback. Normal connected mode remains Recorded only; the separate whole-workspace demo retains its own fixture accounts.

Before a committed evaluator view exists, the account strip labels configuration values **Account size** and **Initial phase**. It does not claim these are current balance or position state. Current balance, phase and position count appear only from the committed account view. Processing counters remain in details. Unselected markets omit unknown price/coverage subtitles.

The order ticket presents Buy/Sell, order kind, exact quantity and optional protective levels, with one primary Review action. Developer settings (SDK profile, full account, explicit nonce/time and synthetic operator controls) are closed initially. The friendly review leads with side, symbol, type, quantity, price and account; exact canonical fields and signing bytes remain inspectable in closed details. Inspection consent, exact-byte signing, immutable retry, uncertainty, scope invalidation and reload resync retain their accepted behavior.

Phone Chart / Ticket / Account tabs show one active panel while keeping the ticket mounted. Arrow-key navigation and distinct accessible panel IDs are supported. Chart interval, presentation choice and fit remain visible; desktop focus/side-panel controls yield to mobile tabs. Footer/safe-area spacing avoids the former long blank tail. The final actual phone Chart capture is 390×851 for an 844-pixel viewport; the default ticket needs a short scroll (390×954), rather than stacking every workspace panel.

Recorded dataset/range controls, exact candle details and provenance diagnostics are expandable. Refresh and fit remain directly reachable after loading. Expanding dataset controls on a phone allows normal page scrolling instead of squeezing the chart scroll area to zero. Candle data, cutoff, pagination and exact-value code are unchanged.

## Evidence and validation

- **142 unit/component checks pass**, covering account updates, candles, chart navigation, exact drafts, prototype isolation, retries, uncertainty and resync. `artifacts/ui-refinement/unit-results.json`.
- **12 distinct scoped desktop/phone browser scenarios pass** across recorded history, exact draft gating/invalidation and new layout/accessibility checks. The main corrected run passed 11; its remaining phone test initially clicked before the lazy workspace mounted, then passed after explicitly waiting for the chart. Main/follow-up evidence is separate. The final viewport and WCAG A/AA pair passes after the last spacing changes. See `artifacts/ui-refinement/validation-summary.json` for exact run paths; failed development attempts are retained.
- **Eight actual-gateway groups pass**, with no successful API interception: disposable login/distinct cookie; exact Market + CSRF receipt and identical retry; persisted open position/evidence; reload resync and draft clearance; changed-payload nonce conflict; phone Close and canonical journals/status/replay; phone panel transitions retaining signed review; logout/session isolation/no source calls or page errors. `artifacts/ui-refinement/real-prototype-1792995151222/results.json`. Account: `4d03efaaed816966ab0da8bb64fcd70340bec5fb8e27e5119927d2a1458c5420`.
- Production build, accepted SDK integrity and formatting pass. Required AST-only graph update completed; no semantic API extraction was used.
- **All 298 protected historical report/evidence files remain byte-identical.** Original M1–M4 reports, correction evidence and prototype walkthrough are preserved; pre-refinement handoff is archived under `artifacts/ui-refinement/origin-handoff-before.md`.
- Backend process identities remain source 50081/94665 and prototype 59588/58162. No backend source/config/service, SDK source, contract, vendor pin, deployment, remote, commit or push was changed.

## Before / after

Before captures are historical M4 screens and use a different disposable account/state; they are visual comparisons, not a matched account-data experiment.

| View                   | Before                                                                  | After, actual disposable account                                                        |
| ---------------------- | ----------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| Desktop                | `artifacts/milestone-4/real-prototype-1792978819211/opened-desktop.png` | `artifacts/ui-refinement/real-prototype-1792995151222/fresh-prototype-desktop.png`      |
| Phone                  | `artifacts/milestone-4/real-prototype-1792978819211/closed-phone.png`   | `artifacts/ui-refinement/real-prototype-1792995151222/fresh-prototype-phone-chart.png`  |
| Phone ticket           | —                                                                       | `artifacts/ui-refinement/real-prototype-1792995151222/fresh-prototype-phone-ticket.png` |
| Friendly signed review | —                                                                       | `artifacts/ui-refinement/real-prototype-1792995151222/friendly-review-desktop.png`      |

The populated chart in these after captures is explicitly illustrative. The account is authenticated against the actual synthetic gateway; no old demo account was substituted. Recorded candle behavior is checked with controlled history fixtures in this refinement; the accepted M2 actual-history evidence remains historical.

## Interactive session and limits

The headed launcher-owned Chromium session remains open at `http://127.0.0.1:5173/app/terminal`. Controller **16437**, Vite **16454**, logs `artifacts/ui-refinement/interactive-1792995159017/`; disposable account `a35cab362e9298e731bc17fdda1cefa038b5189ff3cce1eb1442cf91b1b59a58`, synthetic clock `1791813600`, phase `ready`. This is a fresh session, separate from the completed regression account. Choose Connect wallet → Disposable synthetic wallet → Sign in with wallet in that launched window. No trading intent has been signed in this fresh interactive account. Other browser tabs do not inherit its controller or key. `npm run prototype:status` reports ownership; `npm run prototype:stop` stops only the verified frontend/controller/browser.

Illustrative prices have no execution authority. Only the existing manufactured Buy Market / whole-position Close flow with zero protective levels is executable in the opted-in local prototype; other draft types remain previews. Provider acquisition, live trading, bid/ask, market depth, volume, margin/P&L estimation, complete outcomes/finality, payouts/scaling/lifecycle and production admission remain outside this work. No real key, fund or chain transaction is involved. Controlled failure/uncertainty tests are not claimed as real fault injection.
