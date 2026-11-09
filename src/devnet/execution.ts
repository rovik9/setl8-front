import { fixedStageProblem, type StageEvidence } from "./fixedStage";
import { armedMarketSizeProblem } from "./marketSize";
import bs58 from "bs58";
import { api, ApiClient } from "../api/client";
import { DEV_API_URL, DEV_ORIGIN } from "../api/profile";
import type {
  DevnetExecutionContext,
  DevnetExecutionLedger,
  DevnetRecordedIntent,
} from "../api/devnet-execution-v1";
import type { SignedIntent, IntentReceipt } from "../api/frontend-v1";
import {
  accountBytes,
  scaledInteger,
  hex,
  type PreparedDraft,
} from "../data/orderDraft";
/** Candidate DTO consumer only. Read/action activation require a reviewed source change. */
export const DEVNET_EXECUTION_RELEASE = Object.freeze({
  contextRead: false,
  intentSign: false,
  intentSubmit: false,
  authorizationReference: null as string | null,
  wallet: null as string | null,
  account: null as string | null,
  expiresAtMs: null as number | null,
});
export class DevnetExecutionHttp {
  constructor(
    readonly client: ApiClient = api,
    private origin = globalThis.location?.origin ?? "",
  ) {}
  private readGuard() {
    if (
      !DEVNET_EXECUTION_RELEASE.contextRead ||
      this.origin !== DEV_ORIGIN ||
      this.client.base !== DEV_API_URL
    )
      throw Error(
        "The genuine devnet execution connection is not activated. No practice bridge or browser enrollment is used.",
      );
  }
  context(signal?: AbortSignal) {
    this.readGuard();
    return this.client.request<DevnetExecutionContext>(
      "/v1/devnet/execution/context",
      { signal, maxBytes: 262144 },
    );
  }
  ledger(account: string, signal?: AbortSignal) {
    this.readGuard();
    assertAccountId(account);
    return this.client.request<DevnetExecutionLedger>(
      `/v1/devnet/execution/accounts/${account}/ledger`,
      { signal, maxBytes: 262144 },
    );
  }
  submit(
    wallet: string,
    account: string,
    body: SignedIntent,
    signal?: AbortSignal,
  ) {
    this.readGuard();
    assertDevnetOrderRelease(account, wallet);
    return this.client.request<IntentReceipt>(
      `/v1/devnet/execution/accounts/${account}/intents`,
      {
        body,
        signal: signal
          ? AbortSignal.any([signal, AbortSignal.timeout(8000)])
          : AbortSignal.timeout(8000),
        protectedPost: true,
        maxBytes: 262144,
      },
    );
  }
  async recoverReceipt(
    account: string,
    body: SignedIntent,
    signal?: AbortSignal,
  ) {
    this.readGuard();
    const original = await this.recorded(account, String(body.nonce), signal);
    if (
      original.account !== account ||
      original.signed_intent.nonce !== body.nonce ||
      original.signed_intent.order !== body.order ||
      original.signed_intent.signature !== body.signature ||
      !/^[a-f0-9]{64}$/.test(original.recorded_input_sha256)
    )
      throw Error(
        "Original recorded nonce/body binding differs. No recovery POST was made.",
      );
    // Receipt recovery is read-only. It cannot wake a publisher after finite GO expires.
    return original;
  }
  recorded(account: string, nonce: string, signal?: AbortSignal) {
    this.readGuard();
    assertAccountId(account);
    nonceU32(nonce);
    return this.client.request<DevnetRecordedIntent>(
      `/v1/devnet/execution/accounts/${account}/intents/${nonce}`,
      { signal, maxBytes: 262144 },
    );
  }
}
export function assertAccountId(account: string) {
  if (!/^[a-f0-9]{64}$/.test(account))
    throw Error("A genuine 32-byte devnet account identity is required.");
}
export function nonceU32(nonce: string) {
  if (!/^[1-9]\d*$/.test(nonce) || BigInt(nonce) > 4294967295n)
    throw Error(
      "Choose an explicit unsigned 32-bit order reference. No nonce is allocated automatically.",
    );
  return Number(BigInt(nonce));
}
export function assertDevnetOrderRelease(
  account: string,
  wallet: string,
  now = Date.now(),
) {
  const r = DEVNET_EXECUTION_RELEASE;
  if (
    !r.intentSign ||
    !r.intentSubmit ||
    !r.authorizationReference ||
    r.account !== account ||
    !wallet ||
    r.wallet !== wallet ||
    r.expiresAtMs === null ||
    now >= r.expiresAtMs
  )
    throw Error(
      "Actual devnet order approval/submission remains OFF pending a concrete reviewed, wallet/account-scoped grant.",
    );
}
export function validateDevnetContext(
  c: DevnetExecutionContext,
  wallet: string,
) {
  if (
    c.api_version !== "1" ||
    c.devnet_execution_version !== "1" ||
    c.wallet !== wallet ||
    c.scope !== "one_genuine_genesis_account_btc_market_whole_close"
  )
    throw Error("Execution response identity or bounded scope mismatch.");
  if (
    c.signing.sdk_version !== "0.1.0-dev.4" ||
    c.signing.profile !== "setl8-sdk-dev-v1" ||
    c.signing.order_bytes !== "48" ||
    c.signing.message_bytes !== "93" ||
    c.signing.timestamp_rewrite !== false ||
    c.signing.backend_signs !== false ||
    c.signing.nonce_allocator !== false
  )
    throw Error("The accepted canonical signing contract changed.");
  if (
    !["unavailable_pending_reviewed_p30_adapter", "reviewed_ready"].includes(
      c.publication_compilation,
    ) ||
    c.live_production_admission !== false ||
    c.lifecycle !== "operator_only"
  )
    throw Error(
      "Unreviewed publication/admission status. A new source contract review is required.",
    );
  const a = c.account;
  if (!a) return c;
  assertAccountId(a.account);
  if (
    a.trader !== wallet ||
    a.chain_origin !== true ||
    a.synthetic !== false ||
    a.lane !== "devnet_bounded_rehearsal" ||
    a.sdk_profile !== "p30-devnet-2026-10-31-v1" ||
    a.market !== "0" ||
    a.max_market_intents !== "1" ||
    a.max_whole_close_intents !== "1"
  )
    throw Error("Not this wallet's admitted genuine devnet account.");
  if (hex(bs58.decode(a.account_address)) !== a.account)
    throw Error("Account address and binary identity differ.");
  for (const ref of [
    a.genesis_proof_sha256,
    a.configuration_sha256,
    a.origin_evidence_ref,
  ])
    if (!/^[a-f0-9]{64}$/.test(ref))
      throw Error("Genuine genesis/configuration evidence is missing.");
  return c;
}
export function wallObservationAgeNs(timestampNs: string, nowMs = Date.now()) {
  return BigInt(Math.trunc(nowMs)) * 1_000_000n - BigInt(timestampNs);
}
export function reviewWallRemainingMs(
  preparedAtMs: number,
  nowMs = Date.now(),
) {
  return Math.max(0, 5000 - Math.max(0, nowMs - preparedAtMs));
}
export function devnetReviewProblem(c: DevnetExecutionContext, wallet: string) {
  try {
    validateDevnetContext(c, wallet);
    if (!c.account)
      return "A finalized genuine purchase/genesis account has not been enrolled by the trusted driver.";
    if (
      c.account.runtime_admission !== "source_go_ready" ||
      c.source_gate !== "finite_go_ready" ||
      c.blocked_reasons.length ||
      c.account.blocked_reasons.length
    )
      return [
        ...c.blocked_reasons,
        ...c.account.blocked_reasons,
        "Genuine account/source admission is not ready.",
      ].join(" ");
    if (
      !c.clock_unix_s ||
      !c.source ||
      c.source.identity.market !== "0" ||
      c.source.identity.source !== "2" ||
      c.source.identity.max_age_secs !== "15" ||
      !c.chain_snapshot_ref ||
      !c.chain_snapshot_received_unix_ns
    )
      return "Actual GMX source2 BTC observation and fresh chain snapshot are required; no synthetic sample is substituted.";
    if (
      c.source.timestamp_basis !== "provider_updatedAt_ms" ||
      !c.source.provider_time_ns ||
      !c.source.verifier_receive_ns ||
      !c.backend_now_unix_ns ||
      c.source_age_ns === null ||
      c.chain_snapshot_age_ns === null
    )
      return "Source/provider/verifier/backend time provenance and both observation ages are required.";
    if (
      BigInt(c.source_age_ns) < 0n ||
      BigInt(c.source_age_ns) > 15_000_000_000n ||
      BigInt(c.chain_snapshot_age_ns) < 0n
    )
      return "Backend source/chain observation ages are stale or invalid.";
    const backendNow = BigInt(c.backend_now_unix_ns),
      source = BigInt(c.source.source_ns);
    if (BigInt(c.clock_unix_s) !== backendNow / 1_000_000_000n)
      return "The signable backend wall second does not match this context's exact wall timestamp. Refresh actual context.";
    if (source > backendNow || backendNow - source > 15_000_000_000n)
      return "GMX source observation is stale or ahead of the backend wall clock.";
    if (c.publication_compilation !== "reviewed_ready")
      return "The reviewed P30 journal compiler/publication adapter is unavailable. New Market/Close admission remains blocked.";
    return null;
  } catch (e) {
    return (e as Error).message;
  }
}
/** A new action never advances past an in-flight/unknown publication or mismatched head. */
export function priorPublicationProblem(
  c: DevnetExecutionContext,
  ledger: DevnetExecutionLedger | null,
  kind: "Market" | "Close",
) {
  const a = c.account;
  if (!a) return "Genuine account unavailable.";
  if (
    ["pending", "unknown", "blocked"].includes(a.publication) ||
    ["received", "blocked"].includes(a.local_execution)
  )
    return "Prior execution/publication is unresolved. Reconcile its exact receipt and finalized head before another action.";
  if (
    !ledger ||
    ledger.account.account !== a.account ||
    ledger.account.trader !== a.trader ||
    !ledger.evaluator_state
  )
    return "Read this genuine account's canonical execution ledger before another action.";
  if (
    ledger.account.publication === "pending" ||
    ledger.account.publication === "unknown" ||
    ledger.account.publication === "blocked" ||
    ledger.account.local_execution === "received" ||
    ledger.account.local_execution === "blocked"
  )
    return "The ledger still has unresolved prior execution/publication. Refresh both evidence views before another action.";
  if (!ledger.worker || ledger.worker.last_error)
    return "Canonical worker health is unavailable or blocked. Resolve its reported error before another action.";
  if (ledger.received_through !== ledger.processed_through)
    return "The received input prefix is not processed through yet.";
  const state = ledger.evaluator_state;
  if (kind === "Market" && ledger.used_nonces.length)
    return "The one-Market budget is already occupied. Recover its existing signed reference; no replacement is allocated.";
  if (
    kind === "Close" &&
    (ledger.used_nonces.length !== 1 || !state.positions.length)
  )
    return "Whole Close requires the prior admitted Market and its observed position.";
  if (kind === "Close" || BigInt(state.journal_seq) > 0n) {
    const head = ledger.finalized_chain_head;
    if (
      a.publication !== "finalized" ||
      ledger.account.publication !== "finalized" ||
      !head ||
      head.seq !== state.journal_seq ||
      head.journal_hash !== state.journal_hash
    )
      return "Prior journal must be finalized with the exact canonical sequence and journal hash before the next action.";
  }
  return null;
}
export type DevnetOrderFields = {
  kind: "Market" | "Close";
  side: "Buy" | "Sell";
  quantity: string;
  nonce: string;
  confirmed: boolean;
};
export async function prepareBoundedDevnetDraft(
  c: DevnetExecutionContext,
  wallet: string,
  walletHex: string,
  epoch: number,
  f: DevnetOrderFields,
  ledger: DevnetExecutionLedger | null,
  stageEvidence?: StageEvidence,
): Promise<PreparedDraft> {
  const problem = devnetReviewProblem(c, wallet);
  if (problem) throw Error(problem);
  const sizeProblem = armedMarketSizeProblem(
    f.quantity,
    f.kind,
    c.market_quantity_policy,
  );
  if (sizeProblem) throw Error(sizeProblem);
  const prior = priorPublicationProblem(c, ledger, f.kind);
  if (prior) throw Error(prior);
  const stage = fixedStageProblem(c, ledger, f.kind, f.nonce, stageEvidence);
  if (stage) throw Error(stage);
  return prepareDevnetBytePreview(c, wallet, walletHex, epoch, f);
}
/** Pure codec preview is not source admission, publisher readiness or wallet signing authority. */
export async function prepareDevnetBytePreview(
  c: DevnetExecutionContext,
  wallet: string,
  walletHex: string,
  epoch: number,
  f: DevnetOrderFields,
): Promise<PreparedDraft> {
  validateDevnetContext(c, wallet);
  if (!c.account || !c.clock_unix_s)
    throw Error(
      "An exact genuine-account identity and explicit client time are required for SDK bytes.",
    );
  if (!f.confirmed)
    throw Error(
      "Confirm this genuine devnet account for the exact order review.",
    );
  if (
    !["Market", "Close"].includes(f.kind) ||
    !["Buy", "Sell"].includes(f.side)
  )
    throw Error(
      "Only one Market and one whole Close are in this finite scope.",
    );
  const qty =
    f.kind === "Close" ? 0n : scaledInteger(f.quantity, 6, "Quantity");
  if (f.kind === "Market" && qty === 0n)
    throw Error("Market quantity must be positive.");
  if (hex(bs58.decode(wallet)) !== walletHex)
    throw Error("Session wallet bytes differ from its address.");
  const sdk = await import("@setl8/order-codec"),
    nonce = nonceU32(f.nonce),
    a = c.account!;
  const order = {
    kind: sdk.IntentKind[f.kind],
    market: 0,
    side: (f.side === "Buy" ? 0 : 1) as 0 | 1,
    qty,
    priceE12: 0n,
    slE12: 0n,
    tpE12: 0n,
    targetNonce: 0,
    clientTime: BigInt(c.clock_unix_s!),
  };
  const bytes = sdk.encodeOrder(order),
    message = sdk.signingMessage(accountBytes(a.account), nonce, bytes);
  return {
    scope: {
      account: a.account,
      market: "0",
      wallet: walletHex,
      sessionEpoch: epoch,
      mode: "connected",
      gateway: DEV_API_URL,
    },
    profile: "setl8-sdk-dev-v1",
    sdkVersion: "0.1.0-dev.4",
    nonce: f.nonce,
    decoded: sdk.orderToTransport(sdk.decodeOrder(bytes)),
    orderHex: hex(bytes),
    messageHex: hex(message),
    orderLength: bytes.length,
    messageLength: message.length,
  };
}
/** No clock pause or hidden retimestamp: a slow wallet response becomes explicit stale review. */
export function signedTimeStillCurrent(d: PreparedDraft, currentClock: string) {
  const delta = BigInt(currentClock) - BigInt(d.decoded.clientTime);
  return delta >= -5n && delta <= 5n;
}
export const devnetExecutionHttp = new DevnetExecutionHttp();
