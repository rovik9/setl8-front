import { IsolatedPurchaseAdapter } from "./adapter";
import { P30_PROFILE } from "./profile";
export const P30_LIVE_READ_PROFILE = Object.freeze({
  kind: "isolated_live_read_auth_only",
  api: P30_PROFILE.api,
  browserOrigin: P30_PROFILE.browserOrigin,
  serviceContract: "P30_RUNNING_ORIGIN_HANDOFF.md",
  actions: P30_PROFILE.actions,
});
/** Explicit read/auth only. Fixed 5174 entry → API8791; purchase/transaction methods remain gated. */
export function createLiveP30ReadOnlyAdapter() {
  return IsolatedPurchaseAdapter.readOnlyLive();
}
