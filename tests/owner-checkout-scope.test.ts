// @vitest-environment node
import { beforeAll, it, expect, vi } from "vitest";
import {
  OWNER_RELEASE,
  REVIEWED_OWNER_SCOPE as S,
  assertReviewedOwnerCheckoutScope,
  liveReleaseConfigured,
  type OwnerReleaseGrant,
} from "../src/buy/executionGate";
import {
  DIRECT_GATE,
  type CheckedPurchase,
  type OwnerReview,
} from "../src/buy/direct-types";
import { createGatedCheckoutPort } from "../src/buy/checkoutPort";
import { prepareP30UnsignedPurchase } from "../src/purchase/prepareUnsigned";
import { loadAccountDerivation } from "../src/buy/accountDerivation";
import { TIERS } from "../src/buy/tiers";
import { ctx } from "./f2-fixture";
import { PublicKey } from "@setl8/p30-sdk";
import descriptor from "../dependencies/p30/3e33090cf9193fd909f57ed75e10f9e59b9409e3c8a8f6c186272d8ee185f86d/p30-descriptor.json";
const now = 1793600000000;
// Independent anchors: the trading accounts for this wallet's challenge counters 0 and 1 (derived once with the
// pinned SDK on 6 Nov 2026 and written down here, so a drifting derivation cannot silently agree with itself).
const ACCOUNT0 = "9aLv8BzUCAjYWnAav75K9aeSHnZAKKFu26VmEVyhcYxT",
  ACCOUNT1 = "7AMvgh1hCPKvJYKCMSNmHqyLKfNxZJXW8aKdM83zaxUv";
const accountFor = (wallet: string, counter: bigint) =>
  ctx.tradingAccount(new PublicKey(wallet), counter)[0].toBase58();
