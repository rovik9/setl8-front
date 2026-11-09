import { u64 } from "./bytes";
import { deriveTradingAccount, staticKeys } from "./accountDerivation";
import { fromHex } from "./bytes";
import {
  DIRECT_GATE,
  type CheckedPurchase,
  type OwnerReview,
} from "./direct-types";
/**
 * The four reviewed trader wallets. J95 is the original owner wallet. Rehearsal, Prof and Panel were added on
 * 8 Nov 2026 on the owner's explicit instruction, each under exactly the same scope, tiers and window as J95;
 * nothing else was widened. Any other wallet stays refused.
 */
const OWNER_WALLET = "J95j3drvYgYNrT3cocwSoR8hWd5zsaqVr12eW7UxL7zC";
const REHEARSAL_WALLET = "E3T29izJ6aKE3zwpVi71mDDmbyDYp3vXMB4KkKVd32tK";
const PROF_WALLET = "HXC9pZxnqyqeb3awEtaBtWb2sJn21zwaNpzxaPQTrZPT";
const PANEL_WALLET = "2CRtrRwLFsrpnBas5z3Hx9gCuuESWZfscE5L2QzK1TYK";
/** Source-controlled release record. No query/environment/storage/remote acceptance flag reads. */
export const OWNER_RELEASE = Object.freeze({
  enabled: true as boolean,
  wallets: Object.freeze([
    OWNER_WALLET,
    REHEARSAL_WALLET,
    PROF_WALLET,
    PANEL_WALLET,
  ]) as readonly string[],
  authorizationReference: "BTP-OWNER-2026-11-06-REPEAT-DEMO" as string | null,
  validUntilMs: 1794508140000 as number | null, // 2026-11-12 23:59 IST (18:29 UTC); the gate closes itself after
});
export function liveReleaseConfigured(now = Date.now()) {
  return (
    DIRECT_GATE.sign === true &&
    DIRECT_GATE.send === true &&
    reviewedGrantConfigured(OWNER_RELEASE, now)
  );
}
/** User-facing availability only. Approval still enforces the complete exact scope. */
export function ownerCheckoutRestriction(
  wallet: string,
  tier: string,
  checked?: CheckedPurchase | null,
  now = Date.now(),
  derive: (wallet: string, counter: string) => string = deriveTradingAccount,
): string | null {
  if (!DIRECT_GATE.sign || !DIRECT_GATE.send || !OWNER_RELEASE.enabled)
    return "Purchase approval is currently disabled.";
  if (OWNER_RELEASE.validUntilMs !== null && now >= OWNER_RELEASE.validUntilMs)
    return "The purchase test window has expired. A reviewed renewal is required before payment.";
  if (!reviewedGrantConfigured(OWNER_RELEASE, now))
    return "The purchase test grant is unavailable.";
  if (!REVIEWED_OWNER_SCOPE.wallets.includes(wallet))
    return "Purchases are currently limited to the reviewed test wallets. Your wallet can still sign in and view its dashboard.";
  if (!REVIEWED_OWNER_SCOPE.tiers.includes(tier))
    return "This purchase test permits the $2,500, $5,000, $10,000 and $15,000 accounts. Choose one of those to continue.";
  if (checked) {
    let derived: string | null = null;
    try {
      derived = derive(checked.wallet, checked.nextChallengeId);
    } catch {
      /* Not derivable yet (or a malformed counter): approval enforces it; this is messaging only. */
    }
    if (derived !== null && checked.expectedAccount !== derived)
      return "The checked account address does not match the address derived for this wallet's next account counter. Review the existing account or retained purchase before requesting a new scope.";
  }
  return null;
}
export function assertLiveRelease(wallet: string, now = Date.now()) {
  if (!liveReleaseConfigured(now) || !OWNER_RELEASE.wallets.includes(wallet))
    throw Error(
      "Real signing/sending remains OFF. A source-reviewed, wallet-scoped, time-bounded owner activation is required.",
    );
}
export function assertOwnerReview(
  c: CheckedPurchase,
  r: OwnerReview | undefined,
  now = Date.now(),
) {
  if (
    !r ||
    r.wallet !== c.wallet ||
    r.epoch !== c.epoch ||
    r.expectedAccount !== c.expectedAccount ||
    r.messageSha256 !== c.prepared.messageSha256 ||
    r.fingerprint !== c.fingerprint ||
    r.checkedAt !== c.checkedAt ||
    r.total !== c.total ||
    r.devnetTestTokens !== true ||
    r.noDebitCapAcknowledged !== true ||
    now < Number(c.checkedAt) ||
    now >= Number(c.expiresAt)
  )
    throw Error(
      "Review the fresh exact account, terms and message, devnet/test tokens and absence of a signed debit cap before wallet approval.",
    );
}

