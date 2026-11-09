# P30 read-only live profile and actual auth/read validation — 1 November 2026

Implemented the explicit read/auth-only frontend at **http://127.0.0.1:5174/p30-live.html**, separately from normal5173/API8788 and the controlled simulated entry. The default isolated constructor remains disabled and mock injection remains explicit. **Quote creation, unsigned preparation, durable purchase-attempt submission, wallet transaction prompts/sign/send and signature reporting remain false.** This checkpoint validates reads/authentication; it is not frontend purchase or full backend milestone acceptance.

## Readiness and process ownership

Actual requests began only after Origin's `coordination/reviews/backend-p30-running-readiness.json` and the matching backend `docs/P30_RUNNING_ORIGIN_HANDOFF.md` arrived. The frontend readiness helper independently checked the service record, exact reviewed executable SHA, gateway/PG command paths and starts, listener PIDs, fixed8791/5174 identities and disabled preparation/submission fields. The SHA is `9e30e9b010d9e156bc63e1a0298ef6948914b934481a0e05c97402693cb7ad96`; gateway90268 and PG89891 retained their original starts. No backend process was started, stopped or edited.

Port5174 was free before the owned frontend started. `tools/p30-readonly-preview.mjs` provides reversible **start**, **status** and **stop** commands, verifying PID/start/command/listener identity before signalling only its own frontend. A stop/start/status cycle was exercised after disposable validation sessions were closed. Final owned frontend is PID **96560**, started **1 November 2026,15:39:35 IST**, using `vite.p30-readonly.config.ts`. Its process handle and append-only log are retained; no request to take over another port/process is made.

Normal preview PID33218, start08:52:35IST, remains unchanged. Final HTTP200 checks passed for normal `/demo/accounts`, `/purchase`, `/purchase-preview.html`, and its served API setting remains8788. The5174 root redirects to the dedicated entry; normal app/fixture HTML routes return404 in that profile. Both53-file preservation manifests remain unchanged.

## Explicit live factory and page behavior

- `createLiveP30ReadOnlyAdapter()` uses a private live authority, fixed real browser fetch, exact Origin5174 and exact `/p30-live.html` path. It accepts no injected origin, transport, clock, environment activation or alternate API. A forged live constructor mode is rejected. The old no-argument constructor stays disabled; tests continue to use the separately identified mock contract.
- Existing bounded body/time/redirect handling, strict DTO keys, source-release→browser-npm mapping, authenticated wallet/session epoch, cancellation, cursor/cutoff limits and logout-revocation barrier are retained. The only read-contract refinement after real validation is404 classification: registered account/status detail routes report `record_unavailable`, while missing list/catalogue infrastructure remains `service_prerequisite`.
- The page subscribes to adapter state/epoch. Session changes clear rendered rows, selected detail and check times. It has manual session restore, read refresh, continuation, detail and sign-out; no wallet-login or financial-action UI. It never substitutes fixtures after an HTTP failure.
- Account rows show the **last observed** phase, recorded observation timestamp and age, independent trading setup/admission, and unavailable current observation where appropriate. The list also shows recorded checkpoint time/age even when empty, separately from when the browser last checked. It states that observations do not guarantee continuing ownership/current state/readiness. Unknown/partial coverage and history gaps are distinct from a completed checkpoint returning no rows. Failed refreshes keep prior rows explicitly labelled as the last observed result. Diagnostic evidence is collapsed.

## Actual5174→8791 validation

The full run's11check groups and22observed browser HTTP responses are in `artifacts/p30-readonly-live/actual/browser-results.json`. Additional native HTTP boundary assertions are in the runner. Source, readiness, cookie flag, sanitized request/CORS and strict DTO evidence is separate from mock results. Private keys/session-cookie values/CSRF values are not written into evidence.