const grant: OwnerReleaseGrant = {
  enabled: true,
  wallets: S.wallets,
  authorizationReference: "OFFLINE_SCOPED_FIXTURE_ONLY",
  validUntilMs: now + 60000,
};
let base: CheckedPurchase;
function review(c: CheckedPurchase): OwnerReview {
  return {
    wallet: c.wallet,
    epoch: c.epoch,
    expectedAccount: c.expectedAccount,
    messageSha256: c.prepared.messageSha256,
    fingerprint: c.fingerprint,
    checkedAt: c.checkedAt,
    total: c.total,
    devnetTestTokens: true,
    noDebitCapAcknowledged: true,
  };
}
beforeAll(async () => {
  await loadAccountDerivation();
  const prepared = await prepareP30UnsignedPurchase({
    inputKind: "p30-public-unsigned-input-v1",
    sdkProfile: "p30-devnet-2026-10-31-v1",
    descriptor,
    connectedWallet: S.wallet,
    trader: S.wallet,
    sessionEpoch: 7,
    expectedAccount: ACCOUNT0,
    nextChallengeId: "0",
    tierIndex: "0",
    mint: "usdc",
    recentBlockhash: "11111111111111111111111111111111",
    priorityFee: { kind: "omitted" },
  });
  base = {
    wallet: S.wallet,
    epoch: 7,
    tier: "0",
    size: "2500000000",
    price: "30000000",
    feeBps: "40",
    fee: "120000",
    total: "30120000",
    networkFee: "5000",
    rent: "3870960",
    solRequired: "3875960",
    blockhash: prepared.context.recentBlockhash,
    lastValidBlockHeight: "700000000",
    checkedAt: String(now - 500),
    expiresAt: String(now + 30000),
    minSlot: "600000000",
    fingerprint: "ab".repeat(32),
    expectedAccount: ACCOUNT0,
    nextChallengeId: "0",
    prepared,
    checks: [],
  };
});
it("accepts the exact reviewed scoped fixture; the production record is the narrow wallet-scoped, time-bounded release", () => {
  expect(() =>
    assertReviewedOwnerCheckoutScope(base, review(base), grant, now),
  ).not.toThrow();
  expect(OWNER_RELEASE).toEqual({
    enabled: true,
    wallets: S.wallets,
    authorizationReference: "BTP-OWNER-2026-11-06-REPEAT-DEMO",
    validUntilMs: expect.any(Number),
  });
  expect(DIRECT_GATE.sign).toBe(true);
  expect(DIRECT_GATE.send).toBe(true);
  const until = OWNER_RELEASE.validUntilMs!;
  expect(liveReleaseConfigured(until - 1)).toBe(true);
  expect(liveReleaseConfigured(until)).toBe(false); // closes itself
  // The real record, not just a fixture grant, drives the scoped check.
  expect(() =>
    assertReviewedOwnerCheckoutScope(base, review(base), OWNER_RELEASE, now),
  ).not.toThrow();
  expect(() =>
    assertReviewedOwnerCheckoutScope(
      {
        ...base,
        checkedAt: String(until - 500),
        expiresAt: String(until + 29_500),
      },
      review({
        ...base,
        checkedAt: String(until - 500),
        expiresAt: String(until + 29_500),
      }),
      OWNER_RELEASE,
      until,
    ),
  ).toThrow("grant");
  for (const patch of [
    { wallet: "7urBRSkXz6jAoz7j4QnVjgWWVLUxV6nzjZxNEWhxkLeF" }, // other wallet
    { tier: "1" }, // tier 1 carrying tier 0's size, price and total
    { size: "5000000000" },
    { nextChallengeId: "1" }, // counter 1 with counter 0's account
  ]) {
    const c = { ...base, ...patch };
    expect(() =>
      assertReviewedOwnerCheckoutScope(c, review(c), OWNER_RELEASE, now),
    ).toThrow("reviewed owner scope");
  }
});
it.each([
  { wallet: "7urBRSkXz6jAoz7j4QnVjgWWVLUxV6nzjZxNEWhxkLeF" },
  { tier: "1" },
  { tier: "4" },
  { size: "5000000000" },
  { price: "30000001", fee: "119999" },
  { nextChallengeId: "1" },
  { expectedAccount: "A3ncHBKQRrRNKVaeH9WuhMmwZ22BNoKyeCFsxK6ZwpvU" },
])("rejects checked scope mismatch %j", (patch) => {
  const c = { ...base, ...patch };
  expect(() =>
    assertReviewedOwnerCheckoutScope(c, review(c), grant, now),
  ).toThrow("reviewed owner scope");
});
it.each([
  { enabled: false },
  { wallets: [] },
  { wallets: "J95" }, // a string is not a wallet list
  { wallets: ["7urBRSkXz6jAoz7j4QnVjgWWVLUxV6nzjZxNEWhxkLeF"] },
  { wallets: [S.wallet, "7urBRSkXz6jAoz7j4QnVjgWWVLUxV6nzjZxNEWhxkLeF"] }, // one foreign wallet poisons the grant
  { authorizationReference: null },
  { authorizationReference: " " },
  { validUntilMs: null },
  { validUntilMs: now },
  { validUntilMs: NaN },
])("rejects closed/foreign/unconfigured/expired grant %j", (patch) => {
  expect(() =>
    assertReviewedOwnerCheckoutScope(
      base,
      review(base),
      { ...grant, ...patch } as OwnerReleaseGrant, // some cases are deliberately malformed
      now,
    ),
  ).toThrow("grant");
});
it("accepts the exact two cap boundaries and rejects one micro-token or lamport over", () => {
  const boundary = {
    ...base,
    rent: "9995000",
    networkFee: "5000",
    solRequired: "10000000",
  };
  expect(() =>
    assertReviewedOwnerCheckoutScope(boundary, review(boundary), grant, now),
  ).not.toThrow();
  const overToken = { ...base, fee: "120001", total: "30120001" };
  expect(() =>
    assertReviewedOwnerCheckoutScope(overToken, review(overToken), grant, now),
  ).toThrow("token total");
  const overSOL = { ...boundary, rent: "9995001", solRequired: "10000001" };
  expect(() =>
    assertReviewedOwnerCheckoutScope(overSOL, review(overSOL), grant, now),
  ).toThrow("network fee and purchase rent");
});
it("rejects inconsistent totals or unsafe financial number representations", () => {
  for (const c of [
    { ...base, total: "30119999" },
    { ...base, solRequired: "1" },
    { ...base, total: "30120000.0" },
    { ...base, total: 30120000 as any },
  ])
    expect(() =>
      assertReviewedOwnerCheckoutScope(c, review(c), grant, now),
    ).toThrow();
});
it("rejects a different exact prepared message context and required signer", () => {
  for (const patch of [
    { trader: descriptor.feeWallet },
    { expectedAccount: descriptor.config },
    { nextChallengeId: "1" },
    { tierIndex: "1" },
    { mint: "usdt" as const },
    { mintAddress: descriptor.usdtMint },
    { sessionEpoch: 8 },
  ]) {
    const c = {
      ...base,
      prepared: {
        ...base.prepared,
        context: { ...base.prepared.context, ...patch },
      },
    };
    expect(() =>
      assertReviewedOwnerCheckoutScope(c, review(c), grant, now),
    ).toThrow("prepared message context");
  }
  const c = {
    ...base,
    prepared: {
      ...base.prepared,
      requiredSigners: [S.wallet, descriptor.feeWallet],
    },
  };
  expect(() =>
    assertReviewedOwnerCheckoutScope(c, review(c), grant, now),
  ).toThrow("prepared message context");
});
it("requires the fresh exact owner review and no-signed-cap acknowledgement", () => {
  expect(() =>
    assertReviewedOwnerCheckoutScope(base, undefined, grant, now),
  ).toThrow("Review the fresh");
  for (const patch of [
    { noDebitCapAcknowledged: false as const },
    { devnetTestTokens: false as const },
    { messageSha256: "00".repeat(32) },
    { epoch: 8 },
  ])
    expect(() =>
      assertReviewedOwnerCheckoutScope(
        base,
        { ...review(base), ...patch } as OwnerReview,
        grant,
        now,
      ),
    ).toThrow("Review the fresh");
  expect(() =>
    assertReviewedOwnerCheckoutScope(base, review(base), grant, now + 30000),
  ).toThrow("Review the fresh");
});
it("production approval needs the signed-in released wallet inside the window; every refusal happens before any network access", async () => {
  const fetch = vi
    .spyOn(globalThis, "fetch")
    .mockRejectedValue(Error("NO_NETWORK_ALLOWED"));
  const until = OWNER_RELEASE.validUntilMs!;
  const signal = new AbortController().signal;
  const reject = async (
    p: ReturnType<typeof createGatedCheckoutPort>,
    c: CheckedPurchase,
    message: string,
  ) => {
    expect(() => p.assertExecution?.(c, review(c))).toThrow(message);
    await expect(
      p.simulate!(c, new Uint8Array(), true, signal, review(c)),
    ).rejects.toThrow(message);
    await expect(
      p.broadcast(new Uint8Array(), "not-a-signature", signal, c, review(c)),
    ).rejects.toThrow(message);
  };
  vi.useFakeTimers({ toFake: ["Date"] });
  try {
    vi.setSystemTime(now); // inside the window, inside the fixture's 30 s review
    // No signed-in session for the wallet: no approval, and every execution step refuses.
    const anonymous = createGatedCheckoutPort();
    expect(anonymous.canRequestApproval?.(S.wallet)).toBe(false);
    await reject(anonymous, base, "Sign in");
    // Signed in as the released wallet: the exact reviewed fixture passes the gate...
    const signedIn = createGatedCheckoutPort({
      isPurchaseWallet: (w) => w === S.wallet,
    });
    expect(signedIn.canRequestApproval?.(S.wallet)).toBe(true);
    expect(() => signedIn.assertExecution?.(base, review(base))).not.toThrow();
    // ...but not without the review acknowledgements.
    for (const patch of [
      { noDebitCapAcknowledged: false as const },
      { devnetTestTokens: false as const },
    ])
      expect(() =>
        signedIn.assertExecution?.(base, {
          ...review(base),
          ...patch,
        } as unknown as OwnerReview),
      ).toThrow("Review the fresh");
    expect(() => signedIn.assertExecution?.(base, undefined)).toThrow(
      "Review the fresh",
    );
    // The production port enforces the reviewed scope itself (tier, size, challenge id, account, caps, signer),
    // not only the pure helper: each deviation is refused even for the released, signed-in wallet.
    for (const patch of [
      { tier: "1" },
      { size: "5000000000" },
      { nextChallengeId: "1" },
      { expectedAccount: "A3ncHBKQRrRNKVaeH9WuhMmwZ22BNoKyeCFsxK6ZwpvU" },
      { fee: "120001", total: "30120001" },
      { solRequired: "10000001", rent: "9995001" },
    ]) {
      const c = { ...base, ...patch };
      expect(() => signedIn.assertExecution?.(c, review(c))).toThrow(
        /reviewed owner scope|token total|network fee/,
      );
    }
    const extraSigner = {
      ...base,
      prepared: {
        ...base.prepared,
        requiredSigners: [S.wallet, descriptor.feeWallet],
      },
    };
    expect(() =>
      signedIn.assertExecution?.(extraSigner, review(extraSigner)),
    ).toThrow("prepared message context");
    // Another wallet, even signed in, stays OFF.
    const other = {
      ...base,
      wallet: "7urBRSkXz6jAoz7j4QnVjgWWVLUxV6nzjZxNEWhxkLeF",
    };
    const anyone = createGatedCheckoutPort({ isPurchaseWallet: () => true });
    expect(anyone.canRequestApproval?.(other.wallet)).toBe(false);
    await reject(anyone, other, "OFF");
    // Expired release: OFF again for the released wallet itself.
    vi.setSystemTime(until);
    expect(signedIn.canRequestApproval?.(S.wallet)).toBe(false);
    await reject(signedIn, base, "OFF");
    expect(fetch).not.toHaveBeenCalled();
  } finally {
    vi.useRealTimers();
    fetch.mockRestore();
  }
});

