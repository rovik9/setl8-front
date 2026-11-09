import { afterEach, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

vi.mock("../src/pages/Terminal", () => ({
  default: () => <div data-testid="sim-terminal">terminal workspace</div>,
}));
import TerminalEntry from "../src/pages/TerminalEntry";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
const at = (search: string) =>
  render(
    <MemoryRouter initialEntries={["/app/terminal" + search]}>
      <TerminalEntry />
    </MemoryRouter>,
  );
const credentialMissing = () =>
  vi.fn(
    async () =>
      new Response(
        JSON.stringify({
          api_version: "1",
          canonical_trading_supported: false,
          channel: "fixed_rate@1000ms",
          execution_mode: "market_data_only",
          historical_backfill: false,
          poll_interval_ms: "1000",
          provider_error: null,
          required_environment: "PYTH_API_KEY",
          source: "pyth_price_feeds",
          state: "credential_missing",
        }),
        { status: 200 },
      ),
  );

it("opens on the labelled BTC simulation, listed first, not on the Pyth panel", () => {
  const fetchSpy = credentialMissing();
  vi.stubGlobal("fetch", fetchSpy);
  at("");
  expect(screen.getByTestId("sim-terminal")).toBeInTheDocument();
  expect(screen.getByText(/Simulation · Local only · No funds/)).toBeVisible();
  const [first, second] = screen.getAllByRole("button");
  expect(first).toHaveTextContent("BTC simulation");
  expect(first).toHaveAttribute("aria-pressed", "true");
  expect(second).toHaveTextContent("Live Pyth prices");
  expect(second).toHaveAttribute("aria-pressed", "false");
  expect(screen.queryByLabelText("Live Pyth market data")).toBeNull();
  expect(fetchSpy).not.toHaveBeenCalled(); // the Pyth service is not even read until the tab is chosen
});
it("an unknown view value still opens the simulation", () => {
  at("?view=anything");
  expect(screen.getByTestId("sim-terminal")).toBeInTheDocument();
});
it("an unconfigured Pyth feed is one calm neutral line, no alert and no error wording", async () => {
  vi.stubGlobal("fetch", credentialMissing());
  at("?view=pyth");
  const line = await screen.findByText(
    "Live Pyth feed: not configured in this devnet demo",
  );
  expect(line).toHaveAttribute("role", "status");
  await waitFor(() => expect(screen.queryByText("Connecting…")).toBeNull());
  expect(screen.queryByRole("alert")).toBeNull();
  expect(
    screen.queryByText(
      /Provider access required|credentials|Configure credentials/i,
    ),
  ).toBeNull();
  expect(screen.queryByLabelText("Pyth market pair")).toBeNull();
});

// ---- an unreachable Pyth sidecar reads the same as an unconfigured one ----
const NEUTRAL = "Live Pyth feed: not configured in this devnet demo";
const expectNeutral = () => {
  expect(screen.getByText(NEUTRAL)).toHaveAttribute("role", "status");
  expect(screen.queryByRole("alert")).toBeNull();
  expect(screen.queryByText(/could not be read|Check the service/)).toBeNull();
  expect(screen.queryByLabelText("Pyth market pair")).toBeNull();
};
it.each([
  [
    "the request fails",
    () => vi.fn(async () => Promise.reject(new TypeError("Failed to fetch"))),
  ],
  [
    "the service answers 500",
    () => vi.fn(async () => new Response("down", { status: 500 })),
  ],
  [
    "the service answers with unreadable JSON",
    () => vi.fn(async () => new Response("<html>", { status: 200 })),
  ],
  [
    "the status is malformed",
    () =>
      vi.fn(
        async () =>
          new Response(JSON.stringify({ state: "ready" }), { status: 200 }),
      ),
  ],
] as [string, () => ReturnType<typeof vi.fn>][])(
  "shows the neutral line when %s",
  async (_n, make) => {
    vi.stubGlobal("fetch", make());
    at("?view=pyth");
    await screen.findByText(NEUTRAL);
    expectNeutral();
  },
);
it("shows the neutral line when the status read times out", async () => {
  vi.useFakeTimers({
    toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval"],
  });
  try {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        (_u: string, init: RequestInit) =>
          new Promise((_resolve, reject) =>
            init.signal!.addEventListener("abort", () =>
              reject(new DOMException("aborted", "AbortError")),
            ),
          ),
      ),
    );
    at("?view=pyth");
    expect(screen.queryByText(NEUTRAL)).toBeNull(); // still connecting
    await vi.advanceTimersByTimeAsync(7999);
    expect(screen.queryByText(NEUTRAL)).toBeNull();
    await vi.advanceTimersByTimeAsync(2);
    expectNeutral();
  } finally {
    vi.useRealTimers();
  }
});
it("a service that is ready but fails afterwards still reports its own error", async () => {
  const ready = {
    api_version: "1",
    canonical_trading_supported: false,
    channel: "fixed_rate@1000ms",
    execution_mode: "market_data_only",
    historical_backfill: false,
    poll_interval_ms: "1000",
    provider_error: null,
    required_environment: "PYTH_API_KEY",
    source: "pyth_price_feeds",
    state: "ready",
  };
  vi.stubGlobal(
    "fetch",
    vi.fn(async (u: string) =>
      u.endsWith("/v1/pyth/status")
        ? new Response(JSON.stringify(ready), { status: 200 })
        : Promise.reject(new TypeError("Failed to fetch")),
    ),
  );
  at("?view=pyth");
  expect(await screen.findByRole("alert")).toHaveTextContent(
    /could not be read/,
  );
  expect(screen.queryByText(NEUTRAL)).toBeNull();
});

