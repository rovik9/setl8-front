/** Read-only design seam. Not connected to API calls, persistence, wallets or payment controls. */
import type { PurchaseStatus } from "../api/purchase-draft-v1";
export type PurchaseReadScope = {
  wallet: string;
  deployment: string;
  sessionEpoch: number;
};
const disabledActions = Object.freeze({
  sign: false as const,
  submit: false as const,
  repay: false as const,
});
type StatusData = Pick<
  PurchaseStatus,
  | "evidence_purpose"
  | "purchase_id"
  | "submission"
  | "chain"
  | "verification"
  | "indexing"
  | "verified_account"
  | "recovery"
  | "updated_unix_ns"
>;
export type PurchaseReadState =
  | { kind: "scope_mismatch"; actions: typeof disabledActions; data: null }
  | {
      kind: "draft_observation";
      actions: typeof disabledActions;
      scope: PurchaseReadScope;
      data: StatusData;
    };
/** Request scope must be captured before an eventual read; a new session cannot adopt a late result. */
export function purchaseReadState(
  status: PurchaseStatus,
  request: PurchaseReadScope,
  current: PurchaseReadScope,
): PurchaseReadState {
  if (
    request.wallet !== current.wallet ||
    request.deployment !== current.deployment ||
    request.sessionEpoch !== current.sessionEpoch ||
    !Number.isSafeInteger(current.sessionEpoch) ||
    current.sessionEpoch < 0 ||
    status.wallet !== request.wallet ||
    status.deployment.deployment_id !== request.deployment
  )
    return { kind: "scope_mismatch", actions: disabledActions, data: null };
  const {
    evidence_purpose,
    purchase_id,
    submission,
    chain,
    verification,
    indexing,
    verified_account,
    recovery,
    updated_unix_ns,
  } = status;
  return {
    kind: "draft_observation",
    actions: disabledActions,
    scope: { ...current },
    data: structuredClone({
      evidence_purpose,
      purchase_id,
      submission,
      chain,
      verification,
      indexing,
      verified_account,
      recovery,
      updated_unix_ns,
    }),
  };
}