/**
 * Single-owner repeat-demo scope (6 Nov 2026). Publishing this record never enables a release.
 * The wallet, mint, one-signer rule, SOL cap and total = price + fee are fixed. The challenge counter is NOT
 * pinned: it is whatever the wallet profile holds on chain, and the account address must equal the one the
 * SDK derives independently for (wallet, that counter) and match the prepared message context.
 */
export const REVIEWED_OWNER_SCOPE = Object.freeze({
  /** The original reviewed wallet, kept for existing callers. Eligibility is decided by `wallets`. */
  wallet: OWNER_WALLET,
  /** Every reviewed wallet. Each one gets exactly the same tiers, sizes, prices, totals and caps below. */
  wallets: Object.freeze([
    OWNER_WALLET,
    REHEARSAL_WALLET,
    PROF_WALLET,
    PANEL_WALLET,
  ]) as readonly string[],
  tiers: Object.freeze(["0", "1", "2", "3"]) as readonly string[],
  /** Account size (micro units) per permitted tier. */
  sizes: Object.freeze({
    "0": "2500000000",
    "1": "5000000000",
    "2": "10000000000",
    "3": "15000000000",
  }) as Readonly<Record<string, string>>,
  /** Challenge price (micro units) per permitted tier; the 0.4% fee is price + fee = total below. */
  prices: Object.freeze({
    "0": "30000000",
    "1": "55000000",
    "2": "99000000",
    "3": "145000000",
  }) as Readonly<Record<string, string>>,
  /** Exact total (price + 0.4% fee) per permitted tier, so a tier cannot be charged a different fee. */
  totals: Object.freeze({
    "0": "30120000",
    "1": "55220000",
    "2": "99396000",
    "3": "145580000",
  }) as Readonly<Record<string, string>>,
  mint: "usdc",
  mintAddress: "2kBKxj3TYz2UbQfVcJ5xBbWscC5hrALq7MLzJi3c1fTx",
  /** Tier 3 total (145,000,000 + 580,000 fee). */
  maxTokenTotal: "145580000",
  maxOwnerNetworkFeeAndPurchaseRent: "10000000",
});
export interface OwnerReleaseGrant {
  readonly enabled: boolean;
  readonly wallets: readonly string[];
  readonly authorizationReference: string | null;
  readonly validUntilMs: number | null;
}
function reviewedGrantConfigured(g: OwnerReleaseGrant, now: number) {
  return (
    g.enabled === true &&
    Array.isArray(g.wallets) &&
    g.wallets.length > 0 &&
    g.wallets.every((w) => REVIEWED_OWNER_SCOPE.wallets.includes(w)) &&
    typeof g.authorizationReference === "string" &&
    g.authorizationReference.trim().length > 0 &&
    Number.isSafeInteger(g.validUntilMs) &&
    Number.isSafeInteger(now) &&
    now >= 0 &&
    g.validUntilMs !== null &&
    now < g.validUntilMs
  );
}
/**
 * Pure invariant for offline scoped fixtures. It cannot enable the real source gates.
 * `derive` is the independent (wallet, counter) -> trading-account derivation; it throws when unavailable,
 * which fails the check closed.
 */
