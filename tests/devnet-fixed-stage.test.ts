// @vitest-environment node
import { it, expect } from "vitest";
import { encodeOrder, IntentKind } from "@setl8/order-codec";
import { hex } from "../src/buy/bytes";
import {
  fixedStageReference,
  fixedStageProblem,
  type StageEvidence,
} from "../src/devnet/fixedStage";
import type {
  DevnetExecutionContext,
  DevnetExecutionLedger,
  DevnetRecordedIntent,
} from "../src/api/devnet-execution-v1";
const account = "21".repeat(32),
  wallet = "controlled-wallet";
function setup(close = false) {
  const a = {
    account,
    trader: wallet,
    publication: close ? "finalized" : "awaiting_reviewed_p30_adapter",
  };
  const c = {
    wallet,
    account: a,
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
  const e: StageEvidence = { retained: null, market: close ? m : null };
  return { c, l, m, e };
}
it("uses only the exact armed fixed stage references, with null or mismatched policy blocked", () => {
  const x = setup();
  expect(fixedStageReference(x.c, "Market")).toBe("1");
  expect(fixedStageReference(x.c, "Close")).toBe("2");
  x.c.first_run_intent_policy = null;
  expect(() => fixedStageReference(x.c, "Market")).toThrow("unavailable");
});
it("fresh Market1 requires authoritative empty history, matching prefix and checked local recovery", () => {
  const x = setup();
  expect(fixedStageProblem(x.c, x.l, "Market", "1", x.e)).toBeNull();
  expect(fixedStageProblem(x.c, x.l, "Market", "2", x.e)).toContain("differs");
  expect(fixedStageProblem(x.c, x.l, "Market", "1", undefined)).toContain(
    "local signed",
  );
  x.l.used_nonces = ["7"];
  expect(fixedStageProblem(x.c, x.l, "Market", "1", x.e)).toContain("unused");
});
it("rejects a lagged canonical state even when top-level prefix strings match", () => {
  const x = setup();
  x.l.evaluator_state!.processed_through = "12";
  expect(fixedStageProblem(x.c, x.l, "Market", "1", x.e)).toContain("prefix");
});
it.each(["uncertain", "not_sent"])(
  "retained %s blocks the next stage without choosing a new reference",
  (submission) => {
    const x = setup(true);
    x.e.retained = { wallet, account, nonce: "1", submission } as any;
    expect(fixedStageProblem(x.c, x.l, "Close", "2", x.e)).toContain(
      "unresolved",
    );
  },
);
it("requires the exact processed Market1 receipt and matching finalized canonical head for Close2", () => {
  const x = setup(true);
  expect(fixedStageProblem(x.c, x.l, "Close", "2", x.e)).toBeNull();
  x.e.market = null;
  expect(fixedStageProblem(x.c, x.l, "Close", "2", x.e)).toContain("receipt");
  x.e.market = x.m;
  x.l.finalized_chain_head!.journal_hash = "99".repeat(32);
  expect(fixedStageProblem(x.c, x.l, "Close", "2", x.e)).toContain("finalized");
});
it.each([{ nonces: ["7"] }, { nonces: ["1", "2"] }, { nonces: ["1", "7"] }])(
  "occupied or different history %s cannot be relabeled Close2",
  ({ nonces }) => {
    const x = setup(true);
    x.l.used_nonces = nonces;
    expect(fixedStageProblem(x.c, x.l, "Close", "2", x.e)).toContain(
      "reference2 must be unused",
    );
  },
);
it.each(["account", "nonce", "signature", "prefix"])(
  "rejects conflicting recorded Market1 %s",
  (field) => {
    const x = setup(true);
    if (field === "account") x.m.account = "99".repeat(32);
    if (field === "nonce") x.m.signed_intent.nonce = 7;
    if (field === "signature") x.m.signed_intent.signature = "";
    if (field === "prefix") x.m.input_seq = "14";
    expect(fixedStageProblem(x.c, x.l, "Close", "2", x.e)).toContain("receipt");
  },
);
it("compares retained exact signature and receipt sequence with authoritative Market1", () => {
  const x = setup(true);
  x.e.retained = {
    wallet,
    account,
    nonce: "1",
    submission: "received",
    body: { ...x.m.signed_intent },
    receipt: { input_seq: "12" },
  } as any;
  expect(fixedStageProblem(x.c, x.l, "Close", "2", x.e)).toBeNull();
  x.e.retained!.body.signature = "08".repeat(64);
  expect(fixedStageProblem(x.c, x.l, "Close", "2", x.e)).toContain("differs");
});
it("an unsent retired reference from a different stage does not make Market1 fresh", () => {
  const x = setup();
  x.e.retained = {
    wallet,
    account,
    nonce: "2",
    submission: "retired_not_sent",
  } as any;
  expect(fixedStageProblem(x.c, x.l, "Market", "1", x.e)).toContain("unused");
});
