// @vitest-environment node
import { it, expect } from "vitest";
import { marketSizeProblem } from "../src/devnet/marketSize";
it.each(["0.0002", "0.000200", "0.0098", "0.01", "0.010000"])(
  "accepts exact proposed aligned %s BTC",
  (q) => expect(marketSizeProblem(q, "Market")).toBeNull(),
);
it.each([
  "0",
  "0.000001",
  "0.000201",
  "0.010001",
  "1",
  "1e-2",
  " 0.01",
  "0.0100001",
])("rejects %s without rounding or consuming admission", (q) =>
  expect(marketSizeProblem(q, "Market")).not.toBeNull(),
);
it("whole Close stays zero independently of a stale Market form field", () =>
  expect(marketSizeProblem("1", "Close")).toBeNull());