// ---- Repeat-demo scope (6 Nov 2026): tiers 0-3, the counter is read from chain, the account is derived ----
const PRICE: Record<string, [string, string, string, string]> = {
  // tier: [size, price, fee, total]
  "0": ["2500000000", "30000000", "120000", "30120000"],
  "1": ["5000000000", "55000000", "220000", "55220000"],
  "2": ["10000000000", "99000000", "396000", "99396000"],
  "3": ["15000000000", "145000000", "580000", "145580000"],
};
async function purchase(
  tier: string,
  counter: bigint,
  wallet: string = S.wallet,
) {
  const [size, price, fee, total] = PRICE[tier],
    expectedAccount = accountFor(wallet, counter),
    prepared = await prepareP30UnsignedPurchase({
      inputKind: "p30-public-unsigned-input-v1",
      sdkProfile: "p30-devnet-2026-10-31-v1",
      descriptor,
      connectedWallet: wallet,
      trader: wallet,
      sessionEpoch: 7,
      expectedAccount,
      nextChallengeId: counter.toString(),
      tierIndex: tier,
      mint: "usdc",
      recentBlockhash: "11111111111111111111111111111111",
      priorityFee: { kind: "omitted" },
    });
  return {
    ...base,
    wallet,
    tier,
    size,
    price,
    fee,
    total,
    expectedAccount,
    nextChallengeId: counter.toString(),
    prepared,
  } as CheckedPurchase;
}
const accept = (
  c: CheckedPurchase,
  derive?: (w: string, n: string) => string,
) => assertReviewedOwnerCheckoutScope(c, review(c), grant, now, derive);

