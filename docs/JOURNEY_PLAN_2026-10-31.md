# Purchase → overview → terminal: frontend planning delta

31 October 2026. Proposal only; implementation is not authorized by this document.

Basis: [Origin reference study](/Users/rovik/Documents/ChatGPT/Setl8/coordination/REFERENCE_STUDY_2026-10-31.md), current route/component/contract reads, and the accepted terminal refinement. MFFU informs account navigation, checkout review and performance hierarchy; Vest informs market selection, ticket density, history and preferences alongside the earlier TradeSea/TopstepX direction. Browser observations and limitations belong to Origin's study; this pass did not access either reference account. No personal/reference-account data is reproduced.

## Recommended delta

Make account ownership, current status and the next valid action the organizing structure. Keep the accepted terminal as the Trade destination. Give purchase a dedicated entry and review, and give account management its own overview rather than turning the terminal into checkout or a statistics dashboard.

Preserve the infinity mark, black #0A0A0A, cerulean #007BA7, rose #FF2D95, Outfit/IBM Plex Mono and exact/tabular numbers. Use restrained borders and spacing, compact status chips, clear empty/error states and short contextual explanations. Financial truth leads; technical provenance expands on demand. Motion should support navigation and feedback, respect reduced motion and never obscure the chart. Retain the real-work top loading bar.

## Current → proposed surfaces

All routes in the proposed column are suggestions, not implemented endpoints. Existing account query links remain valid.

| Surface | Existing route/component and reuse | Proposed destination and delta |
| --- | --- | --- |
| Purchase | `/` → `Landing.tsx`: phase/product explanation and account CTA; `WalletDialog.tsx` provides login only. No checkout or purchase action exists. | New `/purchase`: size selection → reviewed rules/quote → wallet review → transaction status/receipt. Login and payment authorization remain distinct. Never turn the order-intent POST into a purchase API. |
| Account overview | `/app/accounts?account=…` → `Dashboard.tsx`, `Metric`, embedded `AccountDirectory`; `Workspace.tsx`, `AccountSelect`, `AccountBoundary`. | Preserve this selected-account URL initially, label it Overview; promote the embedded directory to an Accounts view, proposed `/app/accounts/list`. Header shows size/phase/state and Trade action. Rework connected-state placeholders around useful current values; no invented balance curve. |
| Rules / risk | Dashboard phase panel; committed evaluator flags and `initial_config` in overview; diagnostics in `AccountPanels.tsx`. No typed risk/eligibility view. | Overview side panel plus an account-scoped Rules detail view. Distinguish target, monetary floors, remaining room, temporary lock and permanent failure. Display configured facts; calculated risk/eligibility waits for the contract below. |
| Calendar / performance | `PreviewChart` provides demo illustrations; current connected dashboard explicitly lacks historical balance series. | Proposed `/app/performance?account=…`: growth curve, month calendar, filters and summaries only after reconciled history exists. Day → journal is a Setl8 proposal, not an observed MFFU capability. Distinguish zero, no trades, unavailable and incomplete history. |
| Journal / history | `AccountPanels` already has Positions, Pending orders, Activity and Evidence; independent paginated activity/journal/publication pages and detail views exist. | Proposed `/app/journal?account=…`, with a compact recent section on Overview and existing terminal tabs retained. Current protocol journals remain Evidence; they are not a complete closed-trade ledger. Introduce a trader-facing closed-position view only after canonical ledger semantics exist. |
| Payouts | Landing feature copy only; recorded phase/flags and operator-only lifecycle observations are not payout eligibility or payment evidence. | Proposed `/app/payouts`: eligibility explanation → request/review → queue → payment evidence/history. Distinct unavailable states; no active request/withdraw control from current data. |
| Purchases / receipts | No purchase ledger, reset linkage, fees or receipt contract; current account directory only lists owned account reads. | Proposed `/app/purchases`: purchases/resets, exact charges, confirmation/indexing state and receipt → account links. Preserve prior/new reset identities. No implied subscription, renewal, discount or payment provider. |
| Trade | `/app/terminal?account=…` → `Terminal`, `RecordedChart`, `MarketChart`, `OrderDraftTicket`, prototype providers/actions. | Keep the accepted chart-led composition, 300px ticket and phone Chart/Ticket/Account tabs. A later searchable market dialog can reuse the catalog; supported history filters/preferences can follow without changing order semantics. |

