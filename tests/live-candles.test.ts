import { expect, it } from "vitest";
import { checkedCandles, movingAverage } from "../src/live/candles";
const envelope = {
  provider: "Hyperliquid",
  execution_mode: "observation_only",
  state: "ready",
  id: "BTC",
  symbol: "BTC/USD",
  interval: "1m",
  candles: [
    { time: 100, open: "10", high: "12", low: "9", close: "11", volume: "2" },
  ],
};
it("accepts provider OHLCV with matching identity", () => {
  expect(checkedCandles(envelope, "BTC", "1m")[0].high).toBe(12);
});
it("rejects another market or timeframe", () => {
  expect(() => checkedCandles(envelope, "ETH", "1m")).toThrow();
  expect(() => checkedCandles(envelope, "BTC", "5m")).toThrow();
});
it("rejects invalid ranges, duplicate times, or manufactured source labels", () => {
  expect(() =>
    checkedCandles(
      { ...envelope, candles: [{ ...envelope.candles[0], high: "8" }] },
      "BTC",
      "1m",
    ),
  ).toThrow();
  expect(() =>
    checkedCandles(
      { ...envelope, candles: [...envelope.candles, ...envelope.candles] },
      "BTC",
      "1m",
    ),
  ).toThrow();
  expect(() =>
    checkedCandles({ ...envelope, provider: "Pyth" }, "BTC", "1m"),
  ).toThrow();
});
it("computes indicators from supplied closes only, without filling history", () => {
  const candles = [1, 2, 3, 4].map((close, i) => ({
    time: i + 1,
    open: close,
    high: close,
    low: close,
    close,
    volume: 0,
  }));
  expect(movingAverage(candles, 3)).toEqual([
    { time: 3, value: 2 },
    { time: 4, value: 3 },
  ]);
  expect(movingAverage(candles.slice(0, 2), 3)).toEqual([]);
  expect(movingAverage(candles, 3, true).at(-1)?.value).toBe(3);
});
