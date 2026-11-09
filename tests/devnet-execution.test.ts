// @vitest-environment node
import { it, expect, vi } from "vitest";
import bs58 from "bs58";
import { createHash } from "node:crypto";
import {
  prepareBoundedDevnetDraft,
  prepareDevnetBytePreview,
  priorPublicationProblem,
  signedTimeStillCurrent,
  wallObservationAgeNs,
  reviewWallRemainingMs,
  validateDevnetContext,
  devnetReviewProblem,
  DEVNET_EXECUTION_RELEASE,
} from "../src/devnet/execution";
import {
  DevnetIntentStore,
  retainApprovedDevnetMessage,
} from "../src/devnet/intentRecovery";
import type {
  DevnetExecutionContext,
  DevnetExecutionLedger,
} from "../src/api/devnet-execution-v1";
import type { SessionManager } from "../src/auth/session";
import { hex, fromHex } from "../src/buy/bytes";
import { REVIEWED_OWNER_SCOPE } from "../src/buy/executionGate";
// Controlled offline DTOs prove byte/state boundaries, not a real enrolled account or source GO.
const wallet = REVIEWED_OWNER_SCOPE.wallet,
  // An arbitrary account fixture (the first purchased account); the owner scope no longer pins an account.
  address = "9aLv8BzUCAjYWnAav75K9aeSHnZAKKFu26VmEVyhcYxT",
  account = hex(bs58.decode(address)),
  walletHex = hex(bs58.decode(wallet));
