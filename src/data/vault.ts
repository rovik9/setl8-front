import { api, ApiError } from "../api/client";
import proof from "./devnet-proof.json";

import type { VaultStatusV1 } from "../api/vault-status-v1";
export type VaultStatus = VaultStatusV1;
const decimal = (v: unknown): v is string =>
  typeof v === "string" &&
  /^(0|[1-9][0-9]{0,19})$/.test(v) &&
  BigInt(v) <= 18446744073709551615n;
const digest = (v: unknown) =>
  typeof v === "string" && /^[a-f0-9]{64}$/.test(v);
export function checkedVaultStatus(value: unknown): VaultStatus {
  const v = value as VaultStatus;
  const fail = () => {
    throw Error(
      "Vault evidence could not be verified. Check again after the service is updated.",
    );
  };
  if (
    !v ||
    v.api_version !== "1" ||
    v.vault_status_version !== "1" ||
    v.network !== "devnet" ||
    !["observed", "stale"].includes(v.status) ||
    v.vault_state !== proof.accounts.vault_state ||
    v.vault_program !== proof.programs.vault.id ||
    v.cache_ttl_seconds !== "60"
  )
    return fail();
  if (
    ![
      v.last_observed_at_unix_ms,
      v.served_at_unix_ms,
      v.observed_chain_unix_s,
      v.open_claims_count,
      v.open_claims_total_atoms,
    ].every(decimal) ||
    BigInt(v.served_at_unix_ms) < BigInt(v.last_observed_at_unix_ms)
  )
    return fail();
  if (
    !Array.isArray(v.pools) ||
    v.pools.length !== 2 ||
    v.pools.some((p) => !p || typeof p !== "object") ||
    new Set(v.pools.map((p) => p.symbol)).size !== 2
  )
    return fail();
  for (const p of v.pools) {
    if (
      !["USDC", "USDT"].includes(p.symbol) ||
      !decimal(p.balance_atoms) ||
      p.decimals !== "6" ||
      typeof p.frozen !== "boolean"
    )
      return fail();
    const symbol = p.symbol === "USDC" ? "usdc" : "usdt";
    if (
      p.mint !== proof.test_mints[symbol] ||
      p.address !==
        proof.accounts[symbol === "usdc" ? "usdc_pool" : "usdt_pool"]
    )
      return fail();
  }
  const c = v.cycle;
  if (
    !c ||
    ![c.id, c.eligible_count, c.processed_count].every(decimal) ||
    c.minimum_gap_s !== "432000" ||
    c.next_payout_at_unix_s !== null ||
    typeof c.active !== "boolean" ||
    !["never_started", "processing", "closed"].includes(c.status) ||
    BigInt(c.processed_count) > BigInt(c.eligible_count)
  )
    return fail();
  if (
    (c.status === "processing") !== c.active ||
    (c.status === "never_started") !== (c.started_at_unix_s === null)
  )
    return fail();
  if (
    c.started_at_unix_s === null
      ? c.next_cycle_eligible_at_unix_s !== null
      : !decimal(c.started_at_unix_s) ||
        c.started_at_unix_s === "0" ||
        !decimal(c.next_cycle_eligible_at_unix_s) ||
        BigInt(c.next_cycle_eligible_at_unix_s) !==
          BigInt(c.started_at_unix_s) + BigInt(c.minimum_gap_s)
  )
    return fail();
  if (
    !v.product ||
    typeof v.product.active !== "boolean" ||
    !decimal(v.product.pause_reason) ||
    !v.trading_config ||
    !decimal(v.trading_config.paused)
  )
    return fail();
  if (
    !Array.isArray(v.provenance) ||
    v.provenance.length !== 2 ||
    v.provenance.some((p) => !p || typeof p !== "object") ||
    v.provenance
      .map((p) => p.operator)
      .sort()
      .join(",") !== "onfinality_public_devnet,solana_public_devnet"
  )
    return fail();
  if (
    v.provenance.some(
      (p) =>
        p.commitment !== "finalized" ||
        ![p.slot, p.received_at_unix_ms, p.observed_chain_unix_s].every(
          decimal,
        ) ||
        ![
          p.genesis_response_sha256,
          p.program_response_sha256,
          p.state_response_sha256,
        ].every(digest),
    )
  )
    return fail();
  if (
    !Array.isArray(v.programs) ||
    v.programs.length !== 2 ||
    !(["lev", "vault"] as const).every((key) =>
      v.programs.some(
        (p) =>
          p &&
          p.program === proof.programs[key].id &&
          p.image_sha256 === proof.programs[key].sha256,
      ),
    )
  )
    return fail();
  if (
    v.status === "observed"
      ? v.refresh_error !== null
      : typeof v.refresh_error !== "string"
  )
    return fail();
  return v;
}
/**
 * The service cannot give a live reading right now (route not served, service down, network, timeout).
 * Expected in a demo; NOT an integrity failure. Evidence that arrives but fails verification is a
 * different error and still raises an alert.
 */
export class VaultUnavailable extends Error {
  constructor(readonly reason: string) {
    super("Live vault read unavailable: " + reason);
    this.name = "VaultUnavailable";
  }
}
export async function readVaultStatus(signal: AbortSignal) {
  let body: unknown;
  try {
    body = await api.request<unknown>("/v1/vault/status", {
      signal,
      authFailure: false,
      maxBytes: 65536,
    });
  } catch (error) {
    if (signal.aborted) throw new VaultUnavailable("the read timed out");
    if (error instanceof ApiError) {
      if (error.status === 404)
        throw new VaultUnavailable(
          "this gateway does not serve /v1/vault/status (HTTP 404)",
        );
      if (error.status === 503 || error.status === 502)
        throw new VaultUnavailable(
          "the service reported no current observation (HTTP " +
            error.status +
            ", " +
            error.code +
            ")",
        );
    }
    // fetch() rejects with a TypeError when the service cannot be reached at all.
    if (error instanceof TypeError)
      throw new VaultUnavailable("the service could not be reached");
    throw error;
  }
  return checkedVaultStatus(body);
}
export function vaultTime(seconds: string) {
  const ms = BigInt(seconds) * 1000n;
  return ms <= 8640000000000000n
    ? new Date(Number(ms))
        .toISOString()
        .replace("T", " ")
        .replace(".000Z", " UTC")
    : "Time unavailable";
}
export function vaultElapsed(v: VaultStatus): number | null {
  if (v.cycle.started_at_unix_s === null) return null;
  const elapsed =
    BigInt(v.observed_chain_unix_s) - BigInt(v.cycle.started_at_unix_s);
  return Number(elapsed < 0n ? 0n : elapsed > 432000n ? 432000n : elapsed);
}