it("the scope's anchors agree with the SDK derivation and with the tier table", () => {
  expect(accountFor(S.wallet, 0n)).toBe(ACCOUNT0);
  expect(accountFor(S.wallet, 1n)).toBe(ACCOUNT1);
  expect(S.tiers).toEqual(["0", "1", "2", "3"]);
  for (const t of S.tiers) {
    const tier = TIERS[Number(t)];
    expect(S.sizes[t]).toBe(
      (BigInt(tier.accountSizeUsd) * 1_000_000n).toString(),
    );
    expect(S.prices[t]).toBe(tier.priceMicro.toString());
    expect(S.totals[t]).toBe(tier.totalMicro.toString());
    expect(PRICE[t]).toEqual([
      S.sizes[t],
      S.prices[t],
      tier.feeMicro.toString(),
      S.totals[t],
    ]);
  }
  expect(S.maxTokenTotal).toBe("145580000");
  expect(S.maxTokenTotal).toBe(S.totals["3"]);
  expect(S.maxOwnerNetworkFeeAndPurchaseRent).toBe("10000000");
  expect(
    Object.isFrozen(S) &&
      Object.isFrozen(S.tiers) &&
      Object.isFrozen(S.sizes) &&
      Object.isFrozen(S.prices) &&
      Object.isFrozen(S.totals),
  ).toBe(true);
});
it.each(["0", "1", "2", "3"])(
  "accepts tier %s with its own size, price, fee and total, for counters 0, 1, 2, 41 and the largest usable one",
  async (tier) => {
    for (const counter of [0n, 1n, 2n, 41n, 18446744073709551614n]) {
      const c = await purchase(tier, counter);
      expect(() => accept(c)).not.toThrow();
    }
  },
);
it("a new account is a new address: counter 1 is accepted only with the counter-1 account", async () => {
  const c = await purchase("0", 1n);
  expect(c.expectedAccount).toBe(ACCOUNT1);
  expect(() => accept(c)).not.toThrow();
  // counter 1 carrying counter 0's address (what the old pinned scope would have wanted) is refused ...
  const stale = {
    ...c,
    expectedAccount: ACCOUNT0,
    prepared: {
      ...c.prepared,
      context: { ...c.prepared.context, expectedAccount: ACCOUNT0 },
    },
  } as CheckedPurchase;
  expect(() => accept(stale)).toThrow("derived for this wallet and counter");
  // ... and so is counter 0 carrying counter 1's.
  const ahead = {
    ...(await purchase("0", 0n)),
    expectedAccount: ACCOUNT1,
  } as CheckedPurchase;
  expect(() => accept(ahead)).toThrow("derived for this wallet and counter");
});
it.each([
  "4",
  "5",
  "9",
  "",
  "-1",
  "00",
  "01",
  "0 ",
  "٣",
  "1e0",
  "0x1",
  // names that exist on every object: a table lookup must never treat them as a tier
  "__proto__",
  "constructor",
  "toString",
  "hasOwnProperty",
  "valueOf",
])("refuses tier %j even with otherwise consistent numbers", async (tier) => {
  const c = { ...(await purchase("3", 0n)), tier } as CheckedPurchase;
  expect(() => accept(c)).toThrow("reviewed owner scope");
});
it("refuses a size, price, fee or total that belongs to another tier", async () => {
  const one = await purchase("1", 0n);
  for (const patch of [
    { size: PRICE["0"][0] },
    { size: PRICE["2"][0] },
    { price: PRICE["0"][1] },
    { price: PRICE["2"][1] },
    { fee: PRICE["0"][2] }, // total no longer reconciles
    { fee: "220001", total: "55220001" }, // reconciles, but is not tier 1's fee
    { fee: "219999", total: "55219999" },
    { total: PRICE["3"][3] },
  ]) {
    const c = { ...one, ...patch } as CheckedPurchase;
    expect(() => accept(c), JSON.stringify(patch)).toThrow();
  }
});
it("the token cap is the tier-3 total: exactly 145,580,000 passes, one micro-token more does not", async () => {
  const three = await purchase("3", 0n);
  expect(() => accept(three)).not.toThrow();
  const over = {
    ...three,
    fee: "580001",
    total: "145580001",
  } as CheckedPurchase;
  expect(() => accept(over)).toThrow("token total");
  // a tier-4 style total (189,756,000) is far over
  const four = {
    ...three,
    tier: "4",
    size: "20000000000",
    price: "189000000",
    fee: "756000",
    total: "189756000",
  } as CheckedPurchase;
  expect(() => accept(four)).toThrow();
});
it.each([
  "",
  " ",
  "-1",
  "01",
  "1.0",
  "0x1",
  "1e1",
  "18446744073709551616",
  "٣",
])("refuses a malformed challenge counter %j", async (counter) => {
  const c = {
    ...(await purchase("0", 0n)),
    nextChallengeId: counter,
  } as CheckedPurchase;
  expect(() => accept(c)).toThrow();
});
it("the account must be the SDK-derived one for this wallet, not another wallet's or another counter's", async () => {
  const c = await purchase("0", 5n);
  for (const other of [
    ACCOUNT0,
    ACCOUNT1,
    accountFor(descriptor.feeWallet, 5n),
    descriptor.config,
    "",
  ]) {
    const x = {
      ...c,
      expectedAccount: other,
      prepared: {
        ...c.prepared,
        context: { ...c.prepared.context, expectedAccount: other },
      },
    } as CheckedPurchase;
    expect(() => accept(x), other).toThrow();
  }
  // The checked account and the prepared message context must agree with each other as well.
  const split = {
    ...c,
    prepared: {
      ...c.prepared,
      context: { ...c.prepared.context, expectedAccount: ACCOUNT0 },
    },
  } as CheckedPurchase;
  expect(() => accept(split)).toThrow("prepared message context");
  const counterSplit = {
    ...c,
    prepared: {
      ...c.prepared,
      context: { ...c.prepared.context, nextChallengeId: "6" },
    },
  } as CheckedPurchase;
  expect(() => accept(counterSplit)).toThrow("prepared message context");
  const tierSplit = {
    ...c,
    prepared: {
      ...c.prepared,
      context: { ...c.prepared.context, tierIndex: "1" },
    },
  } as CheckedPurchase;
  expect(() => accept(tierSplit)).toThrow("prepared message context");
});
it("fails closed when the derivation is unavailable or disagrees", async () => {
  const c = await purchase("2", 3n);
  expect(() =>
    accept(c, () => {
      throw Error("not loaded");
    }),
  ).toThrow("could not be verified");
  expect(() => accept(c, () => ACCOUNT0)).toThrow(
    "derived for this wallet and counter",
  );
  expect(() => accept(c, (w, n) => accountFor(w, BigInt(n)))).not.toThrow();
});
it("still refuses another wallet, a second signer, a different mint and every closed or foreign grant for the new tiers", async () => {
  const c = await purchase("3", 1n);
  const otherWallet = "7urBRSkXz6jAoz7j4QnVjgWWVLUxV6nzjZxNEWhxkLeF";
  expect(() =>
    accept({ ...c, wallet: otherWallet } as CheckedPurchase),
  ).toThrow("reviewed owner scope");
  expect(() =>
    accept({
      ...c,
      prepared: { ...c.prepared, requiredSigners: [S.wallet, otherWallet] },
    } as CheckedPurchase),
  ).toThrow("prepared message context");
  expect(() =>
    accept({
      ...c,
      prepared: {
        ...c.prepared,
        context: { ...c.prepared.context, mint: "usdt" as const },
      },
    } as CheckedPurchase),
  ).toThrow("prepared message context");
  for (const patch of [
    { enabled: false },
    { wallets: [otherWallet] },
    { validUntilMs: now },
  ])
    expect(() =>
      assertReviewedOwnerCheckoutScope(
        c,
        review(c),
        { ...grant, ...patch },
        now,
      ),
    ).toThrow("grant");
  // SOL cap unchanged
  const sol = {
    ...c,
    rent: "9995001",
    networkFee: "5000",
    solRequired: "10000001",
  } as CheckedPurchase;
  expect(() => accept(sol)).toThrow("network fee and purchase rent");
  expect(() =>
    accept({
      ...c,
      rent: "9995000",
      networkFee: "5000",
      solRequired: "10000000",
    } as CheckedPurchase),
  ).not.toThrow();
});

