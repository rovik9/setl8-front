/** Exact Pyth sample representation. Served loopback wrappers are declared below. */
export interface PythPriceSampleV1 {
  provider: "pyth_price_feeds";
  feed_id: string;
  symbol: string;
  name: string | null;
  asset_type: string | null;
  quote_currency: string | null;
  state: string | null;
  minimum_channel: string | null;
  channel: "fixed_rate@1000ms";
  exponent: string;
  price_integer: string;
  price_exponent: string;
  price_e18: string;
  provider_timestamp_us: string;
  batch_timestamp_us: string;
  timestamp_basis: "feed_update_microseconds" | "batch_update_microseconds";
  source_unix_ns: string;
  received_unix_ns: string;
  confidence_integer: string | null;
  market_session: string | null;
  raw_sha256: string;
  catalog_sha256: string;
  canonical_admission: "blocked_pyth_source_unsupported";
}
export interface PythPriceBatchV1 {
  api_version: "1";
  pyth_version: "1";
  source: "pyth_price_feeds";
  execution_mode: "market_data_only";
  samples: PythPriceSampleV1[];
  raw_sha256: string;
  historical_backfill: false;
  chart_basis: "recorded_price_samples";
  canonical_trading_supported: false;
}

/** Public loopback service at http://127.0.0.1:8794. Simple GET, credentials omitted. */
export type PythServiceState = "ready" | "credential_missing" | "provider_blocked";
export interface PythServiceStatusV1 {
  api_version: "1";
  source: "pyth_price_feeds";
  state: PythServiceState;
  required_environment: "PYTH_API_KEY";
  provider_error: string | null;
  channel: "fixed_rate@1000ms";
  poll_interval_ms: "1000";
  execution_mode: "market_data_only";
  canonical_trading_supported: false;
  historical_backfill: false;
}
export interface PythCatalogMarketV1 {
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
/** GET /v1/pyth/markets. HTTP 200 with an empty array when credentials are absent. */
export interface PythMarketsV1 extends PythServiceStatusV1 {
  markets: PythCatalogMarketV1[];
}
/** GET /v1/pyth/prices?ids=ID,ID. At most 22 distinct numeric catalog IDs. */
export interface PythPricesV1 extends PythPriceBatchV1 {
  state: PythServiceState;
}
/** GET /v1/pyth/candles?feed_id=ID&interval_s=60&from_s=SECONDS&to_s=SECONDS */
export interface PythCandlesV1 extends PythServiceStatusV1 {
  feed_id: string;
  interval_s: string;
  from_unix_s: string;
  to_unix_s: string;
  cutoff_sequence: string;
  candles: Array<{
    time_unix_s: string;
    open_e18: string;
    high_e18: string;
    low_e18: string;
    close_e18: string;
    sample_count: string;
  }>;
  coverage: {
    samples_retained: string;
    selected_samples: string;
    maximum_samples_retained: "2000";
    range_may_be_partial: true;
    empty_intervals: "omitted";
    basis: "observed_pyth_price_samples";
    finality: "recomputed_from_recorded_observations";
  };
}
/** HTTP 503 for missing credential or provider failure, HTTP 400 for malformed queries. */
export interface PythServiceErrorV1 extends PythServiceStatusV1 {
  error: string;
}
