# Frontend design decisions

Applied the installed frontend-design and apple-design skills before design and implementation. Inspected the approved October 22 landing concept and preserved its center-set headline, Outfit typography, blue/rose product stage and disciplined dark surfaces. Replaced its sandbox wrapper, fake rendering percentages and sample pricing with application routes and real-work loading state.

## Tokens and composition

- Jet black `#0A0A0A`: brand ground and structural navigation.
- Cerulean `#007BA7`: read state, focus and positive chart direction. Lighter text tints maintain contrast.
- Neon rose `#FF2D95`: main public actions and negative chart direction. Main rose buttons use dark text for contrast.
- Surface `#111216`, raised surface `#181A20`, border `#282A31`, primary text `#F3F4F6`, muted text `#A1A4AF`.
- Outfit Variable: display, prose and controls. IBM Plex Mono: explicit byte/cursor detail and chart scales. Financial values use tabular numerals and integer-only formatting.

The public site uses a central hero and inset interactive product demonstration. Lower content shifts to a two-column challenge journey with Phase 1, Phases 2–5 and Live selectors. The application uses a quiet sidebar, selected-account strip and clear data hierarchy. The terminal compresses navigation into a narrow rail and gives most of the viewport to the chart/read workspace.

## Reference actually inspected

- The official [Tradesea Station page](https://www.tradesea.ai/station), including its workspace screenshot.
- The user's authenticated `app.tradesea.ai/trade` sandbox demo in the in-app browser: chart toolbar, account strip, DOM/Order/Scalp pad modes, lower account/position tabs and full/popup panel behavior. No orders were placed. TopstepX access was offered but not required.
- Official [Lightweight Charts documentation](https://tradingview.github.io/lightweight-charts/docs) and [product comparison](https://tradingview.github.io/lightweight-charts/docs/product-comparison). Lightweight Charts was available through npm with typed APIs. Advanced Charts requires separate access and was not assumed.

The user's later instructions explicitly remove **DOM** and **pSpark/AI** from Setl8. Neither appears in its UI. The reference informs hierarchy and density; this is our own implementation, not a claim of full Tradesea feature parity.

## Motion and accessibility

One orchestrated hero/product entrance, spring-retargeted phase selection, immediate press feedback and direct panel resize tracking. No video, artificial loading delay, percentage progress, large animated blur or full-screen moving background. Reduced motion disables entrance movement; reduced transparency and contrast preferences have explicit fallbacks. Keyboard access covers dialog focus/Escape/return, tabs, scrollable tables, chart panning/reset and desktop splitters.

At phone widths the public page reflows, metrics become two columns, application navigation moves to the bottom, and the terminal stacks chart, account tabs and order/recording panel. There is no phone gate. Dense account tables scroll inside focusable regions rather than widening the page. Resizing is desktop-only; no full mobile parity claim is made.

## Latest user-authored product features

Phase 1 remains unpaid evaluation. Phases 2–5 display a 100% profit split and an 8% target each phase. Live follows Phase 5 and displays: 75% profit split, no profit target, no per-payout limit, unrestricted scaling, minimal rules, negligible spreads, unrestricted news trading and multiple payouts per day. These are feature presentation only. No eligibility, phase-close, scaling or payout engine was added. The user also described completion as “target reaches and balance closes”; the canonical closing-balance/flatness transition still belongs to the runtime/backend handoff, not UI inference.

## Milestone 2 recorded chart design

Kept the approved palette, type, terminal hierarchy and phone stack. Controls sit above the chart: explicit stream/market selection, interval, UTC half-open range, fresh read and fit/reset. No stream is silently selected; no connected chart is synthesized. The stored-sample shortcut is an explicit user action and labels its recorded date and age.

The chart is the primary visual. Exact values and bounded provenance remain available in expandable details; diagnostics explain unknown coverage, missing provider time and inspected-prefix truncation. Ordinary fresh reads and pagination keep the logical navigation window; fit/reset is explicit. At phone widths controls become full-width touch targets, chart/details flow vertically and the rest of the workspace remains reachable. Numerical presentation conversion is limited to approximate plot coordinates; exact e18/ns values remain the source for details.
