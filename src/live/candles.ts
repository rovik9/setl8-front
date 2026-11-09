import type { Pair } from "./data";
export const TIMEFRAMES = ["1m", "5m", "15m", "30m", "1h", "4h", "1d"] as const;
export type Timeframe = (typeof TIMEFRAMES)[number];
export interface Candle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}
export function checkedCandles(
  body: unknown,
  pair: Pair,
  interval: Timeframe,
): Candle[] {
  const b = body as Record<string, unknown>;
  if (
    !b ||
    b.provider !== "Hyperliquid" ||
    b.execution_mode !== "observation_only" ||
    b.state !== "ready" ||
    b.id !== pair ||
    b.symbol !== pair + "/USD" ||
    b.interval !== interval ||
    !Array.isArray(b.candles) ||
    !b.candles.length ||
    b.candles.length > 502
  )
    throw Error("Candle identity unavailable");
  let previous = 0;
  return b.candles.map((r: Record<string, unknown>) => {
    if (!Number.isSafeInteger(r.time) || Number(r.time) <= previous)
      throw Error("Invalid candle time");
    const values = ["open", "high", "low", "close", "volume"].map((k) => {
      if (typeof r[k] !== "string" || !/^\d+(\.\d+)?$/.test(r[k] as string))
        throw Error("Invalid candle");
      return Number(r[k]);
    });
    const [open, high, low, close, volume] = values;
    if (
      values.some((v) => !Number.isFinite(v) || v < 0) ||
      Math.min(open, high, low, close) <= 0 ||
      high < Math.max(open, close) ||
      low > Math.min(open, close) ||
      low > high
    )
      throw Error("Invalid OHLCV");
    previous = Number(r.time);
    return { time: previous, open, high, low, close, volume };
  });
}
export function movingAverage(
  candles: Candle[],
  period: number,
  exponential = false,
) {
  let sum = 0,
    ema = 0;
  return candles.flatMap((c, i) => {
    sum += c.close;
    if (i >= period) sum -= candles[i - period].close;
    if (i < period - 1) return [];
    ema =
      i === period - 1
        ? sum / period
        : exponential
          ? ((c.close - ema) * 2) / (period + 1) + ema
          : sum / period;
    return [{ time: c.time, value: ema }];
  });
}
