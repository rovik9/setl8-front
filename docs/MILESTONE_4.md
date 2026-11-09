# Frontend M4 — isolated synthetic trading prototype

Completed locally on 2026-10-26, Asia/Calcutta. Work is confined to `/Users/rovik/Documents/setl8-front`. Origin accepted M3 and reviewed backend M6 before authorizing this integration. Read-only references: backend `docs/PROTOTYPE.md` and `docs/MILESTONE_6_ORIGIN_HANDOFF.md`. No backend source/config/SDK/vendor/contract edit, setup/build, migration, service restart, source database mutation, production signing or chain transaction was performed.

## Runnable entry point and active session

```sh
cd /Users/rovik/Documents/setl8-front
npm run prototype
npm run prototype:status
npm run prototype:stop
# After stopping the prototype frontend:
npm run dev
```

The launcher opens an interactive headed Chromium window and leaves it usable; it is not only a closing test. See `PROTOTYPE_FRONTEND.md` for the full Market/Close walkthrough and recovery limits. Startup initializes only a newly generated public trader identity through the reviewed guarded CLI; its private key stays in the controller's process memory. The live session identity and log directory are recorded separately in `artifacts/milestone-4/validation-summary.json` and `.local/prototype-session.json`.

Frontend **127.0.0.1:5173**, prototype gateway **127.0.0.1:8790**, prototype PostgreSQL **127.0.0.1:55450**. Source gateway **8788 / PID 50081** and source PostgreSQL **55438 / PID 94665** remain untouched. Existing prototype gateway **PID 59588** and PostgreSQL **PID 58162** were reused without restart. The launcher checks the reviewed executable SHA-256 **`53a3c64e017e41e593a19a487b4f91f6ee080e688730b47586fffface7836f8b`**, fixed configuration and process record; it uses no Rust build/cache regeneration.

## Scope and authority gates

Synthetic actions require all of: exact URL `http://127.0.0.1:8790`, explicit development opt-in `local-synthetic-v1`, exact Origin `http://127.0.0.1:5173`, and the launcher-owned bridge in its one selected page. URL aliases/trailing slash, opt-in absence, wrong origin, default/demo scopes, wrong account/wallet/session/gateway/market and unsupported executable kinds/fields are rejected. The opt-in browser excludes real wallet providers. Normal frontend entry points and M3 unsigned previews remain available; default connected signing/submission remains disabled even if a page/backend claims readiness.

The visible simulation banner and profile labels distinguish manufactured fixture execution from live/deployed behavior. A browser binding, rather than an operator HTTP endpoint, connects only that launched local page to the CLI controller. Public account, wallet and clock metadata are exposed; the key is not. Login signing is restricted to the exact prototype challenge observed from the gateway for this disposable wallet. Order signing independently decodes and rebuilds the SDK message from the inspected bytes, validates account and nonce, requires market 0, current staged synthetic time and supported Market/Close, and checks the displayed decoded fields too. The trader key signs the account-bound message; there is no generic real-authority signer.

The SDK remains **0.1.0-dev.4 / setl8-sdk-dev-v1** with archive SHA **`5acde8df3fc4be31dbcb80106b7a7d491a5e60bd8d37d67da62dda0d19e33fbd`**. Both app and local controller reuse its verified unchanged order module. The Node 22 launcher translates just the two TypeScript modules into session-local JS using its built-in experimental type transform; no Rust/SDK campaign or dependency installation is needed. No canonical binary encoding was hand-written.

## Signing, receipts, retry and evidence

Prepared fields remain exact strings/BigInt. Explicit account confirmation, developer nonce and synthetic-clock selection remain required. Market uses price=0; Close is prototype-only, side=0, qty=0 for the whole position and zero price/SL/TP/target nonce. M3 Limit/Stop/protective previews remain intact but are not admitted as executable prototype orders. Recorded chart prices never supply execution authority or draft prices. The controller manufactures labeled samples through `advance`; no provider/live stream is admitted.

