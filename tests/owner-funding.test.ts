// @vitest-environment node
import { it, expect, vi, afterEach } from "vitest";
import { mkdtempSync, rmSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Transaction, PublicKey, SystemProgram } from "@solana/web3.js";
import bs58 from "bs58";
import {
  INTENT,
  TOKEN,
  compileFunding,
  fundingInstructions,
  inspectFundingMessage,
  fundingBudget,
  assertFreshContext,
  assertIdentity,
  FundingJournal,
  executeStagedFunding,
  FUNDING_ADDRESSES,
  inspectFundingAccounts,
  inspectUnsignedSimulation,
} from "../tools/owner-funding/core.mjs";
import { RENT_SYSVAR, SYSVAR_OWNER } from "../src/buy/rentEvidence";
const blockhash = "11111111111111111111111111111111";
const b64 = (b: Uint8Array) => Buffer.from(b).toString("base64");
const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0))
    rmSync(root, { recursive: true, force: true });
});
const root = () => {
  const r = mkdtempSync(join(tmpdir(), "setl8-funding-unit-"));
  roots.push(r);
  return r;
};
function accounts() {
  const mint = Buffer.alloc(82);
  mint.writeUInt32LE(1, 0);
  mint.set(new PublicKey(INTENT.payer).toBytes(), 4);
  mint.writeBigUInt64LE(750000000000n, 36);
  mint[44] = 6;
  mint[45] = 1;
  return {
    [INTENT.payer]: {
      owner: SystemProgram.programId.toBase58(),
      executable: false,
      lamports: "100000000",
      data: ["", "base64"],
    },
    [INTENT.owner]: null,
    [INTENT.ata]: null,
    [INTENT.mint]: {
      owner: TOKEN,
      executable: false,
      lamports: "1066800",
      data: [b64(mint), "base64"],
    },
    [RENT_SYSVAR]: {
      owner: SYSVAR_OWNER,
      executable: false,
      lamports: "1009200",
      data: [
        b64(Buffer.from("d813000000000000000000000000f03f32", "hex")),
        "base64",
      ],
    },
  };
}
function context() {
  const compiled = compileFunding(blockhash);
  return {
    ...compiled,
    intentId: INTENT.id,
    ready: true,
    startedAt: 1000,
    expiresAt: 31000,
    minSlot: "10",
    payerLamports: "100000000",
    budget: fundingBudget("1488440", "5000", "100000000"),
    unsignedSimulation: { sameMessageHash: compiled.messageHash, err: null },
  };
}
it("compiles and independently decodes exactly the approved legacy three-instruction message", () => {
  const c = compileFunding(blockhash);
  expect(c.decoded.requiredSigners).toEqual([INTENT.payer]);
  expect(c.decoded.instructions.map((i: any) => i.kind)).toEqual([
    "ATA_CreateIdempotent",
    "SPL_MintToChecked",
    "System_Transfer",
  ]);
  expect(c.decoded.instructions[1]).toMatchObject({
    amountMicro: "30120000",
    decimals: 6,
    accounts: [INTENT.mint, INTENT.ata, INTENT.payer],
  });
  expect(c.decoded.instructions[2].accounts).toEqual([
    INTENT.payer,
    INTENT.owner,
  ]);
  expect(c.decoded.instructions[2].dataHex).toBe("02000000002d310100000000");
  const packet = Buffer.from(c.unsignedBase64, "base64");
  expect(packet[0]).toBe(1);
  expect(packet.subarray(1, 65).every((x) => x === 0)).toBe(true);
  expect(packet.subarray(65).toString("hex")).toBe(c.messageHex);
  expect(packet.length).toBeLessThanOrEqual(1232);
});
it.each([
  "mintAmount",
  "decimals",
  "recipient",
  "transferAmount",
  "ATAopcode",
  "program",
  "extraInstruction",
  "extraSigner",
  "payer",
])("rejects altered approved scope: %s", (change) => {
  const ix = fundingInstructions();
  let payer: string = INTENT.payer;
  if (change === "mintAmount") ix[1].data[1] ^= 1;
  if (change === "decimals") ix[1].data[9] = 7;
  if (change === "recipient") ix[2].keys[1].pubkey = new PublicKey(INTENT.mint);
  if (change === "transferAmount")
    ix[2] = SystemProgram.transfer({
      fromPubkey: new PublicKey(INTENT.payer),
      toPubkey: new PublicKey(INTENT.owner),
      lamports: 20000001n,
    });
  if (change === "ATAopcode") ix[0].data[0] = 0;
  if (change === "program") ix[1].programId = SystemProgram.programId;
  if (change === "extraInstruction") ix.push(ix[2]);
  if (change === "extraSigner") ix[0].keys[2].isSigner = true;
  if (change === "payer") payer = INTENT.owner;
  const bytes = new Transaction({
    feePayer: new PublicKey(payer),
    recentBlockhash: blockhash,
  })
    .add(...ix)
    .serializeMessage();
  expect(() => inspectFundingMessage(bytes, blockhash)).toThrow();
});
it("rejects wrong blockhash and message hash even when instruction scope is unchanged", () => {
  const c = context();
  expect(() =>
    inspectFundingMessage(Buffer.from(c.messageHex, "hex"), INTENT.owner),
  ).toThrow("Blockhash");
  expect(() =>
    assertFreshContext({ ...c, messageHash: "0".repeat(64) }, 2000),
  ).toThrow("hash");
});
it("accepts exact cap boundary and rejects one-lamport excess and insufficient payer balance", () => {
  expect(
    fundingBudget("1488440", "3511560", "25000000")
      .expectedAggregateDebitLamports,
  ).toBe("25000000");
  expect(() => fundingBudget("1488440", "3511561", "100000000")).toThrow("cap");
  expect(() => fundingBudget("1488440", "5000", "21493439")).toThrow(
    "insufficient",
  );
});
it.each(["1.0", "-1", "01", 5000, undefined])(
  "requires exact integer funding values: %s",
  (fee) => {
    expect(() => fundingBudget("1488440", fee, "100000000")).toThrow();
  },
);
it("rejects stale/unready context and absent unsigned simulation without renewing it", () => {
  const c = context();
  expect(() => assertFreshContext(c, 2000)).not.toThrow();
  expect(() => assertFreshContext(c, 31000)).toThrow("stale");
  expect(() => assertFreshContext({ ...c, ready: false }, 2000)).toThrow();
  expect(() =>
    assertFreshContext({ ...c, unsignedSimulation: null }, 2000),
  ).toThrow("simulation");
});
it("requires the approved public keeper identity without generating a key or signing", () => {
  expect(assertIdentity(INTENT.payer)).toBe(INTENT.payer);
  expect(() => assertIdentity(INTENT.owner)).toThrow("mismatch");
});
it("checks missing owner/ATA distinctly from unavailable/incomplete RPC state", () => {
  const m = accounts();
  expect(inspectFundingAccounts(m)).toMatchObject({
    ownerAndATAAbsent: true,
    payerLamports: "100000000",
    ATA_rentLamports: "1488440",
  });
  for (const key of [INTENT.owner, INTENT.ata])
    expect(() =>
      inspectFundingAccounts({ ...m, [key]: m[INTENT.payer] }),
    ).toThrow("prior");
  const bad = { ...m };
  delete (bad as Record<string, unknown>)[INTENT.owner];
  expect(() => inspectFundingAccounts(bad)).toThrow("Incomplete");
});
it("rejects unusable payer, changed mint authority/decimals, and unsupported current Rent", () => {
  const m = accounts();
  expect(() =>
    inspectFundingAccounts({
      ...m,
      [INTENT.payer]: { ...m[INTENT.payer], owner: TOKEN },
    }),
  ).toThrow("payer");
  for (const offset of [4, 44]) {
    const bytes = Buffer.from(m[INTENT.mint].data[0], "base64");
    bytes[offset] ^= 1;
    expect(() =>
      inspectFundingAccounts({
        ...m,
        [INTENT.mint]: { ...m[INTENT.mint], data: [b64(bytes), "base64"] },
      }),
    ).toThrow();
  }
  const rb = Buffer.from(m[RENT_SYSVAR].data[0], "base64");
  rb.writeDoubleLE(1.5, 8);
  expect(() =>
    inspectFundingAccounts({
      ...m,
      [RENT_SYSVAR]: { ...m[RENT_SYSVAR], data: [b64(rb), "base64"] },
    }),
  ).toThrow("Rent");
});
it("requires exact simulated debit/recipient/ATA/mint poststate and fails missing/error simulation", () => {
  const m = accounts(),
    c = context(),
    token = Buffer.alloc(165),
    mint = Buffer.from(m[INTENT.mint].data[0], "base64");
  token.set(new PublicKey(INTENT.mint).toBytes(), 0);
  token.set(new PublicKey(INTENT.owner).toBytes(), 32);
  token.writeBigUInt64LE(30120000n, 64);
  token[108] = 1;
  mint.writeBigUInt64LE(750030120000n, 36);
  const post = [
    { ...m[INTENT.payer], lamports: "78506560" },
    { ...m[INTENT.payer], lamports: "20000000" },
    {
      owner: TOKEN,
      executable: false,
      lamports: "1488440",
      data: [b64(token), "base64"],
    },
    { ...m[INTENT.mint], data: [b64(mint), "base64"] },
  ];
  const sim = {
    context: { slot: "10" },
    value: { err: null, unitsConsumed: "20000", accounts: post },
  };
  expect(inspectUnsignedSimulation(sim, c, m)).toMatchObject({
    observedPayerDebitLamports: "21493440",
    postATATokensMicro: "30120000",
  });
  expect(() =>
    inspectUnsignedSimulation(
      { ...sim, value: { ...sim.value, err: "failure" } },
      c,
      m,
    ),
  ).toThrow();
  expect(() =>
    inspectUnsignedSimulation(
      { ...sim, value: { ...sim.value, accounts: null } },
      c,
      m,
    ),
  ).toThrow();
  expect(() =>
    inspectUnsignedSimulation(
      {
        ...sim,
        value: {
          ...sim.value,
          accounts: [{ ...post[0], lamports: "1" }, ...post.slice(1)],
        },
      },
      c,
      m,
    ),
  ).toThrow("debit");
});
it("persists public intent then public signature/message before a one-shot send claim; restart cannot resend", () => {
  const r = root(),
    j = new FundingJournal(r).initialize(),
    hash = "a".repeat(64),
    signature = bs58.encode(new Uint8Array(64).fill(7));
  j.claimSigning(hash);
  expect(() => new FundingJournal(r).initialize().claimSigning(hash)).toThrow();
  expect(() => j.claimSend(signature, hash)).toThrow();
  j.recordSignature(signature, hash);
  expect(JSON.parse(readFileSync(r + "/signature.json", "utf8"))).toEqual({
    signature,
    messageHash: hash,
    intentId: INTENT.id,
  });
  j.claimSend(signature, hash);
  expect(() =>
    new FundingJournal(r).initialize().claimSend(signature, hash),
  ).toThrow();
  const text = readFileSync(r + "/events.jsonl", "utf8");
  expect(text).not.toContain("secret");
  expect(text).not.toContain("packet");
  expect(text).toContain("submission_started");
});
it("fails a changed signature/message claim before submission", () => {
  const r = root(),
    j = new FundingJournal(r).initialize(),
    hash = "a".repeat(64),
    signature = bs58.encode(new Uint8Array(64).fill(7));
  j.claimSigning(hash);
  j.recordSignature(signature, hash);
  expect(() => j.claimSend(signature, "b".repeat(64))).toThrow("changed");
  expect(existsSync(r + "/submit-once.marker")).toBe(false);
});
it("actual stage2 remains closed before any key read, revalidation, signing or send", async () => {
  const revalidate = vi.fn(),
    sendOnce = vi.fn(),
    r = root();
  await expect(
    executeStagedFunding(context(), {
      revalidate,
      sendOnce,
      journal: new FundingJournal(r),
    }),
  ).rejects.toThrow("not released");
  expect(revalidate).not.toHaveBeenCalled();
  expect(sendOnce).not.toHaveBeenCalled();
  expect(existsSync(r + "/sign-once.marker")).toBe(false);
});
