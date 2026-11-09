/** Controlled synthetic transport fixture, never imported by production code. */
import type {
  RecordedCandle,
  RecordedCandlePage,
  RecordedSampleRef,
} from "../../src/api/frontend-v1";
import type { CandleScope } from "../../src/data/history";
import { NS } from "../../src/data/history";
import { demoMarkets } from "../../src/data/demo";
export const FROM = 1792800000n * NS;
export const fixtureScope: CandleScope = {
  stream: "controlled-synthetic-recording",
  market: "0",
  from_ns: String(FROM),
  to_ns: String(FROM + 600n * NS),
  interval_s: "60",
};
export function reference(ns = FROM, seq = 1): RecordedSampleRef {
  return {
    capture_seq: String(seq),
    semantic_key: `synthetic/${seq}`,
    source_ns: String(ns),
    receive_ns: String(ns + 17n),
    provider_time_ns: null,
    timestamp_basis: "receive_time_decision_54_provider_time_absent",
    metadata_evidence: null,
    raw_sha256: "aa".repeat(32),
    envelope_sha256: "bb".repeat(32),
  };
}
export function candle(
  start = FROM,
  close = "67842500123456789012345",
  scope = fixtureScope,
): RecordedCandle {
  const width = BigInt(scope.interval_s) * NS,
    end = start + width;
  const from = BigInt(scope.from_ns),
    to = BigInt(scope.to_ns);
  const left = start > from ? start : from,
    right = end < to ? end : to;
  const ref = reference(left);
  return {
    bucket_start_ns: String(start),
    bucket_end_ns: String(end),
    sample_from_ns: String(left),
    sample_to_ns: String(right),
    range_clipped: left !== start || right !== end,
    open_e18: "67841000123456789012345",
    high_e18: "67850000123456789012345",
    low_e18: "67840000123456789012345",
    close_e18: close,
    sample_count: "3",
    provider_time_absent_count: "3",
    open_ref: ref,
    high_ref: ref,
    low_ref: ref,
    close_ref: ref,
    finalized: false,
  };
}
export function candlePage(
  rows = [candle()],
  scope = fixtureScope,
  cutoff = "9",
  next: string | null = null,
  count = rows.length,
): RecordedCandlePage {
  return {
    api_version: "1",
    history_version: "1",
    format: "setl8-recorded-market-history-v1",
    kind: "candles",
    stream: scope.stream,
    identity: { ...demoMarkets[Number(scope.market)], market: scope.market },
    purpose: "synthetic_test",
    chart_time_field: "source_ns",
    timestamp_basis: "receive_time_decision_54_provider_time_absent",
    from_ns: scope.from_ns,
    to_ns: scope.to_ns,
    interval_s: scope.interval_s,
    cutoff: {
      feed_id: "fixture-lineage",
      policy_sha256: "ab".repeat(32),
      normalized_through: cutoff,
      raw_capture_through: cutoff,
      normalized_anchor: "bc".repeat(32),
      raw_anchor: "bc".repeat(32),
    },
    rows,
    next_cursor: next,
    has_more: next !== null,
    observation_cursor: "opaque-observation-" + cutoff,
    range_point_count: String(count),
    distinct_samples_in_range: String(count * 3),
    first_sample_ref: count ? reference(BigInt(scope.from_ns)) : null,
    last_sample_ref: count ? reference(BigInt(scope.to_ns) - 1n) : null,
    receive_window_diagnostics: {
      axis: "receive_ns",
      counts_scope: "inspected_receive_order_prefix",
      scan_complete: false,
      uninspected_receipt_count: null,
      inspected_through: { receive_ns: scope.to_ns, capture_seq: cutoff },
      from_ns: scope.from_ns,
      to_ns: scope.to_ns,
      raw_receipts: "5000",
      normalized_receipts: "4999",
      pending_receipts: "1",
      market_candidates_including_duplicates: "3",
      semantic_duplicate_candidates: "1",
      transport_gap_receipts: "1",
      market_or_global_issue_receipts: "0",
      evidence: [],
      omitted_inspected_evidence_count: "12",
      meaning: "Controlled diagnostic prefix; coverage unknown",
    },
    coverage: {
      complete: false,
      receive_diagnostics_truncated: true,
      missing_intervals: "unknown",
      deduplication: "distinct recorded samples",
      normalized_backlog_at_cutoff: "0",
      later_data_may_change_prior_candles: true,
    },
    recording_only: true,
    executable_quote: false,
    finalized: false,
    live_admission: "disabled",
    production_reorder_window_ns: null,
  };
}