it("the gate itself rejects a non-canonical counter even if the derivation function would accept it", async () => {
  const lenient = (w: string, n: string) =>
    accountFor(w, BigInt(n.trim() || "0"));
  const c = await purchase("0", 1n);
  for (const counter of ["01", "1 ", " 1", "0x1", "+1", "1.0", "", "-1"]) {
    const x = {
      ...c,
      nextChallengeId: counter,
      prepared: {
        ...c.prepared,
        context: { ...c.prepared.context, nextChallengeId: counter },
      },
    } as CheckedPurchase;
    expect(() => accept(x, lenient), JSON.stringify(counter)).toThrow(
      "could not be verified",
    );
  }
  expect(() => accept(c, lenient)).not.toThrow();
});

it("the largest u64 is never a usable counter (as in the preflight)", async () => {
  const c = await purchase("0", 18446744073709551615n);
  expect(() => accept(c)).toThrow("could not be verified");
});
it("the prepared MESSAGE must carry the derived account, not just a context that says so", async () => {
  const c = await purchase("0", 5n),
    elsewhere = await purchase("0", 6n); // a message built for counter 6
  expect(c.prepared.messageHex).not.toBe(elsewhere.prepared.messageHex);
  const swapped = {
    ...c,
    prepared: { ...c.prepared, messageHex: elsewhere.prepared.messageHex },
  } as CheckedPurchase;
  expect(() => accept(swapped)).toThrow("message accounts");
  for (const messageHex of [
    "",
    "zz",
    "01",
    "80" + c.prepared.messageHex.slice(2),
  ])
    expect(() =>
      accept({
        ...c,
        prepared: { ...c.prepared, messageHex },
      } as CheckedPurchase),
    ).toThrow("prepared message context");
  expect(() => accept(c)).not.toThrow();
});

