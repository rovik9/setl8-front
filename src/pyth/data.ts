import type {
  PythPriceBatchV1,
  PythPriceSampleV1,
} from "../api/pyth-recording-v1";

export type FeedState = "ready" | "credential_missing" | "provider_blocked";
export interface FeedStatus {
  api_version: "1";
  source: "pyth_price_feeds";
  state: FeedState;
  execution_mode: "market_data_only";
  canonical_trading_supported: false;
  historical_backfill: false;
}
export interface FeedMarket {
  feed_id: string;
  symbol: string;
  name: string | null;
  asset_type: string | null;
  quote_currency: string | null;
  exponent: string;
  state: string | null;
  minimum_channel: string | null;
  catalog_sha256: string;
}
export interface FeedCatalog extends FeedStatus {
  markets: FeedMarket[];
}
const BASE = "http://127.0.0.1:8794";
const integer = (v: unknown): v is string =>
  typeof v === "string" && /^(0|[1-9][0-9]{0,39})$/.test(v);
const hash = (v: unknown) => typeof v === "string" && /^[a-f0-9]{64}$/.test(v);
function check(condition: unknown, message: string): asserts condition {
  if (!condition) throw Error(message);
}
export function checkedStatus(value: unknown): FeedStatus {
  const v = value as FeedStatus;
  check(
    v &&
      v.api_version === "1" &&
      v.source === "pyth_price_feeds" &&
      ["ready", "credential_missing", "provider_blocked"].includes(v.state) &&
      v.execution_mode === "market_data_only" &&
      v.canonical_trading_supported === false &&
      v.historical_backfill === false,
    "Pyth service returned an unsupported status.",
  );
  return v;
}
export function checkedCatalog(value: unknown): FeedCatalog {
  const status = checkedStatus(value),
    v = value as FeedCatalog;
  check(
    Array.isArray(v.markets) && v.markets.length <= 10000,
    "Pyth catalog exceeds its supported bound.",
  );
  const seen = new Set<string>();
  for (const m of v.markets) {
    check(
      m &&
        integer(m.feed_id) &&
        BigInt(m.feed_id) > 0n &&
        BigInt(m.feed_id) <= 4294967295n &&
        !seen.has(m.feed_id) &&
        typeof m.symbol === "string" &&
        m.symbol.length > 0 &&
        m.symbol.length <= 160 &&
        /^-?\d{1,2}$/.test(m.exponent) &&
        Number(m.exponent) >= -38 &&
        Number(m.exponent) <= 18 &&
        hash(m.catalog_sha256),
      "Pyth catalog identity is incomplete.",
    );
    seen.add(m.feed_id);
  }
  check(
    status.state === "ready" || !v.markets.length,
    "Pyth catalog status does not match its rows.",
  );
  return v;
}
export function checkedPrices(
  value: unknown,
  market: FeedMarket,
): PythPriceSampleV1[] {
  const v = value as PythPriceBatchV1;
  check(
    v &&
      v.api_version === "1" &&
      v.pyth_version === "1" &&
      v.source === "pyth_price_feeds" &&
      v.execution_mode === "market_data_only" &&
      v.historical_backfill === false &&
      v.canonical_trading_supported === false &&
      v.chart_basis === "recorded_price_samples" &&
      hash(v.raw_sha256) &&
      Array.isArray(v.samples) &&
      v.samples.length === 1,
    "Pyth price response does not match the requested feed.",
  );
  for (const s of v.samples) {
    check(
      s &&
        s.provider === "pyth_price_feeds" &&
        s.feed_id === market.feed_id &&
        s.symbol === market.symbol &&
        s.catalog_sha256 === market.catalog_sha256 &&
        s.price_exponent === market.exponent &&
        s.channel === "fixed_rate@1000ms" &&
        s.canonical_admission === "blocked_pyth_source_unsupported" &&
        [
          s.price_integer,
          s.price_e18,
          s.source_unix_ns,
          s.received_unix_ns,
          s.provider_timestamp_us,
          s.batch_timestamp_us,
        ].every(integer) &&
        BigInt(s.price_integer) > 0n &&
        BigInt(s.price_e18) > 0n &&
        BigInt(s.source_unix_ns) === BigInt(s.provider_timestamp_us) * 1000n &&
        BigInt(s.source_unix_ns) <= BigInt(s.received_unix_ns) &&
        BigInt(s.provider_timestamp_us) <= BigInt(s.batch_timestamp_us) &&
        BigInt(s.received_unix_ns) <= 18446744073709551615n &&
        ["feed_update_microseconds", "batch_update_microseconds"].includes(
          s.timestamp_basis,
        ) &&
        hash(s.raw_sha256),
      "Pyth sample identity or exact timestamp could not be checked.",
    );
    const shift = Number(s.price_exponent) + 18;
    const mantissa = BigInt(s.price_integer);
    const divisor = 10n ** BigInt(Math.abs(shift));
    check(
      shift >= 0
        ? mantissa * divisor === BigInt(s.price_e18)
        : mantissa % divisor === 0n &&
            mantissa / divisor === BigInt(s.price_e18),
      "Pyth exact price conversion disagrees.",
    );
  }
  return v.samples;
}
export async function feedRead(
  path: string,
  signal: AbortSignal,
): Promise<unknown> {
  check(
    ["http://127.0.0.1:5173", "http://localhost:3000"].includes(
      window.location.origin,
    ),
    "Pyth preview requires the local demo workspace.",
  );
  const response = await fetch(BASE + path, {
    signal,
    credentials: "omit",
    cache: "no-store",
    redirect: "error",
  });
  const reader = response.body?.getReader();
  check(reader, "Pyth service returned no response.");
  const decoder = new TextDecoder();
  let bytes = 0,
    text = "";
  for (;;) {
    const part = await reader.read();
    if (part.done) break;
    bytes += part.value.length;
    if (bytes > 4194304) {
      await reader.cancel();
      throw Error("Pyth response exceeds the supported size.");
    }
    text += decoder.decode(part.value, { stream: true });
  }
  text += decoder.decode();
  const value = JSON.parse(text);
  if (!response.ok) {
    if (value?.state === "credential_missing")
      throw Error("Pyth credentials are not configured on the local service.");
    if (value?.state === "provider_blocked")
      throw Error(
        "The Pyth provider request was blocked. Service review is required.",
      );
    throw Error("The Pyth read could not be completed. Recording is paused.");
  }
  return value;
}
export function retainedSamples(
  rows: PythPriceSampleV1[],
  incoming: PythPriceSampleV1[],
) {
  const merged = new Map(
    rows.map((s) => [s.source_unix_ns + ":" + s.price_e18, s]),
  );
  for (const s of incoming) merged.set(s.source_unix_ns + ":" + s.price_e18, s);
  return [...merged.values()]
    .sort((a, b) =>
      BigInt(a.source_unix_ns) < BigInt(b.source_unix_ns)
        ? -1
        : BigInt(a.source_unix_ns) > BigInt(b.source_unix_ns)
          ? 1
          : 0,
    )
    .slice(-2000);
}
/** Bounded chart presentation only. Exact e18/ns strings remain in the samples. */
export function plottedSamples(rows: PythPriceSampleV1[]) {
  const seconds = new Map<number, number>();
  for (const s of rows) {
    const time = BigInt(s.source_unix_ns) / 1000000000n;
    const price = BigInt(s.price_e18);
    check(
      time <= BigInt(Number.MAX_SAFE_INTEGER) && price <= 10n ** 30n,
      "This price is outside the chart presentation range.",
    );
    seconds.set(Number(time), Number(price) / 1e18);
  }
  return [...seconds].map(([time, value]) => ({ time, value }));
}
export function exactPrice(value: string) {
  check(integer(value), "Exact price unavailable.");
  const n = BigInt(value),
    fraction = (n % 1000000000000000000n).toString().padStart(18, "0");
  return (n / 1000000000000000000n).toLocaleString("en-US") + "." + fraction;
}
