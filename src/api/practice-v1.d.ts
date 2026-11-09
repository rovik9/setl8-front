/** Local practice only. Never chain purchase/ownership, payout settlement or live admission. */
import type { Decimal, Hex32, WalletBase58, EvaluatorState, RecordedJson, SignedIntent, NormalizedObservation } from './frontend-v1';
export interface PracticeProvenance {
  purpose:'synthetic_test'; lane:'practice'; chain_origin:false; real_funds:false;
  price_basis:'looped_recorded_synthetic_replay'; tape_sha256:Hex32;
  sdk_version:'0.1.0-dev.4'; sdk_profile:'setl8-sdk-dev-v1';
  runtime_fingerprint:Hex32;
}
export interface PracticeAccount {
  account:Hex32; wallet:WalletBase58; starting_balance_micro_usd:'100000000000';
  market:'0'; symbol:'BTC'; phase:'2';
  clock_unix_s:Decimal; quote_clock_unix_s:Decimal; execution_clock_unix_s:Decimal|null;
  quote_wall_age_ns:Decimal; worker_heartbeat_age_ns:Decimal; quote_stale:boolean;
  replay_lag:"synthetic_clock_not_wall_time"; price_e18:Decimal;
  replay_step:Decimal; last_source_evidence:PracticeSourceEvidence;
  state:'ready'|'processing'|'blocked'; blocked_reason:string|null;
  remaining_input_budget:Decimal; provenance:PracticeProvenance;
  worker_state:'ready'|'waiting_for_lease'|'waiting_for_storage'|'blocked'; retry_after_unix_ns:Decimal;
  signing_window:{window_id:Hex32;clock_unix_s:Decimal;expires_unix_ns:Decimal;replay_paused:boolean}|null;
  /** GET context again after wallet/signature delay; no nonce allocator. */
  nonce_policy:'explicit_u32_exact_signed_retry';
}
export interface PracticeContext {
  api_version:'1'; practice_version:'1'; wallet:WalletBase58;
  accounts:PracticeAccount[]; automatic_execution:true;
  capabilities:{market:true;limit:true;stop:true;whole_close:true;exact_partial_close:true;
    attached_full_remaining_sl_tp:true;cancel_pending:true;multi_target_partial_tp:false;
    complete_outcomes:false;chain_submission:false;real_payouts:false};
}
export interface PracticeEnroll {request_id:Hex32}
export interface PracticeEnrollReceipt {api_version:'1';practice_version:'1';account:PracticeAccount;duplicate:boolean}
/** Existing canonical order route: nonce JSON u32, order48bytes/signature64bytes lowercasehex.
 * POST /v1/accounts/{account}/intents; current session+CSRF and actual trader signature required.
 * It commits before receipt. Automatic practice worker supplies replay samples/tick/drain and
 * accepted OS-thread evaluator. Receipt is not fill. GET existing positions/pending-orders/
 * activity/journals/intents/{nonce} for durable evidence, all exact response decimal strings.
 * Limit/Stop/Cancel/SetSlTp retain canonical races/incomplete outcomes; no invented completion. */
export interface PracticeLedger {
 api_version:'1';practice_version:'1';account:PracticeAccount;
 evaluator_state:EvaluatorState|null; execution_event_rows:PracticeExecutionEvent[]; journals:RecordedJson[]; input_count:Decimal; used_nonces:Decimal[]; journals_has_more:boolean; journals_limit:"50";
 complete_outcomes_available:false; chain_finality:'unavailable';
}
export interface PracticePayoutRequest {request_id:Hex32;account:Hex32;amount_micro_usd:Decimal}
export interface PracticePayout {
 id:Hex32; account:Hex32; amount_micro_usd:Decimal; created_unix_ns:Decimal;
 state:'queued'|'cancelled'; simulated:true; eligibility:'not_evaluated';
 balance_effect:'none'; settlement:'not_sent'; events:PracticePayoutEvent[];
 preview:{fixture_phase:'2';canonical_balance_micro_usd:Decimal|null;starting_balance_micro_usd:'100000000000';positive_balance_difference_micro_usd:Decimal|null;withdrawable_amount:null;real_payout_eligibility:'not_evaluated';reason:string};
}
export interface PracticePayoutReceipt {api_version:'1';practice_version:'1';payout:PracticePayout;duplicate:boolean}
export interface PracticePayoutPage {api_version:'1';practice_version:'1';rows:PracticePayout[];has_more:boolean;next_after:Hex32|null}
export interface PracticeSourceEvidence {
 purpose:'synthetic_test';source_profile:'setl8-prototype-v1';
 sample:{market:number|string;stream:string;sample_id:number|string;capture_seq:number|string;semantic_key:string;normalized:NormalizedObservation};
}
export interface PracticePayoutEvent {event:'queued'|'cancelled';recorded_unix_ns:Decimal;payload:RecordedJson;sha256:Hex32}
export interface PracticePrice {step:Decimal;execution_second:Decimal;price_e18:Decimal;original_source_ns:Decimal;original_receive_ns:Decimal;original_raw_sha256:Hex32;sample_input_seq:Decimal;frame_sha256:Hex32}
export interface PracticePrices {api_version:'1';practice_version:'1';purpose:'synthetic_test';price_basis:'looped_recorded_synthetic_replay';timestamp_basis:'synthetic_execution_second';account:Hex32;through_step:Decimal;rows:PracticePrice[];has_more:boolean;next_after:Decimal|null;interpolation:false;traded_volume_available:false}
export interface PracticeRecordedOrder {api_version:'1';practice_version:'1';purpose:'synthetic_test';account:Hex32;signed_intent:SignedIntent;payload_sha256:Hex32;input_seq:Decimal;state:string;complete_outcomes_available:false}
export interface PracticeSigningWindow {window_id:Hex32;account:Hex32;clock_unix_s:Decimal;created_unix_ns:Decimal;expires_unix_ns:Decimal;replay_paused:true;purpose:'synthetic_test'}
export interface PracticeSigningWindowReceipt {api_version:'1';practice_version:'1';window:PracticeSigningWindow;duplicate:boolean}
export interface PracticeRoutes {
 'GET /v1/practice/context':{response:PracticeContext};
 'POST /v1/practice/accounts':{request:PracticeEnroll;response:PracticeEnrollReceipt};
 'POST /v1/practice/accounts/{account}/signing-window':{request:{request_id:Hex32};response:PracticeSigningWindowReceipt};
 'GET /v1/practice/accounts/{account}/ledger':{response:PracticeLedger};
 'GET /v1/practice/accounts/{account}/prices?limit=100&after=STEP&through=STEP':{response:PracticePrices};
 'GET /v1/practice/accounts/{account}/orders/{nonce}':{response:PracticeRecordedOrder};
 'GET /v1/practice/payouts?limit=25&after=HEX':{response:PracticePayoutPage};
 'POST /v1/practice/payouts':{request:PracticePayoutRequest;response:PracticePayoutReceipt};
 'POST /v1/practice/payouts/{id}/cancel':{request:{request_id:Hex32};response:PracticePayoutReceipt};
}