// ---- Reviewed demo wallets (8 Nov 2026, owner instruction): J95 plus Rehearsal, Prof and Panel, all on identical terms ----
// Independent anchors: the trading accounts for counters 0 and 1, derived once with the pinned SDK on 8 Nov 2026.
const ADDED = [
  {
    name: "Rehearsal",
    wallet: "E3T29izJ6aKE3zwpVi71mDDmbyDYp3vXMB4KkKVd32tK",
    a0: "22Mzti43wnCLjvaU3unkCZgisjdoPEe5QTyPAYRM4DXb",
    a1: "3r6HhRWBBytFA4i5zWxifjEnRV58N9dhjHk1h6rtcWbe",
  },
  {
    name: "Prof",
    wallet: "HXC9pZxnqyqeb3awEtaBtWb2sJn21zwaNpzxaPQTrZPT",
    a0: "7kx3o8hNwpVdwUVPnf5jf1aesqBSFgvXKkB6Ww8Ci8Sc",
    a1: "7zcAoHZSZSKrUp2N4nE3iJknaZcnqpdhEcWvaJteCgY2",
  },
  {
    name: "Panel",
    wallet: "2CRtrRwLFsrpnBas5z3Hx9gCuuESWZfscE5L2QzK1TYK",
    a0: "96pdy1zHqzXD68iZgcGADD1ywi9G3Pvta4jrxva3NiCu",
    a1: "H9iZ6qWUJgKveXfEzdBpwW7Ax3VJec6VLgg4rbvf29ye",
  },
];
it("the reviewed list is exactly these four wallets, in the scope and in the production grant", () => {
  // A literal list on purpose: adding a fifth wallet must fail here until the owner has reviewed it.
  const four = [
    "J95j3drvYgYNrT3cocwSoR8hWd5zsaqVr12eW7UxL7zC",
    ...ADDED.map((a) => a.wallet),
  ];
  expect(S.wallets).toEqual(four);
  expect(OWNER_RELEASE.wallets).toEqual(four);
  expect(S.wallet).toBe(four[0]);
});
it.each(ADDED)(
  "$name wallet: anchors match the SDK and production derivation",
  ({ wallet, a0, a1 }) => {
    expect(accountFor(wallet, 0n)).toBe(a0);
    expect(accountFor(wallet, 1n)).toBe(a1);
  },
);
const CASES = ADDED.flatMap((a) =>
  ["0", "1", "2", "3"].map((tier) => ({ ...a, tier })),
);
it.each(CASES)(
  "$name wallet is accepted for tier $tier with its derived account (scope fixture and production record)",
  async ({ wallet, tier, a0, a1 }) => {
    const c = await purchase(tier, 0n, wallet);
    expect(c.expectedAccount).toBe(a0);
    expect(() => accept(c, (w, n) => accountFor(w, BigInt(n)))).not.toThrow();
    expect(() =>
      assertReviewedOwnerCheckoutScope(c, review(c), OWNER_RELEASE, now),
    ).not.toThrow();
    const next = await purchase(tier, 1n, wallet);
    expect(next.expectedAccount).toBe(a1);
    expect(() =>
      accept(next, (w, n) => accountFor(w, BigInt(n))),
    ).not.toThrow();
  },
);
it.each(ADDED)(
  "$name wallet gets no wider terms than J95: tiers 4+, wrong totals, wrong accounts and the window all still refuse",
  async ({ wallet }) => {
    const c = await purchase("0", 0n, wallet);
    for (const t of ["4", "5", "9", ""])
      expect(() => accept({ ...c, tier: t } as CheckedPurchase)).toThrow(
        "reviewed owner scope",
      );
    expect(() =>
      accept({ ...c, size: "5000000000" } as CheckedPurchase),
    ).toThrow("reviewed owner scope");
    expect(() =>
      accept({ ...c, price: "30000001", fee: "119999" } as CheckedPurchase),
    ).toThrow("reviewed owner scope");
    // Another wallet's account for the same counter is refused (derived from the wallet, not trusted).
    expect(() =>
      accept({ ...c, expectedAccount: ACCOUNT0 } as CheckedPurchase),
    ).toThrow();
    expect(() =>
      assertReviewedOwnerCheckoutScope(
        c,
        review(c),
        { ...OWNER_RELEASE, validUntilMs: now },
        now,
      ),
    ).toThrow("grant");
    expect(() =>
      accept({
        ...c,
        nextChallengeId: "18446744073709551615",
      } as CheckedPurchase),
    ).toThrow();
  },
);
it("the wallet a purchase names must be the wallet in its prepared message and signer, for every reviewed wallet", async () => {
  const wallets = [S.wallet, ...ADDED.map((a) => a.wallet)];
  const made = await Promise.all(wallets.map((w) => purchase("0", 0n, w)));
  made.forEach((c, i) => {
    const other = wallets[(i + 1) % wallets.length];
    // One wallet's message presented as another's purchase is refused.
    expect(() => accept({ ...c, wallet: other } as CheckedPurchase)).toThrow();
    // A second signer is refused.
    expect(() =>
      accept({
        ...c,
        prepared: { ...c.prepared, requiredSigners: [wallets[i], other] },
      } as CheckedPurchase),
    ).toThrow("prepared message context");
    // A grant that names only some wallets carries only those.
    const only = (list: readonly string[]) => ({ ...grant, wallets: list });
    expect(() =>
      assertReviewedOwnerCheckoutScope(c, review(c), only([other]), now),
    ).toThrow("reviewed owner scope");
    expect(() =>
      assertReviewedOwnerCheckoutScope(c, review(c), only([wallets[i]]), now),
    ).not.toThrow();
  });
});
