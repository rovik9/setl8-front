# Genuine devnet frontend checkpoint — 3 November 2026

Status: frontend history, bounded order review and exact-intent recovery are implemented and checked. **Actual end-to-end execution/settlement for a newly owned account is not complete or claimed.** Execution context reads, wallet order signing and order submission remain source-controlled OFF. Purchase/funding gates are unchanged and OFF. Origin coordinates the separate backend/SDK/signer/verifier work and any later service activation.

Evidence directory: `artifacts/presentation-journey-2026-11-02/` (named for the start date). This is a separate checkpoint; accepted milestone, account-update correction, recorded-candle, wallet-login, dev3000 and funding reports/evidence remain historical.

## Delivered behavior

- `/my-account` adds an evidence-based journey from actual session wallet/account observation through receipt, journal, claim and settlement. Local purchase recovery or elapsed pass timestamps never become verified ownership, queued claim or paid settlement. Public A1 history is separately linked.
- `/devnet-history` binds the approved A1 DTO to independently checked archived receipts, public identities and exact transfer arithmetic. All five transaction links remain public Explorer links; the page itself makes no chain requests or transactions. It explicitly separates A1's trader `7urBRSkXz6jAoz7j4QnVjgWWVLUxV6nzjZxNEWhxkLeF` from J95 or the signed-in user's new account. Amounts display six exact decimal places: **200.000000 test USDC**, before **99,933.736000**, after **100,133.736000**. These are historical transaction balances, never a current wallet balance.
- `/devnet-terminal` consumes the separate genuine-devnet DTO behind closed activation gates. It uses the immutable dev4 SDK's pure 48-byte order/93-byte message codec with the genuine P30 account's actual address bytes, without a localnet context/PDA factory. The finite scope is one BTC Market and one whole Close. Limit/Stop, partial exits, SL/TP and lifecycle submissions are outside this scope.
- New actions require explicit `publication_compilation: reviewed_ready`, actual account/source admission, exact authenticated trader identity and healthy canonical worker evidence. A pending, unknown or blocked publication prevents replacement. Close requires the prior processed prefix and finalized sequence/hash to match the canonical evaluator head in both context/ledger evidence. Separate HTTP reads are not described as an atomic database snapshot.
- Source/provider time, verifier receive time, backend receive/time, backend-declared source/chain ages and continuously increasing browser wall ages remain distinct. Signable backend wall second and canonical actor clock are shown separately. Exact source ns is compared to exact backend wall ns, so a source within the current second is not rejected merely because signing uses whole seconds. The signable second must match this context's backend wall second. The visible review budget expires after five seconds; no pause, hidden retimestamp or silent re-sign exists.
- Session changes abort read/receipt operations and prevent stale reviews from being applied. Field changes invalidate an in-flight review. A signature returned during a wallet/session change is retained under its original identity before any forwarding decision.

## Durable intent recovery

`src/devnet/intentRecovery.ts` retains exact public account, nonce, order, canonical message and returned signature under separate genuine-devnet wallet/account keys. Each exact signature has an archive entry. Auth cookies, CSRF/login messages and keys are not stored there. Local records are recovery material, not independent financial evidence; backend signature/ownership validation remains required.

The initial explicit submission persists `uncertain` before forwarding bytes. Storage failure prevents forwarding. Network loss, cancellation, 401, 409 or 503 does not free the reference. No automatic resend or nonce allocation exists. An uncertain record blocks another signature and cannot be retired as unsent. Receipt recovery is **GET only**, with exact account/nonce/order/signature/input-hash/sequence binding; it cannot restart publication after a finite grant expires. A 404 leaves uncertainty rather than proving absence. A late original response may archive its original evidence but cannot overwrite a newer account-local recovery record.

An explicitly stale signature that this app never forwarded may be retired locally, preserving its archive. This does not revoke a public signature. Re-review/re-sign remains explicit, and canonical acceptance/freshness limits are independently enforced by the backend. All actual sign/submit controls are disabled until a concrete reviewed wallet/account grant is configured.

## Genuine archived settlement verification

`tools/verify-day2-history-offline.mjs` ran successfully against Origin's existing public archives, with no new RPC. It checked 14 raw response hashes, both operators' genesis/finalized successful statuses, all five transaction packets/slots/signatures and program/discriminator origins. It verified the exact direct vault → classic SPL `TransferChecked` association, source pool, mint, recipient ATA, authority and token pre/post arithmetic.

The 200,000,000 micro-USDC transfer belongs to A1 `A3ncHBKQRrRNKVaeH9WuhMmwZ22BNoKyeCFsxK6ZwpvU`. Full typed claim fields/closure remain unverified; two named operators do not establish infrastructure independence. This historical transfer proves neither J95 ownership nor a newly executed app transaction. No A1 finalize/settle action was replayed, and no extra funding is proposed.

Important provenance:

| Item | SHA-256 |
| --- | --- |
| Origin reviewed receipt result | `a0a2dac9a04b1c430b5bbfd993b062de2f7107abbdafcb0e6b17cea905fa7566` |
| Origin finalized-settlement review | `a9e223d35246ba00db34a29056f0260dbd1a135085dffd4650570a98bf3613cf` |
| Exact concrete history DTO | `fd178332f04a1b25748e1e4bd55094d0eb42b53d2a6a4b56965bb5352167852f` |
| Frontend independent offline verification | `504dbe289feffc6b929e74d29391a06a85b6d98e0a4c4c451a41d242e2ba8c49` |
| Current copied execution declaration | `cebca4b96040da19e1b18556a82d8a003c89a9ffb1fae37193d7203110642d95` |
| Current copied history declaration | `bb2093331cddb04656a96d088ed73db3ffee12d277298526eba6ab8f074dd62f` |