function fixtures() {
  const a = {
    account,
    account_address: address,
    trader: wallet,
    lane: "devnet_bounded_rehearsal",
    chain_origin: true,
    synthetic: false,
    runtime_admission: "source_go_ready",
    blocked_reasons: [],
    genesis_proof_sha256: "11".repeat(32),
    configuration_sha256: "22".repeat(32),
    origin_evidence_ref: "33".repeat(32),
    sdk_profile: "p30-devnet-2026-10-31-v1",
    max_market_intents: "1",
    max_whole_close_intents: "1",
    market: "0",
    local_execution: "not_started",
    publication: "awaiting_reviewed_p30_adapter",
  } as DevnetExecutionContext["account"];
  const c = {
    api_version: "1",
    devnet_execution_version: "1",
    wallet,
    scope: "one_genuine_genesis_account_btc_market_whole_close",
    account: a,
    blocked_reasons: [],
    clock_unix_s: "1793640000",
    actor_clock_unix_s: "1793640000",
    backend_now_unix_ns: "1793640000000000000",
    first_run_intent_policy: null,
    market_quantity_policy: {
      scale: "1000000",
      max_units: "10000",
      max_btc: "0.01",
      step_units: "200",
      min_units: "200",
      basis: "armed_run_plan",
      preflight: "required_before_new_admission",
    },
    source_age_ns: "0",
    chain_snapshot_age_ns: "0",
    source: {
      identity: {
        market: "0",
        source: "2",
        symbol: "BTC",
        feed_id: "44".repeat(32),
        max_age_secs: "15",
      },
      source_ns: "1793640000000000000",
      receive_ns: "1793640000000000000",
      value_e18: "68000000000000000000000",
      provider_time_ns: "1793640000000000000",
      verifier_receive_ns: "1793640000000000000",
      original_observation: { scope: "controlled_offline_fixture" },
      timestamp_basis: "provider_updatedAt_ms",
      raw_sha256: "55".repeat(32),
      metadata_evidence: null,
    },
    source_gate: "finite_go_ready",
    chain_snapshot_ref: "66".repeat(32),
    chain_snapshot_received_unix_ns: "1793640000000000000",
    signing: {
      sdk_version: "0.1.0-dev.4",
      profile: "setl8-sdk-dev-v1",
      order_bytes: "48",
      message_bytes: "93",
      market_close_skew_seconds: "5",
      timestamp_rewrite: false,
      backend_signs: false,
      nonce_allocator: false,
    },
    publication_compilation: "reviewed_ready",
    live_production_admission: false,
    lifecycle: "operator_only",
  } as DevnetExecutionContext;
  const l = {
    api_version: "1",
    devnet_execution_version: "1",
    account: a,
    evaluator_state: {
      journal_seq: "0",
      journal_hash: "00".repeat(32),
      positions: [],
    },
    worker: { state: "idle", last_error: null, retry_after_unix_ns: "0" },
    received_through: "0",
    processed_through: "0",
    used_nonces: [],
    journals: [],
    execution_event_rows: [],
    complete_outcomes_available: false,
    publication_finality_distinct: true,
    finalized_chain_head: null,
  } as unknown as DevnetExecutionLedger;
  return { c, l };
}
const fields = {
  kind: "Market",
  side: "Buy",
  quantity: "0.125",
  nonce: "7",
  confirmed: true,
} as const;
it("pure dev4 codec binds exact genuine P30 account bytes, not a localnet context/PDA factory", async () => {
  const { c, l } = fixtures(),
    d = await prepareDevnetBytePreview(c, wallet, walletHex, 8, fields),
    message = fromHex(d.messageHex),
    order = fromHex(d.orderHex);
  expect(message.length).toBe(93);
  expect(order.length).toBe(48);
  expect(new TextDecoder().decode(message.slice(0, 7))).toBe("SL8LEV|");
  expect(hex(message.slice(7, 39))).toBe(account);
  expect(new DataView(message.buffer).getUint32(40, true)).toBe(7);
  expect(hex(message.slice(45))).toBe(d.orderHex);
  expect(d.decoded.qty).toBe("125000");
  expect(d.decoded.clientTime).toBe(c.clock_unix_s);
  const other = fixtures();
  other.c.account!.account_address = "11111111111111111111111111111111";
  other.c.account!.account = "00".repeat(32);
  other.l.account = other.c.account!;
  const changed = await prepareDevnetBytePreview(
    other.c,
    wallet,
    walletHex,
    8,
    fields,
  );
  expect(changed.messageHex).not.toBe(d.messageHex);
  expect(
    createHash("sha256").update(fromHex(changed.messageHex)).digest("hex"),
  ).not.toBe(createHash("sha256").update(message).digest("hex"));
});
it("rejects synthetic, wrong trader, mismatched address/hex and stale GMX provenance", () => {
  const { c } = fixtures();
  expect(validateDevnetContext(c, wallet)).toBe(c);
  c.account!.synthetic = true as false;
  expect(() => validateDevnetContext(c, wallet)).toThrow("genuine");
  const b = fixtures().c;
  b.account!.trader = "other";
  expect(() => validateDevnetContext(b, wallet)).toThrow("wallet");
  const x = fixtures().c;
  x.account!.account = "00".repeat(32);
  expect(() => validateDevnetContext(x, wallet)).toThrow("binary");
  const stale = fixtures().c;
  stale.source!.source_ns = "1793639900000000000";
  expect(devnetReviewProblem(stale, wallet)).toContain("stale");
});
it("blocks Close until the prior journal is finalized and seq/hash and processed prefix match", () => {
  const { c, l } = fixtures();
  l.used_nonces = ["7"];
  l.evaluator_state!.positions = [{ market: "0" }] as any;
  l.evaluator_state!.journal_seq = "1";
  l.evaluator_state!.journal_hash = "77".repeat(32);
  c.account!.local_execution = "processed";
  expect(priorPublicationProblem(c, l, "Close")).toContain("finalized");
  c.account!.publication = "finalized";
  l.finalized_chain_head = {
    seq: "1",
    journal_hash: "77".repeat(32),
    slot: "517852840",
    evidence_ref: "88".repeat(32),
  };
  expect(priorPublicationProblem(c, l, "Close")).toBeNull();
  l.finalized_chain_head.journal_hash = "99".repeat(32);
  expect(priorPublicationProblem(c, l, "Close")).toContain("exact canonical");
  l.received_through = "9";
  l.processed_through = "8";
  expect(priorPublicationProblem(c, l, "Close")).toContain("prefix");
});
it.each(["pending", "unknown", "blocked"])(
  "blocks new %s publication actions without blocking existing-body recovery semantics",
  (publication) => {
    const { c, l } = fixtures();
    c.account!.publication = publication as any;
    expect(priorPublicationProblem(c, l, "Market")).toContain("unresolved");
  },
);
it("keeps signed time immutable and identifies slow-wallet stale results instead of pausing or retiming", async () => {
  const { c, l } = fixtures(),
    d = await prepareDevnetBytePreview(c, wallet, walletHex, 8, fields),
    before = d.messageHex;
  expect(signedTimeStillCurrent(d, "1793640005")).toBe(true);
  expect(signedTimeStillCurrent(d, "1793640025")).toBe(false);
  expect(d.messageHex).toBe(before);
});
it("default actual authority gates stop before any wallet signature is requested", async () => {
  const { c, l } = fixtures(),
    d = await prepareDevnetBytePreview(c, wallet, walletHex, 8, fields),
    sign = vi.fn(),
    storage = new Map<string, string>(),
    store = new DevnetIntentStore({
      getItem: (k) => storage.get(k) ?? null,
      setItem: (k, v) => {
        storage.set(k, v);
      },
    });
  const manager = {
    getSnapshot: () => ({
      phase: "authenticated",
      epoch: 8,
      session: { wallet, wallet_hex: walletHex },
    }),
    signSessionMessage: sign,
  } as unknown as SessionManager;
  expect(DEVNET_EXECUTION_RELEASE.contextRead).toBe(false);
  expect(DEVNET_EXECUTION_RELEASE.intentSign).toBe(false);
  await expect(
    retainApprovedDevnetMessage(d, wallet, manager, store),
  ).rejects.toThrow("OFF");
  expect(sign).not.toHaveBeenCalled();
  expect(storage.size).toBe(0);
});
it("retains an exact returned public signature after session changes before permitting forwarding", async () => {
  const { c, l } = fixtures(),
    d = await prepareDevnetBytePreview(c, wallet, walletHex, 8, {
      ...fields,
      quantity: "0.01",
    });
  let epoch = 8;
  const storage = new Map<string, string>(),
    store = new DevnetIntentStore({
      getItem: (k) => storage.get(k) ?? null,
      setItem: (k, v) => {
        storage.set(k, v);
      },
    });
  const manager = {
    getSnapshot: () => ({
      phase: "authenticated",
      epoch,
      session: { wallet, wallet_hex: walletHex },
    }),
    signSessionMessage: async () => {
      epoch = 9;
      return { signature: new Uint8Array(64).fill(7), current: false };
    },
  } as unknown as SessionManager;
  const result = await retainApprovedDevnetMessage(
    d,
    wallet,
    manager,
    store,
    () => {},
  );
  expect(result.current).toBe(false);
  expect(store.read(wallet, account)!.body.signature).toBe("07".repeat(64));
  expect(result.retained.submission).toBe("not_sent");
  expect(storage.size).toBe(2);
});

