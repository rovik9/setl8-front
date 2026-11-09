import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import type { PythPriceSampleV1 } from "../api/pyth-recording-v1";
import {
  checkedCatalog,
  checkedPrices,
  checkedStatus,
  exactPrice,
  feedRead,
  plottedSamples,
  retainedSamples,
  type FeedCatalog,
  type FeedStatus,
} from "./data";

const Chart = lazy(() => import("../components/MarketChart"));
export default function PythPanel() {
  const [status, setStatus] = useState<FeedStatus | null>(null);
  const [catalog, setCatalog] = useState<FeedCatalog | null>(null);
  const [feed, setFeed] = useState("");
  const [search, setSearch] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  // The status read failed or timed out: the sidecar is not reachable, which reads the same as "not configured".
  const [unreachable, setUnreachable] = useState(false);
  const [revision, setRevision] = useState(0);
  const [rows, setRows] = useState<PythPriceSampleV1[]>([]);
  const [paused, setPaused] = useState(false);
  const [fit, setFit] = useState(0);
  const [clock, setClock] = useState(Date.now);
  const [selection, setSelection] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    const timeout = setTimeout(() => controller.abort(), 8000);
    setLoading(true);
    setError(null);
    setUnreachable(false);
    let statusRead = false;
    void (async () => {
      const next = checkedStatus(
        await feedRead("/v1/pyth/status", controller.signal),
      );
      if (!active) return;
      statusRead = true;
      setStatus(next);
      if (next.state !== "ready") {
        setCatalog(null);
        setFeed("");
        return;
      }
      const list = checkedCatalog(
        await feedRead("/v1/pyth/markets", controller.signal),
      );
      if (!active) return;
      setStatus(list);
      setCatalog(list);
      setFeed((previous) =>
        list.markets.some((m) => m.feed_id === previous)
          ? previous
          : ((
              list.markets.find(
                (m) => m.symbol.includes("BTC") && m.symbol.includes("USD"),
              ) ?? list.markets[0]
            )?.feed_id ?? ""),
      );
    })()
      .catch(() => {
        if (!active) return;
        if (!statusRead) {
          // Nothing from an earlier read may keep polling behind the neutral line.
          setStatus(null);
          setCatalog(null);
          setFeed("");
          setUnreachable(true);
        } else
          setError(
            "The local Pyth service could not be read. Check the service and try again.",
          );
      })
      .finally(() => {
        clearTimeout(timeout);
        if (active) setLoading(false);
      });
    return () => {
      active = false;
      controller.abort();
      clearTimeout(timeout);
    };
  }, [revision]);
  const market = catalog?.markets.find((m) => m.feed_id === feed);
  useEffect(() => {
    setRows([]);
    setSelection("");
    setPaused(false);
    if (!market || status?.state !== "ready") return;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    let request: AbortController | null = null;
    const poll = async () => {
      request = new AbortController();
      const cancel = () => request?.abort();
      controller.signal.addEventListener("abort", cancel, { once: true });
      const deadline = setTimeout(cancel, 5000);
      try {
        const data = await feedRead(
          "/v1/pyth/prices?ids=" + market.feed_id,
          request.signal,
        );
        const incoming = checkedPrices(data, market);
        if (controller.signal.aborted) return;
        setRows((previous) => retainedSamples(previous, incoming));
        setError(null);
        setClock(Date.now());
        timer = setTimeout(() => void poll(), 1000);
      } catch (e) {
        if (!controller.signal.aborted) {
          setPaused(true);
          setError(
            e instanceof Error
              ? e.message
              : "Pyth recording paused. Check the local service.",
          );
        }
      } finally {
        clearTimeout(deadline);
        controller.signal.removeEventListener("abort", cancel);
      }
    };
    void poll();
    return () => {
      controller.abort();
      request?.abort();
      clearTimeout(timer);
    };
  }, [market, status?.state, revision]);
  useEffect(() => {
    const timer = setInterval(() => setClock(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  const matches =
    catalog?.markets.filter((m) =>
      (m.symbol + " " + (m.name ?? "") + " " + (m.asset_type ?? ""))
        .toLowerCase()
        .includes(search.toLowerCase()),
    ) ?? [];
  const options = matches.slice(0, 100);
  const latest = rows.at(-1);
  const selected =
    rows.find((s) => s.source_unix_ns + ":" + s.price_e18 === selection) ??
    latest;
  const age = latest
    ? BigInt(clock) * 1000000n - BigInt(latest.source_unix_ns)
    : null;
  const fresh = age !== null && age >= 0n && age <= 15000000000n && !paused;
  const plot = useMemo(() => {
    try {
      return { points: plottedSamples(rows), error: null };
    } catch (e) {
      return { points: [], error: (e as Error).message };
    }
  }, [rows]);
  if (status?.state === "credential_missing" || unreachable)
    return (
      <section className="pyth-panel" aria-label="Live Pyth market data">
        <p className="pyth-notice" role="status">
          Live Pyth feed: not configured in this devnet demo
        </p>
      </section>
    );
  return (
    <section className="pyth-panel" aria-label="Live Pyth market data">
      <div className="pyth-heading">
        <div>
          <h1>Live market prices</h1>
          <p>Pyth Price Feeds · observed samples · market data only</p>
        </div>
        <span className={fresh ? "pyth-fresh" : "pyth-muted"}>
          {loading
            ? "Connecting…"
            : paused
              ? "Recording paused"
              : fresh
                ? "Receiving samples"
                : latest
                  ? "Earlier observation"
                  : "Awaiting samples"}
        </span>
      </div>
      {status?.state === "provider_blocked" && (
        <div className="pyth-notice" role="status">
          <strong>Provider access is blocked</strong>
          <p>The local service needs review before recording can resume.</p>
        </div>
      )}
      {error && (
        <p role="alert" className="pyth-notice">
          {error}
        </p>
      )}
      <div className="pyth-controls">
        <label>
          Find a pair
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="BTC, ETH, SOL…"
            disabled={!catalog}
          />
        </label>
        <label>
          Market pair
          <select
            aria-label="Pyth market pair"
            value={feed}
            disabled={!catalog?.markets.length}
            onChange={(e) => {
              setFeed(e.target.value);
              setRows([]);
              setSelection("");
              setError(null);
            }}
          >
            {!catalog?.markets.length && (
              <option value="">
                Pairs appear when the provider is available
              </option>
            )}
            {market && !options.some((m) => m.feed_id === market.feed_id) && (
              <option value={market.feed_id}>{market.symbol}</option>
            )}
            {options.map((m) => (
              <option key={m.feed_id} value={m.feed_id}>
                {m.symbol}
                {m.name ? " · " + m.name : ""}
              </option>
            ))}
          </select>
        </label>
        <button
          className="button secondary"
          disabled={loading}
          onClick={() => setRevision((v) => v + 1)}
        >
          Check connection
        </button>
      </div>
      {catalog && (
        <p className="pyth-caption">
          {catalog.markets.length} catalog pairs · {matches.length} match
          {options.length < matches.length
            ? " · first 100 shown, refine your search"
            : ""}
        </p>
      )}
      <div className="pyth-price">
        <strong>{latest ? exactPrice(latest.price_e18) : "—"}</strong>
        <span>{market?.symbol ?? "Choose a Pyth pair"}</span>
      </div>
      {plot.error ? (
        <p role="alert">{plot.error}</p>
      ) : plot.points.length ? (
        <div className="pyth-chart">
          <Suspense fallback={<p role="status">Opening price chart…</p>}>
            <Chart
              market={feed}
              interval={1}
              kind="line"
              fit={fit}
              crosshair
              points={plot.points}
              pointLabel="Observed Pyth price · approximate plot"
              navigationKey={"pyth:" + feed}
            />
          </Suspense>
        </div>
      ) : (
        <div className="pyth-empty">
          <p>Observed prices will appear here.</p>
          <span>
            The chart starts with the samples received during this view.
          </span>
        </div>
      )}
      <div className="pyth-chart-footer">
        <p>
          One observed point per second. Missing periods remain empty. Up to
          2,000 samples retained in this view.
        </p>
        <button
          className="button secondary"
          disabled={!rows.length}
          onClick={() => setFit((v) => v + 1)}
        >
          Fit / reset chart
        </button>
      </div>
      <p className="pyth-mode-note">
        Pyth prices are shown for market observation. BTC practice orders use
        the separate simulation workspace.
      </p>
      {selected && (
        <details className="pyth-details">
          <summary>Exact price, timestamps & source</summary>
          <label>
            Recorded sample
            <select
              value={selected.source_unix_ns + ":" + selected.price_e18}
              onChange={(e) => setSelection(e.target.value)}
            >
              {rows.map((s) => (
                <option
                  key={s.source_unix_ns + ":" + s.price_e18}
                  value={s.source_unix_ns + ":" + s.price_e18}
                >
                  {s.source_unix_ns} ns
                </option>
              ))}
            </select>
          </label>
          <dl>
            <dt>Exact price</dt>
            <dd>{exactPrice(selected.price_e18)}</dd>
            <dt>Exact e18 price</dt>
            <dd>{selected.price_e18}</dd>
            <dt>Source timestamp (ns)</dt>
            <dd>{selected.source_unix_ns}</dd>
            <dt>Received timestamp (ns)</dt>
            <dd>{selected.received_unix_ns}</dd>
            <dt>Time basis</dt>
            <dd>{selected.timestamp_basis}</dd>
            <dt>Provider / channel</dt>
            <dd>
              {selected.provider} / {selected.channel}
            </dd>
            <dt>Raw response SHA-256</dt>
            <dd>{selected.raw_sha256}</dd>
            <dt>Catalog SHA-256</dt>
            <dd>{selected.catalog_sha256}</dd>
          </dl>
        </details>
      )}
    </section>
  );
}
