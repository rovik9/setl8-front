/** Candidate genuine-devnet consumer. No authority activation or fabricated genesis/source values. */
import type {ObservePurchaseRequest,PrepareSourceRequest,DevnetPipelineJob,FixedFirstRunIntentPolicy} from './devnet-chain-evidence-v1';
import type {Decimal,Hex32,WalletBase58,EvaluatorState,SignedIntent,IntentReceipt,IntentStatus,RecordedJson} from './frontend-v1';
export interface DevnetSourceObservation {
 identity:{market:'0';symbol:'BTC';source:'2';feed_id:Hex32;max_age_secs:'15'};
 value_e18:Decimal;source_ns:Decimal;receive_ns:Decimal;verifier_receive_ns:Decimal;
 provider_time_ns:Decimal;timestamp_basis:'provider_updatedAt_ms';metadata_evidence:RecordedJson;
 original_observation:RecordedJson;
}
export interface DevnetExecutionAccount {
 account:Hex32;account_address:WalletBase58;trader:WalletBase58;
 lane:'devnet_bounded_rehearsal';chain_origin:true;synthetic:false;
 runtime_admission:'blocked'|'genesis_ready'|'source_go_ready';blocked_reasons:string[];
 genesis_proof_sha256:Hex32;configuration_sha256:Hex32;
 origin_evidence_ref:Hex32;sdk_profile:'p30-devnet-2026-10-31-v1';
 max_market_intents:'1';max_whole_close_intents:'1';market:'0';
 local_execution:'not_started'|'received'|'processed'|'blocked';
 publication:'awaiting_reviewed_p30_adapter'|'pending'|'unknown'|'finalized'|'blocked';
}
export interface DevnetExecutionContext {
 api_version:'1';devnet_execution_version:'1';wallet:WalletBase58;
 scope:'one_genuine_genesis_account_btc_market_whole_close';
 account:DevnetExecutionAccount|null;blocked_reasons:string[];
 clock_unix_s:Decimal|null;actor_clock_unix_s:Decimal|null;backend_now_unix_ns:Decimal;
 first_run_intent_policy:FixedFirstRunIntentPolicy|null;
 market_quantity_policy:{scale:'1000000';max_units:Decimal;max_btc:string;step_units:Decimal;min_units:Decimal;basis:'armed_run_plan';preflight:'required_before_new_admission'}|null;
 source_age_ns:Decimal|null;chain_snapshot_age_ns:Decimal|null;source:DevnetSourceObservation|null;
 source_gate:'not_admitted'|'finite_go_ready'|'stale'|'blocked';
 chain_snapshot_ref:Hex32|null;chain_snapshot_received_unix_ns:Decimal|null;
 signing:{sdk_version:'0.1.0-dev.4';profile:'setl8-sdk-dev-v1';order_bytes:'48';message_bytes:'93';
 market_close_skew_seconds:'5';timestamp_rewrite:false;backend_signs:false;nonce_allocator:false};
 publication_compilation:'unavailable_pending_reviewed_p30_adapter'|'reviewed_ready';
 live_production_admission:false;lifecycle:'operator_only';
}
export interface DevnetExecutionLedger {
 api_version:'1';devnet_execution_version:'1';account:DevnetExecutionAccount;
 evaluator_state:EvaluatorState|null;worker:{state:string;last_error:string|null;retry_after_unix_ns:Decimal};received_through:Decimal;processed_through:Decimal;
 used_nonces:Decimal[];journals:RecordedJson[];execution_event_rows:RecordedJson[];
 complete_outcomes_available:false;publication_finality_distinct:true;
 finalized_chain_head:{seq:Decimal;journal_hash:Hex32;slot:Decimal;evidence_ref:Hex32}|null;
}
export interface DevnetRecordedIntent {
 api_version:'1';devnet_execution_version:'1';account:Hex32;
 signed_intent:SignedIntent;input_seq:Decimal;recorded_input_sha256:Hex32;
 admitted_unix_ns:Decimal;arrival_unix_s:Decimal;source_input_seq:Decimal;arrival_tick_input_seq:Decimal;
 status:string;complete_outcomes_available:false;
}
export interface DevnetExecutionRoutes {
 'POST /v1/devnet/execution/purchase-observations':{request:ObservePurchaseRequest;response:DevnetPipelineJob};
 'POST /v1/devnet/execution/accounts/{account}/source-contexts':{request:PrepareSourceRequest;response:DevnetPipelineJob};
 'GET /v1/devnet/execution/jobs/{job_id}':{response:DevnetPipelineJob};
 'GET /v1/devnet/execution/context':{response:DevnetExecutionContext};
 'GET /v1/devnet/execution/accounts/{account}/ledger':{response:DevnetExecutionLedger};
 'POST /v1/devnet/execution/accounts/{account}/intents':{request:SignedIntent;response:IntentReceipt};
 'GET /v1/devnet/execution/accounts/{account}/intents/{nonce}':{response:DevnetRecordedIntent};
}
/** All routes require existing localhost3000/8792 session; POST also CSRF. Only exact
 * authenticated genuine trader. Enrollment/import is TRUSTED LOCAL DRIVER ONLY after
 * immutable SDK decoder verification, successful finalized actual purchase/genesis proof,
 * seq0/head/balance/phase/empty-state match and exactfreshconfig. No browser enrollment,
 * balance/config/price/head input, no snapshot-to-runtime shortcut for existing nonzerohead.
 * Finite GO + current RPC consistency + actualGMX source2 BTC/maxage15 required before admission.
 * Actual canonicalwalletsignature and immutable nonce payload; exact retry returns original
 * receipt even after expiry, changedpayload same nonce409. Realwallet delay>5s can be stale:
 * never use the practiceclock pause, alter signedtime, delegate identity or silentlyre-sign.
 * clock_unix_s is actual backend wall second when GO is fresh (else null); actor_clock is separately visible.
 * Source/verifier receive/backend import receive/actual ordered admission receive are distinct.
 * reviewed_ready requires actual future SDK review/adoption; current implementation reports unavailable.
 * OneMarket+onewholeClose only, localexecution != finalizedpublication. MissingSDKpublisher
 * adapter/externalsigning grant never fabricated; no chain submission capability here.
 */
