/** Public GET /v1/vault/status. Exact Host/Origin/rate policy applies. All amounts/times are decimal strings. */
export interface VaultStatusV1 {
  api_version: "1";
  vault_status_version: "1";
  network: "devnet";
  vault_state: string;
  vault_program: string;
  status: "observed" | "stale";
  last_observed_at_unix_ms: string;
  served_at_unix_ms: string;
  observed_chain_unix_s: string;
  cache_ttl_seconds: "60";
  refresh_error: null | "provider_evidence_unavailable";
  pools: Array<{
    symbol: "USDC" | "USDT";
    mint: string;
    address: string;
    balance_atoms: string;
    decimals: "6";
    frozen: boolean;
  }>;
  cycle: {
    id: string;
    active: boolean;
    status: "never_started" | "processing" | "closed";
    started_at_unix_s: string | null;
    minimum_gap_s: "432000";
    next_cycle_eligible_at_unix_s: string | null;
    next_payout_at_unix_s: null;
    eligible_count: string;
    processed_count: string;
  };
  open_claims_count: string;
  open_claims_total_atoms: string;
  trading_config: { paused: string };
  product: { active: boolean; pause_reason: string };
  programs: Array<{
    program: string;
    program_data: string;
    image_sha256: string;
    image_size: string;
    upgrade_slot: string;
    upgrade_authority: string | null;
    loader: string;
    allocated_data_size: string;
    program_data_sha256: string;
    zero_padding_size: string;
  }>;
  provenance: Array<{
    operator: "solana_public_devnet" | "onfinality_public_devnet";
    endpoint: string;
    commitment: "finalized";
    slot: string;
    received_at_unix_ms: string;
    genesis_response_sha256: string;
    program_response_sha256: string;
    state_response_sha256: string;
    observed_chain_unix_s: string;
  }>;
}