Reuse shared `ui.tsx` controls, disclosure/dialog/focus patterns, `useResource`, `usePaged`, exact formatters and the authentication boundary. Navigation additions also need route-aware titles/breadcrumbs in `main.tsx`/`Workspace.tsx`; preserve account context and deliberately scope/reset filters rather than discarding unrelated query state. Capability-dependent destinations should appear as useful views when their reads exist, not as a shelf of dead buttons.

## Contract gates

The copied `frontend-v1.d.ts` currently supplies account summaries/overview, committed positions/pending lists, paginated activity/evidence, recorded markets/candles, login and signed order intents. Its arbitrary `RecordedJson` payloads and explicit unavailable feature flags do not provide the following typed product contracts. These are requirements for backend/SDK review, not a request to edit contracts now.

| Needed | Minimum authoritative information / semantics |
| --- | --- |
| Purchase catalog + exact quote | Reviewed deployment/profile identity; available sizes/terms; base price and configured surcharge; token mint/decimals and exact total; quote identity/expiry; required accounts and supported transaction construction. Wallet balance and estimated SOL costs are separately labeled. Reviewed active-account cap and refusal reasons. |
| Durable purchase reconciliation | Wallet/network/profile-scoped purchase identity, transaction signature/blockhash validity, rejection/expiry/unknown/chain failure, commitment/finality, ownership evidence, resulting account identity and indexing/initialization status. Persist public pending identity over refresh and reconcile before offering a new payment; login or a submitted signature never proves purchase success. |
| Rules / risk / readiness | Versioned rule explanation plus authoritative derived target/floors/remaining room, lock/failure reason, eligibility and preconditions with committed revision, as-of clock and price-validity basis. Current balance/flags remain distinct from initial configuration. Do not repurpose worker errors as rule failures, or run a wall-clock lock countdown from a stale synthetic clock. |
| Balance / trade ledger / aggregates | Stable lifecycle/execution IDs; partial-close/reversal allocation; opening/closing times and timezone; gross market result, credited challenge result, commissions/holding costs and quick-trade adjustments reconciled to balance. Revision/cutoff, completeness, pagination and aggregation scope. Closed net-position trades must have an accepted definition before win rate/calendar totals. |
| Payout and purchase history | Phase treatment, eligible amount/reason, request/review/queue state, actual payment evidence and vault cadence; separately, purchases/resets, charges and receipt provenance. No inference of paid from queued, publication prepared or phase target hit. |

Keep core overview/positions/pending values on their existing single committed boundary. Independently paginated evidence and future ledgers need their own loading/invalidation and documented revision semantics; separate HTTP pages are not an atomic snapshot. Keep exact integer amounts/times in the data layer. Never derive account equity, performance or executable prices from recorded candle floats or illustrative charts.

Origin's backend/SDK assessment reports deployed rehearsal identity/profile differences from the current historical localnet-only SDK/indexer. A reviewed compatible deployment/profile and integration contract must precede real purchase signing or devnet claims. This planning pass did not revalidate chain deployment. All pins remain unchanged.

## First cohesive implementation milestone

**Journey foundation: purchase review → account overview → existing terminal.** Deliver the interface and state model around current capabilities, with real account reads and a clearly isolated checkout prototype; do not bundle an unreviewed payment integration into a visual milestone.

