import bs58 from "bs58";
import { fromHex, hash, hex, same, u64 } from "./bytes";
import type { CheckedPurchase } from "./direct-types";
import { REVIEWED_OWNER_SCOPE } from "./executionGate";
import { mismatch } from "./signed";

/**
 * Narrow acceptance of a wallet-modified purchase message.
 *
 * Some wallets add one ComputeBudget SetComputeUnitPrice instruction before signing, and may
 * re-serialise the message while doing so (account-key order, header counts, indexes). This file
 * accepts the exact prepared bytes, or a returned legacy message that is SEMANTICALLY the prepared
 * message plus exactly one such price instruction: same fee payer, same blockhash, same set of
 * account keys with identical signer/writable roles (each derived from its own message's header),
 * the original instructions in the same order each resolving to the same program key, ordered
 * account keys and data, and one added ComputeBudget SetComputeUnitPrice (no accounts, nine data
 * bytes, discriminator 3). Its price, times the prepared compute-unit limit, must cost at most
 * PRIORITY_FEE_CAP_LAMPORTS, and network fee + priority fee + rent must stay inside the reviewed
 * owner scope. The wallet's Ed25519 signature must verify over the RETURNED bytes exactly as
 * returned; they are never re-serialised.
 */
export const COMPUTE_BUDGET_PROGRAM =
  "ComputeBudget111111111111111111111111111111";
export const PRIORITY_FEE_CAP_LAMPORTS = 1_000_000n;
export interface ReturnedClass {
  kind: "exact" | "priority_price_added";
  messageHex: string;
  /** Position of the added instruction in the returned message; null for the exact prepared message. */
  insertedAt: number | null;
  /** micro-lamports per compute unit; null for the exact prepared message. */
  priceMicroLamportsPerCu: string | null;
  priorityFeeLamports: string;
}
export interface ReturnedMessage extends ReturnedClass {
  messageSha256: string;
}
export interface VerifiedWalletReturn extends ReturnedMessage {
  signature: string;
}
class Refusal extends Error {}
const no = (why: string): never => {
  throw new Refusal(why);
};
function shortvec(b: Uint8Array, at: number): [number, number] {
  let v = 0;
  for (let i = 0; i < 3; i++) {
    const x = b[at + i];
    if (x === undefined) return no("truncated length");
    v |= (x & 0x7f) << (7 * i);
    if ((x & 0x80) === 0) {
      // Canonical (shortest) encoding only, so byte comparison cannot be dodged by re-encoding.
      if (i > 0 && x === 0) return no("non-canonical length");
      return [v, at + i + 1];
    }
  }
  return no("length too long");
}
interface Plan {
  limit: number;
}
/** Strict parse of the SDK's prepared message: it must hold exactly one ComputeBudget SetComputeUnitLimit. */
function plan(m: Uint8Array): Plan {
  const d = decode(m, "prepared");
  const computeIndex = d.keys.indexOf(COMPUTE_BUDGET_PROGRAM);
  // The program must be an unsigned, read-only key, as a program id always is.
  if (computeIndex < 0 || d.role(computeIndex) !== "ro")
    no("prepared message has no read-only ComputeBudget program key");
  let limit = -1;
  for (const ix of d.ixs) {
    if (ix.program !== COMPUTE_BUDGET_PROGRAM) continue;
    // The prepared message may hold exactly one ComputeBudget instruction: SetComputeUnitLimit.
    if (!(ix.accounts.length === 0 && ix.data.length === 5 && ix.data[0] === 2))
      no(
        "prepared message has a ComputeBudget instruction other than the limit",
      );
    if (limit !== -1) no("duplicate compute-unit limit");
    limit = new DataView(ix.data.buffer, ix.data.byteOffset + 1, 4).getUint32(
      0,
      true,
    );
  }
  if (limit < 1) no("prepared message has no compute-unit limit instruction");
  return { limit };
}
interface Instr {
  /** Resolved program key. */
  program: string;
  /** Resolved account keys, in order. */
  accounts: string[];
  data: Uint8Array;
}
interface Decoded {
  keys: string[];
  blockhash: string;
  ixs: Instr[];
  /** "sw" signer+writable, "sr" signer read-only, "w" writable unsigned, "ro" read-only unsigned. */
  role(i: number): "sw" | "sr" | "w" | "ro";
}
/**
 * Strict decode of a legacy message: canonical lengths, no trailing bytes, consistent header, no
 * duplicate keys, every index inside the static keys. Anything else is refused, so two messages that
 * decode equal cannot differ in any byte that carries meaning.
 */
