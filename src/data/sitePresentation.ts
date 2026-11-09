import { DEV_ORIGIN } from "../api/profile";
import { demoBuild, stageCopy } from "./demoScope";

/** Copy/navigation only. This profile grants no auth, trading or payment permission. */
export function sitePresentation(
  origin = globalThis.location?.origin ?? "",
  historicalDemo = demoBuild(),
) {
  const current = origin === DEV_ORIGIN;
  const copy = stageCopy(current || historicalDemo);
  return {
    profile: current
      ? "localhost3000"
      : historicalDemo
        ? "historical-demo"
        : "historical",
    accountPath: current || historicalDemo ? "/my-account" : "/app/accounts",
    copy: current
      ? {
          ...copy,
          preview:
            "Solana devnet uses test tokens. Wallet sign-in and account reads are available. Purchase signing, resets and payouts are off.",
        }
      : copy,
  };
}
