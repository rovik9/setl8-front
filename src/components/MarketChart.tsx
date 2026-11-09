import { useEffect, useMemo, useRef } from "react";
import {
  CandlestickSeries,
  LineSeries,
  ColorType,
  CrosshairMode,
  createChart,
  type UTCTimestamp,
  type IChartApi,
  type ISeriesApi,
} from "lightweight-charts";
import { demoCandles } from "../data/demo";
import type { RecordedCandle } from "../api/frontend-v1";
import { plottedCandle } from "../data/history";
export default function MarketChart({
  market,
  interval,
  kind,
  fit,
  crosshair,
  recorded,
  navigationKey,
  onCandle,
  points,
  pointLabel,
}: {
  market: string;
  interval: number;
  kind: "candles" | "line";
  fit: number;
  crosshair: boolean;
  recorded?: RecordedCandle[];
  navigationKey?: string;
  onCandle?: (bucket: string) => void;
  points?: { time: number; value: number }[];
  pointLabel?: string;
}) {
  const demoUnavailable =
    recorded === undefined && points === undefined && market !== "0";
  const ref = useRef<HTMLDivElement>(null);
  const apiRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<
    ISeriesApi<"Candlestick"> | ISeriesApi<"Line"> | null
  >(null);
  const detail = useRef(onCandle);
  detail.current = onCandle;
  const source = useRef(recorded);
  source.current = recorded;
  const first = useRef(true);
  const data = useMemo(
    () =>
      points !== undefined || demoUnavailable
        ? []
        : recorded === undefined
          ? demoCandles(market, interval)
          : recorded.map(plottedCandle),
    [recorded, market, interval, points, demoUnavailable],
  );
  useEffect(() => {
    if (!ref.current) return;
    const chart = createChart(ref.current, {
      autoSize: true,
      layout: {
        background: { type: ColorType.Solid, color: "#101113" },
        textColor: "#8e939e",
        fontFamily: "IBM Plex Mono, monospace",
        fontSize: 10,
        attributionLogo: true,
      },
      grid: {
        vertLines: { color: "#1b1e23" },
        horzLines: { color: "#1b1e23" },
      },
      rightPriceScale: { borderColor: "#292c33", minimumWidth: 76 },
      timeScale: {
        borderColor: "#292c33",
        timeVisible: true,
        secondsVisible: true,
        rightOffset: 3,
        shiftVisibleRangeOnNewBar: false,
      },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: { color: "#697787", labelBackgroundColor: "#283749" },
        horzLine: { color: "#697787", labelBackgroundColor: "#283749" },
      },
      handleScale: true,
      handleScroll: true,
    });
    const series =
      kind === "candles"
        ? chart.addSeries(CandlestickSeries, {
            upColor: "#32a9cb",
            downColor: "#ed4a93",
            wickUpColor: "#32a9cb",
            wickDownColor: "#ed4a93",
            borderVisible: false,
          })
        : chart.addSeries(LineSeries, {
            color: "#41b4d5",
            lineWidth: 2,
            lineVisible: !points,
            pointMarkersVisible: !!points,
            pointMarkersRadius: 3,
          });
    seriesRef.current = series;
    const select = (event: { time?: unknown }) => {
      if (typeof event.time === "number") {
        const c = source.current?.find(
          (c) =>
            Number(BigInt(c.bucket_start_ns) / 1_000_000_000n) === event.time,
        );
        if (c) detail.current?.(c.bucket_start_ns);
      }
    };
    chart.subscribeCrosshairMove(select);
    chart.subscribeClick(select);
    apiRef.current = chart;
    first.current = true;
    return () => {
      apiRef.current = null;
      seriesRef.current = null;
      chart.remove();
    };
  }, [kind, navigationKey, demoUnavailable]);
  useEffect(() => {
    const chart = apiRef.current,
      series = seriesRef.current;
    if (!chart || !series) return;
    const scale = chart.timeScale();
    const visible = scale.getVisibleLogicalRange();
    const replayPoints = points?.map((p) => ({
      ...p,
      time: p.time as UTCTimestamp,
    }));
    const plotted = data.map((c) => ({ ...c, time: c.time as UTCTimestamp }));
    if (series.seriesType() === "Candlestick")
      (series as ISeriesApi<"Candlestick">).setData(plotted);
    else
      (series as ISeriesApi<"Line">).setData(
        replayPoints ?? plotted.map((c) => ({ time: c.time, value: c.close })),
      );
    if (first.current && (replayPoints ?? plotted).length) {
      scale.fitContent();
      first.current = false;
    } else if (visible && (replayPoints ?? plotted).length)
      scale.setVisibleLogicalRange(visible);
  }, [data, kind, navigationKey, points]);
  useEffect(() => {
    apiRef.current?.applyOptions({
      crosshair: {
        mode: crosshair ? CrosshairMode.Normal : CrosshairMode.Hidden,
      },
    });
  }, [crosshair, kind, navigationKey]);
  useEffect(() => {
    if (fit) {
      apiRef.current?.timeScale().fitContent();
      apiRef.current?.priceScale("right").applyOptions({ autoScale: true });
    }
  }, [fit]);
  if (demoUnavailable)
    return (
      <p role="status">
        Chart unavailable. ETH/SOL require actual recorded history; no BTC
        fixture is substituted.
      </p>
    );
  return (
    <div
      ref={ref}
      className="market-chart"
      role="region"
      tabIndex={0}
      onKeyDown={(e) => {
        const scale = apiRef.current?.timeScale();
        if (!scale) return;
        if (e.key === "Home") {
          e.preventDefault();
          scale.fitContent();
          apiRef.current?.priceScale("right").applyOptions({ autoScale: true });
        } else if (["ArrowLeft", "ArrowRight"].includes(e.key)) {
          e.preventDefault();
          scale.scrollToPosition(
            scale.scrollPosition() + (e.key === "ArrowLeft" ? 6 : -6),
            false,
          );
        }
      }}
      aria-label={
        pointLabel ??
        (recorded === undefined
          ? "Interactive demo market chart with deterministic fixtures. Drag to pan, scroll to zoom."
          : "Interactive recorded candle chart. Approximate USD coordinates, exact values in candle details. Drag to pan, scroll to zoom; Home to fit.")
      }
    />
  );
}
