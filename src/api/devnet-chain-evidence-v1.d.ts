/** Exact durable proof objects, not browser uploads and not signing authority. */
import type {Decimal,Hex32,WalletBase58} from './frontend-v1';
export type DevnetOperator='solana_public_devnet'|'onfinality_public_devnet';
/** Capture ID = SHA256(original immutable capture-record UTF8 bytes, excluding its own ID).
 * Body/hash are the original HTTP response bytes; params hash is original request params UTF8.
 * Full blobs remain in the fixed marked local evidence store, not a caller URL. */
export interface RpcCaptureRef {
 operator:DevnetOperator;capture_id:Hex32;method:string;params_sha256:Hex32;
 response_sha256:Hex32;received_unix_ns:Decimal;http_status:'200';
}
export interface RawAccountRecord {
 address:WalletBase58;owner:WalletBase58;executable:false;data_hex:string;data_sha256:Hex32;
}
export interface ProgramImageEvidence {
 program:WalletBase58;program_data:WalletBase58;loader:WalletBase58;
 upgrade_slot:Decimal;upgrade_authority:WalletBase58;image_sha256:Hex32;image_size:Decimal;
 program_data_sha256:Hex32;capture:RpcCaptureRef;
}
export interface FinalizedStateEvidence {
 /** Seven exact SDK records agree in address/owner/executable/data across both operators.
  * Clock may differ; its two raw records and decoded times are preserved below. */
 records:{trading:RawAccountRecord;wallet:RawAccountRecord;config:RawAccountRecord;
  ruleset:RawAccountRecord;registry:RawAccountRecord;vault:RawAccountRecord;trader_state:RawAccountRecord};
 market:RawAccountRecord;
 sources:[{capture:RpcCaptureRef;slot:Decimal;clock:RawAccountRecord;clock_unix_s:Decimal},
          {capture:RpcCaptureRef;slot:Decimal;clock:RawAccountRecord;clock_unix_s:Decimal}];
 /** Integer minima, never host time substituted for authenticated finalized Clock. */
 sdk_observed_slot:Decimal;sdk_chain_time_unix_s:Decimal;
}
export interface GenuineOriginEvidence {
 format:'setl8-devnet-genuine-origin-evidence-v1';run_id:Hex32;
 sdk_profile:'p30-devnet-actions-2026-11-02-v1';sdk_artifact_sha256:Hex32;approved_npm_artifact_sha256:Hex32;descriptor_sha256:Hex32;review_sha256:Hex32;
 account:Hex32;account_address:WalletBase58;trader:WalletBase58;challenge_id:Decimal;tier_index:Decimal;size_micro:Decimal;
 purchase:{signature_base58:string;signature_hex:string;slot:Decimal;outer_instruction_index:Decimal;
  packet_hex:string;packet_sha256:Hex32;message_sha256:Hex32;
  mint:WalletBase58;token_decimals:'6';account_debit_atoms:Decimal;fee_atoms:Decimal;
  /** Original full finalized getTransaction/getSignatureStatuses responses are persisted by capture ID. */
  sources:[{genesis:RpcCaptureRef;transaction:RpcCaptureRef;status:RpcCaptureRef},
           {genesis:RpcCaptureRef;transaction:RpcCaptureRef;status:RpcCaptureRef}];};
 program_images:[ProgramImageEvidence,ProgramImageEvidence,ProgramImageEvidence,ProgramImageEvidence];
 genesis_snapshot:FinalizedStateEvidence;
 /** Exact accepted AccountConfig serialization, NOT a checkpoint or snapshot restore. */
 account_config_json_utf8_hex:string;account_config_sha256:Hex32;
 configuration_json_utf8_hex:string;configuration_sha256:Hex32;
 genesis_head:Hex32;genesis_seq:'0';phase:'1';created_unix_s:Decimal;
 /** ID/digest of original immutable origin record bytes, excluding these two self-reference fields. */
 evidence_id:Hex32;evidence_sha256:Hex32;
}
export interface PreparedCompileContext {
 format:'setl8-devnet-post-journal-compile-context-v1';action:'post_journal';run_id:Hex32;
 sdk_profile:'p30-devnet-actions-2026-11-02-v1';sdk_artifact_sha256:Hex32;approved_npm_artifact_sha256:Hex32;descriptor_sha256:Hex32;review_sha256:Hex32;
 genuine_origin_evidence_id:Hex32;configuration_sha256:Hex32;first_run_intent_policy:FixedFirstRunIntentPolicy;market_quantity_policy:{scale:'1000000';max_units:Decimal;step_units:Decimal;min_units:Decimal};created_unix_ns:Decimal;expires_unix_ns:Decimal;
 snapshot:FinalizedStateEvidence;
 genesis:[RpcCaptureRef,RpcCaptureRef];
 program_images:[ProgramImageEvidence,ProgramImageEvidence,ProgramImageEvidence,ProgramImageEvidence];
 blockhash:{hex:Hex32;base58:WalletBase58;source_operator:DevnetOperator;source_slot:Decimal;
  last_valid_block_height:Decimal;acquisition:RpcCaptureRef;
  /** Original chosen getLatestBlockhash response bytes, verbatim UTF8. */
  acquisition_response_utf8_hex:string;acquisition_response_sha256:Hex32;};
 validity:[{capture:RpcCaptureRef;chosen_blockhash:WalletBase58;valid:true;current_block_height:Decimal;height_capture:RpcCaptureRef},
           {capture:RpcCaptureRef;chosen_blockhash:WalletBase58;valid:true;current_block_height:Decimal;height_capture:RpcCaptureRef}];
 fees:{message_sha256:Hex32;compute_unit_limit:Decimal;priority_fee_micro_lamports:'0';rent_lamports:'0';
  maximum_fee_lamports:Decimal;maximum_run_fee_lamports:Decimal;
  observations:[{capture:RpcCaptureRef;fee_lamports:Decimal},{capture:RpcCaptureRef;fee_lamports:Decimal}];};
 /** Original exact prepared SDK bytes, never reconstructed by a frontend serializer. */
 message_hex:string;message_sha256:Hex32;unsigned_transaction_hex:string;packet_bytes:Decimal;
 /** Source GO expiry is deliberately absent: it guarded NEW input processing already committed.
  * Context expires by independent fresh-chain/run/lease bounds. Clock lag yields waiting state,
  * never host Clock substitution, price restamp, changed batch or permanent journal poison. */
}
export interface SourceProofReference {
 format:'setl8-devnet-recorded-btc-source-proof-v1';stream:string;purpose:'live_record_only';
 capture_seq:Decimal;raw_body_sha256:Hex32;headers_sha256:Hex32;envelope_sha256:Hex32;
 chain_sha256:Hex32;record_sha256:Hex32;normalization_sha256:Hex32;verifier_manifest_sha256:Hex32;
 metadata:{capture_seq:Decimal;body_sha256:Hex32;chain_sha256:Hex32};
 source_ns:Decimal;verifier_receive_ns:Decimal;backend_import_receive_ns:Decimal;
 backend_admission_ns:Decimal;ordered_sample_input_seq:Decimal;raw_evidence_id:Hex32;
}
/** POST returns existing job without reacquisition on retries; GET never performs RPC. */
export interface ObservePurchaseRequest {request_id:Hex32;signature:string}
export interface DevnetPipelineJob {
 api_version:'1';devnet_execution_version:'1';job_id:Hex32;run_id:Hex32;request_id:Hex32;wallet:WalletBase58;
 subject:{run_id:Hex32;account:Hex32;account_address:WalletBase58;owner_wallet:WalletBase58;stage:'Market'|'Close'|null;
 purchase_signature:string|null;purchase_signature_sha256:Hex32|null;basis:'armed_plan_not_origin_proof'};
 polling:'read_only_no_acquisition';terminal:boolean;
 kind:'purchase_origin'|'market_source'|'whole_close_source'|'post_journal';
 state:'queued'|'observing'|'waiting_for_finality'|'waiting_for_finalized_clock'|'genesis_registered'|'source_ready'|'prepared_unsigned'|'blocked'|'unknown';
 blocked_reason:string|null;evidence_ids:Hex32[];duplicate:boolean;
 signing:'disabled';submission:'not_performed';
}
export interface PrepareSourceRequest {request_id:Hex32;stage:'Market'|'Close'}
export interface DevnetJobRoutes {
 'POST /v1/devnet/execution/purchase-observations':{request:ObservePurchaseRequest;response:DevnetPipelineJob};
 'POST /v1/devnet/execution/accounts/{account}/source-contexts':{request:PrepareSourceRequest;response:DevnetPipelineJob};
 'GET /v1/devnet/execution/jobs/{job_id}':{response:DevnetPipelineJob};
}

