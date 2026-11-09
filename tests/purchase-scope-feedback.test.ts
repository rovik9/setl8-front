// @vitest-environment node
import { beforeAll, expect, it } from "vitest";
import {
  ownerCheckoutRestriction,
  OWNER_RELEASE,
  REVIEWED_OWNER_SCOPE,
} from "../src/buy/executionGate";
import { loadAccountDerivation } from "../src/buy/accountDerivation";
beforeAll(loadAccountDerivation);
const ACCOUNT0 = "9aLv8BzUCAjYWnAav75K9aeSHnZAKKFu26VmEVyhcYxT",
  ACCOUNT1 = "7AMvgh1hCPKvJYKCMSNmHqyLKfNxZJXW8aKdM83zaxUv";
it("explains wallet, tier and expiry restrictions without widening the current grant", () => {
  const now = OWNER_RELEASE.validUntilMs! - 1;
  for (const tier of ["0", "1", "2", "3"])
    expect(
      ownerCheckoutRestriction(REVIEWED_OWNER_SCOPE.wallet, tier, null, now),
    ).toBeNull();
  for (const tier of ["4", "9", "", "x"])
    expect(
      ownerCheckoutRestriction(REVIEWED_OWNER_SCOPE.wallet, tier, null, now),
    ).toMatch(/\$2,500, \$5,000, \$10,000 and \$15,000/);
  expect(ownerCheckoutRestriction("other", "0", null, now)).toMatch(
    /reviewed test wallet/,
  );
  expect(
    ownerCheckoutRestriction(REVIEWED_OWNER_SCOPE.wallet, "0", null, now + 1),
  ).toMatch(/expired/);
});
it("every reviewed wallet gets the same tiers and window, and no other wallet is let in", () => {
  const now = OWNER_RELEASE.validUntilMs! - 1;
  // Literal list on purpose: a fifth wallet must fail here until the owner has reviewed it.
  expect(REVIEWED_OWNER_SCOPE.wallets).toEqual([
    "J95j3drvYgYNrT3cocwSoR8hWd5zsaqVr12eW7UxL7zC",
    "E3T29izJ6aKE3zwpVi71mDDmbyDYp3vXMB4KkKVd32tK", // Rehearsal
    "HXC9pZxnqyqeb3awEtaBtWb2sJn21zwaNpzxaPQTrZPT", // Prof
    "2CRtrRwLFsrpnBas5z3Hx9gCuuESWZfscE5L2QzK1TYK", // Panel
  ]);
  for (const wallet of REVIEWED_OWNER_SCOPE.wallets) {
    for (const tier of ["0", "1", "2", "3"])
      expect(ownerCheckoutRestriction(wallet, tier, null, now)).toBeNull();
    for (const tier of ["4", "9", "", "x"])
      expect(ownerCheckoutRestriction(wallet, tier, null, now)).toMatch(
        /\$2,500, \$5,000, \$10,000 and \$15,000/,
      );
    expect(ownerCheckoutRestriction(wallet, "0", null, now + 1)).toMatch(
      /expired/,
    );
  }
  expect(ownerCheckoutRestriction("other", "0", null, now)).toMatch(
    /reviewed test wallet/,
  );
});
it("reports an account address that does not belong to the checked wallet and counter, but not a new counter", () => {
  const w = REVIEWED_OWNER_SCOPE.wallet,
    now = OWNER_RELEASE.validUntilMs! - 1,
    at = (counter: string, expectedAccount: string) =>
      ({ wallet: w, nextChallengeId: counter, expectedAccount }) as any;
  // The next account (counter 1) is expected after the first purchase; it is no longer a restriction.
  expect(ownerCheckoutRestriction(w, "0", at("0", ACCOUNT0), now)).toBeNull();
  expect(ownerCheckoutRestriction(w, "0", at("1", ACCOUNT1), now)).toBeNull();
  expect(ownerCheckoutRestriction(w, "0", at("1", ACCOUNT0), now)).toMatch(
    /does not match the address derived/,
  );
  expect(ownerCheckoutRestriction(w, "0", at("0", "different"), now)).toMatch(
    /does not match the address derived/,
  );
});
it("messaging never blocks on an underivable counter (approval enforces it)", () => {
  const w = REVIEWED_OWNER_SCOPE.wallet,
    now = OWNER_RELEASE.validUntilMs! - 1;
  expect(
    ownerCheckoutRestriction(
      w,
      "0",
      { wallet: w, nextChallengeId: "x", expectedAccount: "y" } as any,
      now,
      () => {
        throw Error("unavailable");
      },
    ),
  ).toBeNull();
});
