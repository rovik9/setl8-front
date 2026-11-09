import type {
  CandleIntervalSeconds,
  RecordedCandle,
  RecordedCandlePage,
} from "../api/frontend-v1";
import { ApiError } from "../api/client";
import { fixed } from "./exact";
export const NS = 1_000_000_000n;
export const HISTORY_PAGE_SIZE = 25;
export const HISTORY_RESPONSE_BYTES = 256 * 1024;
export const INTERVALS: CandleIntervalSeconds[] = [
  "1",
  "60",
  "300",
  "900",
  "3600",
];
const U64 = (1n << 64n) - 1n;
export interface CandleScope {
  stream: string;
  market: string;
  from_ns: string;
  to_ns: string;
  interval_s: CandleIntervalSeconds;
}
export function unsigned(value: string) {
  if (!/^\d{1,20}$/.test(value))
    throw new Error("Invalid exact timestamp or counter.");
  return BigInt(value);
}
export function rangeProblem(scope: CandleScope): string | null {
  try {
    const from = unsigned(scope.from_ns),
      to = unsigned(scope.to_ns);
    if (!scope.stream || !/^\d+$/.test(scope.market))
      return "Choose a recording stream and market.";
    if (!INTERVALS.includes(scope.interval_s))
      return "Choose a supported candle interval.";
    if (from >= to || to > U64)
      return "Choose a valid start before the end, within the timestamp bounds.";
    if (to - from > 7n * 86400n * NS)
      return "Choose a range of seven days or less.";
    const width = BigInt(scope.interval_s) * NS;
    if ((to - 1n) / width - from / width + 1n > 2000n)
      return "This range intersects more than 2,000 bucket positions. Choose a narrower range.";
    return null;
  } catch {
    return "Choose a valid UTC start and end.";
  }
}
export function candlePath(scope: CandleScope, cursor?: string) {
  const problem = rangeProblem(scope);
  if (problem) throw new ApiError(422, "range_limit", problem);
  if (cursor && cursor.length > 2048)
    throw new ApiError(
      414,
      "request_uri_limit",
      "The continuation exceeds the cursor limit. Start a fresh recording read.",
    );
  const query = new URLSearchParams({
    stream: scope.stream,
    from_ns: scope.from_ns,
    to_ns: scope.to_ns,
    interval_s: scope.interval_s,
    limit: String(HISTORY_PAGE_SIZE),
  });
  if (cursor) query.set("cursor", cursor);
  const path = `/v1/markets/${scope.market}/candles?${query}`;
  if (new TextEncoder().encode(path).length > 4096)
    throw new ApiError(
      414,
      "request_uri_limit",
      "The recording request exceeds the URI limit.",
    );
  return path;
}
/** Exact USD text; all 18 decimal places are retained, never sourced from chart coordinates. */
export const exactPrice = (value: string) => "$" + fixed(value, 18, 18);
export function exactTime(value: string): string {
  const ns = unsigned(value);
  // Date is a presentation boundary: only the safe, integral millisecond portion is converted.
  if (ns > U64 + 3600n * NS)
    throw new Error("Timestamp outside display bounds.");
  return (
    new Date(Number(ns / 1_000_000n)).toISOString().slice(0, 19) +
    "." +
    (ns % NS).toString().padStart(9, "0") +
    "Z"
  );
}
export function utcInput(ns: string) {
  return exactTime(ns).slice(0, 19);
}
export function inputNs(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/.test(value)) return "";
  const date = Date.parse(value + "Z");
  if (!Number.isSafeInteger(date) || date < 0) return "";
  return (BigInt(date) * 1_000_000n).toString();
}
export function recordedAge(ns: string, nowMs = Date.now()) {
  const elapsed = BigInt(nowMs) * 1_000_000n - unsigned(ns);
  if (elapsed < 0n)
    return "Recorded timestamp is in the future; check the recording clock";
  const seconds = elapsed / NS;
  if (seconds >= 86400n) {
    const days = seconds / 86400n;
    return `${days} day${days === 1n ? "" : "s"} old`;
  }
  if (seconds >= 3600n) {
    const hours = seconds / 3600n;
    return `${hours} hour${hours === 1n ? "" : "s"} old`;
  }
  if (seconds >= 60n) {
    const minutes = seconds / 60n;
    return `${minutes} minute${minutes === 1n ? "" : "s"} old`;
  }
  return `${seconds} seconds old · Recorded view`;
}
/** The only recorded-price float boundary. USD in [1e-12,1e12] (or zero), approximate rendering only. */
export function plottedPrice(value: string) {
  if (!/^-?\d{1,39}$/.test(value))
    throw new Error("Price outside chart presentation bounds.");
  const n = BigInt(value),
    abs = n < 0n ? -n : n;
  if (abs > 10n ** 30n || (abs > 0n && abs < 10n ** 6n))
    throw new Error(
      "Price outside chart presentation bounds. Exact values remain in candle details.",
    );
  return Number(n) / 1e18;
}
export function plottedTime(ns: string) {
  const n = unsigned(ns);
  if (n > U64 || n % NS !== 0n)
    throw new Error("Chart time must be an aligned whole Unix second.");
  return Number(n / NS);
}
export function plottedCandle(c: RecordedCandle) {
  return {
    time: plottedTime(c.bucket_start_ns),
    open: plottedPrice(c.open_e18),
    high: plottedPrice(c.high_e18),
    low: plottedPrice(c.low_e18),
    close: plottedPrice(c.close_e18),
  };
}
function invalid(message: string): never {
  throw new ApiError(410, "resync_required", message);
}
function cutoffKey(p: RecordedCandlePage) {
  const c = p.cutoff;
  return JSON.stringify([
    c.feed_id,
    c.policy_sha256,
    c.normalized_through,
    c.raw_capture_through,
    c.normalized_anchor,
    c.raw_anchor,
    p.observation_cursor,
    p.range_point_count,
    p.distinct_samples_in_range,
    p.purpose,
    p.timestamp_basis,
  ]);
}
/** Validate bounded page/scope/prefix before applying it; cursors remain opaque. Never synthesize buckets. */
export function acceptCandlePage(
  scope: CandleScope,
  page: RecordedCandlePage,
  previous: RecordedCandlePage | null,
  existing: RecordedCandle[],
) {
  if (
    page.history_version !== "1" ||
    page.format !== "setl8-recorded-market-history-v1" ||
    page.kind !== "candles" ||
    page.chart_time_field !== "source_ns" ||
    ![
      "provider_updatedAt_ms",
      "receive_time_decision_54_provider_time_absent",
    ].includes(page.timestamp_basis) ||
    !["live_record_only", "synthetic_test"].includes(page.purpose) ||
    page.stream !== scope.stream ||
    page.identity.market !== scope.market ||
    page.from_ns !== scope.from_ns ||
    page.to_ns !== scope.to_ns ||
    page.interval_s !== scope.interval_s ||
    page.recording_only !== true ||
    page.executable_quote !== false ||
    page.finalized !== false ||
    page.coverage.complete !== false
  )
    invalid(
      "The recording response changed scope or format. Start a fresh read.",
    );
  if (previous && cutoffKey(previous) !== cutoffKey(page))
    invalid(
      "The recording cutoff changed during pagination. Start a fresh read.",
    );
  if (
    page.rows.length > HISTORY_PAGE_SIZE ||
    unsigned(page.range_point_count) > 2000n ||
    unsigned(page.distinct_samples_in_range) > 10000n
  )
    throw new ApiError(
      422,
      "history_work_limit",
      "The recording exceeds the bounded chart work. Choose a narrower range.",
    );
  if (
    page.has_more !== (page.next_cursor !== null) ||
    (page.has_more &&
      (!page.rows.length || page.next_cursor === previous?.next_cursor)) ||
    (page.next_cursor?.length ?? 0) > 2048
  )
    invalid("Invalid recording continuation. Start a fresh read.");
  let last = existing.at(-1) ? BigInt(existing.at(-1)!.bucket_start_ns) : -1n;
  const from = BigInt(scope.from_ns),
    to = BigInt(scope.to_ns),
    width = BigInt(scope.interval_s) * NS;
  for (const c of page.rows) {
    const start = unsigned(c.bucket_start_ns),
      end = unsigned(c.bucket_end_ns);
    const left = start > from ? start : from,
      right = end < to ? end : to;
    if (
      start <= last ||
      start % width !== 0n ||
      end !== start + width ||
      left >= right ||
      c.sample_from_ns !== String(left) ||
      c.sample_to_ns !== String(right) ||
      c.range_clipped !== (left !== start || right !== end) ||
      c.finalized !== false ||
      unsigned(c.sample_count) < 1n ||
      unsigned(c.sample_count) > 10000n ||
      unsigned(c.provider_time_absent_count) > unsigned(c.sample_count)
    )
      invalid("Invalid candle bounds or ordering. Start a fresh read.");
    const prices = [c.open_e18, c.high_e18, c.low_e18, c.close_e18].map((v) => {
      if (
        !/^-?\d{1,39}$/.test(v) ||
        BigInt(v) < -(1n << 127n) ||
        BigInt(v) >= 1n << 127n
      )
        invalid("Invalid exact candle price.");
      return BigInt(v);
    });
    if (
      prices[1] < prices[0] ||
      prices[1] < prices[3] ||
      prices[2] > prices[0] ||
      prices[2] > prices[3]
    )
      invalid("Invalid candle price bounds.");
    last = start;
  }
  const rows = [...existing, ...page.rows];
  if (
    BigInt(rows.length) > unsigned(page.range_point_count) ||
    (!page.has_more && BigInt(rows.length) !== unsigned(page.range_point_count))
  )
    invalid("The recording point count changed. Start a fresh read.");
  return rows;
}
export function historyFailure(error: unknown): {
  kind: string;
  message: string;
} {
  if (error instanceof ApiError) {
    if (error.status === 401)
      return {
        kind: "session",
        message:
          "Your session expired. Sign in again to read recorded candles.",
      };
    if (error.status === 404)
      return {
        kind: "prerequisite",
        message:
          "Recorded candle route, market or stream unavailable. The reviewed history gateway must be activated; this is not an empty recording.",
      };
    if (error.status === 409 || error.status === 410)
      return {
        kind: "resync",
        message:
          error.status === 409
            ? "This cutoff is ahead of available recording progress. Start a fresh read explicitly."
            : "This recording cutoff can no longer be continued. Start a fresh read explicitly.",
      };
    if (
      error.status === 422 ||
      error.status === 413 ||
      error.code === "response_limit"
    )
      return {
        kind: "limit",
        message:
          "This range exceeds a work or response bound. Choose a narrower range; no partial-input candles were accepted.",
      };
    if (error.status === 503)
      return {
        kind: "unavailable",
        message:
          "Recorded history is unavailable or exceeded a service bound. Retry, or choose a narrower range.",
      };
    if (error.status === 414 || error.status === 400)
      return {
        kind: "resync",
        message:
          "This recording request or continuation was rejected. Check the range or start a fresh read.",
      };
  }
  return {
    kind: "unavailable",
    message:
      error instanceof Error
        ? error.message
        : "Recorded history is unavailable. Try again.",
  };
}
