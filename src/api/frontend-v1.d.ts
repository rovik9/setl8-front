/** Setl8 loopback frontend API v1. This is not an SDK order codec. */
export type Decimal = string;
export type Hex32 = string;
export type WalletBase58 = string;
/** Every response number, including small protocol fields, is a decimal string. */
export type RecordedJson = null | boolean | string | RecordedJson[] | { [key: string]: RecordedJson };
export interface Versioned { api_version: "1" }
export interface ApiError extends Versioned {
  error: { code: string; message: string };
}
export interface Page<T, C = string> extends Versioned {
  rows: T[]; next_after: C | null; has_more: boolean;
}
export interface ChallengeRequest { wallet: WalletBase58 }
export interface LoginRequest {
  challenge_id: Hex32; wallet: WalletBase58; message: string; signature_hex: string;
}
export interface Challenge extends Versioned {
  challenge_id: Hex32; wallet: WalletBase58; audience: string; browser_origin: string;
  issued_unix_s: Decimal; expires_unix_s: Decimal; message: string;
  encoding: "utf8"; signature_encoding: "hex_ed25519_64_bytes";
}
export interface Login extends Versioned { wallet: WalletBase58; expires_unix_s: Decimal; csrf_token: Hex32 }
export interface Session extends Login {
  wallet_hex: Hex32; admin_read: boolean;
  trading_authority: "actual_trader_signature_per_intent"; lifecycle_application: "operator_only";
}
export interface AccountSummary {
  account: Hex32; trader_hex: Hex32; received_through: Decimal;
  processed_through: Decimal; evaluator_status: string | null; state_available: boolean;
}
export interface Position {
  market: Decimal; qty: Decimal; avg_entry_e12: Decimal;
  timer_start: Decimal; opened_at: Decimal; fee_day: Decimal; sl: Decimal; tp: Decimal;
}
export interface PendingOrder { nonce: Decimal; order_hex: string }
export interface EvaluatorState {
  balance_micro: Decimal; size_micro: Decimal; q_tally: Decimal;
  lock_until: Decimal; flat: boolean; latch: boolean; tight_on: boolean;
  r: Decimal; l_start: Decimal; g_peak: Decimal; l_level: Decimal;
  phase: Decimal; status: string; frozen: boolean; ended: boolean;
  clock: Decimal; processed_through: Decimal; journal_seq: Decimal; journal_hash: Hex32;
  trades_closed: Decimal; queued_events: Decimal; positions: Position[]; pending: PendingOrder[];
  samples: Decimal; archive_bytes: Decimal; intents_bytes: Decimal;
  archive_sha256: Hex32; intents_sha256: Hex32; exec_refused: Decimal;
}
export interface AccountOverview extends Versioned {
  account: Hex32; trader_hex: Hex32; initial_config: RecordedJson;
  received_through: Decimal; processed_through: Decimal; evaluator_state: EvaluatorState | null;
  worker_live: boolean; worker_error: string | null; read_at_unix_ns: Decimal; update_cursor: string;
  chain_origins: RecordedJson[];
  chain_finality: { publication_reconciled: false; deployed_compatibility_verified: false; status: "unavailable" };
  features: { live_market_admission: false; production_reorder_window_ns: null;
    complete_outcomes: false; cancel_sltp_completion: false;
    lifecycle_application: "operator_only"; independent_verdict: "unavailable" };
}
export interface StatePart<T> extends Versioned {
  account: Hex32; processed_through: Decimal; available: boolean; rows: T[] | null;
  update_cursor: string; basis: "last_committed_canonical_view"; complete_outcomes_available: false;
}
/** Compatibility intake u32 stays a JSON integer; SDK owns encoding/signing. */
export interface SignedIntent { nonce: number; order: string; signature: string }
export interface IntentReceipt extends Versioned { input_seq: Decimal; duplicate: boolean; state: "received" }
export interface IntentStatus extends Versioned {
  account: Hex32; nonce: Decimal; input_seq: Decimal;
  state: "received" | "evaluator_accepted" | "refused" | "executed" | "chain_finalized";
  reason: string | null; completion: null; complete_outcomes_available: false;
  chain_finality: "unavailable"; update_cursor: string;
}
export interface Activity {
  input_seq: Decimal; request_key: string; input: RecordedJson; input_sha256: Hex32;
  received_unix_ns: Decimal; processing_outcome: RecordedJson;
  recorded_refusals: RecordedJson; result_sha256: Hex32 | null; state: "received" | "processed";
}
export interface Journal {
  work_id: Decimal; input_seq: Decimal; journal_seq: Decimal; journal_hash: Hex32;
  payload: RecordedJson; publication_state: "pending" | "prepared" | "submitted" | "finalized" | "quarantined";
  chain_reconciliation_available: false;
}
export interface PublicationAttempt {
  attempt_id: Decimal; work_id: Decimal; lease_epoch: Decimal; message_sha256: Hex32;
  message_hex: string; context: RecordedJson; created_unix_ns: Decimal;
  meaning: "compiled_message_prepared; not signer approval or submission";
}
export interface MarketIdentity { market: Decimal; symbol: string; source: Decimal; feed_id: Hex32; max_age_secs: Decimal }
export interface MarketCatalog extends Versioned {
  rows: MarketIdentity[]; launch_sha256: Hex32; live_admission: "disabled"; production_reorder_window_ns: null;
}
export interface Recording {
  stream: string; purpose: string | null; capture_through: Decimal; normalization_through: Decimal;
  recording_only: true; executable_quote: false;
}
export interface NormalizedObservation {
  identity: MarketIdentity; source_ns: Decimal; receive_ns: Decimal; value_e18: Decimal;
  provider_time_ns: Decimal | null; timestamp_basis: string; raw_sha256: Hex32; metadata_evidence: string | null;
}
export interface MarketObservation {
  sample_id: Decimal; capture_seq: Decimal; observation: NormalizedObservation;
  raw_sha256: Hex32; envelope_sha256: Hex32; endpoint: string; transport_kind: string;
  receive_age_ns: Decimal; source_age_ns: Decimal;
}
export interface MarketRead extends Versioned {
  stream: string; market: Decimal; purpose: string | null;
  capture_through: Decimal; normalization_through: Decimal; rows: MarketObservation[]; available: boolean;
  selection: string; recording_only: true; executable_quote: false; coverage_complete: false; age_basis: string;
}
export interface LifecycleObservation {
  network: string; slot: Decimal; blockhash: string; event_index: Decimal; account: Hex32;
  lifecycle_type: string; observation_ref: string; decoded_effect: RecordedJson;
  block_payload_sha256: Hex32; block_evidence: RecordedJson;
  review_state: "parked_operator_review" | "already_delivered";
  prior_input_seq: Decimal | null; prior_input: RecordedJson; prior_input_sha256: Hex32 | null;
}
export interface ChainCursor { after_slot: Decimal; after_index: Decimal }
export interface LifecyclePage extends Page<LifecycleObservation, ChainCursor> {
  lifecycle_application: "operator_only"; deployment_verified: false; meaning: string;
}
/** These two admin pages retain M3 next_after semantics: last row, even at EOF. */
export interface OperatorPage extends Versioned { rows: RecordedJson[]; next_after: RecordedJson }
export interface ReconciliationPage extends OperatorPage { blocked_reason: string | null }
export interface RecorderHealth extends Versioned {
  run_id: string; stream: string; database_reachable: true; owns_stream: boolean;
  persisted_run_state: string; effective_run_state: string; recorder_heartbeat_recent: boolean;
  capture_cursor: Decimal; normalization_cursor: Decimal; backlog: Decimal;
  trading_ready: false; live_admission: "disabled"; coverage_complete: false;
  [field: string]: RecordedJson;
}
export interface Invalidation extends Versioned { account: Hex32; revision: Decimal; changed_table: string; action: string }
export interface StreamControl extends Versioned { code: string; action?: string; reconnect?: string }
/** SSE event id is opaque; native Last-Event-ID takes precedence over URL cursor. */
export interface EventPayloads {
  snapshot: AccountOverview; connected: { api_version: "1"; cursor: string; mode: "durable_invalidation_catchup" };
  invalidate: Invalidation; resync_required: StreamControl; session_closed: StreamControl; reconnect: StreamControl;
}
export interface ReadRoutes {
  "/v1/auth/session": Session;
  "/v1/accounts": Page<AccountSummary>;
  "/v1/accounts/{account}": AccountOverview;
  "/v1/accounts/{account}/positions": StatePart<Position>;
  "/v1/accounts/{account}/pending-orders": StatePart<PendingOrder>;
  "/v1/accounts/{account}/intents/{nonce}": IntentStatus;
  "/v1/accounts/{account}/activity": Page<Activity> & { update_cursor: string; history_basis: string };
  "/v1/accounts/{account}/journals": Page<Journal> & { update_cursor: string };
  "/v1/accounts/{account}/publication-attempts": Page<PublicationAttempt>;
  "/v1/accounts/{account}/chain-observations": LifecyclePage;
  "/v1/accounts/{account}/updates": EventPayloads;
  "/v1/markets": MarketCatalog;
  "/v1/market-recordings": Page<Recording>;
  "/v1/markets/{market}/observations": MarketRead;
  "/v1/admin/recorder-runs": OperatorPage;
  "/v1/admin/recorders/{run}": RecorderHealth;
  "/v1/admin/lifecycle-observations": LifecyclePage;
  "/v1/admin/reconciliation/{network}": ReconciliationPage;
  "/v1/status": Versioned & { profile: string; deployment_verified: false; runtime_fingerprint: Hex32; sdk_fingerprint: Hex32; live_admission: "disabled"; lifecycle_application: "operator_only" };
  "/readyz": Versioned & { status: "ready"; scope: "local_database_only" };
  "/healthz": { status: "alive" };
}
export interface PostRoutes {
  "/v1/auth/challenge": { request: ChallengeRequest; response: Challenge };
  "/v1/auth/login": { request: LoginRequest; response: Login };
  "/v1/auth/logout": { request: Record<string, never>; response: Versioned & { logged_out: true } };
  "/v1/auth/logout-all": { request: Record<string, never>; response: Versioned & { all_wallet_sessions_revoked: true } };
  "/v1/accounts/{account}/intents": { request: SignedIntent; response: IntentReceipt };
}

