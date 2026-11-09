import { act, render, screen, fireEvent } from "@testing-library/react";
import { afterEach, it, expect, vi } from "vitest";
const local = vi.hoisted(() => ({
  bridge: {
    info: {
      id: "session",
      account: "aa".repeat(32),
      wallet: "Disposable",
      walletHex: "bb".repeat(32),
      clock: "1791813600",
      phase: "ready",
      gateway: "http://127.0.0.1:8790",
      origin: "http://127.0.0.1:5173",
    },
    readInfo: vi.fn(),
    signOrder: vi.fn(),
    signLogin: vi.fn(),
    operate: vi.fn(),
  },
}));
vi.mock("../src/prototype/profile", () => ({
  prototypeEnabled: () => true,
  prototypeBridge: () => local.bridge,
}));
import { PrototypeProvider, usePrototype } from "../src/prototype/context";
function Probe() {
  const p = usePrototype();
  return (
    <div data-testid="scope">
      {p?.synced
        ? p.info?.clock + " / " + p.info?.phase
        : "synthetic actions disabled"}
    </div>
  );
}
afterEach(() => vi.useRealTimers());
it("keeps synthetic scope disabled on bootstrap timeout, ignores late metadata, and supports explicit read-only resync", async () => {
  vi.useFakeTimers();
  let resolve!: (v: typeof local.bridge.info) => void;
  local.bridge.readInfo.mockReturnValueOnce(new Promise((r) => (resolve = r)));
  render(
    <PrototypeProvider>
      <Probe />
    </PrototypeProvider>,
  );
  expect(screen.getByTestId("scope")).toHaveTextContent("disabled");
  await act(async () => {
    await vi.advanceTimersByTimeAsync(3000);
  });
  expect(screen.getByRole("alert")).toHaveTextContent("timed out");
  const current = {
    ...local.bridge.info,
    clock: "1791813601",
    phase: "evaluated-open",
  };
  await act(async () => resolve(current));
  expect(screen.getByTestId("scope")).toHaveTextContent("disabled");
  local.bridge.readInfo.mockResolvedValueOnce(current);
  await act(async () =>
    fireEvent.click(
      screen.getByRole("button", { name: "Resync controller info" }),
    ),
  );
  expect(screen.getByTestId("scope")).toHaveTextContent(
    "1791813601 / evaluated-open",
  );
  expect(local.bridge.operate).not.toHaveBeenCalled();
  expect(local.bridge.signOrder).not.toHaveBeenCalled();
  expect(local.bridge.signLogin).not.toHaveBeenCalled();
});
