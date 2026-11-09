import bs58 from "bs58";
import descriptor from "../../../dependencies/p30/3e33090cf9193fd909f57ed75e10f9e59b9409e3c8a8f6c186272d8ee185f86d/p30-descriptor.json";
import type * as DTO from "../../api/purchase-foundation-v1";
export interface PurchaseScope {
  wallet: string;
  deploymentId: DTO.DeploymentId;
  sessionEpoch: number;
  evidencePurpose: DTO.PurchaseVersion["evidence_purpose"];
}
export type Payloads = {
  catalog: DTO.PurchaseCatalog;
  quote: DTO.PurchaseQuote;
  ack: DTO.PurchaseAcknowledgment;
  status: DTO.PurchaseStatus;
  purchases: DTO.FixedPage<DTO.PurchaseStatus>;
  owned: DTO.FixedPage<DTO.OwnedAccount>;
  account: DTO.OwnedAccountRead;
};
export class PurchaseDataError extends Error {
  constructor(path: string) {
    super("Purchase data needs a fresh reviewed read (" + path + ").");
    this.name = "PurchaseDataError";
  }
}
const bad = (p: string): never => {
  throw new PurchaseDataError(p);
};
type S = (v: unknown, p: string) => any;
const str =
  (max = 256): S =>
  (v, p) =>
    typeof v === "string" &&
    v.length > 0 &&
    v.length <= max &&
    !/[\u0000-\u001f\u007f]/.test(v)
      ? v
      : bad(p);
const lit =
  (...values: unknown[]): S =>
  (v, p) =>
    values.includes(v) ? v : bad(p);
const dec: S = (v, p) =>
  typeof v === "string" &&
  v.length <= 20 &&
  /^(0|[1-9][0-9]*)$/.test(v) &&
  BigInt(v) <= 18446744073709551615n
    ? v
    : bad(p);
const hex: S = (v, p) =>
  typeof v === "string" && /^[a-f0-9]{64}$/.test(v) ? v : bad(p);
const base =
  (length: number, min: number, max: number): S =>
  (v, p) => {
    str(max)(v, p);
    if ((v as string).length < min) bad(p);
    try {
      const b = bs58.decode(v as string);
      if (b.length !== length || bs58.encode(b) !== v) bad(p);
      return v;
    } catch {
      return bad(p);
    }
  };
const address = base(32, 32, 44),
  signature = base(64, 64, 88);
const nullable =
  (s: S): S =>
  (v, p) =>
    v === null ? null : s(v, p);
const arr =
  (s: S, max = 100, min = 0): S =>
  (v, p) => {
    if (!Array.isArray(v) || v.length > max || v.length < min) bad(p);
    return (v as unknown[]).map((x, i) => s(x, p + "." + i));
  };
const obj =
  (shape: Record<string, S>): S =>
  (v, p) => {
    if (!v || typeof v !== "object" || Array.isArray(v)) bad(p);
    const d = v as Record<string, unknown>,
      keys = Object.keys(d);
    if (
      keys.length !== Object.keys(shape).length ||
      keys.some((k) => !Object.hasOwn(shape, k))
    )
      bad(p);
    return Object.fromEntries(
      Object.entries(shape).map(([k, s]) => [k, s(d[k], p + "." + k)]),
    );
  };
const reasons = arr(str(128), 32),
  version = {
    api_version: lit("1"),
    purchase_version: lit("1"),
    format: lit("setl8-purchase-read-v1"),
    evidence_purpose: lit("synthetic_test", "chain_observation"),
  };
