# Finite public A1 network read — 1 November 2026

The actual normal5173 browser read stopped on **OnFinality HTTP429 after four JSON-RPC requests**. No retry, polling, alternate endpoint, wallet connection, simulation, signing or transaction occurred. The ten-request budget was respected; optional A1 reads were not used. No successful response was intercepted or replaced.

| # | Fixed endpoint | Method | HTTP | Observation |
|---|---|---|---|---|
|1|api.devnet.solana.com|getGenesisHash|200|Expected devnet genesis|
|2|solana-devnet.api.onfinality.io/public|getGenesisHash|200|Same expected genesis|
|3|api.devnet.solana.com|getMultipleAccounts|200|Wallet profile at finalized slot517487933|
|4|solana-devnet.api.onfinality.io/public|getMultipleAccounts|429|Stopped immediately; no Retry-After header was exposed|

An independent offline decode of response3 checked program owner, trader, wallet-profile PDA/layout and exact next_challenge_id=1 for public wallet `7urBRSkXz6jAoz7j4QnVjgWWVLUxV6nzjZxNEWhxkLeF`. The second operator’s profile read was denied, so the dashboard did not apply a paired account observation. **A1 trading-account state, current rules/config and payment remain unverified.** The visible state honestly asks the user to wait; no empty-account or completed-payment inference was made.

Evidence in `artifacts/f3-network-read/`: exact request methods/parameters/status, public200 raw bodies and SHA256 hashes, observed slot/decoder checks and before/after process identities in `results.json`; `ACTUAL-PUBLIC-DEVNET-READ-DESKTOP.png` inspected and visibly classified as an actual public read attempt, not authenticated ownership/payment; `visible-public-state.txt`; one-attempt script/marker/log. The429 response body was aborted by the client’s stop path and unavailable to Playwright; its body hash is explicitly null with the capture error, not invented. No second acquisition was made to obtain it.

All normal/readonly/prototype/P30 service identities remained unchanged. This is a factual public-endpoint rate-limit blocker, not an SDK/owner-wallet absence or an empty-data result. Future network verification needs a separately scoped permitted request window or owner-approved endpoint/access decision; this run did not alter endpoints or permissions.

At this checkpoint owner checkout still needs the default-OFF live sign-only/single-send implementation and exact-message advisory simulation path completed/reviewed, followed by concrete activation authorization, fresh current terms/program/config/token/fee/rent checks, and an owner-controlled Wallet Standard signTransaction devnet wallet with existing funded devnet SOL/test-USDC/source and destination accounts. No private wallet access is needed from the implementation agent. The separately dispatched checkout code-readiness work follows with offline validation only; real activation and wallet prompts remain unauthorized.
