import { it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
const fixture = vi.hoisted(() => ({ page: {} as any }));
vi.mock("../src/auth/context", () => ({
  useAuth: () => ({ epoch: 4, session: { wallet: "controlled" } }),
}));
vi.mock("../src/hooks/candles", () => ({
  useCandles: () => ({ rows: [], page: fixture.page }),
}));
vi.mock("../src/components/MarketChart", () => ({
  default: () => <p>Unexpected plot</p>,
}));
import { RecordedChart } from "../src/components/RecordedChart";
const selected = {
  market: "0",
  symbol: "ETH / USD",
  source: "2",
  feed_id: "21".repeat(32),
  max_age_secs: "15",
};
it.each(["asset", "feed"])(
  "a recorded %s mismatch is shown as unavailable instead of relabeling an old BTC plot",
  (field) => {
    fixture.page = {
      identity:
        field === "asset"
          ? { ...selected, symbol: "BTC / USD" }
          : { ...selected, feed_id: "99".repeat(32) },
    };
    const setStream = vi.fn();
    render(
      <RecordedChart
        expectedIdentity={selected}
        market="0"
        stream="old-recording"
        setStream={setStream}
        recordings={{ rows: [] } as any}
      />,
    );
    expect(screen.getByRole("status")).toHaveTextContent(
      "Recorded identity does not match this asset",
    );
    expect(screen.queryByText("Unexpected plot")).toBeNull();
    fireEvent.click(
      screen.getByRole("button", { name: "Choose another recording" }),
    );
    expect(setStream).toHaveBeenCalledWith("");
  },
);
