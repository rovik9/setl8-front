/**
 * Demo build scope. `VITE_DEMO_BUILD=1 npm run build` hides the "Live account stage" copy from the landing page;
 * the default (development) build keeps it. The Live stage code and its text stay in the source.
 */
export const demoBuild = (
  env: Record<string, unknown> = import.meta.env ?? {},
) => env.VITE_DEMO_BUILD === "1";

export const PHASE_TABS: readonly (readonly [string, string])[] = [
  ["evaluation", "Phase 1"],
  ["payable", "Phases 2–5"],
  ["live", "Live"],
];

export function stageCopy(demo: boolean) {
  return {
    tabs: demo ? PHASE_TABS.filter(([id]) => id !== "live") : PHASE_TABS,
    structure: demo
      ? "Evaluation, then four payable phases."
      : "Evaluation, four payable phases, then Live.",
    intro: demo
      ? "Start with an evaluation. Progress through five challenge phases."
      : "Start with an evaluation. Progress through five challenge phases, then move into Live.",
    preview: demo
      ? "Purchases, resets and payouts are not available in this preview. Final account sizes and pricing await the launch catalog."
      : "Live access, purchases, resets and payouts are not available in this preview. Final account sizes and pricing await the launch catalog.",
    journey: demo
      ? "Move through five challenge phases. Payout requests, queued vault claims and completed payouts remain distinct steps."
      : "Move through five challenge phases into Live. Payout requests, queued vault claims and completed payouts remain distinct steps.",
    afterPhaseFive: demo
      ? null
      : "Live follows the five challenge phases, with a 75% profit split, no profit target, no per-payout limit, unrestricted account scaling, minimal rules, negligible spreads, unrestricted news trading and multiple payouts per day. Live access and payout integrations are not enabled in this development preview.",
  };
}