it("publisher unavailable blocks first new Market even with an otherwise-ready source and empty blocked reasons", async () => {
  const { c, l } = fixtures();
  c.publication_compilation = "unavailable_pending_reviewed_p30_adapter";
  expect(devnetReviewProblem(c, wallet)).toContain("journal compiler");
  await expect(
    prepareBoundedDevnetDraft(c, wallet, walletHex, 8, fields, l),
  ).rejects.toThrow("journal compiler");
});

it("an unchanged context does not freeze visible wall ages or the five-second review budget", () => {
  const ns = "1793640000000000000",
    start = 1793640000000;
  expect(wallObservationAgeNs(ns, start + 25000)).toBe(25000000000n);
  expect(reviewWallRemainingMs(start, start + 4999)).toBe(1);
  expect(reviewWallRemainingMs(start, start + 25000)).toBe(0);
});
it("an unreviewed compiler-ready string cannot bypass the blocked candidate contract", () => {
  const { c } = fixtures();
  c.publication_compilation = "pretend_ready" as any;
  expect(() => validateDevnetContext(c, wallet)).toThrow("Unreviewed");
});

it("backend-declared stale source age blocks a new action even when frozen actor/source timestamps match", () => {
  const { c } = fixtures();
  c.source_age_ns = "25000000000";
  expect(devnetReviewProblem(c, wallet)).toContain("stale");
});

it("ledger publication and worker failures block new actions despite an older ready context", () => {
  const { c, l } = fixtures();
  l.account = { ...l.account, publication: "pending" };
  expect(priorPublicationProblem(c, l, "Market")).toContain(
    "ledger still has unresolved",
  );
  l.account = { ...l.account, publication: "awaiting_reviewed_p30_adapter" };
  l.worker.last_error = "actual canonical worker failure";
  expect(priorPublicationProblem(c, l, "Market")).toContain("worker health");
});

it("exact source nanoseconds within the signable backend second are fresh, without rounding source time", () => {
  const { c } = fixtures();
  c.backend_now_unix_ns = "1793640000900000000";
  c.source!.source_ns = "1793640000800000000";
  c.source!.provider_time_ns = c.source!.source_ns;
  c.source_age_ns = "100000000";
  expect(devnetReviewProblem(c, wallet)).toBeNull();
  c.clock_unix_s = "1793639999";
  expect(devnetReviewProblem(c, wallet)).toContain("wall second");
});
