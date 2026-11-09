# Wallet sign-in and dashboard correction

Completed 2026-11-02 in `/Users/rovik/Documents/setl8-front`. This is a separate correction record; previous milestone, account-update, chart, checkout and funding reports/evidence remain historical.

## Result

Connect wallet is visible on the Landing, Buy and My accounts headers, including phones and browsers with no wallet provider. The existing chooser explicitly explains that the in-app browser cannot use a Chrome extension and offers supported providers or honest unavailable/help states. A missing Phantom button explains: “Open this page in the browser where Phantom is installed.” No wallet is connected or installed automatically.

The existing AuthProvider/SessionManager now shares the connected Wallet Standard account with checkout. Login uses the exact server nonce message, signMessage, credentialed requests and HttpOnly session. Signing in spends no tokens and leaves private keys in the wallet. The first successful login is wallet identity onboarding; an on-chain challenge profile requires a separate purchase.

My accounts defaults to the authenticated server-session wallet without a paste step. Logout, expiry, account/network change or changed server session clears and cancels the owned view and purchase review. A public-address explorer remains an explicit secondary, read-only view; entering an address never authenticates or enables payment.

Buy requires the authenticated wallet and the same connected devnet transaction signer. It adopts an already connected account without another connection prompt. Restored cookie sessions can adopt an already authorized matching provider; message-only/unsupported providers can sign in but cannot purchase. Sign-in never submits a payment. There is no manual transfer/recipient/signature-claim payment path.

## Origin review correction: signature recovery

`src/buy/sessionSigner.ts` retains the pre-sign session guard. If session/account validity changes during a pending wallet approval, it copies the returned bytes, synchronously invalidates PurchaseFlow's epoch/abort state, and returns the bytes. Existing PurchaseFlow verifies the exact signed transaction and durably stores the original public signature before its abort check prevents revalidation, signed simulation and broadcast. Malformed wallet output still fails verification. The original attempt stays locked and reconciliation targets that attempt; it is never silently cleared or repaid.

## Validation and evidence boundaries

| Check | Result | Evidence |
| --- | --- | --- |
| Focused auth, wallet, checkout and sign-in regressions | 45 tests passed across 4 files, including expiry/account-switch during exact signed-packet return | `artifacts/wallet-login-correction/final-scoped-tests.log` |
| Production TypeScript and Vite build | Passed | `artifacts/wallet-login-correction/production-build.log` |
| Order SDK and P30 SDK guards | Passed; archive, descriptor and installed selected files unchanged | Same build log |
| Actual no-wallet local browser | `/`, `/buy`, `/my-account`, desktop 1440×1000 and phone 390×844; Connect visible, chooser/help works, no horizontal overflow or page errors | `artifacts/wallet-login-correction/final-browser/results.json`, 8 screenshots |
| Settled lazy landing preview | Ready capture inspected; initial loading capture preserved | `final-browser/landing-ready.json`, `LANDING-DESKTOP-READY.png`, `LANDING-DESKTOP-VIEWPORT.png` under the evidence root |
| Actual normal local gateway authentication | Challenge 200 → login 200 → session 200, correct wallet and HttpOnly/SameSite Strict cookie → logout 200 → session 401 | `artifacts/wallet-login-correction/actual-local-auth-results.json` |
| Code graph update | AST-only 219/219 files, no LLM/API extraction | `artifacts/wallet-login-correction/graphify-update.log` |

The actual gateway auth check ran once against existing `127.0.0.1:8788` from normal `127.0.0.1:5173`, with a disposable in-memory Ed25519 key and an explicitly named test Wallet Standard provider. Public test wallet: `2RN9pDFbEVBNrkWjzQdQRK2Wc9KS2RHF9HN2ecZwFRVd`. Exactly one login-message signature, zero chain requests, no transaction signer capability, no owner/funding key and no backend indexed-account fixture. It signed the exact received message; no cookie/CSRF/signature value or private key was stored. The session was logged out/revoked at the end. Watermarked actual-auth review/signed-in screenshots were inspected. The exclusive one-test marker is preserved; the check was not repeated.

Desktop/phone screenshots use an actual fresh no-wallet browser against the running local frontend with no API-response fixtures. Auth/owned-dashboard/connection-binding and transaction-race regressions use controlled responses and exact locally signed disposable fixture packets; their checks are not chain or owner-wallet evidence. Initial test failures from jsdom dialog support and strict test-fixture typing were corrected; earlier logs remain for audit.

## Current limits and preserved scope

The previous purchase grant expired at `2026-11-01T21:24:18.865Z` (Nov 2, 02:54:18.865 IST). OWNER_RELEASE is false with null activation fields; DIRECT_GATE sign/send are false. No renewal or purchase execution was performed. Funding helper remains closed. Existing scope/debit ceilings, SDK-only preparation, exact simulations, durable recovery and no-repay behavior remain in force.

No actual owner Phantom/Chrome sign-in, owned chain read, transaction approval or purchase was attempted by this correction. Those remain unverified here. The real gateway authentication pass establishes session compatibility, not a completed indexed challenge or chain purchase. In-app browser wallet-extension isolation remains a browser capability limit; use the browser containing the installed wallet.

All 73 historical funding-manifest entries match. Funding helper, core PurchaseFlow, unsigned compiler, artifact/proof and package hashes match the before snapshot. No backend/SDK/vendor/pin edits, service restarts, source-data seeding, transactions, deployments, commits or pushes. Sources/hashes and preservation checks are in `source-before.json`, `source-after.json` and `preservation-audit.json`; the original handoff is archived alongside them. Detailed evidence is hashed by `manifest.json`.

A direct backend-chat message was rejected by automatic approval review because that destination lacked direct human messaging authorization. It was not retried or relayed as a request. Existing source and incoming backend/Origin confirmations supplied the contract; no unresolved integration blocker remains from that rejection.