function decode(m: Uint8Array, what: string): Decoded {
  if (m.length < 70 || m.length > 1232 || m[0] & 0x80)
    no(`${what} message is not legacy`);
  const signers = m[0],
    roSigned = m[1],
    roUnsigned = m[2];
  const [nKeys, afterKeys] = shortvec(m, 3);
  if (nKeys > 64 || nKeys < 1 || signers < 1 || signers > nKeys)
    no(`${what} header`);
  // The fee payer is a writable signer; read-only counts cannot swallow their section.
  if (roSigned >= signers || roUnsigned > nKeys - signers) no(`${what} header`);
  const headEnd = afterKeys + nKeys * 32 + 32;
  if (headEnd > m.length) no(`${what} accounts`);
  const keys: string[] = [];
  for (let i = 0; i < nKeys; i++) {
    const k = bs58.encode(
      m.subarray(afterKeys + i * 32, afterKeys + i * 32 + 32),
    );
    if (keys.includes(k)) no(`${what} message repeats an account key`);
    keys.push(k);
  }
  const blockhash = bs58.encode(m.subarray(headEnd - 32, headEnd));
  const [nIx, first] = shortvec(m, headEnd);
  if (nIx < 1 || nIx > 100) no(`${what} instruction count`);
  const ixs: Instr[] = [];
  let at = first;
  for (let k = 0; k < nIx; k++) {
    const prog = m[at++];
    if (prog === undefined || prog >= nKeys) no(`${what} program index`);
    const [na, afterAccounts] = shortvec(m, at);
    at = afterAccounts;
    if (at + na > m.length) no(`${what} instruction bounds`);
    const accounts: string[] = [];
    for (let j = 0; j < na; j++) {
      const idx = m[at + j];
      if (idx >= nKeys) no(`${what} account index`);
      accounts.push(keys[idx]);
    }
    at += na;
    const [nd, dataAt] = shortvec(m, at);
    at = dataAt + nd;
    if (at > m.length) no(`${what} instruction bounds`);
    ixs.push({ program: keys[prog], accounts, data: m.slice(dataAt, at) });
  }
  if (at !== m.length) no(`${what} message has trailing bytes`);
  return {
    keys,
    blockhash,
    ixs,
    role: (i) =>
      i < signers
        ? i < signers - roSigned
          ? "sw"
          : "sr"
        : i < nKeys - roUnsigned
          ? "w"
          : "ro",
  };
}
const isPriceIx = (ix: Instr) =>
  ix.program === COMPUTE_BUDGET_PROGRAM &&
  ix.accounts.length === 0 &&
  ix.data.length === 9 &&
  ix.data[0] === 3;
const sameIx = (a: Instr, b: Instr) =>
  a.program === b.program &&
  a.accounts.length === b.accounts.length &&
  a.accounts.every((k, i) => k === b.accounts[i]) &&
  same(a.data, b.data);
/** Priority fee in lamports: ceil(price * limit / 1_000_000). */
export const priorityFeeLamports = (price: bigint, limit: number) =>
  (price * BigInt(limit) + 999_999n) / 1_000_000n;
/**
 * Decide whether `returned` is the prepared message or the prepared message plus exactly one
 * allowed SetComputeUnitPrice instruction. Throws (Refusal) for anything else. `computeUnitLimit`
 * is the prepared compute-unit limit and must equal the limit written in the prepared message.
 */