/** Frozen job seam: request_id is original immutable operation ID; recovery checks exact owner+ID
 * before the current run. Changed kind/signature/subject conflicts409. Otherwise lookup only the
 * currently armed owner/account/run, never an unrelated wallet-wide latest job. Duplicate POST
 * returns original job/request_id/result and spends no new attempt; GET is ALWAYS read-only.
 * purchase_signature_sha256 = SHA256(decoded canonical64-byte Ed25519 signature), not its text.
 * queued/observing/waiting_for_finality/waiting_for_finalized_clock are pollable progress states.
 * genesis_registered/source_ready/prepared_unsigned are completed local job results. blocked and
 * unknown are terminal for automatic retry; unknown never releases by timeout. All GETs remain
 * pollable as reads. Progress/subject are not ownership proof: matched verified origin/context required.
 */

/** Artifact identity: sdk_artifact_sha256 in Rust producer/origin/context records is SOURCE
 * 7ac5a6b5f65b45a85c5911e697058cadc362a5cf5ebe6989a988c2522bdde9b2;
 * approved_npm_artifact_sha256 is ac7067ccd66c3462456c7daaf6e357c81ef086dec9ad761fd6a564d00bec62db.
 * They are distinct artifacts bound by descriptor00d100163f8d246156d4419cae7ba972ae2b005828069aa359693a543c9a517e,
 * profile p30-devnet-actions-2026-11-02-v1 and Origin review2a505c8c54ff93ffb2710804b0a7c1a770c186de2a7238906804c45a98827ad0.
 * The TS signer validates the ORIGINAL Rust serialized message; no cross-language packet identity.
 * Old runtime/dev4 fingerprints remain separate and unchanged.
 */

export interface FixedFirstRunIntentPolicy {
 format:'setl8-devnet-fixed-first-run-intents-v1';account_size_micro:'2500000000';
 market_nonce:'1';whole_close_nonce:'2';market_max_units:Decimal;market_qty_scale:'1000000';
 market_qty_step:Decimal;market_qty_min:Decimal;whole_close_qty:'0';nonce_allocator:false;
 unknown_submission_blocks_next_action:true;
}
