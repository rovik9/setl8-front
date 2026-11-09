import { render, screen, waitFor, cleanup } from "@testing-library/react";
import { act } from "react";
import { afterEach, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import LivePanel from "../src/live/Panel";
import TerminalEntry from "../src/pages/TerminalEntry";
import { checkedPrice, freshness } from "../src/live/data";
vi.mock("../src/pages/Terminal", () => ({
  default: () => <div>SIMULATION FIXTURE</div>,
}));
vi.mock("../src/live/CandleChart", () => ({
  default: () => <div>Observation plot</div>,
}));
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});
const row = {
  id: "BTC",
  symbol: "BTC/USD",
  price: "90000",
  provider_timestamp_ms: null,
  received_timestamp_ms: "1794118718000",
  time_basis: "received_time",
  price_kind: "perpetual_midpoint",
};
it("rejects a symbol identity mismatch", () => {
  expect(() => checkedPrice({ ...row, symbol: "ETH/USD" }, "BTC")).toThrow();
  expect(() => checkedPrice({ ...row, id: "ETH" }, "BTC")).toThrow();
});
it("marks observations fresh only up to 15 seconds", () => {
  const checked = checkedPrice(row, "BTC");
  expect(freshness(checked, 1794118733000)).toBe("Fresh observation");
  expect(freshness(checked, 1794118733001)).toBe("Earlier observation");
  expect(freshness(checked, 1794118717999)).toBe("Earlier observation");
});
it("shows a calm neutral state when unreachable", async () => {
  vi.stubGlobal("fetch", vi.fn().mockRejectedValue(Error("offline")));
  render(<LivePanel />);
  expect(
    await screen.findByText("Market observations are temporarily unavailable."),
  ).toHaveAttribute("role", "status");
  expect(screen.queryByRole("alert")).toBeNull();
});
it("simulation remains default and never renders live observation content", () => {
  render(
    <MemoryRouter>
      <TerminalEntry />
    </MemoryRouter>,
  );
  expect(screen.getByText("SIMULATION FIXTURE")).toBeVisible();
  expect(
    screen.queryByRole("region", { name: "Live market observation" }),
  ).toBeNull();
  expect(
    screen.getByRole("button", { name: "BTC simulation" }),
  ).toHaveAttribute("aria-pressed", "true");
});
it("rejects data claiming another provider and never plots it", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        provider: "Pyth",
        execution_mode: "observation_only",
        state: "ready",
        prices: [row],
      }),
    }),
  );
  render(<LivePanel />);
  await waitFor(() =>
    expect(
      screen.getByText("Market observations are temporarily unavailable."),
    ).toBeVisible(),
  );
  expect(screen.queryByText("Observation plot")).toBeNull();
});

const ready = {
  ok: true,
  json: async () => ({
    provider: "Hyperliquid",
    execution_mode: "observation_only",
    state: "ready",
    prices: [row],
  }),
};
it("clears the old price during an outage and recovers by itself", async () => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  const fetchMock = vi
    .fn()
    .mockResolvedValueOnce(ready)
    .mockRejectedValueOnce(Error("offline"))
    .mockRejectedValueOnce(Error("offline"))
    .mockResolvedValue(ready);
  vi.stubGlobal("fetch", fetchMock);
  render(<LivePanel />);
  expect(await screen.findByText("90000")).toBeVisible();
  await act(() => vi.advanceTimersByTimeAsync(1100));
  expect(
    await screen.findByText("Market observations are temporarily unavailable."),
  ).toBeVisible();
  expect(screen.queryByText("90000")).toBeNull();
  expect(screen.queryByText("Observation plot")).toBeNull();
  const attempts = fetchMock.mock.calls.length;
  await act(() => vi.advanceTimersByTimeAsync(4000));
  expect(fetchMock.mock.calls.length).toBe(attempts);
  await act(() => vi.advanceTimersByTimeAsync(1100));
  await act(() => vi.advanceTimersByTimeAsync(5100));
  expect(await screen.findByText("90000")).toBeVisible();
  expect(
    screen.queryByText("Market observations are temporarily unavailable."),
  ).toBeNull();
});
