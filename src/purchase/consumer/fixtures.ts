/** Deterministic DTO service simulation. No network, wallet, real durability, transaction or account creation. */
import bs58 from "bs58";
import identities from "./fixture-identities.json";
import historical from "./historical-offers.json";
import descriptor from "../../../dependencies/p30/3e33090cf9193fd909f57ed75e10f9e59b9409e3c8a8f6c186272d8ee185f86d/p30-descriptor.json";
import type * as D from "../../api/purchase-foundation-v1";
import type { PurchaseTransport } from "./client";
import { keyHex, type PurchaseScope } from "./runtime";
export const fixtureWallets = identities.map((x) => x.wallet);
export const fixtureId = (n: number) =>
  BigInt(n).toString(16).padStart(64, "0");
export type Scenario =
  "progress" | "unknown" | "mismatch" | "partial" | "lost_ack" | "expired";
export function createPurchaseFixtures(
  now: () => bigint = () => BigInt(Date.now()) * 1000000n,
) {
  let scenario: Scenario = "progress",
    counter = 100,
    quotes = new Map<string, D.PurchaseQuote>(),
    records = new Map<string, D.PurchaseStatus>(),
    steps = new Map<string, number>();
  const version = {
    api_version: "1" as const,
    purchase_version: "1" as const,
    format: "setl8-purchase-read-v1" as const,
    evidence_purpose: "synthetic_test" as const,
  };
  const deployment: D.DeploymentRef = {
    deployment_id: "p30-devnet-rehearsal-v1",
    environment: "devnet_rehearsal",
    genesis_hash: descriptor.genesisHash,
    lev_program: descriptor.levProgramId,
    vault_program: descriptor.vaultProgramId,
    owner_manifest_sha256: descriptor.ownerDeploymentJsonSha256,
    sdk_release: "0.1.0-dev.5",
    sdk_profile: descriptor.profileId,
    sdk_artifact_sha256:
      "3e33090cf9193fd909f57ed75e10f9e59b9409e3c8a8f6c186272d8ee185f86d",
    compatibility: "approved_for_purchase_reads",
    production: false,
  };
  const snapshot = (): D.ChainSnapshot => ({
    observation_id: fixtureId(12),
    context_slots: ["100", "101"],
    minimum_context_slot: "100",
    rpc_response_sha256: [fixtureId(13), fixtureId(14)],
    commitment: "finalized",
    received_unix_ns: now().toString(),
    timestamp_basis: "server_receive_time",
    trust_policy_sha256: fixtureId(15),
    evidence: [],
    corroboration: "synthetic_fixture",
  });
  const coverage = (): D.ReadCoverage => ({
    discovery:
      scenario === "partial" ? "partial" : "complete_through_checkpoint",
    finalized_scanned_through_slot: "101",
    missing_history: scenario === "partial",
    blocked_reasons: scenario === "partial" ? ["fixture_partial_history"] : [],
  });
  const charge = (base: string): D.TokenCharge => {
    const fee = (BigInt(base) * 40n + 9999n) / 10000n;
    return {
      mint: {
        address: descriptor.usdcMint,
        decimals: "6",
        display_symbol: "USDC",
        test_token: true,
      },
      tier_price_atoms: base,
      purchase_fee_bps: "40",
      purchase_fee_atoms: fee.toString(),
      total_token_debit_atoms: (BigInt(base) + fee).toString(),
      formula:
        "tier_price_atoms + ceil(tier_price_atoms * purchase_fee_bps / 10000)",
    };
  };
  const offers = (): D.TierOffer[] =>
    historical.offers.map((o) => ({
      tier_index: o.tier_index,
      account_size_micro_usd: o.account_size_micro_usd,
      ruleset_address: descriptor.ruleset,
      ruleset_version: "1",
      charge: charge(o.tier_price_atoms),
    }));
  const row = (r: D.PurchaseStatus): D.OwnedAccount => {
    const q = quotes.get(r.quote_id)!;
    return {
      account: q.expected_account,
      account_address: q.expected_account_address,
      trader: r.wallet,
      challenge_id: q.next_challenge_id,
      tier_index: q.offer.tier_index,
      account_size_micro_usd: q.offer.account_size_micro_usd,
      opened_phase: "1",
      opened_time_unix_s: (now() / 1000000000n).toString(),
      origin: {
        commitment: "finalized",
        slot: "101",
        transaction_signature: bs58.encode(new Uint8Array(64).fill(7)),
        evidence_ref: "fixture_origin",
        kind: "purchase",
        history: "verified_origin_only",
      },
      current_chain_state: {
        phase: "1",
        status_code: "active",
        ruleset_version: "1",
        snapshot: snapshot(),
        basis: "finalized_account_data",
      },
      evaluator: {
        registration: "absent",
        phase: null,
        status_code: null,
        processed_through: null,
        blocked_reasons: ["fixture_evaluator_not_registered"],
        phase_matches_chain: null,
        lifecycle_application: "operator_only",
      },
      terminal_admission: {
        enabled: false,
        reasons: ["fixture_terminal_unavailable"],
      },
    };
  };
  const own = (s: PurchaseScope) =>
    [...records.values()]
      .filter((r) => r.wallet === s.wallet && r.indexing.state === "indexed")
      .map(row);
  const page = <T>(s: PurchaseScope, rows: T[]): D.FixedPage<T> => ({
    ...version,
    deployment,
    wallet: s.wallet,
    rows,
    next_cursor: null,
    has_more: false,
    read_cutoff: {
      lineage: "fixture_lineage",
      revision: "1",
      observed_unix_ns: "1",
    },
    coverage: coverage(),
    refresh_after_ms: "1000",
  });
  const transport: PurchaseTransport = {
    async catalog() {
      return {
        ...version,
        deployment,
        snapshot: snapshot(),
        offers: offers(),
        fetched_unix_ns: now().toString(),
        refresh_after_ms: "1000",
        purchase_preparation: "requires_reviewed_sdk_and_fresh_quote",
      } satisfies D.PurchaseCatalog;
    },
    async quote(s, request) {
      const identity = identities.find((x) => x.wallet === s.wallet);
      if (!identity) throw Error("Unknown fixture wallet");
      const offer = offers().find(
        (x) =>
          x.tier_index === request.tier_index &&
          x.charge.mint.address === request.mint,
      );
      if (!offer) throw Error("Unknown fixture offer");
      const q: D.PurchaseQuote = {
        ...version,
        deployment,
        snapshot: snapshot(),
        quote_id: fixtureId(counter++),
        request_id: request.request_id,
        wallet: s.wallet,
        offer,
        wallet_profile_address: identity.walletProfile,
        wallet_profile_state: "present_at_snapshot",
        next_challenge_id: identity.challengeId,
        expected_account: keyHex(identity.account),
        expected_account_address: identity.account,
        created_unix_ns: (
          now() - (scenario === "expired" ? 120000000000n : 0n)
        ).toString(),
        refresh_required_at_unix_ns: (
          now() + (scenario === "expired" ? -60000000000n : 60000000000n)
        ).toString(),
        reservation: false,
        payment_accounts: {
          sector_config: descriptor.config,
          product_registry: descriptor.registry,
          vault_state: descriptor.vaultState,
          pool_token_account: descriptor.usdcPool,
          vault_platform_token_account: identity.platformToken,
          fee_token_account: identity.feeToken,
          token_program: "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
        },
        sol_costs: {
          basis: "not_estimated_without_exact_transaction_message",
          network_fee_lamports: null,
          priority_fee_lamports: null,
          account_rent_lamports: null,
        },
      };
      quotes.set(q.quote_id, q);
      return structuredClone(q);
    },
    async prepareAttempt(s, request) {
      const old = [...records.values()].find(
        (x) => x.wallet === s.wallet && x.request_id === request.request_id,
      );
      if (old) {
        if (old.expected_message_sha256 !== request.message_sha256)
          throw Error("Fixture request conflict");
        return { ...version, duplicate: true, purchase: structuredClone(old) };
      }
      const q = quotes.get(request.quote_id);
      if (!q || q.wallet !== s.wallet)
        throw Error("Fixture quote scope mismatch");
      const r: D.PurchaseStatus = {
        ...version,
        deployment,
        purchase_id: fixtureId(counter++),
        request_id: request.request_id,
        wallet: s.wallet,
        quote_id: request.quote_id,
        transaction_signature: null,
        expected_account: request.expected_account,
        recent_blockhash: request.recent_blockhash,
        last_valid_block_height: request.last_valid_block_height,
        recovery: {
          action: "reconcile_before_repayment",
          unreported_signature_known: false,
        },
        expected_message_sha256: request.message_sha256,
        submission: {
          state:
            scenario === "unknown" || scenario === "lost_ack"
              ? "unknown"
              : "prepared",
          basis: "client_report",
          reported_unix_ns: now().toString(),
        },
        chain: {
          state: "unknown",
          commitment: null,
          slot: null,
          blockhash: null,
          transaction_error_code: null,
          message_sha256: null,
          evidence_ref: null,
        },
        verification: {
          state: "pending",
          reasons: [],
          actual_charge: null,
          quote_match: "not_checked",
        },
        indexing: {
          state: "not_started",
          finalized_scanned_through_slot: null,
          ownership_origin_ref: null,
          blocked_reasons: [],
        },
        verified_account: null,
        updated_unix_ns: now().toString(),
        poll_after_ms: "1000",
      };
      records.set(r.purchase_id, r);
      steps.set(r.purchase_id, 0);
      if (scenario === "lost_ack")
        throw Error(
          "Fixture acknowledgment lost; reconcile the original attempt.",
        );
      return { ...version, duplicate: false, purchase: structuredClone(r) };
    },
    async status(s, id) {
      const r = records.get(id);
      if (!r || r.wallet !== s.wallet)
        throw Error("Fixture resource unavailable");
      if (scenario !== "unknown" && scenario !== "lost_ack") {
        const step = (steps.get(id) ?? 0) + 1;
        steps.set(id, step);
        r.submission.state = "submitted";
        r.chain = {
          ...r.chain,
          state: "finalized",
          commitment: "finalized",
          slot: "101",
          message_sha256: r.expected_message_sha256,
          evidence_ref: "fixture_transaction",
        };
        r.transaction_signature = bs58.encode(new Uint8Array(64).fill(7));
        if (step >= 2) {
          r.verification = {
            state: scenario === "mismatch" ? "blocked" : "verified",
            reasons: scenario === "mismatch" ? ["fixture_quote_mismatch"] : [],
            actual_charge:
              scenario === "mismatch"
                ? charge("31000000")
                : quotes.get(r.quote_id)!.offer.charge,
            quote_match: scenario === "mismatch" ? "different" : "matched",
          };
          r.verified_account =
            scenario === "mismatch" ? null : r.expected_account;
          r.indexing.state = step >= 3 ? "indexed" : "pending";
          if (step >= 3) {
            r.indexing.ownership_origin_ref = "fixture_origin";
            r.indexing.finalized_scanned_through_slot = "101";
          }
        }
      }
      return structuredClone(r);
    },
    async purchases(s) {
      return page(
        s,
        structuredClone(
          [...records.values()].filter((r) => r.wallet === s.wallet),
        ),
      );
    },
    async owned(s) {
      return page(s, scenario === "partial" ? [] : own(s));
    },
    async account(s, id) {
      const value = own(s).find((r) => r.account === id);
      if (!value) throw Error("Fixture account unavailable");
      return {
        ...version,
        deployment,
        wallet: s.wallet,
        row: value,
        coverage: coverage(),
        read_at_unix_ns: now().toString(),
      } satisfies D.OwnedAccountRead;
    },
  };
  return {
    transport,
    setScenario: (value: Scenario) => {
      scenario = value;
    },
    getScenario: () => scenario,
    records,
    quotes,
  };
}
