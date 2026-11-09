// @vitest-environment node
import { it, expect, vi } from "vitest";
import bs58 from "bs58";
import { encodeOrder, IntentKind } from "@setl8/order-codec";
import { hex } from "../src/buy/bytes";
import { checkRetainedSubmission } from "../src/devnet/submissionPreparation";
import { signingMessage } from "@setl8/order-codec";
import { fromHex } from "../src/buy/bytes";
import type { DevnetSignedRecord } from "../src/devnet/intentRecovery";
import { devnetReviewProblem } from "../src/devnet/execution";
import type {
  DevnetExecutionContext,
  DevnetExecutionLedger,
  DevnetRecordedIntent,
} from "../src/api/devnet-execution-v1";
function fixture(close = false) {
  const account = "21".repeat(32),
    wallet = bs58.encode(new Uint8Array(32).fill(31));
  const a = {
    account,
    account_address: bs58.encode(Buffer.from(account, "hex")),
    trader: wallet,
    chain_origin: true,
    synthetic: false,
    lane: "devnet_bounded_rehearsal",
    sdk_profile: "p30-devnet-2026-10-31-v1",
    market: "0",
    max_market_intents: "1",
    max_whole_close_intents: "1",
    genesis_proof_sha256: "11".repeat(32),
    configuration_sha256: "12".repeat(32),
    origin_evidence_ref: "13".repeat(32),
    publication: close ? "finalized" : "awaiting_reviewed_p30_adapter",
    local_execution: close ? "processed" : "not_started",
    runtime_admission: "genesis_ready",
    blocked_reasons: [],
  };
  const c = {
    api_version: "1",
    devnet_execution_version: "1",
    wallet,
    scope: "one_genuine_genesis_account_btc_market_whole_close",
    account: a,
    source: null,
    source_gate: "not_admitted",
    clock_unix_s: null,
    blocked_reasons: [],
    signing: {
      sdk_version: "0.1.0-dev.4",
      profile: "setl8-sdk-dev-v1",
      order_bytes: "48",
      message_bytes: "93",
      timestamp_rewrite: false,
      backend_signs: false,
      nonce_allocator: false,
    },
    publication_compilation: "reviewed_ready",
    live_production_admission: false,
    lifecycle: "operator_only",
    first_run_intent_policy: {
      format: "setl8-devnet-fixed-first-run-intents-v1",
      account_size_micro: "2500000000",
      market_nonce: "1",
      whole_close_nonce: "2",
      market_max_units: "10000",
      market_qty_scale: "1000000",
      market_qty_step: "200",
      market_qty_min: "200",
      whole_close_qty: "0",
      nonce_allocator: false,
      unknown_submission_blocks_next_action: true,
    },
    market_quantity_policy: {
      scale: "1000000",
      max_units: "10000",
      max_btc: "0.01",
      step_units: "200",
      min_units: "200",
      basis: "armed_run_plan",
      preflight: "required_before_new_admission",
    },
  } as unknown as DevnetExecutionContext;
  const l = {
    account: a,
    received_through: "13",
    processed_through: "13",
    used_nonces: close ? ["1"] : [],
    worker: { state: "idle", last_error: null, retry_after_unix_ns: "0" },
    evaluator_state: {
      size_micro: "2500000000",
      processed_through: "13",
      journal_seq: close ? "1" : "0",
      journal_hash: "33".repeat(32),
      positions: close ? [{ market: "0" }] : [],
      pending: [],
    },
    finalized_chain_head: close
      ? { seq: "1", journal_hash: "33".repeat(32) }
      : null,
  } as unknown as DevnetExecutionLedger;
  const order = encodeOrder({
    kind: IntentKind.Market,
    market: 0,
    side: 0,
    qty: 10000n,
    priceE12: 0n,
    slE12: 0n,
    tpE12: 0n,
    targetNonce: 0,
    clientTime: 1793640000n,
  });
  const m = {
    api_version: "1",
    devnet_execution_version: "1",
    account,
    signed_intent: { nonce: 1, order: hex(order), signature: "07".repeat(64) },
    input_seq: "12",
    recorded_input_sha256: "41".repeat(32),
  } as DevnetRecordedIntent;
  const http = {
      context: vi.fn(async () => c),
      ledger: vi.fn(async () => l),
      recorded: vi.fn(async () => m),
    },
    store = { read: vi.fn(() => null) };
  return { account, wallet, c, l, http, store };
}
async function signedFixture() {
  const x = fixture();
  const signal = new AbortController().signal;
  const m = await x.http.recorded();
  x.http.recorded.mockClear();
  const time = "1793640000000000000";
  x.c.account!.runtime_admission = "source_go_ready";
  x.c.source_gate = "finite_go_ready";
  x.c.clock_unix_s = "1793640000";
  x.c.backend_now_unix_ns = time;
  x.c.source_age_ns = "0";
  x.c.chain_snapshot_age_ns = "0";
  x.c.chain_snapshot_ref = "44".repeat(32);
  x.c.chain_snapshot_received_unix_ns = time;
  x.c.source = {
    identity: {
      market: "0",
      symbol: "BTC",
      source: "2",
      feed_id: "45".repeat(32),
      max_age_secs: "15",
    },
    source_ns: time,
    receive_ns: time,
    verifier_receive_ns: time,
    provider_time_ns: time,
    timestamp_basis: "provider_updatedAt_ms",
    value_e18: "68000000000000000000000",
    metadata_evidence: null,
    original_observation: { controlled_fixture: true },
  };
  const r: DevnetSignedRecord = {
    format: "setl8-genuine-devnet-intent-v1",
    wallet: x.wallet,
    account: x.account,
    nonce: "1",
    body: { ...m.signed_intent },
    messageHex: hex(
      signingMessage(fromHex(x.account), 1, fromHex(m.signed_intent.order)),
    ),
    submission: "not_sent",
    receipt: null,
    createdAt: "2026-11-02T00:00:00Z",
  };
  const store = { read: vi.fn(() => r) };
  return { ...x, r, store, signal };
}
it("submission requires fresh armed source/context/history and the exact app-unsent candidate", async () => {
  const x = await signedFixture();
  await expect(
    checkRetainedSubmission(x.r, x.wallet, x.signal, x.http, x.store),
  ).resolves.toBeUndefined();
  expect(x.http.context).toHaveBeenCalledTimes(1);
  expect(x.http.ledger).toHaveBeenCalledTimes(1);
  expect(x.http.recorded).not.toHaveBeenCalled();
});
it("source preparation may be ready while missing source still blocks the subsequent submission", async () => {
  const x = await signedFixture();
  x.c.source = null;
  x.c.source_gate = "not_admitted";
  await expect(
    checkRetainedSubmission(x.r, x.wallet, x.signal, x.http, x.store),
  ).rejects.toThrow("admission");
  expect(x.http.ledger).not.toHaveBeenCalled();
});
it("a slow wallet result is retained but not sent or retimestamped", async () => {
  const x = await signedFixture(),
    original = x.r.messageHex;
  x.c.clock_unix_s = "1793640006";
  x.c.backend_now_unix_ns = "1793640006000000000";
  x.c.source_age_ns = "6000000000";
  await expect(
    checkRetainedSubmission(x.r, x.wallet, x.signal, x.http, x.store),
  ).rejects.toThrow("stale");
  expect(x.r.messageHex).toBe(original);
  expect(x.http.ledger).not.toHaveBeenCalled();
});
it("a different or already-forwarded retained candidate cannot be silently substituted after fresh checks", async () => {
  const x = await signedFixture();
  x.store.read.mockReturnValue({ ...x.r, submission: "uncertain" });
  await expect(
    checkRetainedSubmission(x.r, x.wallet, x.signal, x.http, x.store),
  ).rejects.toThrow("changed or was already forwarded");
});
it("loss of armed quantity policy blocks sending even an otherwise small signed quantity", async () => {
  const x = await signedFixture();
  x.c.market_quantity_policy = null;
  await expect(
    checkRetainedSubmission(x.r, x.wallet, x.signal, x.http, x.store),
  ).rejects.toThrow("policy");
});
