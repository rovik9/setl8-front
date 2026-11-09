/** Isolated, one-approved-intent devnet funding. No app purchase authority. */
import {
  openSync,
  closeSync,
  readSync,
  fstatSync,
  constants,
  mkdirSync,
  writeFileSync,
  appendFileSync,
  readFileSync,
  fsyncSync,
  existsSync,
} from "node:fs";
import { createHash } from "node:crypto";
import {
  Keypair,
  PublicKey,
  Transaction,
  TransactionInstruction,
  Message,
  SystemProgram,
  SystemInstruction,
} from "@solana/web3.js";
import bs58 from "bs58";
import { u64, un64 } from "../../src/buy/bytes.ts";
import {
  estimateClassicTokenAtaRent,
  RENT_SYSVAR,
} from "../../src/buy/rentEvidence.ts";
export const INTENT = Object.freeze({
  id: "owner-first-tier-devnet-funding-2026-11-02-v1",
  genesis: "EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG",
  payer: "98j1TXdxt77vsDVcLmABWyMP2bWXVoYqRg85nGVGvcth",
  owner: "J95j3drvYgYNrT3cocwSoR8hWd5zsaqVr12eW7UxL7zC",
  mint: "2kBKxj3TYz2UbQfVcJ5xBbWscC5hrALq7MLzJi3c1fTx",
  ata: "Fo6ASykY9yr5phVCFTFt3HiV79jK3g7QHBpy76z7jHCM",
  amountMicro: "30120000",
  decimals: 6,
  transferLamports: "20000000",
  aggregatePayerCapLamports: "25000000",
});
export const TOKEN = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
  ATA_PROGRAM = "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL";
const KEEPER_FILE = "/Users/rovik/.setl8-devnet-lev/keeper.json";
export const JOURNAL_ROOT = "artifacts/owner-funding-execution";
// Origin must source-review and explicitly release stage2 before any actual signature/send.
export const STAGE2_RELEASE = Object.freeze({
  enabled: false,
  originReference: null,
});
const pk = (s) => new PublicKey(s),
  sha = (b) => createHash("sha256").update(b).digest("hex");
