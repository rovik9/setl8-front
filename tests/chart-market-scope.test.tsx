import { it, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import {
  chartAsset,
  demoFixtureMarket,
  sameChartMarket,
} from "../src/data/chartScope";
import { demoCandles, demoMarkets } from "../src/data/demo";
const fixture = vi.hoisted(() => ({ workspace: {} as any }));
vi.mock("../src/components/Workspace", () => ({
  useWorkspace: () => fixture.workspace,
  AccountSelect: () => <span>Controlled account selector</span>,
  AccountBoundary: ({ children }: any) => children,
}));
vi.mock("../src/auth/context", () => ({
  useAuth: () => ({ session: null, epoch: 0 }),
}));
vi.mock("../src/prototype/context", () => ({ usePrototype: () => null }));
vi.mock("../src/prototype/profile", () => ({
  prototypeEnabled: () => false,
  prototypeBridge: () => false,
}));
vi.mock("../src/hooks/resource", () => ({
  useResource: () => ({
    data: null,
    error: null,
    loading: false,
    refresh: vi.fn(),
  }),
}));
vi.mock("../src/hooks/paged", () => ({
  usePaged: () => ({
    rows: [],
    error: null,
    loading: false,
    hasMore: false,
    refresh: vi.fn(),
    more: vi.fn(),
  }),
}));
vi.mock("../src/components/AccountPanels", () => ({
  AccountPanels: () => <div>Controlled account panels</div>,
}));
vi.mock("../src/components/OrderDraftTicket", () => ({
  OrderDraftTicket: ({ scope, symbol }: any) => (
    <p>
      Selected order identity {scope.market} {symbol} · orders disabled
    </p>
  ),
}));
vi.mock("../src/components/RecordedChart", () => ({
  RecordedChart: ({ market }: any) => <p>Recorded chart identity {market}</p>,
}));
vi.mock("../src/components/MarketChart", () => ({
  default: ({ market }: any) => <p>Demo chart identity {market}</p>,
}));
import Terminal from "../src/pages/Terminal";
import DemoPreview from "../src/components/DemoPreview";
beforeEach(() => {
  fixture.workspace = {
    demo: true,
    base: "/demo",
    account: null,
    markets: [
      ...demoMarkets,
      { ...demoMarkets[0], market: "7", symbol: "XRP / USD" },
    ],
    marketError: null,
    accounts: { refresh: vi.fn() },
    bundle: { data: null, status: "connected", refresh: vi.fn() },
  };
});
it.each([
  ["0", "BTC / USD"],
  ["1", "ETH / USD"],
  ["2", "SOL / USD"],
])("maps %s only to its correct explicit demo asset", (market, symbol) => {
  expect(demoFixtureMarket({ market, symbol })).toBe(market);
  expect(demoCandles(market)).toHaveLength(96);
});
it("unsupported fixture IDs never fall back to BTC prices", () => {
  expect(demoCandles("7")).toEqual([]);
  expect(demoCandles("BTC")).toEqual([]);
  expect(demoFixtureMarket({ market: "0", symbol: "ETH / USD" })).toBeNull();
  expect(chartAsset({ symbol: "XRP / USD" })).toBeNull();
});
it("ETH/SOL demo selections require persisted history; another listed asset remains unavailable", async () => {
  render(
    <MemoryRouter>
      <Terminal />
    </MemoryRouter>,
  );
  await screen.findByText("Demo chart identity 0");
  fireEvent.change(screen.getByRole("combobox", { name: "Market" }), {
    target: { value: "1" },
  });
  expect(
    screen.getByText("Recorded history required for this asset"),
  ).toBeVisible();
  expect(screen.queryByText("Demo chart identity 0")).toBeNull();
  fireEvent.change(screen.getByRole("combobox", { name: "Market" }), {
    target: { value: "2" },
  });
  expect(
    screen.getByText("Recorded history required for this asset"),
  ).toBeVisible();
  fireEvent.change(screen.getByRole("combobox", { name: "Market" }), {
    target: { value: "7" },
  });
  expect(screen.getByText("Chart unavailable for this asset")).toBeVisible();
  expect(screen.queryByText(/Demo chart identity/)).toBeNull();
  expect(screen.getByText(/Selected order identity 7 XRP/)).toBeVisible();
});
it("a mislabeled demo catalog cannot put BTC data under an ETH label", () => {
  fixture.workspace.markets = [{ ...demoMarkets[0], symbol: "ETH / USD" }];
  render(
    <MemoryRouter>
      <Terminal />
    </MemoryRouter>,
  );
  fireEvent.change(screen.getByRole("combobox", { name: "Market" }), {
    target: { value: "0" },
  });
  expect(
    screen.getByText("Recorded history required for this asset"),
  ).toBeVisible();
  expect(screen.queryByText(/Demo chart identity/)).toBeNull();
});
it("connected history keeps selected backend market IDs and never substitutes demo data", () => {
  fixture.workspace.demo = false;
  fixture.workspace.base = "/app";
  fixture.workspace.markets = [
    { ...demoMarkets[1], market: "11" },
    { ...demoMarkets[2], market: "12" },
    { ...demoMarkets[0], market: "13", symbol: "XRP / USD" },
  ];
  render(
    <MemoryRouter>
      <Terminal />
    </MemoryRouter>,
  );
  fireEvent.change(screen.getByRole("combobox", { name: "Market" }), {
    target: { value: "11" },
  });
  expect(screen.getByText("Recorded chart identity 11")).toBeVisible();
  fireEvent.change(screen.getByRole("combobox", { name: "Market" }), {
    target: { value: "12" },
  });
  expect(screen.getByText("Recorded chart identity 12")).toBeVisible();
  expect(screen.queryByText(/Demo chart identity/)).toBeNull();
  fireEvent.change(screen.getByRole("combobox", { name: "Market" }), {
    target: { value: "13" },
  });
  expect(screen.getByText("Chart unavailable for this asset")).toBeVisible();
  expect(screen.queryByText(/Recorded chart identity/)).toBeNull();
  expect(
    screen.getByText("Orders disabled · Live admission off"),
  ).toBeVisible();
});

it("preview ETH/SOL selections show recorded-history-required without generated price or candle SVG", () => {
  render(
    <MemoryRouter>
      <DemoPreview />
    </MemoryRouter>,
  );
  fireEvent.click(screen.getByRole("button", { name: "ETH / USD" }));
  expect(screen.getByRole("status")).toHaveTextContent(
    "actual recorded history",
  );
  expect(
    screen.queryByRole("img", { name: /Deterministic demo candlestick/ }),
  ).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "SOL / USD" }));
  expect(screen.getByRole("status")).toHaveTextContent(
    "actual recorded history",
  );
  fireEvent.click(screen.getByRole("button", { name: "BTC / USD" }));
  expect(
    screen.getByRole("img", { name: /Deterministic demo candlestick/ }),
  ).toBeVisible();
});

it("recorded quotes/charts require matching asset, market, source and feed, not just a numeric ID", () => {
  const btc = demoMarkets[0];
  expect(sameChartMarket(btc, { ...btc, symbol: "BTC" })).toBe(true);
  expect(sameChartMarket(btc, { ...btc, symbol: "ETH / USD" })).toBe(false);
  expect(sameChartMarket(btc, { ...btc, feed_id: "99".repeat(32) })).toBe(
    false,
  );
  expect(sameChartMarket(btc, { ...btc, source: "4" })).toBe(false);
});