export function classifyReturnedMessage(
  preparedMessage: Uint8Array,
  computeUnitLimit: number | string,
  returned: Uint8Array,
): ReturnedClass {
  const p = plan(preparedMessage);
  if (BigInt(computeUnitLimit) !== BigInt(p.limit))
    no("prepared compute-unit limit differs from the message");
  if (same(returned, preparedMessage))
    return {
      kind: "exact",
      messageHex: hex(returned),
      insertedAt: null,
      priceMicroLamportsPerCu: null,
      priorityFeeLamports: "0",
    };
  const prep = decode(preparedMessage, "prepared"),
    ret = decode(returned, "returned");
  if (ret.keys[0] !== prep.keys[0]) no("returned fee payer differs");
  if (ret.blockhash !== prep.blockhash) no("returned blockhash differs");
  // The same SET of account keys; roles are compared per key, each from its own message's header.
  if (ret.keys.length !== prep.keys.length)
    no("returned message adds or removes an account key");
  for (let i = 0; i < ret.keys.length; i++) {
    const j = prep.keys.indexOf(ret.keys[i]);
    if (j < 0) no("returned message adds or removes an account key");
    if (ret.role(i) !== prep.role(j))
      no("returned message changes an account's signer or writable role");
  }
  // Exactly one price instruction; everything else must be the prepared instructions, in order.
  const priced = ret.ixs.flatMap((ix, at) => (isPriceIx(ix) ? [at] : []));
  if (priced.length !== 1)
    no(
      priced.length === 0
        ? "returned message differs from the prepared message without a price instruction"
        : "returned message has more than one price instruction",
    );
  const insertedAt = priced[0],
    rest = ret.ixs.filter((_, at) => at !== insertedAt);
  if (
    rest.length !== prep.ixs.length ||
    !rest.every((ix, i) => sameIx(ix, prep.ixs[i]))
  )
    no("returned instructions differ from the prepared instructions");
  const price = new DataView(
      ret.ixs[insertedAt].data.buffer,
      ret.ixs[insertedAt].data.byteOffset + 1,
      8,
    ).getBigUint64(0, true),
    fee = priorityFeeLamports(price, p.limit);
  if (fee > PRIORITY_FEE_CAP_LAMPORTS)
    no(
      `priority fee ${fee} lamports is above the ${PRIORITY_FEE_CAP_LAMPORTS} lamport cap`,
    );
  return {
    kind: "priority_price_added",
    messageHex: hex(returned),
    insertedAt,
    priceMicroLamportsPerCu: price.toString(),
    priorityFeeLamports: fee.toString(),
  };
}
/** Network fee + priority fee + purchase rent must stay inside the reviewed owner scope. */
export function assertPriorityWithinOwnerCap(
  c: Pick<CheckedPurchase, "networkFee" | "rent">,
  priorityLamports: string,
) {
  // u64() refuses empty, signed, hex, padded or non-string values instead of coercing them.
  const total =
    BigInt(u64(c.networkFee)) +
    BigInt(u64(c.rent)) +
    BigInt(u64(priorityLamports));
  if (total > BigInt(REVIEWED_OWNER_SCOPE.maxOwnerNetworkFeeAndPurchaseRent))
    no(
      "network fee, priority fee and rent exceed the reviewed owner SOL limit",
    );
}
/**
 * Verify a wallet's signed packet for this exact review. Accepts the exact prepared message, or it
 * plus one capped SetComputeUnitPrice instruction. Anything else throws the usual refusal with
 * public-only diagnostics. The signature must verify over the returned bytes.
 */
export async function verifyWalletReturn(
  packet: Uint8Array,
  c: CheckedPurchase,
  wallet = c.wallet,
): Promise<VerifiedWalletReturn> {
  // Snapshot first: everything below, including the signature check, must see the same bytes.
  packet = packet.slice();
  const preparedHex = c.prepared.messageHex,
    prepared = fromHex(preparedHex);
  let info: ReturnedMessage;
  try {
    if (packet.length > 1232 || packet.length < 65 || packet[0] !== 1)
      no("packet shape");
    // The review is bound to the prepared hash; it must still describe the prepared bytes.
    if ((await hash(prepared)) !== c.prepared.messageSha256)
      no("prepared hash differs");
    const message = packet.subarray(65),
      cls = classifyReturnedMessage(
        prepared,
        c.prepared.computeUnitLimit,
        message,
      );
    info = { ...cls, messageSha256: await hash(message) };
    if (
      info.kind === "exact" &&
      info.messageSha256 !== c.prepared.messageSha256
    )
      no("prepared hash differs");
    assertPriorityWithinOwnerCap(c, info.priorityFeeLamports);
  } catch (e) {
    throw mismatch(
      packet,
      preparedHex,
      e instanceof Refusal ? e.message : undefined,
    );
  }
  const key = await crypto.subtle.importKey(
    "raw",
    new Uint8Array(bs58.decode(wallet)),
    { name: "Ed25519" },
    false,
    ["verify"],
  );
  if (
    !(await crypto.subtle.verify(
      { name: "Ed25519" },
      key,
      new Uint8Array(packet.slice(1, 65)),
      new Uint8Array(packet.subarray(65)),
    ))
  )
    throw Error(
      "The required wallet signature is invalid. No app broadcast is permitted.",
    );
  return { ...info, signature: bs58.encode(packet.slice(1, 65)) };
}
/** Re-derive and re-check a retained attempt's returned message against its prepared message. */
export async function classifyRetained(a: {
  messageHex: string;
  signedMessageHex: string | null;
  signedMessageSha256: string | null;
}): Promise<ReturnedMessage> {
  const prepared = fromHex(a.messageHex),
    signed =
      a.signedMessageHex === null ? prepared : fromHex(a.signedMessageHex),
    info: ReturnedMessage = {
      ...classifyReturnedMessage(prepared, plan(prepared).limit, signed),
      messageSha256: await hash(signed),
    };
  if (
    a.signedMessageSha256 !== null &&
    a.signedMessageSha256 !== info.messageSha256
  )
    no("retained signed message hash differs");
  assertPriorityWithinOwnerCap(
    { networkFee: "0", rent: "0" },
    info.priorityFeeLamports,
  );
  return info;
}
export { Refusal as WalletReturnRefusal };
