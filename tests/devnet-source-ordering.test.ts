// @vitest-environment node
import { it, expect, vi } from "vitest";
import bs58 from "bs58";
import { encodeOrder, IntentKind } from "@setl8/order-codec";
import { hex } from "../src/buy/bytes";
import { checkSourcePreparation } from "../src/devnet/sourcePreparation";
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
it("Market source preparation accepts verified genesis/config/history without requiring the GMX sample it creates", async () => {
  const x = fixture();
  await expect(
    checkSourcePreparation(
      x.wallet,
      x.account,
      "Market",
      new AbortController().signal,
      x.http,
      x.store,
    ),
  ).resolves.toBeUndefined();
  expect(x.http.context).toHaveBeenCalledTimes(1);
  expect(x.http.ledger).toHaveBeenCalledTimes(1);
  expect(x.http.recorded).not.toHaveBeenCalled();
  expect(devnetReviewProblem(x.c, x.wallet)).not.toBeNull();
});
it("Close source preparation still needs processed Market1/finalized head while allowing absent source/clock", async () => {
  const x = fixture(true);
  await expect(
    checkSourcePreparation(
      x.wallet,
      x.account,
      "Close",
      new AbortController().signal,
      x.http,
      x.store,
    ),
  ).resolves.toBeUndefined();
  expect(x.http.recorded).toHaveBeenCalledWith(
    x.account,
    "1",
    expect.any(AbortSignal),
  );
  expect(devnetReviewProblem(x.c, x.wallet)).not.toBeNull();
  x.l.finalized_chain_head!.journal_hash = "99".repeat(32);
  await expect(
    checkSourcePreparation(
      x.wallet,
      x.account,
      "Close",
      new AbortController().signal,
      x.http,
      x.store,
    ),
  ).rejects.toThrow("canonical");
});
it("missing reviewed publisher blocks preparation before reading/acquiring source history", async () => {
  const x = fixture();
  x.c.publication_compilation = "unavailable_pending_reviewed_p30_adapter";
  await expect(
    checkSourcePreparation(
      x.wallet,
      x.account,
      "Market",
      new AbortController().signal,
      x.http,
      x.store,
    ),
  ).rejects.toThrow("publication adapter");
  expect(x.http.ledger).not.toHaveBeenCalled();
});
it("occupied reference and canceled scope cannot progress to a new source request", async () => {
  const x = fixture();
  x.l.used_nonces = ["7"];
  await expect(
    checkSourcePreparation(
      x.wallet,
      x.account,
      "Market",
      new AbortController().signal,
      x.http,
      x.store,
    ),
  ).rejects.toThrow("occupied");
  const abort = new AbortController();
  abort.abort();
  await expect(
    checkSourcePreparation(
      x.wallet,
      x.account,
      "Market",
      abort.signal,
      x.http,
      x.store,
    ),
  ).rejects.toThrow("canceled");
});
