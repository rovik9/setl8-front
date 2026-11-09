import proof from "../data/devnet-proof.json";

/** Devnet challenge tiers. Money is integer micro-units (6 decimals); never floats. */
export const MICRO = 1_000_000n;
export const FEE_BPS = BigInt(proof.challenge.challenge_fee_bps);

export interface Tier {
  index: number;
  accountSizeUsd: number;
  priceUsd: number;
  priceMicro: bigint;
  feeMicro: bigint;
  totalMicro: bigint;
}

const toMicro = (usd: number | bigint): bigint => {
  if (typeof usd === "number" && !Number.isSafeInteger(usd))
    throw new RangeError("Price must be a whole number of USD");
  const v = BigInt(usd);
  if (v < 0n) throw new RangeError("Price must not be negative");
  return v * MICRO;
};

/** Ceil division for non-negative bigints. */
const ceilDiv = (a: bigint, b: bigint) => (a + b - 1n) / b;

export const feeMicro = (priceMicro: bigint): bigint =>
  ceilDiv(priceMicro * FEE_BPS, 10_000n);

export const totalMicro = (priceMicro: bigint): bigint =>
  priceMicro + feeMicro(priceMicro);

/** Format micro-units: thousands separators, at least 2 decimals, trailing zeros trimmed beyond that. */
export function formatMicro(micro: bigint, group = true): string {
  const whole = (micro / MICRO).toString();
  const frac = (micro % MICRO).toString().padStart(6, "0").replace(/0+$/, "");
  const w = group ? whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",") : whole;
  return w + "." + frac.padEnd(2, "0");
}

/** Fee for a price in whole USD, e.g. feeUsd(30) === "0.12". */
export const feeUsd = (price: number | bigint) =>
  formatMicro(feeMicro(toMicro(price)));

/** Price plus fee for a price in whole USD, e.g. totalUsd(30) === "30.12". */
export const totalUsd = (price: number | bigint) =>
  formatMicro(totalMicro(toMicro(price)));

export const TIERS: readonly Tier[] = proof.challenge.tiers.map((t) => {
  const priceMicro = toMicro(t.price_usd);
  return {
    index: t.tier,
    accountSizeUsd: t.account_size_usd,
    priceUsd: t.price_usd,
    priceMicro,
    feeMicro: feeMicro(priceMicro),
    totalMicro: totalMicro(priceMicro),
  };
});

export const tierByIndex = (index: number): Tier | undefined =>
  TIERS.find((t) => t.index === index);

/** Compact size label: 2500 -> "$2.5K", 200000 -> "$200K". */
export const sizeLabel = (usd: number) =>
  "$" + (usd / 1000).toString().replace(/\.0+$/, "") + "K";
