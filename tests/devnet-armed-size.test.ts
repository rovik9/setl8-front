// @vitest-environment node
import { it, expect } from "vitest";
import { armedMarketSizeProblem } from "../src/devnet/marketSize";
const p = {
  scale: "1000000",
  max_units: "10000",
  max_btc: "0.01",
  step_units: "200",
  min_units: "200",
  basis: "armed_run_plan",
  preflight: "required_before_new_admission",
} as const;
it("requires an armed policy rather than the local proposed size ceiling", () => {
  expect(armedMarketSizeProblem("0.01", "Market", null)).toContain(
    "unavailable",
  );
  expect(armedMarketSizeProblem("0.01", "Market", p)).toBeNull();
});
it.each([
  { max_units: "20000", max_btc: "0.02" },
  { step_units: "1" },
  { min_units: "1" },
  { max_units: "1e4" },
  { max_btc: "0.02" },
  { basis: "local" },
])("blocks malformed or unreviewed armed limits %s", (patch) =>
  expect(
    armedMarketSizeProblem("0.01", "Market", { ...p, ...patch } as any),
  ).not.toBeNull(),
);
it("honors a smaller armed ceiling without rounding or enlarging it", () =>
  expect(
    armedMarketSizeProblem("0.01", "Market", {
      ...p,
      max_units: "5000",
      max_btc: "0.005",
    }),
  ).toContain("0.005000 BTC"));
it("keeps wholeClose independent of Market quantity metadata", () =>
  expect(armedMarketSizeProblem("", "Close", null)).toBeNull());
