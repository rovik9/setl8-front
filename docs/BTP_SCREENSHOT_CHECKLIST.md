# Owner BTP screenshot checklist

Run `VITE_DEMO_BUILD=1 npm run dev` for the normal preview, then `npm run shots` from `/Users/rovik/Documents/setl8-front`. The kit writes a classification/hash manifest in `artifacts/btp-screens/`. Account-page data is explicitly mocked in the kit. Buy screenshots reuse the accepted F2 mock evidence. Mock images have a visible watermark and `MOCKED-WALLET-NOT-A-REAL-TRANSACTION` in the filename. They cannot establish an actual purchase.

The standalone kit deliberately skips the terminal. The separate, single owned controller journey uses the existing guarded launcher and `captureControlledTerminal`; a bare `/demo/terminal` shows visual simulation only. Actual local evaluator captures are separate from mock wallet/RPC evidence and from devnet transaction evidence.

Owner captures, only during a separately authorized real devnet run:

- **Wallet transaction popup:** the owner’s wallet opened from `http://127.0.0.1:5173/buy`, after Origin review and explicit execution authorization; capture devnet network, selected account and exact transaction review. A popup alone does not prove execution. F2 signing/sending is currently OFF.
- **Purchase transaction:** `https://explorer.solana.com/tx/<actual-open_account-signature>?cluster=devnet`; capture successful finalized status, program/instruction and token movements. Use the signature of the actual owner run, not the mocked kit.
- **Expected trading account:** `https://explorer.solana.com/address/<actual-account>?cluster=devnet`; capture owner/program and account address, correlated with the actual purchase receipt.
- **Account dashboard after purchase:** `http://127.0.0.1:5173/my-account?wallet=<owner-public-address>`; explicitly refresh and capture public checked account identity, observed slots/time and partial-history notice. Address view/connection is not authentication or proof of payment.
- **Pass finalization:** `https://explorer.solana.com/tx/<actual-finalize_pass-signature>?cluster=devnet`; capture successful finalized transaction and the relevant account/event. A recorded request or elapsed countdown is not finalization.
- **Queued claim account:** `https://explorer.solana.com/address/<actual-claim-account>?cluster=devnet`; capture the queued claim separately. Queued is not paid.
- **Settlement/payout transaction:** `https://explorer.solana.com/tx/<actual-heartbeat-or-settlement-signature>?cluster=devnet`; capture successful finalized settlement and actual trader token credit, not only a claim or pool transfer.
- **Balance before and after:** the owner’s devnet test-USDC account in their wallet and `https://explorer.solana.com/address/<owner-test-USDC-account>?cluster=devnet`; capture both observations with the same token-account identity and relate the delta to the actual settlement transaction.
- **Recorded proof refresh:** only the owner runs `npm run gen:devnet-proof` after actual day-2 evidence exists, then captures `http://127.0.0.1:5173/devnet-proof` and the A1 timeline. Null fields remain pending until source evidence is regenerated. The immutable SDK day-1 descriptor is not replaced by the proof snapshot.

The existing proof snapshot currently records purchase/journal/pass-confirmation links, with finalization/settlement/balances still pending. The frontend implementation did not regenerate it, claim payout execution, request keys or send a transaction.