/** Quote rules: worker heartbeat >15wall seconds marks quote_stale and blocks new intents.
 * quote_wall_age_ns is age of last replay-frame record; source timestamps are historical,
 * not real price freshness. While idle the synthetic clock pauses and last sample remains
 * canonical-fresh in that explicit simulated clock. While positions/pending/dirty inputs exist,
 * each ~3wall seconds advances2synthetic seconds. Signing must use returned clock_unix_s;
 * SDK canonical Market/Close permits [-5,+5]s skew; other kinds [0,+5]. Wallet delay can
 * return409 practice_quote_stale. Refresh/review/re-sign only deliberately; exact original
 * payload retries recover original receipt even if old. Nonce evidence is not allocation.
 * Cancel kind4 uses targetNonce of pending order, other economic fields0. PartialClose kind3
 * positive exact qty; qty0=all. Neither supplies position-generation binding. Canonical Cancel
 * races may show pending removal; complete terminal outcomes remain unavailable.
 * Request IDs: wallet+operation scoped; exact repeated body recovers resource, changed body409.
 */

/** REQUIRED signing handshake: create a fresh request_id and POST signing-window before
 * preview/sign. Its account+wallet-scoped immutable45s wall deadline pauses ONLY this account's
 * synthetic replay clock; original positions/pending are visible as paused. Use returned exact
 * clock_unix_s for SDK clientTime. New practice intent atomically consumes that window; next
 * automatic worker iteration resumes. Wallet cancellation leaves visible pause until expiry.
 * Another tab cannot extend/reopen an active window; exact request retry returns original
 * deadline even after expiry. Expired new admission409 requires explicit review/re-sign.
 * Original exact nonce/payload retry needs no new window and never signs or fills twice.
 * Transient live leases/storage wait with retry_after; never steal or permanentlyblock merely
 * because a restarted worker waits its predecessor's lease. Canonical/hash mismatch blocks.
 */

export interface PracticeExecutionEvent {
 id:string;kind:'fill'|'close'|'fee';market:Decimal;side:'long'|'short'|null;
 order_kind:Decimal|null;qty:Decimal|null;price_e12:Decimal|null;entry_e12:Decimal|null;
 time_unix_s:Decimal;intent_nonce:Decimal|null;pnl_micro_usd:Decimal|null;
 credited_micro_usd:Decimal|null;fee_micro_usd:Decimal|null;fee_kind?:Decimal;
 quick:boolean|null;close_reason:Decimal|null;
 journal_hash:Hex32;journal_seq:Decimal;event_index:Decimal;encoded_sha256:Hex32;
 balance_after_batch_micro_usd:Decimal;
 sample_proof:{source:Decimal;feed_id:Hex32;timestamp_ns:Decimal;value_e18:Decimal}|null;
 practice_frame:{step:Decimal;sample_input_seq:Decimal;frame_sha256:Hex32}|null;
}
/** execution_event_rows are emitted canonical SDK-decoded journal Fill/Close/Fee only,
 * using the same official decoder as execution evidence. Fees are separate rows. Balance
 * after batch is repeated proof metadata, not per-event cash movement to sum repeatedly.
 * Close pnl/credit come from canonical event, Fill pnl is null; no receipt-derived fill.
 * Latest50journalbatches only; journals_has_more directs existing paginated /journals route.
 * Canonical source labels do not make synthetic replay a real-provider observation.
 */
