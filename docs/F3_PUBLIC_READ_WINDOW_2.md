# Public A1 read — manual window2, 1 November 2026

**Partial public-profile success; the trading-account/config observation did not complete because of a local capture-harness race.** This was one separately authorized manual window, with max6 actual JSON-RPC requests and global forward spacing of at least1second. It was not an automatic retry of window1. Public sign/send remains OFF; no wallet connection or authority was assumed from A1.

The production `/my-account?wallet=7urBRSkXz6jAoz7j4QnVjgWWVLUxV6nzjZxNEWhxkLeF` reader ran once on normal5173 in a fresh controlled Chromium context, polling OFF. Four requests were forwarded, all HTTP200:

| #   | Endpoint                               | Method                              | Actual observation      |
| --- | -------------------------------------- | ----------------------------------- | ----------------------- |
| 1   | api.devnet.solana.com                  | getGenesisHash                      | Expected devnet genesis |
| 2   | solana-devnet.api.onfinality.io/public | getGenesisHash                      | Same expected genesis   |
| 3   | api.devnet.solana.com                  | getMultipleAccounts, wallet profile | Finalized slot517566897 |
| 4   | solana-devnet.api.onfinality.io/public | getMultipleAccounts, wallet profile | Finalized slot517566903 |

The saved profiles match in every field. Their shared production-relevant projection and pinned SDK decoder establish the public WalletProfile’s program owner/trader/PDA/layout and exact next_challenge_id1. This is a paired public profile observation, not authentication, payment verification, a checked trading account or readiness to trade.

Actual start2026-11-01 17:17:22.156UTC; finish17:17:27.799UTC (22:47IST). Minimum measured forwarding interval1001.736ms. Exact method/parameters/status/request hash/response hash, public raw responses and paired profile decoding are recorded in `artifacts/f3-network-read-window2/results.json`. No403/429/Retry-After or endpoint network failure was observed in those four forwarded requests.

## Local capture failure and stop

The fifth production account request was **aborted locally before forwarding** by the capture harness’s scope guard. The guard depended on its own asynchronous recording of the previous profile responses. The production reader had received and consumed the successful pair while the forensic capture was still awaiting response-body/file recording; the guard evaluated that recording map too early and rejected the valid dependent request. The user-visible result was Failed to fetch.

This was the implementation agent’s harness error, not evidence that either endpoint refused the account request. No account/config pair reached the endpoints, so A1 trading-account fields/current config/rules remain unverified. No response was replaced or mocked. The run stopped with two budget slots unused; there was no retry, optional A1 read, alternate provider or further acquisition.

The used script/result/screen are preserved unchanged. A separate corrected capture script awaits existing capture tasks before dependent scope evaluation and compares the same projection as production; it was syntax-checked but **NOT EXECUTED**. An offline regression using only the saved four public responses reproduces the incomplete-recording rejection and confirms the corrected completed-capture guard. Evidence: `capture-guard-offline-regression.json` and `corrected-capture-NOT-EXECUTED.mjs`. Another acquisition requires a distinct explicit authorization; none was inferred from unused budget.

## Preserved state and documentation

One actual screenshot was inspected: `ACTUAL-PUBLIC-READ-WINDOW2-DESKTOP.png`, visibly labeled actual public read attempt with no ownership/payment/trading-readiness claim. Production source hashes, normal5173/PID25827 and readonly/prototype/P30 process identities are unchanged. No checkout/preflight, image fetch, simulation, wallet action, chain submission, funding, synthetic fixture, service restart, commit, push or deployment occurred. Earlier window1 and operational-correction evidence remain unchanged except the separately authorized current owner-document correction.

`docs/OWNER_DEVNET_CHECKOUT.md` step4 now states the actual order: pre-wallet revalidation → durable public attempt → unsigned simulation → wallet → copied/verified/durable signature → post-wallet revalidation → signed simulation → local guards/send. It no longer suggests a fresh full check after either simulation. Its access wording points to separately recorded windows rather than claiming no later probe. Exact before/after diff and hashes are preserved here.

Stable normal URL: `http://127.0.0.1:5173/my-account`. This partial window does not provide live/execution acceptance or ownership authority for A1 or the user’s eventual public wallet.