export function assertReviewedOwnerCheckoutScope(
  c: CheckedPurchase,
  review: OwnerReview | undefined,
  grant: OwnerReleaseGrant,
  now = Date.now(),
  derive: (wallet: string, counter: string) => string = deriveTradingAccount,
) {
  if (!reviewedGrantConfigured(grant, now))
    throw Error(
      "The reviewed owner checkout grant is closed, unconfigured or expired.",
    );
  const s = REVIEWED_OWNER_SCOPE;
  if (
    !s.wallets.includes(c.wallet) ||
    !grant.wallets.includes(c.wallet) ||
    !s.tiers.includes(c.tier) ||
    c.size !== s.sizes[c.tier] ||
    c.price !== s.prices[c.tier]
  )
    throw Error(
      "The checked wallet, tier, size or price differs from the reviewed owner scope.",
    );
  // The counter is read from chain (u64() refuses anything but a canonical decimal); the account must be the
  // address derived independently for exactly that wallet and counter.
  let derived: string;
  try {
    // Same bound as the preflight: the largest u64 is never a usable counter.
    if (BigInt(u64(c.nextChallengeId)) >= 18446744073709551615n)
      throw Error("counter out of range");
    derived = derive(c.wallet, c.nextChallengeId);
  } catch {
    throw Error(
      "The challenge counter or its derived account could not be verified against the reviewed owner scope.",
    );
  }
  if (c.expectedAccount !== derived)
    throw Error(
      "The checked account address differs from the address derived for this wallet and counter (reviewed owner scope).",
    );
  const p = c.prepared.context;
  if (
    p.connectedWallet !== c.wallet ||
    p.trader !== c.wallet ||
    p.sessionEpoch !== c.epoch ||
    p.expectedAccount !== derived ||
    p.nextChallengeId !== c.nextChallengeId ||
    p.tierIndex !== c.tier ||
    p.mint !== s.mint ||
    p.mintAddress !== s.mintAddress ||
    c.prepared.requiredSigners.length !== 1 ||
    c.prepared.requiredSigners[0] !== c.wallet
  )
    throw Error(
      "The exact prepared message context differs from the reviewed owner scope.",
    );
  // The message bytes themselves (not only the context that built them) must carry the derived account.
  let messageAccounts: string[] = [];
  try {
    messageAccounts = staticKeys(fromHex(c.prepared.messageHex));
  } catch {
    /* unreadable message: no accounts, refused below */
  }
  if (!messageAccounts.includes(derived))
    throw Error(
      "The exact prepared message context differs from the reviewed owner scope (message accounts).",
    );
  const total = BigInt(u64(c.total)),
    priceAndFee = BigInt(u64(c.price)) + BigInt(u64(c.fee)),
    ownerSOL = BigInt(u64(c.networkFee)) + BigInt(u64(c.rent));
  if (
    priceAndFee !== total ||
    c.total !== s.totals[c.tier] ||
    total > BigInt(s.maxTokenTotal)
  )
    throw Error(
      "The exact token total exceeds the reviewed scope or its terms do not reconcile.",
    );
  if (
    BigInt(u64(c.solRequired)) !== ownerSOL ||
    ownerSOL > BigInt(s.maxOwnerNetworkFeeAndPurchaseRent)
  )
    throw Error(
      "The exact owner network fee and purchase rent exceed the reviewed scope or do not reconcile.",
    );
  const checkedAt = BigInt(u64(c.checkedAt)),
    expiresAt = BigInt(u64(c.expiresAt));
  if (
    checkedAt > BigInt(Number.MAX_SAFE_INTEGER) ||
    expiresAt > BigInt(Number.MAX_SAFE_INTEGER) ||
    expiresAt <= checkedAt
  )
    throw Error("The fresh exact review timestamps are unavailable.");
  assertOwnerReview(c, review, now);
}
