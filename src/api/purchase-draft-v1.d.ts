/** PROPOSED ONLY: no routes implemented/activated. Separate from live ReadRoutes/PostRoutes. */
import type { Decimal, Hex32, WalletBase58, Versioned } from "./frontend-v1";

export type DeploymentId = "p30-devnet-rehearsal-v1";
/** Canonical base58 encoding of exactly 64 transaction-signature bytes. */
export type TransactionSignature = string;
/** Stable machine-readable public code; never raw RPC/SQL exception text. */
export type ReasonCode = string;
export interface PurchaseVersion extends Versioned {
  purchase_version: "1";
  format: "setl8-purchase-read-v1";
  evidence_purpose: "synthetic_test" | "chain_observation";
}
export interface DeploymentRef {
  deployment_id: DeploymentId;
  environment: "devnet_rehearsal";
  genesis_hash: WalletBase58;
  lev_program: WalletBase58;
  vault_program: WalletBase58;
  owner_manifest_sha256: Hex32;
  /** Null while the independently reviewed additive SDK profile is absent. */
  sdk_release: string | null;
  sdk_profile: string | null;
  sdk_artifact_sha256: Hex32 | null;
  compatibility: "awaiting_review" | "approved_for_purchase_reads";
  production: false;
}
export interface AccountEvidence {
  address: WalletBase58;
  availability: "present" | "absent";
  owner_program: WalletBase58 | null;
  role: string;
  /** SHA-256 of decoded base64 account-data bytes, before parsing. */
  data_sha256: Hex32 | null;
}
export interface ChainSnapshot {
  observation_id: Hex32;
  /** Each RPC batch has its own context; minContextSlot is a floor, not an exact bank pin. */
  context_slots: [Decimal, Decimal];
  minimum_context_slot: Decimal;
  rpc_response_sha256: [Hex32, Hex32];
  commitment: "finalized";
  received_unix_ns: Decimal;
  /** Server receipt time, not provider chain time or evaluator input time. */
  timestamp_basis: "server_receive_time";
  trust_policy_sha256: Hex32;
  evidence: AccountEvidence[];
  corroboration: "two_approved_rpc_sources" | "synthetic_fixture";
}
export interface MintRef {
  address: WalletBase58;
  decimals: Decimal;
  display_symbol: string;
  test_token: true;
}
export interface TokenCharge {
  /** All amounts unsigned base-unit integer strings for this one mint. */
  mint: MintRef;
  tier_price_atoms: Decimal;
  purchase_fee_bps: Decimal;
  purchase_fee_atoms: Decimal;
  total_token_debit_atoms: Decimal;
  formula: "tier_price_atoms + ceil(tier_price_atoms * purchase_fee_bps / 10000)";
}
export interface TierOffer {
  tier_index: Decimal;
  account_size_micro_usd: Decimal;
  ruleset_address: WalletBase58;
  ruleset_version: Decimal;
  charge: TokenCharge;
}
export interface PurchaseCatalog extends PurchaseVersion {
  deployment: DeploymentRef;
  snapshot: ChainSnapshot;
  /** Maximum 20: ten tier/mint offers for each of two approved test mints. */
  offers: TierOffer[];
  fetched_unix_ns: Decimal;
  refresh_after_ms: Decimal;
  purchase_preparation: "requires_reviewed_sdk_and_fresh_quote";
}
export interface QuoteRequest {
  deployment_id: DeploymentId;
  request_id: Hex32;
  tier_index: Decimal;
  mint: WalletBase58;
}
export interface PurchaseQuote extends PurchaseVersion {
  quote_id: Hex32;
  request_id: Hex32;
  wallet: WalletBase58;
  deployment: DeploymentRef;
  snapshot: ChainSnapshot;
  offer: TierOffer;
  /** Observed wallet counter/PDA are hints and never a reserved nonce/account. */
  wallet_profile_address: WalletBase58;
  wallet_profile_state: "absent_at_snapshot" | "present_at_snapshot";
  next_challenge_id: Decimal;
  expected_account: Hex32;
  expected_account_address: WalletBase58;
  created_unix_ns: Decimal;
  refresh_required_at_unix_ns: Decimal;
  reservation: false;
  /** Known identities here, canonical instruction account metas remain SDK-owned. */
  payment_accounts: {
    sector_config: WalletBase58;
    product_registry: WalletBase58;
    vault_state: WalletBase58;
    pool_token_account: WalletBase58;
    vault_platform_token_account: WalletBase58;
    fee_token_account: WalletBase58;
    token_program: WalletBase58;
  };
  sol_costs: {
    basis: "not_estimated_without_exact_transaction_message";
    network_fee_lamports: null;
    priority_fee_lamports: null;
    account_rent_lamports: null;
  };
}
/** Records a client's report AFTER its own wallet submission. Does not broadcast. */
export interface PurchaseAttemptRequest {
  deployment_id: DeploymentId;
  request_id: Hex32;
  quote_id: Hex32;
  message_sha256: Hex32;
  expected_account: Hex32;
  recent_blockhash: WalletBase58 | null;
  last_valid_block_height: Decimal | null;
}
export interface PurchaseUncertainRequest { request_id: Hex32 }
export interface PurchaseReportRequest {
  attempt_id: Hex32;
  deployment_id: DeploymentId;
  request_id: Hex32;
  quote_id: Hex32;
  transaction_signature: TransactionSignature;
  message_sha256: Hex32;
  expected_account: Hex32;
}
export interface TransactionObservation {
  /** failed requires finalized unsuccessful transaction evidence. */
  state: "unknown" | "observed" | "finalized" | "failed";
  commitment: null | "confirmed" | "finalized";
  slot: Decimal | null;
  blockhash: WalletBase58 | null;
  transaction_error_code: ReasonCode | null;
  message_sha256: Hex32 | null;
  evidence_ref: string | null;
}
export interface VerificationState {
  state: "pending" | "verified" | "blocked";
  reasons: ReasonCode[];
  /** Proven actual charge; never copied from the requested quote as execution evidence. */
  actual_charge: TokenCharge | null;
  quote_match: "not_checked" | "matched" | "different";
}
export interface IndexingState {
  state: "not_started" | "pending" | "indexed" | "blocked";
  finalized_scanned_through_slot: Decimal | null;
  ownership_origin_ref: string | null;
  blocked_reasons: ReasonCode[];
}
export interface PurchaseStatus extends PurchaseVersion {
  purchase_id: Hex32;
  request_id: Hex32;
  wallet: WalletBase58;
  deployment: DeploymentRef;
  quote_id: Hex32;
  transaction_signature: TransactionSignature | null;
  expected_account: Hex32;
  recent_blockhash: WalletBase58 | null;
  last_valid_block_height: Decimal | null;
  recovery: { action: "reconcile_before_repayment"; unreported_signature_known: false };
  expected_message_sha256: Hex32;
  /** This is the client's report, not an RPC acknowledgment. */
  submission: { state: "prepared" | "submitted" | "unknown"; basis: "client_report"; reported_unix_ns: Decimal };
  chain: TransactionObservation;
  verification: VerificationState;
  indexing: IndexingState;
  verified_account: Hex32 | null;
  updated_unix_ns: Decimal;
  poll_after_ms: Decimal;
}
export interface PurchaseAcknowledgment extends PurchaseVersion {
  duplicate: boolean;
  /** Snapshot at durable acknowledgment; fresh GET returns reconciliation progress. */
  purchase: PurchaseStatus;
}
export interface ObservedAccountState {
  phase: Decimal;
  status_code: string;
  ruleset_version: Decimal;
  snapshot: ChainSnapshot;
  basis: "finalized_account_data";
}
export interface OwnedAccount {
  account: Hex32;
  account_address: WalletBase58;
  trader: WalletBase58;
  challenge_id: Decimal;
  tier_index: Decimal;
  account_size_micro_usd: Decimal;
  opened_phase: Decimal;
  opened_time_unix_s: Decimal;
  origin: {
    commitment: "finalized";
    slot: Decimal;
    transaction_signature: TransactionSignature;
    evidence_ref: string;
    kind: "purchase" | "reset";
    history: "complete_authenticated_prefix" | "verified_origin_only";
  };
  current_chain_state: ObservedAccountState | null;
  evaluator: {
    registration: "absent" | "registered" | "blocked";
    phase: Decimal | null;
    status_code: string | null;
    processed_through: Decimal | null;
    blocked_reasons: ReasonCode[];
    phase_matches_chain: boolean | null;
    /** No lifecycle application is caused by this read. */
    lifecycle_application: "operator_only";
  };
  terminal_admission: { enabled: false; reasons: ReasonCode[] };
}
export interface ReadCoverage {
  discovery: "complete_through_checkpoint" | "partial" | "blocked";
  finalized_scanned_through_slot: Decimal | null;
  missing_history: boolean;
  blocked_reasons: ReasonCode[];
}
export interface FixedPage<T> extends PurchaseVersion {
  deployment: DeploymentRef;
  wallet: WalletBase58;
  rows: T[];
  next_cursor: string | null;
  has_more: boolean;
  read_cutoff: { lineage: string; revision: Decimal; observed_unix_ns: Decimal };
  coverage: ReadCoverage;
  refresh_after_ms: Decimal;
}
export interface OwnedAccountRead extends PurchaseVersion {
  deployment: DeploymentRef;
  wallet: WalletBase58;
  row: OwnedAccount;
  coverage: ReadCoverage;
  read_at_unix_ns: Decimal;
}
/** PROPOSED paths: do not merge into the implemented ReadRoutes/PostRoutes maps. */
export interface DraftReadRoutes {
  "/v1/purchase-catalog": PurchaseCatalog;
  "/v1/purchase-quotes/{quote_id}": PurchaseQuote;
  "/v1/purchases": FixedPage<PurchaseStatus>;
  "/v1/purchases/{purchase_id}": PurchaseStatus;
  "/v1/owned-accounts": FixedPage<OwnedAccount>;
  "/v1/owned-accounts/{account}": OwnedAccountRead;
}
export interface DraftPostRoutes {
  "/v1/purchase-attempts": { request: PurchaseAttemptRequest; response: PurchaseAcknowledgment };
  "/v1/purchase-attempts/{attempt_id}/uncertain": { request: PurchaseUncertainRequest; response: PurchaseAcknowledgment };
  "/v1/purchase-quotes": { request: QuoteRequest; response: PurchaseQuote };
  "/v1/purchases": { request: PurchaseReportRequest; response: PurchaseAcknowledgment };
}
