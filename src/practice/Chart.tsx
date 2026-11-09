import {
  lazy,
  Suspense,
  useEffect,
  useState,
  useSyncExternalStore,
} from "react";
import type { PracticeAccount } from "../api/practice-v1";
import { plottedPrice } from "../data/history";
import { fixed, usd } from "../data/exact";
import { Button, JsonDetails, Skeleton } from "../components/ui";
import { PracticePricesResource } from "./prices";
import type { PracticeHttp } from "./http";
const MarketChart = lazy(() => import("../components/MarketChart"));
export function PracticeChart({
  account,
  http,
}: {
  account: PracticeAccount;
  http: PracticeHttp;
}) {
  const [resource] = useState(() => new PracticePricesResource(account, http)),
    s = useSyncExternalStore(resource.subscribe, resource.getSnapshot),
    [fit, setFit] = useState(0);
  useEffect(() => {
    void resource.refresh();
    return () => resource.dispose();
  }, [resource]);
  useEffect(() => {
    void resource.refresh();
  }, [account.replay_step]);
  const points = s.rows.map((p) => {
    const time = BigInt(p.execution_second);
    if (time < 0n || time > 8640000000000n)
      throw Error("Synthetic chart timestamp exceeds the presentation bound.");
    return { time: Number(time), value: plottedPrice(p.price_e18) };
  });
  return (
    <div className="practice-chart">
      <div className="chart-toolbar">
        <strong>BTC / USD</strong>
        <span>Synthetic replay frames</span>
        <div className="toolbar-spacer" />
        <Button
          variant="ghost"
          disabled={s.loading}
          onClick={() => void resource.refresh()}
        >
          Refresh prices
        </Button>
        <Button variant="ghost" onClick={() => setFit((f) => f + 1)}>
          Fit / reset view
        </Button>
      </div>
      <div className="practice-quote">
        <strong title={account.price_e18}>
          {usd(account.price_e18, 18, 2)}
        </strong>
        <span>Exact replay mark: {usd(account.price_e18, 18, 18)}</span>
      </div>
      {s.error && (
        <p className="notice rose" role="alert">
          {s.error}
        </p>
      )}
      <div className="practice-chart-canvas">
        <Suspense fallback={<Skeleton rows={4} />}>
          <MarketChart
            market="0"
            interval={1}
            kind="line"
            fit={fit}
            crosshair
            points={points}
            navigationKey={account.account}
            pointLabel="Backend synthetic replay sample points. No interpolation, volume or live market feed. Drag to pan; Home to fit."
          />
        </Suspense>
        {!s.rows.length && (
          <p className="practice-chart-empty">
            {s.loading
              ? "Loading durable replay frames…"
              : "No stored replay frames are available."}
          </p>
        )}
      </div>
      <div className="chart-bottomline">
        <span>
          Synthetic execution clock · original source times in provenance
        </span>
        <span>
          {s.rows.length} frames · cutoff {s.through ?? "—"}
        </span>
      </div>
      {s.next && (
        <Button
          disabled={s.loading || s.rows.length >= 1000}
          onClick={() => void resource.more()}
        >
          Load 100 more fixed-cutoff frames
        </Button>
      )}
      {s.rows.length >= 1000 && s.next && (
        <p className="notice amber">
          The 1,000-frame display bound is reached. No additional history was
          silently loaded.
        </p>
      )}
      <details className="practice-provenance">
        <summary>Replay provenance and exact samples</summary>
        <p>
          Repeated historical synthetic test samples, placed at the backend's
          synthetic execution seconds. These are not exchange trades or current
          provider prices. No volume or interpolated prices. Quote wall age{" "}
          {fixed(account.quote_wall_age_ns, 9, 3)} seconds; heartbeat age{" "}
          {fixed(account.worker_heartbeat_age_ns, 9, 3)} seconds. Exact plotted
          coordinates are approximate; order review uses integer SDK values.
        </p>
        <JsonDetails
          title="Source and runtime provenance"
          value={{
            provenance: account.provenance,
            last_source: account.last_source_evidence,
            latest_frames: s.rows.slice(-5),
          }}
        />
      </details>
    </div>
  );
}
