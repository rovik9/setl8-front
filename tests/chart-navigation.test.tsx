import { render, waitFor, screen } from "@testing-library/react";
import { beforeEach, it, expect, vi } from "vitest";
import { candle, FROM } from "./fixtures/candles";
import { NS } from "../src/data/history";
const mocked = vi.hoisted(() => {
  const scale = {
    getVisibleLogicalRange: vi.fn(),
    setVisibleLogicalRange: vi.fn(),
    fitContent: vi.fn(),
    scrollPosition: vi.fn(() => 0),
    scrollToPosition: vi.fn(),
  };
  const series = { setData: vi.fn(), seriesType: () => "Candlestick" };
  const chart = {
    timeScale: () => scale,
    priceScale: () => ({ applyOptions: vi.fn() }),
    addSeries: () => series,
    subscribeCrosshairMove: vi.fn(),
    subscribeClick: vi.fn(),
    applyOptions: vi.fn(),
    remove: vi.fn(),
  };
  return { scale, series, chart, createChart: vi.fn(() => chart) };
});
vi.mock("lightweight-charts", () => ({
  createChart: mocked.createChart,
  CandlestickSeries: {},
  LineSeries: {},
  ColorType: { Solid: "solid" },
  CrosshairMode: { Normal: 0, Hidden: 2 },
}));
import MarketChart from "../src/components/MarketChart";
beforeEach(() => vi.clearAllMocks());
it("preserves the user's time window on fresh-cutoff replacements and pagination; fit is explicit", async () => {
  mocked.scale.getVisibleLogicalRange.mockReturnValue(null);
  const props = {
    market: "0",
    interval: 60,
    kind: "candles" as const,
    fit: 0,
    crosshair: true,
    navigationKey: "unchanged-scope",
  };
  const { rerender } = render(<MarketChart {...props} recorded={[candle()]} />);
  expect(mocked.scale.fitContent).toHaveBeenCalledTimes(1);
  const userWindow = { from: -3, to: 4 };
  mocked.scale.getVisibleLogicalRange.mockReturnValue(userWindow);
  rerender(
    <MarketChart
      {...props}
      recorded={[
        candle(FROM, "67843500123456789012345"),
        candle(FROM + 120n * NS),
      ]}
    />,
  );
  expect(mocked.createChart).toHaveBeenCalledTimes(1);
  expect(mocked.scale.setVisibleLogicalRange).toHaveBeenLastCalledWith(
    userWindow,
  );
  expect(mocked.scale.fitContent).toHaveBeenCalledTimes(1);
  rerender(<MarketChart {...props} fit={1} recorded={[candle()]} />);
  await waitFor(() => expect(mocked.scale.fitContent).toHaveBeenCalledTimes(2));
});

it("ETH/SOL need recorded candles and cannot reuse a BTC demo plot", () => {
  const props = {
    market: "1",
    interval: 60,
    kind: "candles" as const,
    fit: 0,
    crosshair: true,
  };
  const view = render(<MarketChart {...props} />);
  expect(screen.getByRole("status")).toHaveTextContent(
    "actual recorded history",
  );
  expect(mocked.createChart).not.toHaveBeenCalled();
  view.rerender(<MarketChart {...props} recorded={[candle()]} />);
  expect(mocked.createChart).toHaveBeenCalledTimes(1);
  expect(screen.queryByRole("status")).toBeNull();
});
