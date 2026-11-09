import { armedMarketSizeProblem } from "./marketSize";
import { decodeOrder, IntentKind } from "@setl8/order-codec";
import { fromHex } from "../buy/bytes";
import type {
  DevnetExecutionContext,
  DevnetExecutionLedger,
  DevnetRecordedIntent,
} from "../api/devnet-execution-v1";
import type { DevnetSignedRecord } from "./intentRecovery";
export type StageEvidence = {
  retained: DevnetSignedRecord | null;
  market: DevnetRecordedIntent | null;
};
export function fixedStageReference(
  c: DevnetExecutionContext,
  kind: "Market" | "Close",
) {
  const p = c.first_run_intent_policy,
    q = c.market_quantity_policy;
  if (
    !p ||
    p.format !== "setl8-devnet-fixed-first-run-intents-v1" ||
    p.account_size_micro !== "2500000000" ||
    p.market_nonce !== "1" ||
    p.whole_close_nonce !== "2" ||
    p.whole_close_qty !== "0" ||
    p.market_qty_scale !== "1000000" ||
    p.nonce_allocator !== false ||
    p.unknown_submission_blocks_next_action !== true ||
    !q ||
    p.market_max_units !== q.max_units ||
    p.market_qty_min !== q.min_units ||
    p.market_qty_step !== q.step_units
  )
    throw Error(
      "The exact armed first-run stage policy is unavailable or inconsistent. Recover existing references; no new reference is allocated.",
    );
  const size = armedMarketSizeProblem("0.0002", "Market", q);
  if (size) throw Error(size);
  return kind === "Market" ? p.market_nonce : p.whole_close_nonce;
}
export function fixedStageProblem(
  c: DevnetExecutionContext,
  l: DevnetExecutionLedger | null,
  kind: "Market" | "Close",
  nonce: string,
  evidence: StageEvidence | undefined,
): string | null {
  try {
    const expected = fixedStageReference(c, kind);
    if (nonce !== expected)
      return "Reference differs from the armed stage. Recover the original signed intent; never relabel or increment it.";
    if (!evidence)
      return "Read exact local signed-intent recovery before this stage.";
    if (
      !c.account ||
      !l ||
      l.account.account !== c.account.account ||
      !l.evaluator_state ||
      l.evaluator_state.size_micro !== "2500000000" ||
      !Array.isArray(l.used_nonces) ||
      !Array.isArray(l.evaluator_state.positions) ||
      !Array.isArray(l.evaluator_state.pending) ||
      l.received_through !== l.processed_through ||
      l.evaluator_state.processed_through !== l.processed_through
    )
      return "Read the matching authoritative first-account prefix before this stage.";
    const r = evidence.retained;
    if (
      r &&
      (r.account !== c.account.account ||
        r.wallet !== c.wallet ||
        !["1", "2"].includes(r.nonce))
    )
      return "Retained reference/account conflicts with this fixed plan. Recover its exact original evidence.";
    if (r && (r.submission === "uncertain" || r.submission === "not_sent"))
      return "A retained signed intent is unresolved. Use exact recovery before another stage.";
    if (kind === "Market") {
      if (
        l.used_nonces.length ||
        l.evaluator_state.journal_seq !== "0" ||
        l.evaluator_state.positions.length ||
        l.evaluator_state.pending.length ||
        (r && (r.nonce !== "1" || r.submission !== "retired_not_sent"))
      )
        return "Market reference1 must be unused on a genuinely fresh account. Recover occupied evidence.";
    } else {
      if (l.used_nonces.length !== 1 || l.used_nonces[0] !== "1")
        return "Whole Close reference2 requires only Market1 in authoritative history; reference2 must be unused.";
      const m = evidence.market;
      if (
        !m ||
        m.api_version !== "1" ||
        m.devnet_execution_version !== "1" ||
        m.account !== c.account.account ||
        m.signed_intent.nonce !== 1 ||
        !/^[a-f0-9]{128}$/.test(m.signed_intent.signature) ||
        !/^[a-f0-9]{64}$/.test(m.recorded_input_sha256) ||
        !/^[1-9]\d*$/.test(m.input_seq) ||
        BigInt(m.input_seq) > BigInt(l.processed_through)
      )
        return "Read the exact processed Market1 receipt before Close2.";
      const o = decodeOrder(fromHex(m.signed_intent.order));
      if (
        o.kind !== IntentKind.Market ||
        o.market !== 0 ||
        o.qty <= 0n ||
        o.qty > BigInt(c.first_run_intent_policy!.market_max_units) ||
        o.qty % BigInt(c.first_run_intent_policy!.market_qty_step) !== 0n ||
        o.priceE12 !== 0n ||
        o.slE12 !== 0n ||
        o.tpE12 !== 0n ||
        o.targetNonce !== 0
      )
        return "Market1 receipt does not match the armed opening scope.";
      if (
        r &&
        (r.nonce !== "1" ||
          r.submission !== "received" ||
          r.body.order !== m.signed_intent.order ||
          r.body.signature !== m.signed_intent.signature ||
          (r.receipt && r.receipt.input_seq !== m.input_seq) ||
          (r.recorded && r.recorded.input_seq !== m.input_seq))
      )
        return "Retained signature/receipt differs from authoritative Market1. Reconcile without replacement.";
      const head = l.finalized_chain_head;
      if (
        c.account.publication !== "finalized" ||
        l.account.publication !== "finalized" ||
        !head ||
        head.seq !== l.evaluator_state.journal_seq ||
        head.journal_hash !== l.evaluator_state.journal_hash
      )
        return "Close2 waits for the exact finalized canonical journal head.";
    }
    return null;
  } catch (e) {
    return (e as Error).message;
  }
}
