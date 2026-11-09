# F3 account dashboard and finite synthetic browser journey

Delivered 1 November 2026 in `/Users/rovik/Documents/setl8-front`. `/my-account`, the BTP screenshot kit and **one actual local synthetic Market → position → Close → replay browser journey** are complete for Origin review. F2 real devnet signing/sending remains OFF. Devnet account reads were checked with explicit mocked RPC; no external chain acquisition or wallet transaction occurred.

## Account dashboard

The new lazy `/my-account` page uses the approved dark blue/rose CX design, responsive account navigation/cards/detail, phase markers, restrained motion, reduced-motion support and the existing top loading bar. It accepts an explicit `?wallet=<public-address>` or a connect-only Wallet Standard devnet account. No auto-connect or signing feature is exposed. Public-address viewing and wallet connection never claim authentication, ownership authorization or completed payment.

`src/account/data.ts` uses F2’s fixed two-provider bounded read client and pinned SDK decoders. Each account-page refresh uses six read requests: paired genesis, paired profile and paired up-to-ten accounts plus rules/config. The challenge counter/page arithmetic remains exact BigInt even at u64 maximum; it never enumerates the entire counter. Each row requires non-executable account state, program owner, trader, ID, exact layout and derived address; invalid/missing rows are explicit. A1’s optional independent check is four requests and uses its recorded address plus the pinned derivation. Current executable images/admission are not attested by this read-only page.

Explicit refresh is the default. Opt-in polling has a single visible-only timer at 60 seconds minimum, backing off to 120/240/300 seconds. It pauses hidden, coalesces an active resource refresh, aborts reads on address/page/session-view changes and rejects late results by epoch. The shared client honors global 403/Retry-After; no denial bypass, automatic failover, five-second image polling or concurrent operator loop was added. A temporarily winding-down different read can ask the user to refresh again rather than infer absence.

The page shows exact decoded account size, recorded closed balance B, phase/status, sequence, closed-trade count, UTC timestamps, pass state, current observed fee/rules and public Explorer links. Current equity/P&L is explicitly unavailable. Pass-delay display uses checked config plus decoded pending timestamps and the local browser clock; elapsed delay never implies finalization or payment. Timestamps used by terminal accounts are labeled as terminal/reset fields. Last-observed slots/time/age and partial history remain visible: separate requests/pages are not an atomic snapshot. A retained F2 attempt is highlighted only on an independently checked matching account identity, with an explicit warning that payment is not inferred.

The recorded A1 timeline reads unchanged `src/data/devnet-proof.json`. Finalization, settlement and balance evidence are still pending in that snapshot. Queued is not paid; time passing does not complete a pending step. SDK day-1 descriptor identity stays independent of later proof updates. Only the owner regenerates the proof after actual source evidence exists.

## Navigation and screenshot kit

Approved scoped navigation changes send BTP demo-build account CTAs in Landing/Purchase to `/my-account`, retaining legacy/default destinations and the separate purchase demo. F2 recovery links to an explicitly public account view. F1 layout/copy/styles and immutable code/data stay preserved.

`npm run shots` invokes `tools/capture-btp-screens.mjs`. It produced eight numbered images with a classification/hash manifest in `artifacts/btp-screens/`: local landing/pricing/static proof, reused F2 watermarked mock buy images, and new watermarked account/timeline mocks. Mock names include `MOCKED-WALLET-NOT-A-REAL-TRANSACTION`. The standalone kit deliberately skips the terminal and never attaches to an ambient controller or allocates a fixture. Its exported `captureControlledTerminal` verifies the exclusive launched controller before capturing actual local evaluator screens. Owner-only wallet/Explorer/balance captures and proof regeneration are listed in `docs/BTP_SCREENSHOT_CHECKLIST.md`.

The account-page terminal link says **Simulated prices - synthetic account; it is not linked to your devnet account**. Bare `/demo/terminal` is visual-only. `Terminal.tsx` was not changed.

## One actual local browser journey

Evidence: `artifacts/f3-account/actual-synthetic-1793533653434/`. This used the existing `launchPrototype` export from the frontend launcher through `tools/check-f3-synthetic.mjs` (headless automation of the same guarded controller as `npm run prototype`), not a new backend runner. It created exactly one exclusive disposable controller/wallet/account. No successful API response was intercepted or manufactured by the browser harness.

The normal 5173 process PID12560 was verified against its saved start-command identity. Old controller16437 and old Vite16454 were both absent; only their proven-stale public handle was archived to `artifacts/f3-account/mode-handoff/proven-stale-public-handle.json`. The verified normal frontend was stopped once. Gateway8790/PG55450, read-only5174 and P30 services were reused without restart.

Actual UI/HTTP/storage checks passed seven groups:

