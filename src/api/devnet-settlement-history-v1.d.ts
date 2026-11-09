/** Genuine historical devnet transfer evidence; separate from owned dashboard and live execution. */
import type {Decimal,Hex32,WalletBase58} from './frontend-v1';
export interface DevnetHistoricalReceipt {
 action:'finalize_pass'|'reconcile_product'|'begin_heartbeat'|'settle_claims'|'finalize_heartbeat';
 signature:string; slot:Decimal; commitment:'finalized'; transaction_error:null;
 packet_sha256:Hex32; message_sha256:Hex32; signature_verified:true;
 program:WalletBase58; anchor_discriminator_verified:true;
 source_response_sha256:[Hex32,Hex32];
}
export interface DevnetSettlementHistory {
 api_version:'1'; settlement_history_version:'1';
 format:'setl8-devnet-public-rehearsal-settlement-history-v1';
 lane:'devnet'; visibility:'public_rehearsal_example'; example_id:'A1';
 account:WalletBase58; trader:WalletBase58;
 chain:{cluster:'devnet';genesis_hash:WalletBase58;lev_program:WalletBase58;vault_program:WalletBase58};
 transfer:{state:'finalized_token_transfer_verified';amount_atoms:Decimal;decimals:'6';
  display_symbol:'TEST_USDC';mint:WalletBase58;source_pool:WalletBase58;
  destination:WalletBase58;vault_authority:WalletBase58;
  recipient_balance_before_atoms:Decimal;recipient_balance_after_atoms:Decimal;
  balance_basis:'this_finalized_settlement_transaction_not_current_wallet_balance';
  instruction:'classic_spl_transfer_checked';outer_instruction_index:Decimal;stack_height:'2'};
 claim:{address:WalletBase58;correlation:'referenced_in_finalize_and_settle_instruction_accounts';
   typed_claim_fields_verified:false;reported_status:string;reported_status_is_not_independent_claim_decode:true};
 receipts:DevnetHistoricalReceipt[];
 provenance:{operators:['solana_public_devnet','onfinality_public_devnet'];
  corroboration:'matching_finalized_slots_serialized_packets_and_transfer_metadata';
  infrastructure_independence:'not_established';public_manifest_sha256:Hex32;
  origin_review_sha256:Hex32;receipt_result_sha256:Hex32;raw_evidence_manifest_sha256:Hex32;
  receive_time_basis:'recorded_rpc_response_receive_time';};
 limits:{history_coverage:'five_explicit_receipts_only';index_cursor:null;
  application_live_execution_proven:false;connected_owner_history:false;
  backend_submitted_transactions:'0';current_token_balance_proven:false;
  repeated_finalization_or_settlement_authorized:false;};
}
/** Authenticated immutable read route (source implementation; activation separately coordinated).
 * GET /v1/devnet/rehearsal-settlements/A1 -> DevnetSettlementHistory.
 * Existing wallet session/origin/limits preserved. Never adds A1 to J95 private account or payout lists.
 * Exact body SHA256 fd178332f04a1b25748e1e4bd55094d0eb42b53d2a6a4b56965bb5352167852f. No chain-action route is introduced. */