/** Recorded chart history v1: no execution/quote/finality authority. */
export type CandleIntervalSeconds = "1" | "60" | "300" | "900" | "3600";
export interface RecordedHistoryQuery {
  stream: string; from_ns: Decimal; to_ns: Decimal;
  limit?: Decimal; cursor?: string;
}
export interface RecordedCandleQuery extends RecordedHistoryQuery { interval_s: CandleIntervalSeconds }
export interface RecordedHistoryCutoff {
  feed_id: string; policy_sha256: Hex32;
  normalized_through: Decimal; raw_capture_through: Decimal;
  normalized_anchor: Hex32 | null; raw_anchor: Hex32 | null;
}
export interface RecordedSampleRef {
  capture_seq: Decimal; semantic_key: string; source_ns: Decimal; receive_ns: Decimal;
  provider_time_ns: Decimal | null; timestamp_basis: string; metadata_evidence: string | null;
  raw_sha256: Hex32; envelope_sha256: Hex32;
}
export interface RecordedHistoryObservation {
  reference: RecordedSampleRef; observation: NormalizedObservation; endpoint: string; transport_kind: string;
}
export interface RecordedCandle {
  bucket_start_ns: Decimal; bucket_end_ns: Decimal;
  sample_from_ns: Decimal; sample_to_ns: Decimal; range_clipped: boolean;
  open_e18: Decimal; high_e18: Decimal; low_e18: Decimal; close_e18: Decimal;
  sample_count: Decimal; provider_time_absent_count: Decimal;
  open_ref: RecordedSampleRef; high_ref: RecordedSampleRef;
  low_ref: RecordedSampleRef; close_ref: RecordedSampleRef; finalized: false;
}
export interface ReceiveWindowEvidence {
  capture_seq: Decimal; receive_ns: Decimal; capture_kind: string;
  raw_sha256: Hex32; envelope_sha256: Hex32;
  transport_gap: boolean; market_or_global_issue: boolean; pending_normalization: boolean;
  semantic_duplicate: boolean; retained_capture_seq: Decimal | null;
}
export interface ReceiveWindowDiagnostics {
  axis: "receive_ns"; counts_scope: "inspected_receive_order_prefix";
  scan_complete: boolean; uninspected_receipt_count: "0" | null;
  inspected_through: { receive_ns: Decimal; capture_seq: Decimal } | null;
  from_ns: Decimal; to_ns: Decimal; raw_receipts: Decimal; normalized_receipts: Decimal;
  pending_receipts: Decimal; market_candidates_including_duplicates: Decimal;
  semantic_duplicate_candidates: Decimal; transport_gap_receipts: Decimal;
  market_or_global_issue_receipts: Decimal; evidence: ReceiveWindowEvidence[];
  omitted_inspected_evidence_count: Decimal; meaning: string;
}
export interface RecordedHistoryCoverage {
  complete: false; receive_diagnostics_truncated: boolean;
  missing_intervals: string; deduplication: string;
  normalized_backlog_at_cutoff: Decimal; later_data_may_change_prior_candles: true;
}
export interface RecordedHistoryPage<T> extends Versioned {
  history_version: "1"; format: "setl8-recorded-market-history-v1";
  kind: "observations" | "candles"; stream: string; identity: MarketIdentity;
  purpose: "live_record_only" | "synthetic_test";
  chart_time_field: "source_ns";
  timestamp_basis: "provider_updatedAt_ms" | "receive_time_decision_54_provider_time_absent";
  from_ns: Decimal; to_ns: Decimal; interval_s: CandleIntervalSeconds | null;
  cutoff: RecordedHistoryCutoff; rows: T[]; next_cursor: string | null; has_more: boolean;
  /** Restart observation history at this exact cutoff; opaque, not an auth credential. */
  observation_cursor: string;
  range_point_count: Decimal; distinct_samples_in_range: Decimal;
  first_sample_ref: RecordedSampleRef | null; last_sample_ref: RecordedSampleRef | null;
  receive_window_diagnostics: ReceiveWindowDiagnostics; coverage: RecordedHistoryCoverage;
  recording_only: true; executable_quote: false; finalized: false;
  live_admission: "disabled"; production_reorder_window_ns: null;
}
export interface RecordedObservationPage extends RecordedHistoryPage<RecordedHistoryObservation> {
  kind: "observations"; interval_s: null;
}
export interface RecordedCandlePage extends RecordedHistoryPage<RecordedCandle> {
  kind: "candles"; interval_s: CandleIntervalSeconds;
}
/** Additive declarations: prior milestone-4 routes/schemas stay unchanged. */
export interface ReadRoutes {
  "/v1/markets/{market}/history": RecordedObservationPage;
  "/v1/markets/{market}/candles": RecordedCandlePage;
}