export { sha };
const must = (v, m) => {
  if (!v) throw Error(m);
};
function syncDir(path) {
  const fd = openSync(path, constants.O_RDONLY);
  try {
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
}
function durableNew(path, value) {
  const fd = openSync(
    path,
    constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL,
    0o600,
  );
  try {
    writeFileSync(fd, JSON.stringify(value) + "\n");
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
}
export function assertIdentity(value) {
  must(
    value === INTENT.payer,
    "Authorized keeper public identity mismatch; stop.",
  );
  return value;
}
function withKeeper(work) {
  let fd, raw, array, secret;
  try {
    fd = openSync(KEEPER_FILE, constants.O_RDONLY | constants.O_NOFOLLOW);
    const stat = fstatSync(fd);
    must(
      stat.isFile() && stat.size > 64 && stat.size <= 2048,
      "Authorized keeper file has unsupported shape.",
    );
    raw = Buffer.alloc(stat.size);
    must(
      readSync(fd, raw, 0, raw.length, 0) === raw.length,
      "Authorized keeper file incomplete.",
    );
    array = JSON.parse(raw.toString("utf8"));
    must(
      Array.isArray(array) &&
        array.length === 64 &&
        array.every((n) => Number.isInteger(n) && n >= 0 && n <= 255),
      "Authorized keeper file has unsupported shape.",
    );
    secret = Uint8Array.from(array);
    const key = Keypair.fromSecretKey(secret);
    assertIdentity(key.publicKey.toBase58());
    return work(key);
  } catch (error) {
    if (error?.message === "Authorized keeper public identity mismatch; stop.")
      throw error;
    throw Error(
      error?.code === "ENOENT"
        ? "Authorized keeper file absent; stop."
        : "Authorized keeper unavailable or invalid; stop.",
    );
  } finally {
    if (fd !== undefined) closeSync(fd);
    raw?.fill(0);
    secret?.fill(0);
    if (Array.isArray(array)) array.fill(0);
  }
}
/** Reads ONLY authorized existing keeper file; returns public identity, never a signature or key. */
export function checkKeeperIdentity() {
  return withKeeper((key) => ({
    publicKey: key.publicKey.toBase58(),
    matchesApprovedPayer: true,
    actualSignatureCreated: false,
  }));
}
export function fundingInstructions() {
  const payer = pk(INTENT.payer),
    owner = pk(INTENT.owner),
    mint = pk(INTENT.mint),
    ata = pk(INTENT.ata),
    token = pk(TOKEN);
  const derived = PublicKey.findProgramAddressSync(
    [owner.toBuffer(), token.toBuffer(), mint.toBuffer()],
    pk(ATA_PROGRAM),
  )[0];
  must(derived.equals(ata), "Canonical ATA differs.");
  const create = new TransactionInstruction({
    programId: pk(ATA_PROGRAM),
    keys: [
      { pubkey: payer, isSigner: true, isWritable: true },
      { pubkey: ata, isSigner: false, isWritable: true },
      { pubkey: owner, isSigner: false, isWritable: false },
      { pubkey: mint, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      { pubkey: token, isSigner: false, isWritable: false },
    ],
    data: Buffer.from([1]),
  });
  const data = Buffer.alloc(10);
  data[0] = 14;
  data.writeBigUInt64LE(BigInt(INTENT.amountMicro), 1);
  data[9] = 6;
  const mintTo = new TransactionInstruction({
    programId: token,
    keys: [
      { pubkey: mint, isSigner: false, isWritable: true },
      { pubkey: ata, isSigner: false, isWritable: true },
      { pubkey: payer, isSigner: true, isWritable: false },
    ],
    data,
  });
  const transfer = SystemProgram.transfer({
    fromPubkey: payer,
    toPubkey: owner,
    lamports: BigInt(INTENT.transferLamports),
  });
  return [create, mintTo, transfer];
}
export function compileFunding(blockhash) {
  must(pk(blockhash).toBase58() === blockhash, "Invalid blockhash.");
  const tx = new Transaction({
      feePayer: pk(INTENT.payer),
      recentBlockhash: blockhash,
    }).add(...fundingInstructions()),
    message = tx.serializeMessage();
  const unsigned = tx.serialize({
    requireAllSignatures: false,
    verifySignatures: false,
  });
  must(
    unsigned.length <= 1232 &&
      unsigned[0] === 1 &&
      unsigned.subarray(1, 65).every((x) => x === 0),
    "Unexpected unsigned legacy envelope.",
  );
  return {
    messageHex: message.toString("hex"),
    messageHash: sha(message),
    unsignedBase64: unsigned.toString("base64"),
    blockhash,
    decoded: inspectFundingMessage(message, blockhash),
  };
}
export function inspectFundingMessage(bytes, expectedBlockhash) {
  const message = Message.from(bytes);
  must(message.recentBlockhash === expectedBlockhash, "Blockhash changed.");
  must(
    message.header.numRequiredSignatures === 1 &&
      message.accountKeys[0].toBase58() === INTENT.payer,
    "Unexpected payer or required signers.",
  );
  const expected = new Transaction({
    feePayer: pk(INTENT.payer),
    recentBlockhash: expectedBlockhash,
  })
    .add(...fundingInstructions())
    .serializeMessage();
  must(
    Buffer.from(bytes).equals(expected),
    "Message differs from the exact three approved instructions.",
  );
  const ix = message.instructions.map((i) => ({
    program: message.accountKeys[i.programIdIndex].toBase58(),
    accounts: i.accounts.map((n) => message.accountKeys[n].toBase58()),
    data: Buffer.from(bs58.decode(i.data)),
  }));
  must(
    ix.length === 3 &&
      ix[0].program === ATA_PROGRAM &&
      ix[0].data.equals(Buffer.from([1])),
    "Not idempotent ATA creation.",
  );
  must(
    ix[1].program === TOKEN &&
      ix[1].data.length === 10 &&
      ix[1].data[0] === 14 &&
      ix[1].data.readBigUInt64LE(1) === 30120000n &&
      ix[1].data[9] === 6,
    "Not exact MintToChecked.",
  );
  const native = SystemInstruction.decodeTransfer(fundingInstructions()[2]);
  must(native.lamports === 20000000n, "Not exact native transfer.");
  return {
    legacy: true,
    payer: INTENT.payer,
    requiredSigners: [INTENT.payer],
    accountKeys: message.accountKeys.map((k) => k.toBase58()),
    instructions: ix.map((i, n) => ({
      index: n,
      program: i.program,
      accounts: i.accounts,
      dataHex: i.data.toString("hex"),
      kind: ["ATA_CreateIdempotent", "SPL_MintToChecked", "System_Transfer"][n],
      ...(n === 1
        ? { amountMicro: INTENT.amountMicro, decimals: 6 }
        : n === 2
          ? { lamports: INTENT.transferLamports }
          : {}),
    })),
  };
}
export function fundingBudget(rent, fee, payerBalance) {
  const r = BigInt(u64(rent)),
    f = BigInt(u64(fee)),
    b = BigInt(u64(payerBalance)),
    debit = 20000000n + r + f;
  must(
    debit <= 25000000n,
    "Aggregate payer debit exceeds approved25000000lamport cap.",
  );
  must(b >= debit, "Payer funding insufficient.");
  return {
    transferLamports: "20000000",
    ATA_rentLamports: r.toString(),
    networkFeeLamports: f.toString(),
    expectedAggregateDebitLamports: debit.toString(),
    approvedCapLamports: "25000000",
  };
}
export function assertFreshContext(c, now = Date.now()) {
  must(
    c?.intentId === INTENT.id && c.ready === true,
    "No ready funding context.",
  );
  must(
    Number.isSafeInteger(c.expiresAt) &&
      now >= c.startedAt &&
      now < c.expiresAt &&
      now < c.startedAt + 60000,
    "Funding context stale; do not rebuild or sign automatically.",
  );
  const msg = Buffer.from(c.messageHex, "hex");
  must(sha(msg) === c.messageHash, "Funding message hash differs.");
  inspectFundingMessage(msg, c.blockhash);
  const calculated = fundingBudget(
    c.budget.ATA_rentLamports,
    c.budget.networkFeeLamports,
    c.payerLamports,
  );
  must(
    JSON.stringify(calculated) === JSON.stringify(c.budget),
    "Funding budget fields differ.",
  );
  must(
    c.unsignedSimulation?.sameMessageHash === c.messageHash &&
      c.unsignedSimulation.err === null,
    "Exact unsigned simulation unavailable.",
  );
}
/** Durable public-only journal. Markers survive crashes; no packet/secret is stored. */
export class FundingJournal {
  constructor(root = JOURNAL_ROOT) {
    this.root = root;
  }
  initialize() {
    mkdirSync(this.root, { recursive: true });
    const path = this.root + "/intent.json";
    if (existsSync(path)) {
      const saved = JSON.parse(readFileSync(path, "utf8"));
      must(
        JSON.stringify(saved) === JSON.stringify(INTENT),
        "Existing funding intent differs.",
      );
    } else {
      durableNew(path, INTENT);
      syncDir(this.root);
    }
    return this;
  }
  event(kind, publicData = {}) {
    const row = { at: new Date().toISOString(), kind, ...publicData },
      fd = openSync(
        this.root + "/events.jsonl",
        constants.O_CREAT | constants.O_APPEND | constants.O_WRONLY,
        0o600,
      );
    try {
      appendFileSync(fd, JSON.stringify(row) + "\n");
      fsyncSync(fd);
    } finally {
      closeSync(fd);
    }
    syncDir(this.root);
  }
  claimSigning(hash) {
    durableNew(this.root + "/sign-once.marker", {
      intentId: INTENT.id,
      messageHash: hash,
    });
    syncDir(this.root);
    this.event("signing", { messageHash: hash });
  }
  recordSignature(signature, hash) {
    must(
      bs58.decode(signature).length === 64,
      "Invalid public signature shape.",
    );
    const claim = JSON.parse(
      readFileSync(this.root + "/sign-once.marker", "utf8"),
    );
    must(claim.messageHash === hash, "Signing claim differs.");
    durableNew(this.root + "/signature.json", {
      signature,
      messageHash: hash,
      intentId: INTENT.id,
    });
    syncDir(this.root);
    this.event("signed", { signature, messageHash: hash });
  }
  claimSend(signature, hash) {
    const saved = JSON.parse(
      readFileSync(this.root + "/signature.json", "utf8"),
    );
    must(
      saved.signature === signature && saved.messageHash === hash,
      "Durable signature/message absent or changed.",
    );
    durableNew(this.root + "/submit-once.marker", {
      signature,
      messageHash: hash,
    });
    syncDir(this.root);
    this.event("submission_started", { signature, messageHash: hash });
  }
}
/** Stage2 gate is deliberately closed. No stage1 caller can produce a real signature. */
export async function executeStagedFunding(
  c,
  { revalidate, sendOnce, journal = new FundingJournal() } = {},
) {
  must(
    STAGE2_RELEASE.enabled && STAGE2_RELEASE.originReference,
    "Funding stage2 not released by Origin.",
  );
  assertFreshContext(c);
  must(
    typeof revalidate === "function" && typeof sendOnce === "function",
    "Reviewed execution transport unavailable.",
  );
  journal.initialize();
  await revalidate(c);
  assertFreshContext(c);
  journal.claimSigning(c.messageHash);
  let packet, signature;
  try {
    packet = withKeeper((key) => {
      const tx = Transaction.populate(
        Message.from(Buffer.from(c.messageHex, "hex")),
      );
      tx.partialSign(key);
      must(tx.verifySignatures(), "Funding signature verification failed.");
      must(
        sha(tx.serializeMessage()) === c.messageHash,
        "Signed message changed.",
      );
      return tx.serialize({
        requireAllSignatures: true,
        verifySignatures: true,
      });
    });
    signature = bs58.encode(packet.subarray(1, 65));
    must(
      packet[0] === 1 &&
        packet.length <= 1232 &&
        Buffer.from(packet.subarray(65)).equals(
          Buffer.from(c.messageHex, "hex"),
        ),
      "Signed envelope differs.",
    );
    journal.recordSignature(signature, c.messageHash);
    assertFreshContext(c);
    journal.claimSend(signature, c.messageHash);
    try {
      const answer = await sendOnce(packet, signature, c);
      must(
        answer === signature,
        "Submission response differs; reconcile exact signature only.",
      );
      journal.event("submitted", { signature, messageHash: c.messageHash });
      return { signature, state: "submitted_not_finalized" };
    } catch {
      try {
        journal.event("uncertain", {
          signature,
          messageHash: c.messageHash,
          action: "Reconcile exact signature only; no remint/rebuild/resend.",
        });
      } catch {}
      return { signature, state: "uncertain_reconcile_exact_signature_only" };
    }
  } finally {
    packet?.fill(0);
  }
}

export const FUNDING_ADDRESSES = Object.freeze([
  INTENT.payer,
  INTENT.owner,
  INTENT.mint,
  INTENT.ata,
  RENT_SYSVAR,
]);
const accountBytes = (a) => {
  must(
    a && !a.executable && a.data?.[1] === "base64",
    "Required account unavailable or encoding invalid.",
  );
  return un64(a.data[0]);
};
export function inspectFundingAccounts(m) {
  must(
    FUNDING_ADDRESSES.every((k) => Object.hasOwn(m, k)),
    "Incomplete account read; no absence inferred.",
  );
  must(
    m[INTENT.owner] === null && m[INTENT.ata] === null,
    "Unexpected prior owner/ATA funding; stop and reconcile, never remint automatically.",
  );
  const payer = m[INTENT.payer];
  must(
    payer &&
      payer.owner === SystemProgram.programId.toBase58() &&
      accountBytes(payer).length === 0,
    "Authorized payer is not a usable System wallet.",
  );
  const mint = m[INTENT.mint],
    b = accountBytes(mint);
  must(
    mint.owner === TOKEN && b.length === 82 && b[44] === 6 && b[45] === 1,
    "Pinned classic six-decimal initialized mint unavailable.",
  );
  const v = new DataView(b.buffer, b.byteOffset);
  must(
    v.getUint32(0, true) === 1 &&
      new PublicKey(b.slice(4, 36)).toBase58() === INTENT.payer,
    "Actual mint authority differs from approved keeper.",
  );
  const supply = v.getBigUint64(36, true);
  must(
    supply + 30120000n <= 18446744073709551615n,
    "Mint supply would overflow.",
  );
  return {
    payerLamports: u64(payer.lamports),
    ATA_rentLamports: estimateClassicTokenAtaRent(m[RENT_SYSVAR]),
    mintSupplyMicro: supply.toString(),
    ownerAndATAAbsent: true,
  };
}
export function inspectUnsignedSimulation(sim, c, baseline) {
  must(
    sim?.value?.err === null &&
      BigInt(u64(sim.context?.slot)) >= BigInt(c.minSlot),
    "Unsigned simulation failed or context is stale.",
  );
  const accounts = sim.value.accounts;
  must(
    Array.isArray(accounts) && accounts.length === 4,
    "Unsigned simulation post-accounts unavailable.",
  );
  const [payer, owner, ata, mint] = accounts,
    payerData = accountBytes(payer),
    ownerData = accountBytes(owner),
    ataData = accountBytes(ata),
    mintData = accountBytes(mint);
  must(
    payer.owner === SystemProgram.programId.toBase58() &&
      payerData.length === 0 &&
      owner.owner === SystemProgram.programId.toBase58() &&
      ownerData.length === 0 &&
      u64(owner.lamports) === "20000000",
    "Simulation System accounts differ.",
  );
  const debit = BigInt(c.payerLamports) - BigInt(u64(payer.lamports));
  must(
    debit === BigInt(c.budget.expectedAggregateDebitLamports) &&
      debit <= 25000000n,
    "Simulation payer debit differs or exceeds cap.",
  );
  must(
    ata.owner === TOKEN &&
      ataData.length === 165 &&
      new PublicKey(ataData.slice(0, 32)).toBase58() === INTENT.mint &&
      new PublicKey(ataData.slice(32, 64)).toBase58() === INTENT.owner &&
      new DataView(ataData.buffer, ataData.byteOffset).getBigUint64(
        64,
        true,
      ) === 30120000n &&
      ataData[108] === 1 &&
      u64(ata.lamports) === c.budget.ATA_rentLamports,
    "Simulation ATA identity/amount/state/rent differs.",
  );
  const expectedMint = accountBytes(baseline[INTENT.mint]);
  const expected = Uint8Array.from(expectedMint),
    mv = new DataView(expected.buffer);
  mv.setBigUint64(36, mv.getBigUint64(36, true) + 30120000n, true);
  must(
    mint.owner === TOKEN &&
      u64(mint.lamports) === baseline[INTENT.mint].lamports &&
      Buffer.from(mintData).equals(Buffer.from(expected)),
    "Simulation mint changed beyond exact approved mint amount.",
  );
  const units = u64(sim.value.unitsConsumed);
  must(
    BigInt(units) > 0n && BigInt(units) <= 1400000n,
    "Simulation unit bound unavailable.",
  );
  return {
    sameMessageHash: c.messageHash,
    err: null,
    slot: u64(sim.context.slot),
    unitsConsumed: units,
    observedPayerDebitLamports: debit.toString(),
    postOwnerLamports: "20000000",
    postATATokensMicro: "30120000",
    advisory: true,
  };
}

/** Must run AFTER pacing and synchronously at the actual funding fetch boundary. */
export function assertFundingForwardBoundary(
  c,
  packet,
  signature,
  { now = Date.now(), release = STAGE2_RELEASE } = {},
) {
  must(
    release.enabled === true &&
      typeof release.originReference === "string" &&
      release.originReference.length > 0,
    "Funding release closed at send boundary.",
  );
  must(
    c?.intentId === INTENT.id &&
      packet?.[0] === 1 &&
      packet.length <= 1232 &&
      sha(packet.subarray(65)) === c.messageHash &&
      bs58.encode(packet.subarray(1, 65)) === signature,
    "Funding intent/message/signature changed at send boundary.",
  );
  assertFreshContext(c, now);
}
