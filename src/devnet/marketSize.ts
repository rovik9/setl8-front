import type { DevnetExecutionContext } from "../api/devnet-execution-v1";
import { fixed } from "../data/exact";
import { scaledInteger } from "../data/orderDraft";
/** Conservative frontend proposal only. Server-armed policy and canonical preflight remain required. */
export const PROPOSED_MARKET_SIZE = Object.freeze({
  maximumUnits: "10000",
  minimumUnits: "200",
  stepUnits: "200",
});
export function marketSizeProblem(
  quantity: string,
  kind: "Market" | "Close",
): string | null {
  if (kind === "Close") return null;
  try {
    const units = scaledInteger(quantity, 6, "BTC quantity");
    if (units === 0n) return "Market quantity must be positive.";
    if (units < 200n)
      return "Minimum proposed size is 0.000200 BTC (200 quantity units).";
    if (units > 10000n)
      return "Maximum proposed size is 0.010000 BTC (10,000 quantity units).";
    if (units % 200n !== 0n)
      return "Use increments of 0.000200 BTC (200 quantity units); quantity is never rounded.";
    return null;
  } catch (e) {
    return (e as Error).message;
  }
}

export function armedMarketSizeProblem(
  quantity: string,
  kind: "Market" | "Close",
  policy: DevnetExecutionContext["market_quantity_policy"],
): string | null {
  if (kind === "Close") return null;
  const local = marketSizeProblem(quantity, kind);
  if (local) return local;
  try {
    if (
      !policy ||
      policy.scale !== "1000000" ||
      policy.basis !== "armed_run_plan" ||
      policy.preflight !== "required_before_new_admission"
    )
      return "Armed Market size policy is unavailable. No new Market may be signed.";
    for (const n of [policy.max_units, policy.min_units, policy.step_units])
      if (!/^[1-9]\d{0,19}$/.test(n))
        throw Error("Invalid armed quantity policy.");
    const max = BigInt(policy.max_units),
      min = BigInt(policy.min_units),
      step = BigInt(policy.step_units);
    if (
      min !== 200n ||
      step !== 200n ||
      max > 10000n ||
      max < min ||
      max % step !== 0n ||
      scaledInteger(policy.max_btc, 6, "Armed maximum") !== max
    )
      throw Error(
        "Armed policy differs from the reviewed first-run ceiling/minimum/step.",
      );
    const units = scaledInteger(quantity, 6, "BTC quantity");
    return units > max
      ? "Armed maximum is " +
          fixed(policy.max_units, 6, 6, false) +
          " BTC. Choose a smaller aligned quantity."
      : null;
  } catch (e) {
    return (e as Error).message;
  }
}
