/**
 * The first real devnet purchase, kept as RECORDED data (like the archived A1 snapshot). It is shown as labelled
 * evidence on the journey view only; it is never "verified in this browser" and it never replaces a local record.
 */
export const RECORDED_DEVNET_PURCHASE = Object.freeze({
  label: "Recorded devnet purchase (verified earlier)",
  wallet: "J95j3drvYgYNrT3cocwSoR8hWd5zsaqVr12eW7UxL7zC",
  account: "9aLv8BzUCAjYWnAav75K9aeSHnZAKKFu26VmEVyhcYxT",
  challenge: "0",
  signature:
    "4wzsDG7CwhSU6SNTZfzsivCMPKoRbmk5tRrUXdidzNc53Pa53XuHjLu5gmSXfMuZQdmRaoocurJKT6oQ1cXTburt",
  slot: "519104975",
  status: "finalized",
  debit: "30.12 test USDC",
});
export type RecordedPurchase = typeof RECORDED_DEVNET_PURCHASE;

export const recordedPurchaseUrl = (p: RecordedPurchase) =>
  `https://explorer.solana.com/tx/${encodeURIComponent(p.signature)}?cluster=devnet`;

/**
 * The recorded purchase applies only to the page that shows exactly its account, observed for its wallet, with the
 * account decoded as that wallet's. Any other wallet, account or unchecked read gets nothing.
 */
export function recordedPurchaseFor(scope: {
  observedWallet: string | null;
  account: string | null;
  trader: string | null;
  checked: boolean;
}): RecordedPurchase | null {
  const r = RECORDED_DEVNET_PURCHASE;
  return scope.checked &&
    scope.observedWallet === r.wallet &&
    scope.trader === r.wallet &&
    scope.account === r.account
    ? r
    : null;
}