1. Connect and exact off-chain login with the new disposable wallet; distinct prototype cookie, real wallets excluded.
2. Stage manufactured 60000 price, inspect/sign canonical Market nonce1, durable submit, identical signed retry with identical body hash and CSRF.
3. Tick/drain/work through the owned controller; authenticated overview reports one stored position and executed intent status.
4. Reload preserves controller phase/clock through read-only resync, clears old drafts/nonces/signatures and performs no new intent POST.
5. Stage manufactured 60100 close sample; inspect/sign whole-position Close nonce2; evaluate through the same controller. Actual positions become empty and exactly two journal batches are stored.
6. Actual canonical recovery matches the entire closed evaluator state after normalizing CLI JSON integer numbers to the API’s exact decimal strings. Phone tab transitions/status were checked; completion/finality remain unavailable.
7. Explicit logout returns401; no browser errors, source8788 calls or browser-storage secrets. The owned frontend/controller/browser closes and discards its in-memory key.

Public fixture: account `258f2cdd2eab97a5405240e8d89ec45d7232d26a46c6ca64d9c6782c85f0428e`. Intent posts are exactly nonce1, identical nonce1 retry, nonce2. Saved `results.json`, operator logs and `actual-correlation.json` establish actual stored position/empty position/replay. Six actual screenshots are separate from mock evidence, including `09-open-position-ACTUAL-LOCAL-SYNTHETIC.png` and `10-closed-phone-ACTUAL-LOCAL-SYNTHETIC.png`; inspected. The phone post-close capture shows the executed Close ticket; empty positions and replay are established by the saved authenticated reads/operator outputs. The chart in these captures is explicitly illustrative, separate from the manufactured samples evaluated by the local engine. No deployed market, chain transaction, devnet account mapping, complete outcome or finality claim is made.

The existing32-fixture bound was respected: one controller initialization only (expected16→17), no blind retry, setup, reset, root rebuild, new gateway, tunnel or CORS change. Existing historical backend rows were not independently rehashed by this frontend run; the preserved process identities, guarded fixed-profile CLI and absence of source/P30 browser requests were checked.

## Validation and restoration

- **102 focused unit/component checks passed in seven files**, including15 new account tests and the existing F2/tier/demo/proof/unsigned-SDK checks.
- **12 mocked F3 browser checks passed**, zero runtime errors, zero automated phone WCAG A/AA violations. Desktop,390px and320px inspected. Five new account/error/limited-state screenshots are clearly watermarked.
- **Eight screenshot-kit images** with classifications and hashes; F2 mock financial evidence reused, not rerun as a fresh claim.
- **Seven actual synthetic browser groups passed** on the single disposable account; six actual screenshots, two journal batches, exact replay correlation and logout401 retained separately.
- Production demo build/TypeScript and both SDK guards passed. Changed-file formatting passed. AST-only graph update completed190 files,1766 nodes,3065 edges. The installed graphify skill/version warning was recorded without package updates or semantic/API calls.
- Three restored-normal browser checks passed: main BTP CTA goes to `/my-account`, no prototype bridge remains, and F2 signing/sending is still OFF.

Normal preview is restored at **http://127.0.0.1:5173**, **PID25827**, start **1 November2026 17:17:39 IST**, API8788, `VITE_DEMO_BUILD=1`, prototype opt-in absent. Exact current handle/log: `artifacts/f3-account/mode-handoff/result.json` and `normal-vite.log`. Read-only5174/PID96560, prototype gateway59588/PG58162, P30 gateway90268/PG89891 retain identical before/after start-command identities. The owned prototype public handle is gone; its old stale record is archived. No backend service restart occurred.

## Changes, preservation and remaining boundary

New code is under `src/account/`, `src/pages/MyAccount.tsx`, focused account fixture/test and the capture/browser/finite frontend-handoff tools. `preservation.json` and exact diffs record only authorized existing-file edits: main lazy route; one package shots script; scoped Landing/Purchase/Buy links; exact frozen-route test additions; and one shared RPC URL check correction. That correction accepts the browser’s standard trailing slash on the fixed root RPC endpoint by comparing normalized full URLs, without expanding the allowlist; a focused regression covers it. The initial browser mock caught this integration boundary before any live RPC request. The SDK/compiler/vendor/contracts/pins/lock, F1 global CSS/TierGrid/cx/tier data, proof JSON/generator, paused shell and all previous evidence remain unchanged. Earlier F2 results are historical; their current-handoff/source hashes naturally differ only for these approved scoped changes.

No external RPC was acquired and no private key file was read/exported/saved; no real wallet transaction, funding, mint, payout, lifecycle action, backend/SDK edit, commit, push, deployment or remote creation occurred. Fresh public endpoint availability, real wallet-extension account connection and current chain observations remain unverified; they are not needed to accept these mocked read flows or the actual isolated synthetic journey. A future real devnet execution still requires separate concrete owner authorization and newly reviewed F2 send/gate work. F2 remains OFF.