const deployment = obj({
  deployment_id: lit("p30-devnet-rehearsal-v1"),
  environment: lit("devnet_rehearsal"),
  genesis_hash: address,
  lev_program: address,
  vault_program: address,
  owner_manifest_sha256: hex,
  sdk_release: nullable(str(32)),
  sdk_profile: nullable(str(64)),
  sdk_artifact_sha256: nullable(hex),
  compatibility: lit("awaiting_review", "approved_for_purchase_reads"),
  production: lit(false),
});
const snapshot = obj({
  observation_id: hex,
  context_slots: arr(dec, 2, 2),
  minimum_context_slot: dec,
  rpc_response_sha256: arr(hex, 2, 2),
  commitment: lit("finalized"),
  received_unix_ns: dec,
  timestamp_basis: lit("server_receive_time"),
  trust_policy_sha256: hex,
  evidence: arr(
    obj({
      address,
      availability: lit("present", "absent"),
      owner_program: nullable(address),
      role: str(64),
      data_sha256: nullable(hex),
    }),
    64,
  ),
  corroboration: lit("two_approved_rpc_sources", "synthetic_fixture"),
});
const charge = obj({
  mint: obj({
    address,
    decimals: lit("6"),
    display_symbol: str(16),
    test_token: lit(true),
  }),
  tier_price_atoms: dec,
  purchase_fee_bps: dec,
  purchase_fee_atoms: dec,
  total_token_debit_atoms: dec,
  formula: lit(
    "tier_price_atoms + ceil(tier_price_atoms * purchase_fee_bps / 10000)",
  ),
});
const offer = obj({
  tier_index: dec,
  account_size_micro_usd: dec,
  ruleset_address: address,
  ruleset_version: lit("1"),
  charge,
});
const coverage = obj({
  discovery: lit("complete_through_checkpoint", "partial", "blocked"),
  finalized_scanned_through_slot: nullable(dec),
  missing_history: lit(true, false),
  blocked_reasons: reasons,
});
const status = obj({
  ...version,
  purchase_id: hex,
  request_id: hex,
  wallet: address,
  deployment,
  quote_id: hex,
  transaction_signature: nullable(signature),
  expected_account: hex,
  recent_blockhash: nullable(address),
  last_valid_block_height: nullable(dec),
  recovery: obj({
    action: lit("reconcile_before_repayment"),
    unreported_signature_known: lit(false),
  }),
  expected_message_sha256: hex,
  submission: obj({
    state: lit("prepared", "submitted", "unknown"),
    basis: lit("client_report"),
    reported_unix_ns: dec,
  }),
  chain: obj({
    state: lit("unknown", "observed", "finalized", "failed"),
    commitment: nullable(lit("confirmed", "finalized")),
    slot: nullable(dec),
    blockhash: nullable(address),
    transaction_error_code: nullable(str(128)),
    message_sha256: nullable(hex),
    evidence_ref: nullable(str(256)),
  }),
  verification: obj({
    state: lit("pending", "verified", "blocked"),
    reasons,
    actual_charge: nullable(charge),
    quote_match: lit("not_checked", "matched", "different"),
  }),
  indexing: obj({
    state: lit("not_started", "pending", "indexed", "blocked"),
    finalized_scanned_through_slot: nullable(dec),
    ownership_origin_ref: nullable(str(256)),
    blocked_reasons: reasons,
  }),
  verified_account: nullable(hex),
  updated_unix_ns: dec,
  poll_after_ms: dec,
});
const owned = obj({
  account: hex,
  account_address: address,
  trader: address,
  challenge_id: dec,
  tier_index: dec,
  account_size_micro_usd: dec,
  opened_phase: dec,
  opened_time_unix_s: dec,
  origin: obj({
    commitment: lit("finalized"),
    slot: dec,
    transaction_signature: signature,
    evidence_ref: str(256),
    kind: lit("purchase", "reset"),
    history: lit("complete_authenticated_prefix", "verified_origin_only"),
  }),
  current_chain_state: nullable(
    obj({
      phase: dec,
      status_code: str(64),
      ruleset_version: dec,
      snapshot,
      basis: lit("finalized_account_data"),
    }),
  ),
  evaluator: obj({
    registration: lit("absent", "registered", "blocked"),
    phase: nullable(dec),
    status_code: nullable(str(64)),
    processed_through: nullable(dec),
    blocked_reasons: reasons,
    phase_matches_chain: nullable(lit(true, false)),
    lifecycle_application: lit("operator_only"),
  }),
  terminal_admission: obj({ enabled: lit(false), reasons }),
});
const page = (row: S) =>
  obj({
    ...version,
    deployment,
    wallet: address,
    rows: arr(row),
    next_cursor: nullable(str(4096)),
    has_more: lit(true, false),
    read_cutoff: obj({
      lineage: str(128),
      revision: dec,
      observed_unix_ns: dec,
    }),
    coverage,
    refresh_after_ms: dec,
  });
