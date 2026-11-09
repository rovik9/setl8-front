import { it, expect } from "vitest";
import {
  purchaseReadState,
  type PurchaseReadScope,
} from "../src/data/purchaseReadState";
import type { PurchaseStatus } from "../src/api/purchase-draft-v1";
const scope: PurchaseReadScope = {
  wallet: "FixtureWallet",
  deployment: "p30-devnet-rehearsal-v1",
  sessionEpoch: 1,
};
const status = (): PurchaseStatus => ({
  api_version: "1",
  purchase_version: "1",
  format: "setl8-purchase-read-v1",
  evidence_purpose: "synthetic_test",
  request_id: "04".repeat(32),
  quote_id: "05".repeat(32),
  transaction_signature: null,
  expected_account: "06".repeat(32),
  recent_blockhash: null,
  last_valid_block_height: null,
  expected_message_sha256: "07".repeat(32),
  poll_after_ms: "1000",
  purchase_id: "01".repeat(32),
  wallet: scope.wallet,
  deployment: {
    deployment_id: "p30-devnet-rehearsal-v1",
    environment: "devnet_rehearsal",
    genesis_hash: "FixtureGenesis",
    lev_program: "FixtureLev",
    vault_program: "FixtureVault",
    owner_manifest_sha256: "03".repeat(32),
    sdk_release: null,
    sdk_profile: null,
    sdk_artifact_sha256: null,
    compatibility: "awaiting_review",
    production: false,
  },
  submission: {
    state: "unknown",
    basis: "client_report",
    reported_unix_ns: "9007199254740993000",
  },
  chain: {
    state: "finalized",
    commitment: "finalized",
    slot: "9007199254740993",
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
  recovery: {
    action: "reconcile_before_repayment",
    unreported_signature_known: false,
  },
  updated_unix_ns: "9007199254740993000",
});
it("chain finality cannot imply verified ownership/indexing or enable payment", () => {
  const r = purchaseReadState(status(), scope, scope);
  expect(r.kind).toBe("draft_observation");
  if (r.kind !== "draft_observation") throw Error();
  expect(r.data.evidence_purpose).toBe("synthetic_test");
  expect(r.data.submission.state).toBe("unknown");
  expect(r.data.chain.state).toBe("finalized");
  expect(r.data.verification.state).toBe("pending");
  expect(r.data.indexing.state).toBe("not_started");
  expect(r.data.verified_account).toBeNull();
  expect(r.data.updated_unix_ns).toBe("9007199254740993000");
  expect(r.actions).toEqual({ sign: false, submit: false, repay: false });
});
it("wallet, deployment and session changes discard private late read data", () => {
  for (const current of [
    { ...scope, wallet: "OtherWallet" },
    { ...scope, deployment: "other" },
    { ...scope, sessionEpoch: 2 },
    { ...scope, sessionEpoch: -1 },
  ])
    expect(purchaseReadState(status(), scope, current)).toEqual({
      kind: "scope_mismatch",
      actions: { sign: false, submit: false, repay: false },
      data: null,
    });
});
it("response ownership/deployment mismatch is not trusted", () => {
  for (const value of [
    { ...status(), wallet: "OtherWallet" },
    {
      ...status(),
      deployment: { ...status().deployment, deployment_id: "other" },
    },
  ])
    expect(purchaseReadState(value as PurchaseStatus, scope, scope).kind).toBe(
      "scope_mismatch",
    );
});
it("blocked verification, indexing and failure reasons remain separate", () => {
  const s = status();
  s.chain.state = "failed";
  s.chain.transaction_error_code = "fixture_failure";
  s.verification = {
    ...s.verification,
    state: "blocked",
    reasons: ["fixture_verification"],
  };
  s.indexing = {
    ...s.indexing,
    state: "blocked",
    blocked_reasons: ["fixture_indexing"],
  };
  const r = purchaseReadState(s, scope, scope);
  if (r.kind !== "draft_observation") throw Error();
  expect(r.data.chain.transaction_error_code).toBe("fixture_failure");
  expect(r.data.verification.reasons).toEqual(["fixture_verification"]);
  expect(r.data.indexing.blocked_reasons).toEqual(["fixture_indexing"]);
});
it("observed data is detached from mutable transport objects; even indexed data cannot pay", () => {
  const s = status();
  s.verification.state = "verified";
  s.indexing.state = "indexed";
  s.verified_account = "02".repeat(32);
  const r = purchaseReadState(s, scope, scope);
  s.verification.reasons.push("later mutation");
  if (r.kind !== "draft_observation") throw Error();
  expect(r.data.verification.reasons).toEqual([]);
  expect(r.actions).toEqual({ sign: false, submit: false, repay: false });
  expect(Object.isFrozen(r.actions)).toBe(true);
});
