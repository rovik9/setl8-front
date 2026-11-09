import type { MarketIdentity } from "../api/frontend-v1";
export const PRESENTATION_ASSETS = Object.freeze([
  "BTC",
  "ETH",
  "SOL",
] as const);
export function chartAsset(
  m: Pick<MarketIdentity, "symbol"> | null | undefined,
): "BTC" | "ETH" | "SOL" | null {
  if (typeof m?.symbol !== "string") return null;
  const match = m.symbol
    .trim()
    .toUpperCase()
    .match(/^(BTC|ETH|SOL)(?:\s*\/\s*USD)?$/);
  return match ? (match[1] as "BTC" | "ETH" | "SOL") : null;
}
/** Fixture IDs belong only to the explicit demo catalog, never to arbitrary backend IDs. */
export function demoFixtureMarket(
  m: Pick<MarketIdentity, "symbol" | "market"> | null | undefined,
): "0" | "1" | "2" | null {
  const asset = chartAsset(m),
    id =
      asset === "BTC"
        ? "0"
        : asset === "ETH"
          ? "1"
          : asset === "SOL"
            ? "2"
            : null;
  return id !== null && m?.market === id ? id : null;
}

export function sameChartMarket(
  expected: MarketIdentity,
  actual: MarketIdentity | null | undefined,
) {
  return (
    !!actual &&
    chartAsset(expected) !== null &&
    chartAsset(expected) === chartAsset(actual) &&
    expected.market === actual.market &&
    expected.source === actual.source &&
    expected.feed_id === actual.feed_id
  );
}