const schemas: Record<keyof Payloads, S> = {
  catalog: obj({
    ...version,
    deployment,
    snapshot,
    offers: arr(offer, 20),
    fetched_unix_ns: dec,
    refresh_after_ms: dec,
    purchase_preparation: lit("requires_reviewed_sdk_and_fresh_quote"),
  }),
  quote: obj({
    ...version,
    quote_id: hex,
    request_id: hex,
    wallet: address,
    deployment,
    snapshot,
    offer,
    wallet_profile_address: address,
    wallet_profile_state: lit("absent_at_snapshot", "present_at_snapshot"),
    next_challenge_id: dec,
    expected_account: hex,
    expected_account_address: address,
    created_unix_ns: dec,
    refresh_required_at_unix_ns: dec,
    reservation: lit(false),
    payment_accounts: obj({
      sector_config: address,
      product_registry: address,
      vault_state: address,
      pool_token_account: address,
      vault_platform_token_account: address,
      fee_token_account: address,
      token_program: address,
    }),
    sol_costs: obj({
      basis: lit("not_estimated_without_exact_transaction_message"),
      network_fee_lamports: lit(null),
      priority_fee_lamports: lit(null),
      account_rent_lamports: lit(null),
    }),
  }),
  ack: obj({ ...version, duplicate: lit(true, false), purchase: status }),
  status,
  purchases: page(status),
  owned: page(owned),
  account: obj({
    ...version,
    deployment,
    wallet: address,
    row: owned,
    coverage,
    read_at_unix_ns: dec,
  }),
};
/** Bounded JSON-like copy rejects accessors/cycles/prototype objects before schema reads. */
function safe(value: unknown) {
  let nodes = 0,
    bytes = 0;
  const ancestors = new Set<object>();
  const walk = (v: unknown, depth: number): any => {
    if (++nodes > 10000 || depth > 32) bad("response budget");
    if (typeof v === "string") {
      bytes += new TextEncoder().encode(v).length;
      if (bytes > 262144 || v.length > 8192) bad("response size");
      return v;
    }
    if (v === null || typeof v === "boolean") return v;
    if (typeof v !== "object") bad("JSON values");
    const o = v as object;
    if (ancestors.has(o)) bad("cycle");
    if (
      !Array.isArray(o) &&
      Object.getPrototypeOf(o) !== Object.prototype &&
      Object.getPrototypeOf(o) !== null
    )
      bad("prototype");
    ancestors.add(o);
    let out: any;
    if (Array.isArray(o)) {
      if (o.length > 1024) bad("array budget");
      if (
        Reflect.ownKeys(o).some(
          (k) =>
            k !== "length" &&
            (typeof k !== "string" ||
              !/^(0|[1-9][0-9]*)$/.test(k) ||
              Number(k) >= o.length),
        )
      )
        bad("array properties");
      out = [];
      for (let i = 0; i < o.length; i++) {
        const d = Object.getOwnPropertyDescriptor(o, String(i));
        if (!d || !("value" in d)) return bad("accessor");
        out.push(walk(d.value, depth + 1));
      }
    } else {
      out = Object.create(null);
      for (const k of Reflect.ownKeys(o)) {
        if (typeof k !== "string" || k.length > 128) return bad("key");
        bytes += k.length;
        const d = Object.getOwnPropertyDescriptor(o, k);
        if (!d || !("value" in d)) return bad("accessor");
        out[k] = walk(d.value, depth + 1);
      }
    }
    ancestors.delete(o);
    return out;
  };
  if (typeof value === "string") {
    if (new TextEncoder().encode(value).length > 262144) bad("response size");
    try {
      value = JSON.parse(value);
    } catch {
      bad("JSON");
    }
  }
  const copied = walk(value, 0);
  if (new TextEncoder().encode(JSON.stringify(copied)).length > 262144)
    bad("response size");
  return copied;
}
export const keyHex = (value: string) =>
  Array.from(bs58.decode(value), (n) => n.toString(16).padStart(2, "0")).join(
    "",
  );