1. Preserve `/app/accounts` deep links while giving Overview and Accounts clearer navigation, account selection and status-led next actions. Use committed values where available; accurately labeled initial size/phase while awaiting a committed view; account-loading, empty ownership, stale/unavailable and session-expired states. Move cursors/raw evidence to expandable details without hiding errors.
2. Add `/purchase` selection/review composition. Real pricing/rules appear only from a reviewed catalog/quote. Until that exists, provide an honest unavailable explanation and a separately labeled demo journey, with no actionable real-payment CTA or fabricated live price. Demonstrate pending/unknown/failed/confirmed-but-indexing states only in isolated fixtures.
3. Connect owned-account overview to the accepted terminal with the selected account preserved. Show account initialization/read readiness separately from market/terminal execution readiness. Login, ownership, initialized account and trade admission are separate checks; actual trading gates stay intact.

Acceptance for that future milestone: coherent desktop/phone journey; keyboard/dialog/focus and reduced-motion support; honest data/empty/loading states; no accidental financial action in previews; selected-account isolation; terminal draft/signing/reload protections intact. Tests/browser inspection would be scoped at implementation time. A subsequent purchase integration slice requires the approved profile, quote/transaction adapter and durable reconciliation contract before a real end-to-end purchase can be claimed. Reconciled performance, payouts and reset actions follow their own contract gates.

## Wireframe-level composition

Desktop Overview (account management density, not terminal density):

```text
[Setl8 / primary navigation]              [wallet / profile]
[account picker] [size] [phase] [state]            [Trade]
[status / reason / next valid step; freshness disclosure]
[closed balance] [target remaining*] [floor room*] [lock*]
[balance history*, or useful current-state summary] [Rules]
[recent closed-position journal* / current account activity]
[Evidence & diagnostics — collapsed]
```

`*` Requires its reviewed contract. Hide unavailable optional metrics or explain the missing basis; never draw a fabricated curve or meter. Trade opens the current terminal with the same account and preserves its synthetic/recorded distinctions.

Desktop Purchase:

```text
[Setl8]   Choose account → Review → Confirmation
[size choice + configured product/rules] [exact quote summary]
[rule groups; phase treatment; terms]    [wallet/network]
                                       [one primary action]
[submitted / uncertain / finality / indexing / receipt state]
                         → [Open owned-account overview]
```

Phone: Overview/Accounts/Trade primary bottom navigation, secondary pages under More; Start challenge is a contextual action. Stack account header → status → a small metric grid → current state/history → rules → recent activity. Purchase uses sequential screens and a safe-area-aware summary/action; confirmation is its own readable view. Calendar, journal filters and market search can use accessible sheets when implemented. Retain mounted terminal panels and avoid resetting chart navigation on ordinary refreshes. No large status banner/toast stack over the chart.

## Boundaries and planning verification

No source code, tests, accepted reports/handoff, graph, services or pins changed by this proposal; only this new document is saved. No browser/account access, transaction, restart, publication, deployment, remote, commit or push. Static navigation used a bounded existing graph query plus focused source reads, not graph regeneration or semantic extraction. The accepted 26 October screenshots/tests remain historical evidence, not fresh 31 October verification; no claim is made about current running process liveness.

No new rules, Options launch, Scale orders, DOM/order book, invented funding/liquidation, guessed margin/P&L or automatic lifecycle. Existing feature marketing is not action eligibility. Preserve approved branding, normal Recorded-only mode, explicit prototype Illustrative/Recorded choice, separate demo accounts, single-snapshot account core, exact signing/retry/uncertainty, wallet/session isolation and reload resync.

Implementation anchors: [routes](/Users/rovik/Documents/setl8-front/src/main.tsx), [workspace](/Users/rovik/Documents/setl8-front/src/components/Workspace.tsx), [overview/directory](/Users/rovik/Documents/setl8-front/src/pages/Dashboard.tsx), [account panels](/Users/rovik/Documents/setl8-front/src/components/AccountPanels.tsx), [terminal](/Users/rovik/Documents/setl8-front/src/pages/Terminal.tsx), [copied read contract](/Users/rovik/Documents/setl8-front/src/api/frontend-v1.d.ts), [accepted refinement](/Users/rovik/Documents/setl8-front/docs/UI_REFINEMENT.md).
