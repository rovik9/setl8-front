/** Offline archive verification only. No RPC, authority key, signing or submission. */
import { readFile, writeFile } from "node:fs/promises";
import { createHash, createPublicKey, verify } from "node:crypto";
import assert from "node:assert/strict";
import { resolve } from "node:path";
import { Transaction } from "@solana/web3.js";
import bs58 from "bs58";
const hash = (b) => createHash("sha256").update(b).digest("hex");
const observation = JSON.parse(
  await readFile("src/data/devnet-day2-observation.json", "utf8"),
);
const accepted = JSON.parse(
  await readFile("src/data/devnet-proof.json", "utf8"),
);
const reviewPath =
  "/Users/rovik/Documents/ChatGPT/Setl8/coordination/reviews/p30-day2-finalized-settlement.json";
const expectedReview =
  "a9e223d35246ba00db34a29056f0260dbd1a135085dffd4650570a98bf3613cf";
const reviewBytes = await readFile(reviewPath);
assert.equal(hash(reviewBytes), expectedReview);
const review = JSON.parse(reviewBytes);
const resultBytes = await readFile(review.evidence);
assert.equal(hash(resultBytes), review.evidence_sha256);
const result = JSON.parse(resultBytes);
assert.equal(result.corroborated, true);
assert.equal(result.chain_actions, 0);
assert.equal(result.source_sha256, observation.source[0].sha256);
const providerEvidence = {},
  transactions = [];
