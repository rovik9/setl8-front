# Frontend pipeline candidate — 3 November 2026

**Status: functional UI hookup implemented, activation OFF, integrated gateway/chain acceptance pending.** This candidate follows the separately sealed history, fixed-stage and armed-quantity checkpoints. It does not claim a new actual account, execution, finalized journal or payout.

## Connected behavior

- Checkout consumes its already retained, exact public purchase signature in a separate verification panel. The offline mock checkout is excluded. Observation can start after an eligible broadcast/verification stage without an execution context. A signature retained before broadcast remains explicit recovery material; another payment is never inferred.
- The terminal resumes the original purchase job and prepares the selected Market or whole Close source through the exact authenticated job routes. Stable request IDs bind wallet/account/stage/purchase signature; reloads, expiry and unknown outcomes do not create a fresh acquisition namespace. Source preparation requires verified genuine account admission, reviewed publisher, authoritative fixed-stage history and local recovery. It deliberately does not require the market sample or trade-ready state that the job itself creates.
- Signing/submission still require actual fresh source/clock, armed quantity and fixed Market1/Close2 policy, exact history and finalized predecessor checks. The approval control now says **Approve and submit reviewed order**: once a future exact grant is enabled, the returned signature is retained first, checked against fresh policy/context, then forwarded once. Changed review/session, stale time or uncertain send cannot silently re-sign, substitute a candidate or retry. Exact recovery remains read-only after forwarding.
- Original request and job progress survive reloads under wallet/request keys. Uncertainty cannot regress to “not started.” GET polling is bounded to 12 reads with a 90-second loop budget and 8-second request deadlines; completed/blocked/unknown states stop the automatic loop. Cached completion does not repeatedly refresh the terminal. Job progress/subject is not ownership proof. Source preparation completion is not continuing freshness or trading authority.
- An accepted intent starts bounded context/ledger reads for up to 90 seconds. Receipt, canonical execution, publication and finalized head remain separate. Current worker evidence remains authoritative; no simulated fill, committed preflight event or outcome API is introduced.

The copied job and execution declarations exactly match the backend source at this checkpoint: chain evidence `aa55f119d449306a33c45ef0afc90d0ff99afd1f2973b8c0d732935f038bee6e`; execution `3503a9e10107458d51e396e36a458b022d29995ce4b2070a38d5a2be35733d86`. No backend/SDK/contract-source change or dependency update was made.

## BTC / ETH / SOL presentation scope

Only BTC, ETH and SOL receive chart focus. Other catalog assets can remain listed; selecting them shows chart unavailable. ETH/SOL selections require actual persisted history, including in preview/demo selectors: no generated ETH/SOL candle or price is substituted. BTC's explicitly illustrative preview stays separate from connected recorded charts and the genuine devnet execution desk.

Connected quotes and candle pages must match the selected asset, market ID, source and feed. Catalog changes cancel/remount the old identity scope; an old BTC response cannot be relabeled ETH. Unknown/mismatched identity shows unavailable. Exact prices/timestamps, fixed-cutoff loading, coverage/provenance and explicit fit behavior remain in the existing recorded-history components. ETH/SOL execution remains unavailable under the BTC-only run policy. No provider or Pyth integration, acquisition campaign or fabricated volume was added.

## Focused validation

| Area | Passing evidence |
| --- | --- |
| Pipeline, gated render and preparation ordering | 32 tests across four files, `artifacts/pipeline-ui-2026-11-03/final-tests.log`. Includes absent execution context for purchase, absent source for preparation, exact recovery, cached completion, uncertainty, wallet cancellation and default gates making zero HTTP calls. |
| Submission ordering and recovery | 25 tests in `submission-tests.log`; the same five submission-ordering cases (included in the 25) are confirmed by `submission-ordering-final-tests.log`. Covers fresh policy/source, slow wallet time, unchanged signing bytes and rejection of candidate substitution before POST. |
| Asset identity and chart navigation | 13 distinct checks: 11 current selection/identity renders in `artifacts/chart-scope-2026-11-03/acceptance-tests.log`, and two unchanged navigation/recorded-only plot checks in `identity-tests.log`. |
| Current production build and SDK guards | `artifacts/pipeline-ui-2026-11-03/sealed-build.log` passes TypeScript/Vite and immutable dev4/dev5 checks; formatting passes. |
| Local knowledge graph | `sealed-graph.log`, AST-only; no API cost. |

All 70 distinct affected checks above are controlled frontend tests. They are not actual gateway, provider, wallet, evaluator or chain execution evidence. Earlier failed test/typing attempts remain in their original logs. The prior 49 fixed-stage campaign was not rerun. No new broad browser campaign or PPT screenshot set was started; actual integration screenshots are deferred until the backend/signer candidate is accepted.

## Preservation and next acceptance step

Separate current evidence is in `artifacts/pipeline-ui-2026-11-03/` and `artifacts/chart-scope-2026-11-03/`. `changed-files.json` records the exact changed-file hashes, and `review-source/` preserves those bytes. The original 250-entry checkpoint and all 73 funding evidence entries remain unchanged. Original reports, proof JSON, wallet/purchase compiler/recovery, account-update correction and historical evidence are preserved. The current source changes are frontend UI/data guards only; previous snapshots remain historical.

All execution read/sign/submit, job read/trigger and purchase/funding gates remain OFF. No authority/funding key access, chain/provider request, transaction, backend/service management, deployment, commit or push was performed. Existing local service ownership is preserved; a separately recorded read-only readiness snapshot is not an activation or gateway feature test.

Next: Origin accepts the integrated backend/signer/verifier candidate and supplies the controlled owned build/start handoff. Then check the actual authenticated purchase/source/job routes and retained wallet isolation with a disposable mock wallet, capture a concise BTC workflow desktop/phone set, and review any exact human wallet/authority grant separately. ETH/SOL actual persisted history availability, actual owner signing, new account execution/publication and lifecycle/settlement remain unverified.
