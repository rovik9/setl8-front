import { useEffect, useRef, useState } from "react";
import {
  createChart,
  CandlestickSeries,
  LineSeries,
  HistogramSeries,
  ColorType,
  CrosshairMode,
  type UTCTimestamp,
  type IChartApi,
  type ISeriesApi,
  type MouseEventParams,
} from "lightweight-charts";
import { LIVE_BASE, type Pair } from "./data";
import {
  checkedCandles,
  movingAverage,
  TIMEFRAMES,
  type Timeframe,
  type Candle,
} from "./candles";
import "./chart.css";
type Tool = "cursor" | "horizontal" | "trend" | "rectangle" | "fib" | "measure";
type Anchor = { time: number; price: number };
type Drawing = { tool: Tool; a: Anchor; b: Anchor };
const COLORS = ["#40b9dd", "#ff2d95"];
export default function CandleChart({ pair }: { pair: Pair }) {
  const [interval, setIntervalValue] = useState<Timeframe>("1m");
  const [candles, setCandles] = useState<Candle[]>([]);
  const [unavailable, setUnavailable] = useState(false);
  const [received, setReceived] = useState("");
  const [kind, setKind] = useState<"candles" | "line">("candles");
  const [volume, setVolume] = useState(true);
  const [indicator, setIndicator] = useState("none");
  const [tool, setTool] = useState<Tool>("cursor");
  const [pendingAnchor, setPendingAnchor] = useState(false);
  const [drawings, setDrawings] = useState<Drawing[]>([]);
  const [revision, bump] = useState(0);
  const [follow, setFollow] = useState(true);
  const [hover, setHover] = useState<Candle | null>(null);
  const [now, setNow] = useState(Date.now());
  const host = useRef<HTMLDivElement>(null);
  const frame = useRef<HTMLDivElement>(null);
  const chart = useRef<IChartApi | null>(null);
  const series = useRef<ISeriesApi<"Candlestick"> | ISeriesApi<"Line"> | null>(
    null,
  );
  const volumeSeries = useRef<ISeriesApi<"Histogram"> | null>(null);
  const average = useRef<ISeriesApi<"Line"> | null>(null);
  const anchor = useRef<Anchor | null>(null);
  const toolRef = useRef(tool);
  toolRef.current = tool;
  const candleRef = useRef(candles);
  candleRef.current = candles;
  useEffect(() => {
    let active = true;
    let timer: ReturnType<typeof setTimeout>;
    const abort = new AbortController();
    setCandles([]);
    setDrawings([]);
    anchor.current = null;
    setReceived("");
    setUnavailable(false);
    async function poll() {
      try {
        const response = await fetch(
          `${LIVE_BASE}/v1/live/candles?id=${pair}&interval=${interval}`,
          {
            credentials: "omit",
            signal: AbortSignal.any([abort.signal, AbortSignal.timeout(10000)]),
          },
        );
        const body = await response.json();
        if (!active) return;
        if (!response.ok) throw Error("unavailable");
        const rows = checkedCandles(body, pair, interval);
        if (!/^\d{13}$/.test(body.received_timestamp_ms))
          throw Error("Missing receipt time");
        setCandles(rows);
        setUnavailable(false);
        setReceived(body.received_timestamp_ms);
        setNow(Date.now());
        timer = setTimeout(() => void poll(), 5000);
      } catch {
        if (!active) return;
        setUnavailable(true);
        timer = setTimeout(() => void poll(), 5000);
      }
    }
    void poll();
    return () => {
      active = false;
      abort.abort();
      clearTimeout(timer);
    };
  }, [pair, interval]);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  useEffect(() => {
    if (!host.current) return;
    const api = createChart(host.current, {
      autoSize: true,
      layout: {
        background: { type: ColorType.Solid, color: "#0c1017" },
        textColor: "#98a5b7",
        attributionLogo: true,
      },
      grid: {
        vertLines: { color: "#19212d" },
        horzLines: { color: "#19212d" },
      },
      crosshair: { mode: CrosshairMode.Normal },
      timeScale: { timeVisible: true, secondsVisible: false, rightOffset: 6 },
      rightPriceScale: { borderColor: "#263143" },
      handleScroll: true,
      handleScale: true,
    });
    const price =
      kind === "candles"
        ? api.addSeries(CandlestickSeries, {
            upColor: COLORS[0],
            downColor: COLORS[1],
            wickUpColor: COLORS[0],
            wickDownColor: COLORS[1],
            borderVisible: false,
          })
        : api.addSeries(LineSeries, { color: COLORS[0], lineWidth: 2 });
    price
      .priceScale()
      .applyOptions({ scaleMargins: { top: 0.12, bottom: 0.25 } });
    const vol = api.addSeries(HistogramSeries, {
      priceFormat: { type: "volume" },
      priceScaleId: "volume",
    });
    vol.priceScale().applyOptions({ scaleMargins: { top: 0.82, bottom: 0 } });
    const ma = api.addSeries(LineSeries, {
      color: "#f6c76c",
      lineWidth: 1,
      priceLineVisible: false,
      lastValueVisible: false,
    });
    chart.current = api;
    series.current = price;
    volumeSeries.current = vol;
    average.current = ma;
    const redraw = () => bump((x) => x + 1);
    api.timeScale().subscribeVisibleLogicalRangeChange(redraw);
    const onClick = (p: MouseEventParams) => {
      if (
        toolRef.current === "cursor" ||
        !p.point ||
        typeof p.time !== "number"
      )
        return;
      const value = price.coordinateToPrice(p.point.y);
      if (value === null) return;
      const point = { time: Number(p.time), price: Number(value) };
      if (toolRef.current === "horizontal") {
        setDrawings((d) => [...d, { tool: "horizontal", a: point, b: point }]);
        return;
      }
      if (!anchor.current) {
        anchor.current = point;
        setPendingAnchor(true);
        return;
      }
      const a = anchor.current;
      anchor.current = null;
      setPendingAnchor(false);
      setDrawings((d) => [...d, { tool: toolRef.current, a, b: point }]);
    };
    const cross = (p: MouseEventParams) => {
      setHover(
        typeof p.time === "number"
          ? (candleRef.current.find((c) => c.time === p.time) ?? null)
          : null,
      );
    };
    api.subscribeClick(onClick);
    api.subscribeCrosshairMove(cross);
    const observer = new ResizeObserver(redraw);
    observer.observe(host.current);
    return () => {
      observer.disconnect();
      chart.current = null;
      series.current = null;
      api.remove();
    };
  }, [pair, interval, kind]);
  useEffect(() => {
    const api = chart.current,
      price = series.current;
    if (!api || !price || !candles.length) return;
    const data = candles.map((c) => ({ ...c, time: c.time as UTCTimestamp }));
    if (price.seriesType() === "Candlestick")
      (price as ISeriesApi<"Candlestick">).setData(data);
    else
      (price as ISeriesApi<"Line">).setData(
        data.map((c) => ({ time: c.time, value: c.close })),
      );
    const min =
      candles.at(-1)!.close < 1 ? 6 : candles.at(-1)!.close < 100 ? 4 : 2;
    price.applyOptions({
      priceFormat: { type: "price", precision: min, minMove: 10 ** -min },
    });
    volumeSeries.current?.setData(
      volume
        ? data.map((c) => ({
            time: c.time,
            value: c.volume,
            color: c.close >= c.open ? "#40b9dd55" : "#ff2d9555",
          }))
        : [],
    );
    average.current?.setData(
      indicator === "none"
        ? []
        : movingAverage(candles, 20, indicator === "ema").map((p) => ({
            ...p,
            time: p.time as UTCTimestamp,
          })),
    );
    if (follow)
      api.timeScale().setVisibleLogicalRange({
        from: Math.max(0, candles.length - 100),
        to: candles.length + 5,
      });
    bump((x) => x + 1);
  }, [candles, kind, volume, indicator, follow]);
  const current = hover ?? candles.at(-1);
  const point = (a: Anchor) => ({
    x: chart.current?.timeScale().timeToCoordinate(a.time as UTCTimestamp),
    y: series.current?.priceToCoordinate(a.price),
  });
  void revision;
  return (
    <section
      className="live-candle-workspace"
      aria-label="Hyperliquid candlestick chart"
    >
      <div
        className="live-chart-toolbar"
        role="toolbar"
        aria-label="Chart controls"
      >
        <strong>{pair}/USD · PERP</strong>
        {TIMEFRAMES.map((t) => (
          <button
            key={t}
            aria-pressed={interval === t}
            onClick={() => setIntervalValue(t)}
          >
            {t}
          </button>
        ))}
        <select
          aria-label="Chart type"
          value={kind}
          onChange={(e) => setKind(e.target.value as typeof kind)}
        >
          <option value="candles">Candlesticks</option>
          <option value="line">Line</option>
        </select>
        <select
          aria-label="Indicator"
          value={indicator}
          onChange={(e) => setIndicator(e.target.value)}
        >
          <option value="none">Indicators</option>
          <option value="sma">SMA 20</option>
          <option value="ema">EMA 20</option>
        </select>
        <button aria-pressed={volume} onClick={() => setVolume((v) => !v)}>
          Volume
        </button>
        <button aria-pressed={follow} onClick={() => setFollow((f) => !f)}>
          Follow live
        </button>
        <button
          onClick={() => {
            chart.current?.timeScale().fitContent();
            bump((x) => x + 1);
          }}
        >
          Fit history
        </button>
        <button
          onClick={() => {
            if (!document.fullscreenElement)
              void frame.current?.requestFullscreen();
            else void document.exitFullscreen();
          }}
        >
          Fullscreen
        </button>
      </div>
      <div className="live-chart-ohlc">
        {current
          ? `O ${current.open}   H ${current.high}   L ${current.low}   C ${current.close}   V ${current.volume}`
          : "Loading genuine exchange candles…"}
      </div>
      {unavailable && (
        <p className="pyth-notice" role="status">
          Market candles are temporarily unavailable.
        </p>
      )}
      <div
        className="live-chart-tools"
        role="toolbar"
        aria-label="Drawing tools"
      >
        {(
          [
            "cursor",
            "horizontal",
            "trend",
            "rectangle",
            "fib",
            "measure",
          ] as Tool[]
        ).map((t) => (
          <button
            key={t}
            aria-pressed={tool === t}
            onClick={() => {
              setTool(t);
              anchor.current = null;
            }}
          >
            {
              {
                cursor: "Crosshair",
                horizontal: "Horizontal line",
                trend: "Trend line",
                rectangle: "Rectangle",
                fib: "Fibonacci",
                measure: "Measure",
              }[t]
            }
          </button>
        ))}
        <button
          disabled={!drawings.length}
          onClick={() => setDrawings((d) => d.slice(0, -1))}
        >
          Undo drawing
        </button>
        <button
          disabled={!drawings.length}
          onClick={() => {
            setDrawings([]);
            anchor.current = null;
          }}
        >
          Clear drawings
        </button>
      </div>
      <p className="live-chart-hint">
        {tool === "cursor"
          ? "Drag to pan · Scroll to zoom · Turn off Follow live to study history"
          : tool === "horizontal"
            ? "Click the chart to place a horizontal level"
            : "Click two points on the chart to draw. Choose Crosshair to return to navigation."}
      </p>
      <p className="live-chart-hint" role="status">
        {pendingAnchor
          ? "First point placed. Click the second point."
          : `${drawings.length} chart annotations`}
      </p>
      <div
        className="live-chart-frame"
        ref={frame}
        onWheel={() => setFollow(false)}
        onPointerDown={() => {
          if (tool === "cursor") setFollow(false);
        }}
      >
        <div ref={host} className="live-chart-host" />
        <svg className="live-drawings" aria-label="Chart annotations">
          {drawings.map((d, i) => {
            const a = point(d.a),
              b = point(d.b);
            if (a.x == null || a.y == null || b.x == null || b.y == null)
              return null;
            const x = Math.min(a.x, b.x),
              y = Math.min(a.y, b.y),
              w = Math.abs(a.x - b.x),
              h = Math.abs(a.y - b.y);
            if (d.tool === "horizontal")
              return (
                <g key={i}>
                  <line x1={0} x2="100%" y1={a.y} y2={a.y} />
                  <text x={10} y={a.y - 5}>
                    {d.a.price.toFixed(4)}
                  </text>
                </g>
              );
            if (d.tool === "rectangle")
              return (
                <rect
                  key={i}
                  x={x}
                  y={y}
                  width={w}
                  height={h}
                  fill="#40b9dd18"
                />
              );
            if (d.tool === "fib")
              return (
                <g key={i}>
                  {[0, 0.236, 0.382, 0.5, 0.618, 0.786, 1].map((r) => {
                    const yy = a.y! + (b.y! - a.y!) * r;
                    return (
                      <g key={r}>
                        <line x1={x} x2={x + w} y1={yy} y2={yy} />
                        <text x={x + 5} y={yy - 4}>
                          {r} ·{" "}
                          {(d.a.price + (d.b.price - d.a.price) * r).toFixed(4)}
                        </text>
                      </g>
                    );
                  })}
                </g>
              );
            return (
              <g key={i}>
                <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} />
                {d.tool === "measure" && (
                  <text x={x + 5} y={y + 16}>
                    {((d.b.price / d.a.price - 1) * 100).toFixed(2)}% ·{" "}
                    {Math.round(Math.abs(d.b.time - d.a.time) / 60)} min
                  </text>
                )}
              </g>
            );
          })}
        </svg>
      </div>
      <p className="live-chart-hint">
        Hyperliquid exchange OHLCV · candle times supplied by provider · latest
        candle is provisional. Received time:{" "}
        {received
          ? new Date(Number(received)).toISOString()
          : "awaiting candles"}{" "}
        ·{" "}
        {received && now - Number(received) <= 15000
          ? "Fresh observation"
          : "Earlier observation"}
        .
      </p>
    </section>
  );
}