async function archived(info) {
  const path = resolve(info.file);
  assert.ok(
    path.startsWith(
      "/Users/rovik/Documents/ChatGPT/Setl8/coordination/observations/p30-day2-receipts-",
    ) && path.endsWith(".json"),
  );
  const bytes = await readFile(path);
  assert.equal(hash(bytes), info.sha256);
  return JSON.parse(bytes).result;
}
for (const name of ["solana", "onfinality"]) {
  const p = result.providers[name];
  assert.equal(p.verified, true);
  assert.equal(await archived(p.responses.genesis), observation.genesis_hash);
  const statuses = await archived(p.responses.statuses);
  assert.equal(statuses.value.length, 5);
  for (const v of statuses.value) {
    assert.equal(v.confirmationStatus, "finalized");
    assert.equal(v.err, null);
  }
  const receipts = {};
  for (const t of observation.transactions) {
    const info = p.responses[t.action];
    assert.equal(info.params[0], t.signature);
    assert.equal(info.params[1].commitment, "finalized");
    const raw = await archived(info);
    assert.ok(raw && raw.meta);
    assert.equal(raw.meta.err, null);
    const packet = Buffer.from(raw.transaction[0], "base64"),
      tx = Transaction.from(packet),
      message = Buffer.from(tx.serializeMessage());
    assert.equal(bs58.encode(tx.signature), t.signature);
    for (const s of tx.signatures) {
      assert.ok(s.signature);
      const spki = Buffer.concat([
        Buffer.from("302a300506032b6570032100", "hex"),
        Buffer.from(s.publicKey.toBytes()),
      ]);
      assert.equal(
        verify(
          null,
          message,
          createPublicKey({ key: spki, format: "der", type: "spki" }),
          s.signature,
        ),
        true,
      );
    }
    assert.equal(hash(packet), p.receipts[t.action].packet_sha256);
    assert.equal(hash(message), p.receipts[t.action].message_sha256);
    assert.equal(raw.slot, p.receipts[t.action].slot);
    const expectedProgram =
      t.action === "finalize_pass"
        ? accepted.programs.lev.id
        : accepted.programs.vault.id;
    const disc = createHash("sha256")
      .update("global:" + t.action)
      .digest()
      .subarray(0, 8);
    const instruction = tx.instructions.find(
      (i) =>
        i.programId.toBase58() === expectedProgram &&
        Buffer.from(i.data).subarray(0, 8).equals(disc),
    );
    assert.ok(instruction);
    assert.equal(
      review.checked[name][t.action].anchor_discriminator_verified,
      true,
    );
    assert.equal(review.checked[name][t.action].signature, t.signature);
    if (t.action === "settle_claims") {
      const keys = tx.compileMessage().accountKeys.map((k) => k.toBase58());
      assert.equal(
        tx.instructions[1].programId.toBase58(),
        accepted.programs.vault.id,
      );
      assert.ok(
        tx.instructions[1].keys.some(
          (k) => k.pubkey.toBase58() === observation.reported.claim,
        ),
      );
      const group = raw.meta.innerInstructions.find((i) => i.index === 1);
      assert.ok(group);
      const transfer = group.instructions.find((i) => {
        const data = bs58.decode(i.data);
        return (
          keys[i.programIdIndex] ===
            "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA" &&
          data.length === 10 &&
          data[0] === 12
        );
      });
      assert.ok(transfer);
      assert.equal(transfer.stackHeight, 2);
      const data = Buffer.from(bs58.decode(transfer.data));
      assert.equal(
        data.readBigUInt64LE(1).toString(),
        observation.reported.delta_micro_usdc,
      );
      assert.equal(data[9], 6);
      assert.deepEqual(
        transfer.accounts.slice(0, 4).map((i) => keys[i]),
        [
          accepted.accounts.usdc_pool,
          observation.account.mint,
          observation.account.trader_token_account,
          accepted.accounts.vault_state,
        ],
      );
      const index = keys.indexOf(observation.account.trader_token_account),
        pre = raw.meta.preTokenBalances.find((v) => v.accountIndex === index),
        post = raw.meta.postTokenBalances.find((v) => v.accountIndex === index);
      assert.ok(pre && post);
      for (const v of [pre, post]) {
        assert.equal(v.owner, observation.account.trader);
        assert.equal(v.mint, observation.account.mint);
        assert.equal(v.uiTokenAmount.decimals, 6);
      }
      assert.equal(
        pre.uiTokenAmount.amount,
        observation.reported.balance_before_micro_usdc,
      );
      assert.equal(
        post.uiTokenAmount.amount,
        observation.reported.balance_after_micro_usdc,
      );
      assert.equal(
        (
          BigInt(post.uiTokenAmount.amount) - BigInt(pre.uiTokenAmount.amount)
        ).toString(),
        data.readBigUInt64LE(1).toString(),
      );
    }
    const summary = {
      action: t.action,
      signature: t.signature,
      slot: String(raw.slot),
      packet_sha256: hash(packet),
      message_sha256: hash(message),
      signature_verified: true,
      program: expectedProgram,
      anchor_discriminator_verified: true,
      response_sha256: info.sha256,
      observed_at_utc: info.received_at_utc,
    };
    receipts[t.action] = summary;
    if (name === "solana") transactions.push(summary);
    else {
      const other = transactions.find((x) => x.action === t.action);
      for (const k of ["slot", "packet_sha256", "message_sha256", "signature"])
        assert.equal(summary[k], other[k]);
    }
  }
  providerEvidence[name] = {
    verified: true,
    genesis_response_sha256: p.responses.genesis.sha256,
    statuses_response_sha256: p.responses.statuses.sha256,
    receipts,
  };
}
const output = {
  format: "setl8-day2-finalized-token-history-v1",
  classification: "two_named_operator_finalized_token_transfer_verified",
  source_manifest_sha256: result.source_sha256,
  review_sha256: expectedReview,
  review_evidence_sha256: review.evidence_sha256,
  network: "devnet",
  genesis_hash: observation.genesis_hash,
  account: observation.account,
  claim: observation.reported.claim,
  settlement: review.settlement,
  transactions,
  providers: providerEvidence,
  corroborated: true,
  offline_verified: true,
  typed_full_claim_consumer_verified: false,
  app_connected_execution_verified: false,
  can_transact: false,
  frontend_rpc_calls: 0,
  chain_actions: 0,
  limits: review.limits,
};
const body = JSON.stringify(output, null, 2) + "\n",
  file = "src/data/devnet-day2-verified-history.json";
if (process.argv.includes("--check"))
  assert.equal(await readFile(file, "utf8"), body);
else await writeFile(file, body);
console.log(
  JSON.stringify({
    passed: true,
    verified_operators: 2,
    verified_receipts_per_operator: 5,
    exact_transfer_micro_usdc: review.settlement.amount_micro_usdc,
    receipt_slot: transactions.find((t) => t.action === "settle_claims").slot,
    frontend_rpc_calls: 0,
    signatures_created: 0,
    output_sha256: hash(body),
  }),
);
