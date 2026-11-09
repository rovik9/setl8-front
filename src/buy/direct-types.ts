import type { prepareP30UnsignedPurchase } from "../purchase/prepareUnsigned";
export type Prepared = Awaited<ReturnType<typeof prepareP30UnsignedPurchase>>;
/** Opened for the owner demo (owner decision 3 Nov 2026). Grants nothing alone: OWNER_RELEASE must also match. */
export const DIRECT_GATE = Object.freeze({
  sign: true as boolean,
  send: true as boolean,
  reason:
    "Owner repeat-demo release: one reviewed wallet, tiers 0-3, devnet test tokens, until 2026-11-12 23:59 IST",
});
export interface CheckedPurchase {
  wallet: string;
  epoch: number;
  tier: string;
  size: string;
  price: string;
  feeBps: string;
  fee: string;
  total: string;
  solRequired: string;
  networkFee: string;
  rent: string;
  blockhash: string;
  lastValidBlockHeight: string;
  checkedAt: string;
  oldestEvidenceAt?: string;
  expiresAt: string;
  minSlot: string;
  fingerprint: string;
  expectedAccount: string;
  nextChallengeId: string;
  prepared: Prepared;
  checks: readonly string[];
}
export interface PublicAttempt {
  format: "setl8-direct-demo-attempt-v1";
  profile: string;
  source: string;
  npm: string;
  descriptor: string;
  wallet: string;
  tier: string;
  size: string;
  price: string;
  fee: string;
  total: string;
  expectedAccount: string;
  nextChallengeId: string;
  blockhash: string;
  lastValidBlockHeight: string;
  messageHex: string;
  messageSha256: string;
  fingerprint: string;
  minSlot: string;
  createdAt: string;
  signature: string | null;
  /**
   * The message the wallet actually signed, set with the signature. It is the prepared message or the
   * prepared message plus one capped ComputeBudget SetComputeUnitPrice instruction. All null until signed.
   */
  signedMessageHex: string | null;
  signedMessageSha256: string | null;
  /** micro-lamports per compute unit the wallet added; null when it added nothing or before signing. */
  computeUnitPriceMicroLamports: string | null;
  /** Priority fee implied by that price times the prepared compute-unit limit ("0" if none). */
  priorityFeeLamports: string | null;
  stage:
    | "awaiting_wallet"
    | "signed"
    | "uncertain"
    | "finalized_observed"
    | "verified";
}
export interface Reconciliation {
  state: "uncertain" | "confirmed" | "finalized_observed" | "verified";
  message: string;
  signature?: string;
  actualDebit?: string;
  account?: string;
}
export interface OwnerReview {
  wallet: string;
  epoch: number;
  expectedAccount: string;
  messageSha256: string;
  fingerprint: string;
  checkedAt: string;
  total: string;
  devnetTestTokens: true;
  noDebitCapAcknowledged: true;
}
export interface SimulationEvidence {
  messageSha256: string;
  sigVerify: boolean;
  slot: string;
  unitsConsumed: string;
  observedAt: string;
  advisory: true;
}
export interface PurchasePort {
  readonly mode: "gated_live" | "offline_mock";
  requiresOwnerReview?: boolean;
  measurements?(): readonly Readonly<import("./rpc").RpcMeasurement>[];
  canRequestApproval?(wallet: string): boolean;
  purchaseRestriction?(
    wallet: string,
    tier: string,
    checked?: CheckedPurchase | null,
  ): string | null;
  assertExecution?(c: CheckedPurchase, review: OwnerReview | undefined): void;
  simulate?(
    c: CheckedPurchase,
    packet: Uint8Array,
    sigVerify: boolean,
    signal: AbortSignal,
    review?: OwnerReview,
  ): Promise<SimulationEvidence>;
  check(
    wallet: string,
    tier: string,
    epoch: number,
    signal: AbortSignal,
  ): Promise<CheckedPurchase>;
  revalidate(
    checked: CheckedPurchase,
    signal: AbortSignal,
    phase?: string,
  ): Promise<void>;
  broadcast(
    packet: Uint8Array,
    signature: string,
    signal: AbortSignal,
    checked?: CheckedPurchase,
    review?: OwnerReview,
  ): Promise<void>;
  reconcile(
    attempt: PublicAttempt,
    signal: AbortSignal,
  ): Promise<Reconciliation>;
}
