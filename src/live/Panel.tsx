import { lazy, Suspense, useEffect, useState } from "react";
import {
  checkedPrice,
  freshness,
  LIVE_BASE,
  PAIRS,
  type Pair,
  type Observation,
} from "./data";
const Chart = lazy(() => import("./CandleChart"));
const RETRY_MS = 5000;
export default function LivePanel() {
  const [pair, setPair] = useState<Pair>("BTC");
  const [rows, setRows] = useState<Observation[]>([]);
  const [unavailable, setUnavailable] = useState(false);
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    let active = true;
    let timer: ReturnType<typeof setTimeout>;
    const controller = new AbortController();
    setRows([]);
    setUnavailable(false);
    async function poll() {
      try {
        const r = await fetch(LIVE_BASE + "/v1/live/prices?ids=" + pair, {
          credentials: "omit",
          signal: AbortSignal.any([
            controller.signal,
            AbortSignal.timeout(9000),
          ]),
        });
        const body = await r.json();
        if (!active) return;
        if (
          !r.ok ||
          body.provider !== "Hyperliquid" ||
          body.execution_mode !== "observation_only" ||
          body.state !== "ready"
        )
          throw Error("unreachable");
        if (!Array.isArray(body.prices) || body.prices.length !== 1)
          throw Error("missing price");
        const sample = checkedPrice(body.prices[0], pair);
        setRows((prior) => {
          const second = Math.floor(
            Number(sample.received_timestamp_ms) / 1000,
          );
          const retained = prior.filter(
            (p) =>
              Math.floor(Number(p.received_timestamp_ms) / 1000) !== second,
          );
          return [...retained, sample].slice(-2000);
        });
        setNow(Date.now());
        setUnavailable(false);
        timer = setTimeout(() => void poll(), 1000);
      } catch {
        if (!active) return;
        // Neutral state during an outage: no stale price or plot. Keep asking; the adapter
        // applies its own 5 s / 15 s / 30 s provider backoff, so this costs the venue nothing.
        setRows([]);
        setUnavailable(true);
        timer = setTimeout(() => void poll(), RETRY_MS);
      }
    }
    void poll();
    return () => {
      active = false;
      controller.abort();
      clearTimeout(timer);
    };
  }, [pair]);
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const latest = rows.at(-1);
  return (
    <section className="pyth-panel" aria-label="Live market observation">
      <div className="pyth-heading">
        <div>
          <h1>Live market prices</h1>
          <p>
            Hyperliquid public feed · observation only · perpetual mid-prices
          </p>
        </div>
        <span className="pyth-muted">
          {latest ? freshness(latest, now) : "Awaiting observation"}
        </span>
      </div>
      <label className="pyth-controls">
        20 major crypto pairs · Market pair{" "}
        <select
          aria-label="Live market pair"
          value={pair}
          onChange={(e) => setPair(e.target.value as Pair)}
        >
          {PAIRS.map((s) => (
            <option key={s} value={s}>
              {s}/USD
            </option>
          ))}
        </select>
      </label>
      {unavailable && (
        <p className="pyth-notice" role="status">
          Market observations are temporarily unavailable.
        </p>
      )}
      <div className="pyth-price">
        <strong>{latest?.price ?? "—"}</strong>
        <span>{pair}/USD</span>
      </div>
      <p>
        Provider timestamp: not supplied. Received time:{" "}
        {latest
          ? new Date(Number(latest.received_timestamp_ms)).toISOString()
          : "Awaiting observation"}
      </p>
      {latest && (
        <Suspense fallback={<p>Opening candlestick workspace…</p>}>
          <Chart key={pair} pair={pair} />
        </Suspense>
      )}
      <p className="pyth-mode-note">
        These prices are for market observation. They are not the prices used by
        the BTC simulation and do not settle on devnet.
      </p>
    </section>
  );
}
