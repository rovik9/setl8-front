import { sameChartMarket } from "../data/chartScope";
import { lazy, Suspense, useMemo, useState, useRef } from "react";
import type {
  CandleIntervalSeconds,
  MarketIdentity,
  MarketObservation,
  Recording,
} from "../api/frontend-v1";
import type { usePaged } from "../hooks/paged";
import { useAuth } from "../auth/context";
import { useCandles } from "../hooks/candles";
import {
  exactPrice,
  exactTime,
  inputNs,
  INTERVALS,
  NS,
  plottedCandle,
  rangeProblem,
  recordedAge,
  utcInput,
  type CandleScope,
} from "../data/history";
import { Badge, Button, JsonDetails } from "./ui";
const MarketChart = lazy(() => import("./MarketChart"));
export function RecordedChart({
  expectedIdentity,
  market,
  stream,
  setStream,
  recordings,
  sample,
}: {
  expectedIdentity?: MarketIdentity;
  market: string;
  stream: string;
  setStream: (s: string) => void;
  recordings: ReturnType<typeof usePaged<Recording>>;
  sample?: MarketObservation;
}) {
  const auth = useAuth();
  // Scope-keyed child clears both applied range and exact details on identity changes.
  return (
    <RecordedChartScope
      key={JSON.stringify([auth.epoch, stream, market])}
      {...{ market, stream, setStream, recordings, sample, expectedIdentity }}
      sessionKey={String(auth.epoch)}
    />
  );
}
function RecordedChartScope({
  expectedIdentity,
  market,
  stream,
  setStream,
  recordings,
  sample,
  sessionKey,
}: {
  expectedIdentity?: MarketIdentity;
  market: string;
  stream: string;
  setStream: (s: string) => void;
  recordings: ReturnType<typeof usePaged<Recording>>;
  sample?: MarketObservation;
  sessionKey: string;
}) {
  const picker = useRef<HTMLDetailsElement>(null);
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [interval, setInterval] = useState<CandleIntervalSeconds>("60");
  const [scope, setScope] = useState<CandleScope | null>(null);
  const [fit, setFit] = useState(0);
  const [selection, setSelection] = useState("");
  const draft: CandleScope = {
    stream,
    market,
    from_ns: inputNs(start),
    to_ns: inputNs(end),
    interval_s: interval,
  };
  const problem = rangeProblem(draft);
  const chart = useCandles(scope, sessionKey);
  const page = chart.page;
  const identityMismatch =
    !!expectedIdentity &&
    !!page &&
    !sameChartMarket(expectedIdentity, page.identity);
  const selected =
    chart.rows.find((c) => c.bucket_start_ns === selection) ??
    chart.rows.at(-1);
  const presentation = useMemo(() => {
    if (identityMismatch) return null;
    try {
      chart.rows.forEach(plottedCandle);
      return null;
    } catch (e) {
      return (e as Error).message;
    }
  }, [chart.rows, identityMismatch]);
  const setRange = (from: bigint, to: bigint) => {
    setStart(utcInput(String(from)));
    setEnd(utcInput(String(to)));
    setScope(null);
  };
  const useRecorded = () => {
    if (!sample) return;
    const to = (BigInt(sample.observation.source_ns) / NS + 1n) * NS;
    const duration = (interval === "1" ? 900n : 3600n) * NS;
    setRange(to > duration ? to - duration : 0n, to);
  };
  const narrow = () => {
    if (!draft.from_ns || !draft.to_ns) return;
    const from = BigInt(draft.from_ns),
      to = BigInt(draft.to_ns);
    if (to <= from) return;
    const seconds = (to - from) / NS;
    const bounded = seconds / 2n < 1n ? 1n : seconds / 2n;
    const next = from + bounded * NS;
    // Explicit button changes the draft only; the user applies the revised range.
    setRange(from, next < to ? next : to);
  };
  const cancelDraft = () => setScope(null);
  if (identityMismatch)
    return (
      <div className="recorded-instruction" role="status">
        <strong>Recorded identity does not match this asset</strong>
        <p>
          No substitute chart or quote is shown. Choose a recording for the
          selected market.
        </p>
        <Button onClick={() => setStream("")}>Choose another recording</Button>
      </div>
    );

  return (
    <div className="recorded-chart-workspace">
      <details ref={picker} className="recorded-picker">
        <summary>
          <span>Recorded dataset</span>
          <strong>
            {stream ? "Change stream & window" : "Choose stream & time window"}
          </strong>
        </summary>
        <div className="recorded-controls">
          <label>
            Recording stream
            <select
              aria-label="Chart recording stream"
              value={stream}
              onChange={(e) => setStream(e.target.value)}
            >
              <option value="">Choose a stream</option>
              {recordings.rows.map((r) => (
                <option key={r.stream} value={r.stream}>
                  {r.stream} · {r.purpose ?? "Unspecified purpose"}
                </option>
              ))}
            </select>
          </label>
          <label>
            Interval
            <select
              aria-label="Recorded candle interval"
              value={interval}
              onChange={(e) => {
                setInterval(e.target.value as CandleIntervalSeconds);
                cancelDraft();
              }}
            >
              {INTERVALS.map((i) => (
                <option key={i} value={i}>
                  {
                    {
                      "1": "1 second",
                      "60": "1 minute",
                      "300": "5 minutes",
                      "900": "15 minutes",
                      "3600": "1 hour",
                    }[i]
                  }
                </option>
              ))}
            </select>
          </label>
          {recordings.loading && <span role="status">Loading streams…</span>}
          {recordings.error && (
            <p role="alert">
              {recordings.error}
              <Button onClick={recordings.refresh}>Retry streams</Button>
            </p>
          )}
          {recordings.next && (
            <Button disabled={recordings.loading} onClick={recordings.more}>
              More streams
            </Button>
          )}
          {!recordings.loading &&
            !recordings.error &&
            !recordings.rows.length && <p>No recording streams returned.</p>}
          <label>
            From · UTC
            <input
              aria-label="Recorded range start UTC"
              type="datetime-local"
              step="1"
              value={start}
              onChange={(e) => {
                setStart(e.target.value);
                cancelDraft();
              }}
            />
          </label>
          <label>
            Until · UTC (excluded)
            <input
              aria-label="Recorded range end UTC"
              type="datetime-local"
              step="1"
              value={end}
              onChange={(e) => {
                setEnd(e.target.value);
                cancelDraft();
              }}
            />
          </label>
        </div>
      </details>
      <div className="recorded-actions">
        <Button onClick={useRecorded} disabled={!sample || !stream || !market}>
          Use last recorded {interval === "1" ? "15 minutes" : "hour"}
        </Button>
        <Button
          variant="primary"
          disabled={!!problem || chart.loading}
          onClick={() => {
            if (picker.current) picker.current.open = false;
            setSelection("");
            if (JSON.stringify(scope) === JSON.stringify(draft))
              chart.refresh();
            else setScope(draft);
          }}
        >
          Load recorded range
        </Button>
        <Button disabled={!scope} onClick={chart.refresh}>
          Refresh recording
        </Button>
        <Button
          disabled={!chart.rows.length}
          onClick={() => setFit((f) => f + 1)}
        >
          Fit / reset view
        </Button>
      </div>
      <div className="recorded-chart-scroll">
        {!scope && (
          <div className="recorded-instruction">
            <strong>Your recorded workspace.</strong>
            <p>
              Select a recording to explore its stored candles. Coverage remains
              unknown.
            </p>
            <a className="button secondary" href="/demo/terminal">
              Explore illustrative preview
            </a>
            {problem && start && end && <p role="alert">{problem}</p>}
            {start && end && (
              <Button onClick={narrow}>Narrow range by half</Button>
            )}
          </div>
        )}
        {chart.loading && (
          <p className="recorded-status" role="status">
            {page
              ? "Reading recording… Previous cutoff remains visible until replacement."
              : "Loading recorded candles…"}
          </p>
        )}
        {chart.error && (
          <div className="notice rose recorded-error" role="alert">
            <strong>
              {chart.error.kind === "prerequisite"
                ? "History integration required"
                : chart.error.kind === "resync"
                  ? "Recording resync required"
                  : chart.error.kind === "limit"
                    ? "Choose a narrower range"
                    : "Recorded chart unavailable"}
            </strong>
            <p>{chart.error.message}</p>
            {page && (
              <p>Previously loaded cutoff shown; continuation is stopped.</p>
            )}
            {chart.error.kind !== "session" && (
              <Button onClick={chart.refresh}>Start fresh read</Button>
            )}
            {["limit", "unavailable"].includes(chart.error.kind) && (
              <Button onClick={narrow}>Narrow range by half</Button>
            )}
          </div>
        )}
        {page && (
          <>
            <div className="recorded-context">
              <Badge
                tone={page.purpose === "synthetic_test" ? "amber" : "blue"}
              >
                {page.purpose === "synthetic_test"
                  ? "Synthetic test recording"
                  : "Live-source recording · archived view"}
              </Badge>
              <strong>
                {page.first_sample_ref
                  ? exactTime(page.first_sample_ref.source_ns).slice(0, 10)
                  : "No recorded date in range"}
              </strong>
              {page.last_sample_ref && (
                <span>{recordedAge(page.last_sample_ref.source_ns)}</span>
              )}
              <span>
                {page.timestamp_basis === "provider_updatedAt_ms"
                  ? "Axis: GMX provider updatedAt"
                  : "Axis: receive time · provider time not supplied"}
              </span>
              <span>
                Coverage unknown · Not finalized · Not a current market feed
              </span>
            </div>
            {presentation ? (
              <p role="alert" className="notice rose">
                {presentation}
              </p>
            ) : (
              <div className="recorded-plot">
                <Suspense
                  fallback={<p role="status">Loading chart renderer…</p>}
                >
                  <MarketChart
                    market={market}
                    interval={Number(interval)}
                    kind="candles"
                    recorded={chart.rows}
                    navigationKey={JSON.stringify(scope)}
                    fit={fit}
                    crosshair
                    onCandle={setSelection}
                  />
                </Suspense>
                {!chart.rows.length && (
                  <p className="recorded-empty">
                    No stored samples in this range. Empty buckets remain
                    absent; coverage is unknown.
                  </p>
                )}
              </div>
            )}
            <div className="recorded-pagination">
              <span>
                {chart.rows.length} of {page.range_point_count} nonempty buckets
                · {page.distinct_samples_in_range} distinct price samples
              </span>
              <Button
                onClick={chart.more}
                disabled={
                  !page.next_cursor ||
                  chart.loading ||
                  chart.continuationBlocked
                }
              >
                Load more candles
              </Button>
            </div>
            <p className="recorded-caveat">
              Later recorded data can revise earlier candles. Empty intervals
              stay absent; spacing follows recorded buckets. No missing prices
              are interpolated. These samples are stored observations. Plotted
              USD values are approximate; exact values below remain
              authoritative for this display.
            </p>
            {selected && (
              <details className="candle-details">
                <summary>Exact candle values and sample references</summary>
                <label>
                  Candle bucket
                  <select
                    aria-label="Exact candle bucket"
                    value={selected.bucket_start_ns}
                    onChange={(e) => setSelection(e.target.value)}
                  >
                    {chart.rows.map((c) => (
                      <option key={c.bucket_start_ns} value={c.bucket_start_ns}>
                        {exactTime(c.bucket_start_ns)}
                        {c.range_clipped ? " · Partial range boundary" : ""}
                      </option>
                    ))}
                  </select>
                </label>
                <dl className="candle-values">
                  {(
                    [
                      ["Open", selected.open_e18],
                      ["High", selected.high_e18],
                      ["Low", selected.low_e18],
                      ["Close", selected.close_e18],
                    ] as const
                  ).map(([name, v]) => (
                    <div key={name}>
                      <dt>{name} · USD</dt>
                      <dd>{exactPrice(v)}</dd>
                    </div>
                  ))}
                </dl>
                <p>
                  Sample window: {exactTime(selected.sample_from_ns)} to{" "}
                  {exactTime(selected.sample_to_ns)} (excluded).{" "}
                  {selected.range_clipped
                    ? "Partial boundary bucket; only samples within this window contribute."
                    : "Aligned bucket; coverage remains unknown."}
                </p>
                <p>
                  {selected.sample_count} distinct samples ·{" "}
                  {selected.provider_time_absent_count} without provider time ·
                  Non-finalized
                </p>
                <JsonDetails
                  title="Exact ns/e18 values and OHLC provenance"
                  value={selected}
                />
              </details>
            )}
            <details className="recorded-diagnostics">
              <summary>
                Recording provenance, cutoff and receive diagnostics
              </summary>
              <p>
                Purpose: {page.purpose}. Source {page.identity.source}; feed{" "}
                {page.identity.feed_id}. Time basis: {page.timestamp_basis}.
              </p>
              <p>
                Requested: {exactTime(page.from_ns)} to {exactTime(page.to_ns)}{" "}
                (excluded). Raw capture {page.cutoff.raw_capture_through};
                normalized through {page.cutoff.normalized_through}. Backlog:{" "}
                {page.coverage.normalized_backlog_at_cutoff}.
              </p>
              <p>
                {!page.receive_window_diagnostics.scan_complete
                  ? "Diagnostics truncated: only an inspected receive-order prefix is counted. Uninspected receipt count is unknown."
                  : "Receive-window diagnostic scan complete; market coverage is still unknown."}{" "}
                Omitted evidence within the inspected prefix:{" "}
                {
                  page.receive_window_diagnostics
                    .omitted_inspected_evidence_count
                }
                .
              </p>
              <p>
                Receive diagnostics use receive time and cannot prove
                provider-time chart coverage. First/last samples do not prove
                recording start/end or continuous acquisition. Missing provider
                timestamps remain null. Sample and duplicate receipt counts are
                not trading volume.
              </p>
              <JsonDetails
                title="Exact cutoff, coverage and bounded diagnostics"
                value={{ ...page, rows: undefined }}
              />
            </details>
          </>
        )}
      </div>
    </div>
  );
}