function semantics(v: any, scope: PurchaseScope) {
  if (!v || typeof v !== "object") return;
  if (v.evidence_purpose && v.evidence_purpose !== scope.evidencePurpose)
    bad("evidence purpose");
  if (v.wallet && v.wallet !== scope.wallet) bad("wallet scope");
  if (v.deployment) {
    const d = v.deployment;
    if (
      d.deployment_id !== scope.deploymentId ||
      d.genesis_hash !== descriptor.genesisHash ||
      d.lev_program !== descriptor.levProgramId ||
      d.vault_program !== descriptor.vaultProgramId ||
      d.owner_manifest_sha256 !== descriptor.ownerDeploymentJsonSha256
    )
      bad("deployment scope");
  }
  if (v.trader && v.trader !== scope.wallet) bad("owner scope");
  if (v.account_address && v.account !== keyHex(v.account_address))
    bad("account identity");
  if (
    v.expected_account_address &&
    v.expected_account !== keyHex(v.expected_account_address)
  )
    bad("quote account identity");
  if (v.tier_index && BigInt(v.tier_index) > 9n) bad("tier");
  if (v.ruleset_address && v.ruleset_address !== descriptor.ruleset)
    bad("ruleset identity");
  if (v.mint && v.total_token_debit_atoms !== undefined) {
    if (![descriptor.usdcMint, descriptor.usdtMint].includes(v.mint.address))
      bad("test mint");
    const price = BigInt(v.tier_price_atoms),
      fee = (price * BigInt(v.purchase_fee_bps) + 9999n) / 10000n;
    if (
      fee !== BigInt(v.purchase_fee_atoms) ||
      price + fee !== BigInt(v.total_token_debit_atoms)
    )
      bad("charge arithmetic");
  }
  if (
    v.corroboration &&
    v.corroboration !==
      (scope.evidencePurpose === "synthetic_test"
        ? "synthetic_fixture"
        : "two_approved_rpc_sources")
  )
    bad("evidence scope");
  if (
    v.context_slots &&
    v.context_slots.some(
      (s: string) => BigInt(s) < BigInt(v.minimum_context_slot),
    )
  )
    bad("context floor");
  if (v.has_more !== undefined && v.has_more !== (v.next_cursor !== null))
    bad("cursor");
  if (v.chain) {
    const c = v.chain;
    const finalizedSuccess =
      c.state === "finalized" &&
      c.commitment === "finalized" &&
      c.slot !== null &&
      c.transaction_error_code === null &&
      c.message_sha256 !== null &&
      c.evidence_ref !== null &&
      v.transaction_signature !== null;
    if (c.state === "finalized" && !finalizedSuccess)
      bad("finalized success evidence");
    if (
      c.state === "failed" &&
      (c.commitment !== "finalized" ||
        c.slot === null ||
        !c.transaction_error_code ||
        !c.evidence_ref ||
        !v.transaction_signature)
    )
      bad("failure evidence");
    if (
      v.verification.state === "verified" &&
      (!finalizedSuccess ||
        !v.verification.actual_charge ||
        v.verified_account !== v.expected_account ||
        c.message_sha256 !== v.expected_message_sha256 ||
        v.verification.quote_match !== "matched")
    )
      bad("purchase verification evidence");
    if (
      v.verification.quote_match === "different" &&
      (v.verification.state !== "blocked" ||
        !v.verification.actual_charge ||
        v.verified_account !== null)
    )
      bad("quote mismatch evidence");
    // Ownership indexing is independent of quote matching and evaluator registration.
    if (
      v.indexing.state === "indexed" &&
      v.indexing.ownership_origin_ref === null
    )
      bad("ownership indexing evidence");
  }
  if (
    v.refresh_required_at_unix_ns &&
    BigInt(v.refresh_required_at_unix_ns) <= BigInt(v.created_unix_ns)
  )
    bad("quote interval");
  if (v.payment_accounts) {
    const p = v.payment_accounts;
    if (
      p.sector_config !== descriptor.config ||
      p.product_registry !== descriptor.registry ||
      p.vault_state !== descriptor.vaultState ||
      p.token_program !== "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA" ||
      p.pool_token_account !==
        (v.offer.charge.mint.address === descriptor.usdcMint
          ? descriptor.usdcPool
          : descriptor.usdtPool)
    )
      bad("payment identities");
  }
  if (v.rows) {
    const keys = v.rows.map((r: any) => r.account ?? r.purchase_id);
    if (new Set(keys).size !== keys.length) bad("duplicate rows");
  }
  if (v.offers) {
    const ids = v.offers.map(
      (o: any) => o.tier_index + ":" + o.charge.mint.address,
    );
    if (new Set(ids).size !== ids.length) bad("duplicate offer");
  }
  for (const x of Object.values(v))
    if (x && typeof x === "object") {
      if (Array.isArray(x)) for (const item of x) semantics(item, scope);
      else semantics(x, scope);
    }
}
function freeze<T>(v: T): T {
  if (v && typeof v === "object") {
    for (const x of Object.values(v)) freeze(x);
    Object.freeze(v);
  }
  return v;
}
export function parsePurchase<K extends keyof Payloads>(
  kind: K,
  raw: unknown,
  scope: PurchaseScope,
): Payloads[K] {
  address(scope.wallet, "scope wallet");
  if (
    scope.deploymentId !== "p30-devnet-rehearsal-v1" ||
    !Number.isSafeInteger(scope.sessionEpoch) ||
    scope.sessionEpoch < 0
  )
    bad("request scope");
  const parsed = schemas[kind](safe(raw), kind);
  semantics(parsed, scope);
  return freeze(parsed) as Payloads[K];
}
export function checkedCharge(charge: DTO.TokenCharge) {
  return {
    base: charge.tier_price_atoms,
    fee: charge.purchase_fee_atoms,
    total: charge.total_token_debit_atoms,
    decimals: charge.mint.decimals,
    symbol: charge.mint.display_symbol,
  };
}

export function assertPurchaseScope(scope: PurchaseScope) {
  address(scope.wallet, "scope wallet");
  if (
    scope.deploymentId !== "p30-devnet-rehearsal-v1" ||
    !Number.isSafeInteger(scope.sessionEpoch) ||
    scope.sessionEpoch < 0 ||
    !["synthetic_test", "chain_observation"].includes(scope.evidencePurpose)
  )
    bad("request scope");
  return Object.freeze({ ...scope });
}