Declarations exactly match the backend's read-only source files. The originally approved history declaration `f8cf7171041ceaf6fa375945d847a26f72ac7ce651e060a15496d839bd76c6b9` is separately preserved; the later change only describes route implementation/activation in comments. Actual DTO/interface fields are unchanged. The local artifact remains the history page's source until the authenticated route is deliberately activated.

Origin approved the separate SDK dev6 action package for additive backend/signer implementation on 3 November. This frontend does not need that transaction builder for pure order messages and has not changed dev4/dev5 dependencies, pins, vendor/runtime or package lock. SDK structural checks do not independently attest economic replay or grant signing authority.

## Validation and screen inspection

| Check | Result and evidence |
| --- | --- |
| Final changed execution/recovery guards | **34 tests passed**, `wall-clock-tests.log` (two files). Covers actual account bytes, default gates, source ns/whole-second boundary, worker/publisher blocking, exact finalized head, stale wallet time, retained signature after session switch, storage failure, duplicate prevention, 401/409/503, uncertain 404, exact GET recovery, corrupt payload/receipt and late responses. All transport/signatures in these tests are controlled fixtures. |
| History/journey/original proof | **21 tests passed**, reused unchanged from `recovery-tests.log` (which passed 53 tests before two added guard cases). Includes negative transfer/identity/evidence binding and the narrow original Router regression repair. Combined current distinct execution/recovery/history/proof coverage: **55 tests**. |
| Production build | **Passed**, `checkpoint-build.log`: TypeScript, production Vite and both immutable SDK guards. Dev4 archive/three selected files and dev5 archive/descriptor/79 installed files remain unchanged. |
| Archived chain verification | **Passed**, `day2-offline-verification.log`; genuine previously acquired public receipts, zero new network requests. |
| Actual local app, guest/read-only | **8 checks passed**, `read-ui-final/results.json`: actual normal localhost3000 UI at 1440×1000 and 390×844, history/desk/MyAccount and absent practice route. No API response mocks. Zero POSTs, external/chain or candidate execution requests; no page errors or horizontal overflow. Exact historical balances asserted. |
| Signed-in recovery screens | **Passed**, `recovery-ui-final/results.json`: controlled backend/session/context/ledger/receipt responses with a conspicuous fixture banner. The test browser alone overrides the delivered read flag; source files/sign/submit flags remain closed. Two manual GETs per viewport: missing receipt retains uncertainty, then exact receipt resolves. Zero POSTs/external requests/page errors/overflow. This is not an actual enrolled account, wallet approval or gateway execution check. |
| Visual review | Inspected final history desktop/phone and recovery desktop/phone screenshots; corrected panel padding and phone source/timing wrapping. Original earlier screenshots/results are retained separately. |
| Preservation | `preservation-audit.json`: all 73 final funding entries unchanged; historical manifests unchanged; prior current handoff archived; original proof/order ticket/active stylesheet, purchase compiler/recovery/gates, package/lock, account-update and candle data/hooks unchanged. |
| Knowledge graph | `graphify-final-update.log`: AST-only local refresh, no LLM/API cost. |

The earlier failed TypeScript/Router/fixture-runtime attempts remain in their original logs. They are superseded only by the explicitly named passing checks above. The initial practice implementation is preserved under `practice-suspended/` and inactive source modules; no practice route or active approved order-ticket dependency remains. Minor unused generic chart-point support and workspace context exports are preserved; their existing callers retain their prior behavior. Unused practice styling was moved out of the active stylesheet.

## Local process ownership and remaining work

Actual app and existing backend readiness returned HTTP200. Frontend process83817 belongs to `frontend-a435b87f-2b6a-423e-ac9f-44faabda7702`. It borrows gateway53119 and PostgreSQL53107 from original owner `frontend-ab63d8fd-a692-4f45-b009-0f91cd82263c`. The running old gateway image is `566e6946f1786e9e63c7af9109180b75454580f66801f88055aadff7c2916080`. The earlier dead frontend record was archived and normal `npm run dev` restored, without touching the borrowed API/database. No backend process was stopped, built or restarted during this checkpoint. Current backend sources are newer than that image; the freshness guard is preserved.

Remaining prerequisites are the reviewed backend's genuine genesis/config/source admission and prepared journal producer, signer policy/authority handoff, bounded source acquisition and a coordinated service rebuild. A separately approved read activation must then be checked against the actual routes with a disposable mock wallet. Human owner wallet approval, a new actual devnet intent, canonical execution, finalized publication and a new account's lifecycle/settlement have **not** been exercised by this frontend checkpoint. A newly purchased account's pass/payout timing and market movement cannot be promised by this UI; operator lifecycle authority remains separate.

No backend/SDK/contract-source edit, authority or funding key access, new chain/RPC campaign, transaction, purchase-grant renewal, deployment, remote creation, commit or push was performed. No operational GO is implied by this report.