// ---- review follow-ups ----
const statusBody = (state: string) => ({
  api_version: "1",
  canonical_trading_supported: false,
  channel: "fixed_rate@1000ms",
  execution_mode: "market_data_only",
  historical_backfill: false,
  poll_interval_ms: "1000",
  provider_error: null,
  required_environment: "PYTH_API_KEY",
  source: "pyth_price_feeds",
  state,
});
it.each(["credential_missing", "provider_blocked"])(
  "a 503 that carries %s is the same calm line",
  async (state) => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(JSON.stringify(statusBody(state)), { status: 503 }),
      ),
    );
    at("?view=pyth");
    await screen.findByText(NEUTRAL);
    expectNeutral();
  },
);
it("a status re-read that fails after a ready service replaces the panel with the neutral line, and a fresh view recovers", async () => {
  const market = {
    feed_id: "1",
    symbol: "Crypto.BTC/USD",
    name: "Bitcoin",
    asset_type: "crypto",
    quote_currency: "USD",
    exponent: "-8",
    state: "stable",
    minimum_channel: null,
    catalog_sha256: "ab".repeat(32),
  };
  let statusCalls = 0;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (u: string) => {
      if (u.endsWith("/v1/pyth/status")) {
        statusCalls++;
        if (statusCalls === 2) throw new TypeError("Failed to fetch");
        return new Response(JSON.stringify(statusBody("ready")), {
          status: 200,
        });
      }
      if (u.endsWith("/v1/pyth/markets"))
        return new Response(
          JSON.stringify({ ...statusBody("ready"), markets: [market] }),
          { status: 200 },
        );
      throw new TypeError("Failed to fetch"); // prices
    }),
  );
  const view = at("?view=pyth");
  const retry = await screen.findByRole("button", {
    name: "Check connection",
  });
  await waitFor(() => expect(retry).toBeEnabled());
  retry.click();
  await screen.findByText(NEUTRAL);
  expectNeutral();
  // Switching away and back mounts a fresh panel, which reads the (now healthy) service again.
  view.unmount();
  at("?view=pyth");
  expect(
    await screen.findByRole("button", { name: "Check connection" }),
  ).toBeInTheDocument();
  expect(screen.queryByText(NEUTRAL)).toBeNull();
});
