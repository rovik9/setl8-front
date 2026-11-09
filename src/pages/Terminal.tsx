import {
  chartAsset,
  demoFixtureMarket,
  sameChartMarket,
} from "../data/chartScope";
import { usePrototype } from "../prototype/context";
import { prototypeBridge, prototypeEnabled } from "../prototype/profile";
import {
  lazy,
  Suspense,
  useState,
  useEffect,
  type PointerEvent,
  type CSSProperties,
} from "react";
import { Link } from "react-router-dom";
import {
  Crosshair,
  Maximize2,
  Minimize2,
  PanelRightClose,
  PanelRightOpen,
  RefreshCw,
  RotateCcw,
  ChartCandlestick,
  TrendingUp,
  MousePointer2,
  ArrowUpRight,
  GripHorizontal,
  Focus,
} from "lucide-react";
import {
  useWorkspace,
  AccountSelect,
  AccountBoundary,
} from "../components/Workspace";
import { OrderDraftTicket } from "../components/OrderDraftTicket";
import { API_URL } from "../api/client";
import type { DraftScope } from "../data/orderDraft";
import { AccountPanels } from "../components/AccountPanels";
import { Badge, Button, Skeleton, tabKeys } from "../components/ui";
import { api } from "../api/client";
import { useResource } from "../hooks/resource";
import { usePaged } from "../hooks/paged";
import type { MarketRead, Page, Recording } from "../api/frontend-v1";
import { usd } from "../data/exact";
import { RecordedChart } from "../components/RecordedChart";
import { useAuth } from "../auth/context";
import { demoPrices, demoMarkets } from "../data/demo";
const MarketChart = lazy(() => import("../components/MarketChart"));
export default function Terminal() {
  const w = useWorkspace();
  const auth = useAuth();
  const prototype = usePrototype();
  const [dataMode, setDataMode] = useState<"illustrative" | "recorded">(() =>
    prototypeEnabled() ? "illustrative" : "recorded",
  );
  const illustrative =
    w.demo || (prototypeEnabled() && dataMode === "illustrative");
  const [dataMarket, setMarket] = useState("");
  const market =
    w.markets.find((m) => m.market === dataMarket) ??
    (dataMarket === "" && illustrative
      ? w.markets.find((m) => demoFixtureMarket(m) === "0")
      : undefined);
  const fixtureMarket = demoFixtureMarket(market);
  const fixtureSupported = fixtureMarket === "0";
  const focusedMarket = chartAsset(market) !== null;
  const [interval, setInterval] = useState(15);
  const [kind, setKind] = useState<"candles" | "line">("candles");
  const [fit, setFit] = useState(0);
  const [crosshair, setCrosshair] = useState(true);
  const [pad, setPad] = useState(true);
  const [focus, setFocus] = useState(false);
  const [width, setWidth] = useState(300);
  const [bottom, setBottom] = useState(222);
  const [mobileTab, setMobileTab] = useState("chart");
  const [stream, setStream] = useState("");
  const recordings = usePaged<Recording>(
    "recordings:" + w.demo + ":" + auth.epoch,
    (_, signal) =>
      w.demo
        ? Promise.resolve({
            api_version: "1",
            rows: [],
            has_more: false,
            next_after: null,
          })
        : api.request<Page<Recording>>(
            "/v1/market-recordings?limit=25" +
              (_ ? "&after=" + encodeURIComponent(_) : ""),
            { signal },
          ),
    !w.demo && !!auth.session,
  );
  useEffect(() => {
    if (prototype?.info?.phase.startsWith("staged-")) recordings.refresh();
  }, [prototype?.info?.phase]);
  const price = useResource<MarketRead>(
    "observation:" + auth.epoch + ":" + JSON.stringify(market) + ":" + stream,
    (signal) =>
      api.request(
        `/v1/markets/${market?.market}/observations?stream=${encodeURIComponent(stream)}`,
        { signal },
      ),
    !w.demo && !!auth.session && !!market && focusedMarket && !!stream,
    5000,
  );
  const candidateSample = price.data?.rows[0];
  const sample =
    market &&
    focusedMarket &&
    price.data?.stream === stream &&
    price.data.market === market.market &&
    sameChartMarket(market, candidateSample?.observation.identity)
      ? candidateSample
      : undefined;
  const value = illustrative
    ? fixtureSupported
      ? demoPrices[Number(fixtureMarket)]
      : undefined
    : sample?.observation.value_e18;
  const state = w.bundle.data?.overview.evaluator_state;
  const config = w.bundle.data?.overview.initial_config;
  const params =
    config && typeof config === "object" && !Array.isArray(config)
      ? config.params
      : null;
  const initial =
    params && typeof params === "object" && !Array.isArray(params)
      ? params
      : null;
  const initialSize =
    typeof initial?.size_micro === "string" && /^\d+$/.test(initial.size_micro)
      ? initial.size_micro
      : undefined;
  const initialPhase =
    typeof initial?.phase === "string" && /^\d+$/.test(initial.phase)
      ? initial.phase
      : undefined;
  const drag = (e: PointerEvent<HTMLDivElement>, axis: "x" | "y") => {
    const el = e.currentTarget;
    el.setPointerCapture(e.pointerId);
    const start = axis === "x" ? e.clientX : e.clientY;
    const initial = axis === "x" ? width : bottom;
    const move = (event: globalThis.PointerEvent) => {
      const delta = start - (axis === "x" ? event.clientX : event.clientY);
      if (axis === "x") setWidth(Math.max(260, Math.min(460, initial + delta)));
      else setBottom(Math.max(170, Math.min(450, initial + delta)));
    };
    const stop = () => {
      el.removeEventListener("pointermove", move);
      el.removeEventListener("pointerup", stop);
      el.removeEventListener("pointercancel", stop);
    };
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerup", stop);
    el.addEventListener("pointercancel", stop);
  };
  return (
    <main
      className="terminal"
      id="main-content"
      data-mobile-tab={mobileTab}
      style={
        {
          "--order-width": width + "px",
          "--bottom-height": bottom + "px",
        } as CSSProperties
      }
    >
      <div className="terminal-accountbar">
        <AccountSelect compact />
        {(state || initialSize) && (
          <div className="terminal-metric">
            <span>{state ? "Balance" : "Account size"}</span>
            <strong>{usd(state?.balance_micro ?? initialSize)}</strong>
          </div>
        )}
        {(state || initialPhase) && (
          <div className="terminal-metric">
            <span>{state ? "Phase" : "Initial phase"}</span>
            <strong>{state?.phase ?? initialPhase}</strong>
          </div>
        )}
        {state && (
          <div className="terminal-metric">
            <span>Positions</span>
            <strong>{state.positions.length}</strong>
          </div>
        )}
        <div className="terminal-topright">
          <Badge tone={w.demo ? "amber" : "blue"}>
            {w.demo
              ? "Demo fixtures"
              : prototypeBridge()
                ? "Synthetic execution"
                : "Read only"}
          </Badge>
          <Button
            variant="ghost"
            onClick={() => {
              w.bundle.refresh();
              w.accounts.refresh();
            }}
            aria-label="Refresh terminal account"
          >
            <RefreshCw size={15} />
          </Button>
        </div>
      </div>
      <nav className="market-watchlist" aria-label="Market watchlist">
        <span className="watchlist-label">Markets</span>
        {w.markets.map((m) => (
          <button
            type="button"
            key={m.market}
            aria-pressed={m.market === market?.market}
            onClick={() => setMarket(m.market)}
          >
            <strong>{m.symbol.replace(" / USD", "")}</strong>
            <span>
              {illustrative && demoFixtureMarket(m) === "0"
                ? usd(demoPrices[Number(demoFixtureMarket(m))], 18)
                : !illustrative && m.market === market?.market && value
                  ? usd(value, 18)
                  : ""}
            </span>
          </button>
        ))}
      </nav>
      <div
        className="mobile-workspace-tabs"
        role="tablist"
        aria-label="Terminal panels"
        onKeyDown={tabKeys}
      >
        {[
          ["chart", "Chart"],
          ["ticket", "Ticket"],
          ["account", "Account"],
        ].map(([id, label]) => (
          <button
            type="button"
            role="tab"
            key={id}
            tabIndex={mobileTab === id ? 0 : -1}
            aria-selected={mobileTab === id}
            aria-controls={"terminal-panel-" + id}
            onClick={() => {
              setMobileTab(id);
              setFocus(false);
              if (id === "ticket") setPad(true);
            }}
          >
            {label}
          </button>
        ))}
      </div>
      <div
        className={`terminal-grid ${!pad || focus ? "without-pad" : ""} ${focus ? "chart-focused" : ""}`}
      >
        <section
          id="terminal-panel-chart"
          className={"chart-stack" + (!illustrative ? " recorded-stack" : "")}
        >
          <div className="chart-toolbar">
            <div className="symbol-select">
              <label htmlFor="market" className="sr-only">
                Market
              </label>
              <select
                id="market"
                value={market?.market ?? ""}
                onChange={(e) => setMarket(e.target.value)}
              >
                {!w.demo && <option value="">Choose market</option>}
                {!w.markets.length && <option>No market catalog</option>}
                {w.markets.map((m) => (
                  <option key={m.market} value={m.market}>
                    {m.symbol}
                  </option>
                ))}
              </select>
            </div>
            <div className="toolbar-divider" />
            {illustrative ? (
              <>
                <label className="sr-only" htmlFor="timeframe">
                  Chart timeframe
                </label>
                <select
                  id="timeframe"
                  value={interval}
                  onChange={(e) => setInterval(Number(e.target.value))}
                >
                  {[1, 5, 15, 60].map((n) => (
                    <option key={n} value={n}>
                      {n === 60 ? "1h" : n + "m"}
                    </option>
                  ))}
                </select>
                <button
                  className={kind === "candles" ? "active" : ""}
                  onClick={() => setKind("candles")}
                  aria-label="Candlestick chart"
                  aria-pressed={kind === "candles"}
                >
                  <ChartCandlestick size={16} />
                </button>
                <button
                  className={kind === "line" ? "active" : ""}
                  onClick={() => setKind("line")}
                  aria-label="Line chart"
                  aria-pressed={kind === "line"}
                >
                  <TrendingUp size={16} />
                </button>
              </>
            ) : (
              <span className="toolbar-label">Recorded candle history</span>
            )}
            {!w.demo && prototypeEnabled() && (
              <div className="chart-mode-choice" aria-label="Chart data mode">
                <button
                  type="button"
                  aria-pressed={dataMode === "illustrative"}
                  onClick={() => setDataMode("illustrative")}
                >
                  Illustrative
                </button>
                <button
                  type="button"
                  aria-pressed={dataMode === "recorded"}
                  onClick={() => {
                    setDataMode("recorded");
                    setMarket("");
                  }}
                >
                  Recorded
                </button>
              </div>
            )}
            <div className="toolbar-spacer" />
            {illustrative && (
              <Button
                variant="ghost"
                aria-label="Fit chart to data"
                onClick={() => setFit((f) => f + 1)}
              >
                <Focus size={16} />
              </Button>
            )}
            <Button
              variant="ghost"
              aria-label={focus ? "Restore panels" : "Focus chart"}
              aria-pressed={focus}
              onClick={() => setFocus(!focus)}
            >
              {focus ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
            </Button>
            <Button
              variant="ghost"
              aria-label={pad ? "Hide side panel" : "Show side panel"}
              aria-pressed={pad}
              onClick={() => setPad(!pad)}
            >
              {pad ? (
                <PanelRightClose size={16} />
              ) : (
                <PanelRightOpen size={16} />
              )}
            </Button>
          </div>
          {w.marketError && (
            <p className="notice rose" role="alert">
              Market catalog: {w.marketError}
            </p>
          )}
          <div className="chart-pricebar">
            <div>
              <strong>{market?.symbol ?? "Market unavailable"}</strong>
              <span>
                {illustrative
                  ? "Illustrative fixture · " + interval + "m"
                  : "Recorded prices · Not executable quotes"}
              </span>
            </div>
            <strong className="quote-value">{usd(value, 18)}</strong>
            <Badge tone={illustrative ? "amber" : "blue"}>
              {illustrative ? "Illustrative" : "Recorded"}
            </Badge>
          </div>
          <div className="chart-canvas-area">
            {market && !focusedMarket ? (
              <div className="recorded-instruction" role="status">
                <strong>Chart unavailable for this asset</strong>
                <p>
                  Professor demo charts focus on BTC, ETH and SOL. No substitute
                  prices or another asset's chart are shown.
                </p>
              </div>
            ) : illustrative && fixtureSupported ? (
              <>
                <div className="chart-toolrail">
                  <button
                    onClick={() => setCrosshair(false)}
                    aria-label="Hide chart crosshair"
                    aria-pressed={!crosshair}
                  >
                    <MousePointer2 size={17} />
                  </button>
                  <button
                    onClick={() => setCrosshair(true)}
                    aria-label="Show chart crosshair"
                    aria-pressed={crosshair}
                  >
                    <Crosshair size={17} />
                  </button>
                  <span />
                  <button
                    onClick={() => setFit((f) => f + 1)}
                    aria-label="Reset chart view"
                  >
                    <RotateCcw size={16} />
                  </button>
                </div>
                <div className="demo-chart-region">
                  <div className="chart-watermark" aria-hidden="true">
                    {market?.symbol}
                    <small>Illustrative · Fixture data</small>
                  </div>
                  <Suspense fallback={<Skeleton rows={3} />}>
                    <MarketChart
                      market={fixtureMarket!}
                      interval={interval}
                      kind={kind}
                      fit={fit}
                      crosshair={crosshair}
                    />
                  </Suspense>
                </div>
              </>
            ) : illustrative ? (
              <div className="recorded-instruction">
                <strong>Recorded history required for this asset</strong>
                <p>
                  ETH and SOL charts require actual persisted history in the
                  connected terminal. No generated candles or BTC chart are
                  substituted.
                </p>
              </div>
            ) : (
              <RecordedChart
                key={JSON.stringify(market)}
                expectedIdentity={market}
                market={market?.market ?? ""}
                stream={stream}
                setStream={setStream}
                recordings={recordings}
                sample={sample}
              />
            )}
          </div>
          <div className="chart-bottomline">
            <span>
              {illustrative
                ? "Illustrative fixtures · No provider data"
                : "Recorded observations only"}
            </span>
            <span>
              {illustrative
                ? "Drag to pan · Scroll to zoom"
                : "Recorded windows · Coverage unknown"}
              <span className="utc-tag">UTC</span>
            </span>
          </div>
        </section>
        {!focus && (
          <>
            <div
              role="separator"
              aria-label="Resize account panel"
              tabIndex={0}
              aria-orientation="horizontal"
              aria-valuenow={bottom}
              aria-valuemin={170}
              aria-valuemax={450}
              className="resize-bottom"
              onPointerDown={(e) => drag(e, "y")}
              onKeyDown={(e) => {
                if (["ArrowUp", "ArrowDown"].includes(e.key)) {
                  e.preventDefault();
                  setBottom((h) =>
                    Math.max(
                      170,
                      Math.min(450, h + (e.key === "ArrowUp" ? 16 : -16)),
                    ),
                  );
                }
              }}
            >
              <GripHorizontal size={15} />
            </div>
            <div className="terminal-lower" id="terminal-panel-account">
              <AccountBoundary>
                <AccountPanels compact />
              </AccountBoundary>
            </div>
          </>
        )}
        {pad && !focus && (
          <>
            <div
              role="separator"
              aria-label="Resize side panel"
              tabIndex={0}
              aria-orientation="vertical"
              aria-valuenow={width}
              aria-valuemin={260}
              aria-valuemax={460}
              className="resize-side"
              onPointerDown={(e) => drag(e, "x")}
              onKeyDown={(e) => {
                if (["ArrowLeft", "ArrowRight"].includes(e.key)) {
                  e.preventDefault();
                  setWidth((v) =>
                    Math.max(
                      260,
                      Math.min(460, v + (e.key === "ArrowLeft" ? 16 : -16)),
                    ),
                  );
                }
              }}
            />
            <aside className="order-panel" id="terminal-panel-ticket">
              <OrderPanel
                demo={w.demo}
                symbol={market?.symbol ?? "No market selected"}
                draftScope={{
                  account: w.account,
                  market: market?.market ?? "",
                  wallet: auth.session?.wallet_hex ?? "",
                  sessionEpoch: auth.epoch,
                  mode: w.demo
                    ? "demo"
                    : prototype?.synced && prototypeBridge()
                      ? "prototype"
                      : "connected",
                  syntheticSession: w.demo ? undefined : prototype?.info?.id,
                  gateway: API_URL,
                }}
                stream={stream}
                recordings={recordings}
                observation={price.data}
              />
            </aside>
          </>
        )}
      </div>
      <footer className="terminal-footer">
        <span>
          <span className="status-dot" />
          {w.demo
            ? "Demo workspace"
            : w.bundle.status === "connected"
              ? "Account updates connected"
              : "Account updates " + w.bundle.status}
        </span>
        <span>
          {prototypeBridge()
            ? "Synthetic Market/Close only · Live disabled"
            : "Orders disabled · Live admission off"}
        </span>
        <Link
          to={w.base + "/accounts" + (w.account ? "?account=" + w.account : "")}
        >
          Account details
          <ArrowUpRight size={12} />
        </Link>
      </footer>
    </main>
  );
}
function OrderPanel({
  demo,
  symbol,
  draftScope,
  stream,
  recordings,
  observation,
}: {
  demo: boolean;
  symbol: string;
  draftScope: DraftScope;
  stream: string;
  recordings: ReturnType<typeof usePaged<Recording>>;
  observation: MarketRead | null;
}) {
  const [tab, setTab] = useState("Order");
  return (
    <>
      <div
        className="order-panel-tabs"
        role="tablist"
        onKeyDown={tabKeys}
        aria-label="Side panel"
      >
        {["Order", "Recording"].map((t) => (
          <button
            key={t}
            role="tab"
            tabIndex={tab === t ? 0 : -1}
            aria-selected={tab === t}
            aria-controls="side-panel-content"
            id={"side-tab-" + t}
            onClick={() => setTab(t)}
          >
            {t}
          </button>
        ))}
      </div>
      <div
        id="side-panel-content"
        role="tabpanel"
        aria-labelledby={"side-tab-" + tab}
        className="order-panel-content"
      >
        <div className="order-market">
          <strong>{symbol}</strong>
          <Badge tone={demo ? "amber" : "muted"}>
            {demo
              ? "Demo"
              : draftScope.mode === "prototype"
                ? "Simulation"
                : "Read only"}
          </Badge>
        </div>
        {tab === "Order" ? (
          <OrderDraftTicket scope={draftScope} symbol={symbol} />
        ) : (
          <div className="recording-panel">
            {demo ? (
              <>
                <Badge tone="amber">Deterministic fixture</Badge>
                <p>
                  Chart data is generated from a fixed formula. This workspace
                  never combines fixtures with your connected account.
                </p>
                <dl className="definition-list">
                  <div>
                    <dt>Source</dt>
                    <dd>Local demo</dd>
                  </div>
                  <div>
                    <dt>Execution</dt>
                    <dd>Disabled</dd>
                  </div>
                  <div>
                    <dt>Account data</dt>
                    <dd>Illustrative</dd>
                  </div>
                </dl>
              </>
            ) : (
              <>
                <strong>Selected recording</strong>
                <p>{stream || "Choose a stream above the chart."}</p>
                {stream && (
                  <Badge
                    tone={
                      recordings.rows.find((r) => r.stream === stream)
                        ?.purpose === "synthetic_test"
                        ? "amber"
                        : "blue"
                    }
                  >
                    {recordings.rows.find((r) => r.stream === stream)
                      ?.purpose ?? "Purpose unspecified"}
                  </Badge>
                )}
                <p>
                  Latest distinct stored observations. Prices may predate later
                  raw captures. No cross-stream merging.
                </p>
                <dl className="definition-list">
                  <div>
                    <dt>Executable quote</dt>
                    <dd>No</dd>
                  </div>
                  <div>
                    <dt>Coverage complete</dt>
                    <dd>No</dd>
                  </div>
                  <div>
                    <dt>Live admission</dt>
                    <dd>Disabled</dd>
                  </div>
                  <div>
                    <dt>Capture cursor</dt>
                    <dd>{observation?.capture_through ?? "—"}</dd>
                  </div>
                  <div>
                    <dt>Normalized cursor</dt>
                    <dd>{observation?.normalization_through ?? "—"}</dd>
                  </div>
                </dl>
                <p className="fine-print">
                  Ages are signed database-clock diagnostics and do not define a
                  trading freshness threshold.
                </p>
              </>
            )}
          </div>
        )}
      </div>
    </>
  );
}
