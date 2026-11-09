export const LIVE_BASE = "http://127.0.0.1:8795";
export const PAIRS = [
  "BTC",
  "ETH",
  "BNB",
  "XRP",
  "SOL",
  "TRX",
  "ZEC",
  "HYPE",
  "XMR",
  "DOGE",
  "LINK",
  "ADA",
  "XLM",
  "BCH",
  "NEAR",
  "UNI",
  "LTC",
  "AVAX",
  "SUI",
  "HBAR",
] as const;
export type Pair = (typeof PAIRS)[number];
export interface Observation {
  id: Pair;
  symbol: string;
  price: string;
  provider_timestamp_ms: null;
  received_timestamp_ms: string;
  time_basis: "received_time";
  price_kind: "perpetual_midpoint";
}
export function checkedPrice(value: unknown, pair: Pair): Observation {
  const v = value as Observation;
  if (
    !v ||
    v.id !== pair ||
    v.symbol !== pair + "/USD" ||
    v.time_basis !== "received_time" ||
    v.provider_timestamp_ms !== null ||
    v.price_kind !== "perpetual_midpoint" ||
    typeof v.price !== "string" ||
    !/^\d+(\.\d+)?$/.test(v.price) ||
    !Number.isFinite(Number(v.price)) ||
    Number(v.price) <= 0 ||
    !/^\d{13}$/.test(v.received_timestamp_ms)
  )
    throw Error("The observation does not match the selected market.");
  return v;
}
export function freshness(row: Observation, now: number) {
  const age = now - Number(row.received_timestamp_ms);
  return age >= 0 && age <= 15000 ? "Fresh observation" : "Earlier observation";
}
