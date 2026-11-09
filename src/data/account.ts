import type {
  AccountOverview,
  PendingOrder,
  Position,
  StatePart,
  MarketIdentity,
} from "../api/frontend-v1";
import { api } from "../api/client";
export interface AccountBundle {
  overview: AccountOverview;
  positions: StatePart<Position>;
  pending: StatePart<PendingOrder>;
}
/** All core rows and their metadata come from this one committed overview. */
export function accountFromOverview(overview: AccountOverview): AccountBundle {
  const metadata = {
    api_version: overview.api_version,
    account: overview.account,
    processed_through: overview.processed_through,
    available: overview.evaluator_state !== null,
    update_cursor: overview.update_cursor,
    basis: "last_committed_canonical_view" as const,
    complete_outcomes_available: false as const,
  };
  return {
    overview,
    positions: {
      ...metadata,
      rows: overview.evaluator_state?.positions ?? null,
    },
    pending: { ...metadata, rows: overview.evaluator_state?.pending ?? null },
  };
}
export async function readAccount(
  account: string,
  signal: AbortSignal,
): Promise<AccountBundle> {
  const base = "/v1/accounts/" + encodeURIComponent(account);
  return accountFromOverview(
    await api.request<AccountOverview>(base, { signal }),
  );
}
export function marketName(markets: MarketIdentity[], id: string) {
  return markets.find((m) => m.market === id)?.symbol ?? `Market ${id}`;
}