After inspection confirmation, the app requests a disposable signature over the exact reviewed message. It freezes one `{nonce, order, signature}` body in memory. Authenticated credentialed POST includes the current session's CSRF header. Duplicate-click guards allow one active sign/submit; exact retries preserve the same bytes/signature. A timeout/network/uncertain response keeps that payload for deliberate reconciliation. Nonce status alone is not payload confirmation; an identical POST is. 409 is displayed as conflict, not a new nonce allocation. 401 clears material and existing auth isolation clears the workspace.

Field/account/wallet/profile/session changes dispose prepared/signed state, abort obsolete requests and ignore delayed completions. If a submitting/uncertain payload is discarded, a public nonce warning says it may have committed and requires inspection; it does not silently recreate bytes/signatures or choose a nonce. Client material is memory-only, without a local/session-storage draft cache. Backend persistence of canonical signed synthetic inputs is intentional and separate from client retention.

Receipt `received`, supported execution evidence and unavailable full outcomes/finality remain distinct. Only explicit local evaluate buttons invoke tick/drain/work. Explicit recover compares canonical replay; no lifecycle, purchase/reset, payout/scaling, signer/verdict service or chain submission is inferred.

## Origin review correction: reload synchronization

Origin correctly identified that the initial injected metadata could be stale after navigation/reload. The page now performs a **bounded read-only controller bootstrap** on every provider mount. The launcher binds `readInfo` only to its own page/main frame and exact Origin; it returns the current public `session.info` snapshot. It does not sign, initialize accounts, allocate nonces or invoke CLI operators. Identity fields must match the injected session; clock/phase must be in the reviewed range. Timeout is three seconds.

Synthetic ticket scope stays disabled until synchronization succeeds. Timeout, missing/invalid metadata or identity mismatch fails closed and exposes explicit “Resync controller info.” Late results are ignored. Resync clears the old synthetic scope rather than reviving a draft/signature. The controlled provider test demonstrates disabled actions after timeout, no late application, and explicit successful read-only resync without any signer/operator call. The final actual browser scenario reloads after a completed open, verifies fresh phase/clock and cleared form/material, then successfully closes. The earlier actual success did not establish reload correctness and is preserved separately.

## Actual browser-to-gateway-to-evaluator result

Successful independent evidence: **`artifacts/milestone-4/real-prototype-1792978819211/results.json`**, operator logs and desktop/phone screenshots in that directory. No successful API response was intercepted. The test used one fresh disposable account **`f6072a084ce658255c0ee474f589c8334ed570b2db5a4587b681b680711a5f82`** and actual authenticated prototype APIs.

Seven check groups passed:

1. Real browser challenge/signature login, HttpOnly prototype cookie, no default-profile cookie and no real-wallet choice.
2. Exact inspected Market signature, CSRF/authenticated durable receipt, and identical retry with matching request-body SHA-256. No resigning occurred for retry.
3. Guarded advance/tick/drain/work produced a persisted **1000000 qty** position (one base unit), visible account update and supported `executed` intent evidence. Manufactured input was USD 60000; the existing runtime's stored entry is USD 60006, including its canonical treatment rather than a frontend quote assumption.
4. **Reload after open/evaluate** reads current controller metadata, displays `evaluated-open` / `1791813601`, clears nonce/quantity/account confirmation and prepared/signed bytes, and performs no intent POST. A subsequent Close succeeds.
5. A different validly signed Close using nonce 1 received the actual backend nonce conflict. Nonce 2 was explicitly chosen afterward.
6. Close on a **390×844** phone viewport produced empty persisted positions, **two journal batches (journal sequences 3 and 6)**, `executed` evidence and `chain_finality=unavailable`. Canonical recovery ran successfully. Seven retained replay/state fields—including balance, journal hash/sequence, flatness, closed count and positions/pending—match independently in `replay-comparison.json`.
7. Explicit logout returned a subsequent 401; no browser storage, source-8788 request or page error occurred.