| Check                                   | Actual result                                                                                                                                                                                     |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Fresh disposable login-only identity    | Exact off-chain UTF-8 login message validated against wallet/audience/Origin/challenge/nonce/times, then signed once in Node runner memory; login200                                              |
| Browser binding/session cookies         | Dedicated P30 names; HttpOnly, Path `/`, SameSite Strict; login binding consumed after success                                                                                                    |
| Missing auth and reload restore         | Session401 before login; session restored after reload without another signature                                                                                                                  |
| Strict owned/purchase reads and mapping | Empty own pages at lineage `b527c8cf-d7b3-452c-991f-1905b988bd1b`, revision3; complete immutable SDK source/npm tuple checked; ownership coverage partial, missing-history true, null scan cursor |
| Public A1 cross-owner detail            | 404; public target derived from its published receipt with SDK public-address derivation only; no owner identity/key/auth impersonation                                                           |
| Other missing status                    | 404; no durable purchase was created                                                                                                                                                              |
| Catalogue/action gates                  | Actual GET catalogue503 preparation-disabled; frontend quote/attempt methods refused without an HTTP POST                                                                                         |
| CSRF                                    | Missing/wrong CSRF logout403; current session stayed valid                                                                                                                                        |
| CORS/Host                               | Exact credentialed Origin/preflight accepted; wrong-Origin browser request blocked, native wrong-Origin403/no allow-origin, explicit raw wrong-Host403                                            |
| Logout/revocation                       | Valid-CSRF logout, cookie removal, session401 and replay of that revoked disposable cookie401                                                                                                     |
| Expiry                                  | A real wait past the120second login deadline rejected the expired browser login context with401; frontend session timer/epoch clearing also checked using a page-local advanced clock             |

Only test-runner tools create login keys. Fresh Ed25519 keys remain in process memory and sign only the rebuilt exact off-chain challenge; no real/user/P30-owner key files, seeds, transaction signing, RPC, funding, orders, SQL auth seeding or account-source seeding are used. The reusable restricted helper is in `tools/p30-login-only.mjs`, outside shipped source; there is no login bypass/private test key/wallet stub in the entry. Disposable sessions were explicitly revoked, including cleanup after the initial failed harness attempt.

The first run stopped because its wrong-Host probe used Fetch, which did not preserve the intended Host header. It is preserved in `actual-attempt-1/` and its log. The corrected raw HTTP probe returns403; this was a test-client correction, not a backend change. The completed full runner's exact source is retained at `actual/executed-runner.mjs`; its later mechanical extraction of the unchanged restricted signer is documented by the final source hashes.

After the full run, a targeted actual follow-up verified the final checkpoint-age display, refined detail404 code and sign-out. `actual-view-final/results.json` and final desktop/phone screenshots are separate. Both sizes passed automated WCAG A/AA checks and overflow checks, including320px; final desktop and phone screenshots were visually inspected.

## Mock and build checks

**46 focused checks pass:**9new factory/page tests plus37existing adapter checks, saved in `mock-results.json`. They distinguish default/mock/live constructors, test forged/wrong-Origin entry refusal, keep action gates false, validate partial versus empty and unavailable views, preserve a populated **fixture** after failed refresh, clear views on epoch change, format observation age and distinguish record404 from a missing list route. Populated rows and wallet/network callback scenarios remain mock evidence.

Production TypeScript/normal app build, separate read-only production build, both SDK integrity guards, scoped formatting and AST-only graph update pass. No old SDK/Journey/full browser campaign was rerun. Accepted interface, chart/account-update correction, demo separation, package/lock, SDK/vendor/pins and frozen declarations are unchanged. The original disabled entry and controlled fixture entry remain separate and unchanged.

## Remaining limits

The disposable wallet has **zero rows with partial coverage**. This does not test a populated real dashboard, positive account-detail DTO, owner-authenticated A1, actual purchase, durable attempt persistence or continuing/current ownership. Actual multi-page populated history is not available to this identity; cursor/cancellation behavior remains focused mock evidence. A1 was used only for denied access.

The120second expiry result is an expired browser login binding/challenge-context check; their TTLs elapse together, so server challenge-row expiry was not independently isolated from browser binding expiry. The one-hour server session expiration was not waited out. Its frontend timer was tested against an actual session DTO with a page-local clock change. Real wallet-extension/network-change integration is not present; the adapter callbacks are tested separately. The shipped read-only page restores an existing reviewed session and deliberately has no wallet-login prompt.

Historical A1 phase2/status0, if eventually viewed under legitimate ownership, must retain its recorded time basis and cannot activate a quote. No fresh acquisition, quote/blockhash/token-state admission, purchase wallet flow, transaction, executable trading, payout/scaling/lifecycle behavior, deployment, backend/SDK/contract-source edit, remote creation, commit or push is included.

Evidence/source hashes and preservation checks: `artifacts/p30-readonly-live/validation-summary.json`. Prior current handoff is preserved under `before/docs/ORIGIN_HANDOFF.md`; earlier milestone/correction/adapter reports remain historical. Current read-only frontend handle is left running for Origin review, with disposable browser sessions signed out.