The flow also used desktop **1440×1000**. Final persisted balance is **100019975002 micro-USD**, flat with one closed trade; this is a manufactured historical-clock fixture result, not investment performance or current-market compatibility. Receipt acknowledgement alone was never used as proof of evaluation.

Failed development attempts and partial directories are retained, not labeled passing. One byte guard rejected a controller reconstruction that initially used the trader key in the account slot before signing/POST; this was corrected. A later full open/close flow failed only a hard-coded UI journal-number expectation; the assertion now uses the returned canonical sequence. Earlier harness/compiler/import failures are also retained. Failed synthetic accounts/history were not reset or deleted. The final successful session was explicitly logged out, and current runner shutdown also attempts scoped logout before closing its own context.

## Controlled checks and preservation

- **108 targeted unit/component checks passed** across eight files: 24 M4 profile/submission/bootstrap checks plus 84 accepted relevant draft, auth, account-update and candle/navigation checks. Controlled cases cover exact URL/opt-in/origin gates, default/backend-claim refusal, prototype-only Close, field/scope restrictions, inspected signing, immutable retry, coalescing, lost-response reconciliation, 409/401 behavior and disposal of pending work with public nonce warning.
- **22 targeted desktop/phone browser checks passed** before the reload correction; **two focused normal-mode desktop/phone rechecks also passed after it**, including a spoofed prototype bridge in normal mode that exposes no simulation banner, Close or synthetic actions, zero normal-mode signature/POST calls, M3 opening/protective drafts, keyboard/phone/Axe/reduced-motion behavior and relevant account/chart regressions. These use controlled read/error transports and are separate from the real prototype result.
- Production TypeScript/Vite build, SDK integrity, formatting and AST-only graph maintenance passed. Full stdout/stderr is under `artifacts/milestone-4/logs/`; counts/source hashes are in `validation-summary.json`.
- **133 historical report/evidence files** remain byte-identical. Accepted SDK package/archive and API declarations remain unchanged. Existing account-update and fixed-cutoff chart mechanisms were preserved; staging only refreshes the recording directory so newly manufactured streams become explicitly selectable.

Unrelated full campaigns were not rerun. Real uncertain-network loss is not claimed: controlled tests cover it; actual browser evidence covers real receipt/retry/conflict and supported evaluation. No real extension wallet, physical phone, deployed-chain, load or live-market compatibility is certified. Earlier pre-reload-success evidence remains at `real-prototype-1792977789012/`; its report/handoff/replay comparison were archived separately before this correction.

## Ownership, storage and remaining limits

`launcher-lifecycle.json` records a headed launch, refusal of an occupied 5173 without touching its owner/record, verified PID/start-command shutdown, freed frontend port, and all four source/prototype backend listeners unchanged. A fresh headed session was then started and left running. Stop affects only its owned frontend/controller/browser; backend services remain running. Stale ownership or failed shutdown requires inspection rather than killing an unrelated PID. No public HTTP operator API, recurring price pump or automatic worker was added.

An initial script write hit ENOSPC. No frontend evidence or broad caches were deleted. Origin reported recovered capacity; subsequent storage was checked before browser work. Launcher startup now refuses below 256 MiB free, before fixture initialization. At final inspection approximately 25 GiB was available. No Rust setup/build/cache recreation occurred.

This is an opt-in developer harness, not a production signing boundary. The backend's reviewed resource limits remain explicit; interruption or a bound requires operator review, never history truncation/reset or a runtime workaround. The combined runtime/SDK, live admission, complete outcomes, nonce allocation, retention/checkpoints, production signer/verdict/finality and reviewed lifecycle interfaces remain unavailable. No production deployment/publication, real funds/keys, real chain transaction, remote creation, commit or push occurred.
