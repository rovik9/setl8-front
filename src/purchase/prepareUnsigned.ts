import identity from "./p30-artifact.json";
import publicDescriptor from "../../dependencies/p30/3e33090cf9193fd909f57ed75e10f9e59b9409e3c8a8f6c186272d8ee185f86d/p30-descriptor.json";
/** Frontend-owned explicit public input. Not a backend DTO or quote/admission certificate. */
export interface P30PreparationInput {
  inputKind: "p30-public-unsigned-input-v1";
  sdkProfile: "p30-devnet-2026-10-31-v1";
  descriptor: unknown;
  connectedWallet: string;
  trader: string;
  sessionEpoch: number;
  expectedAccount: string;
  nextChallengeId: string;
  tierIndex: string;
  mint: "usdc" | "usdt";
  recentBlockhash: string;
  priorityFee:
    { kind: "omitted" } | { kind: "micro_lamports_per_cu"; value: string };
}
export class P30PreparationError extends Error {
  constructor(field: string) {
    super("Invalid P30 preparation input: " + field);
    this.name = "P30PreparationError";
  }
}
const bad = (field: string): never => {
  throw new P30PreparationError(field);
};
function fields(
  value: unknown,
  keys: readonly string[],
  name: string,
): Record<string, unknown> {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    (Object.getPrototypeOf(value) !== Object.prototype &&
      Object.getPrototypeOf(value) !== null)
  )
    return bad(name);
  const names = Reflect.ownKeys(value);
  if (
    names.length !== keys.length ||
    names.some((k) => typeof k !== "string" || !keys.includes(k))
  )
    return bad(name);
  const copy: Record<string, unknown> = {};
  for (const key of keys) {
    const field = Object.getOwnPropertyDescriptor(value, key);
    if (!field || !("value" in field)) return bad(name);
    copy[key] = field.value;
  }
  return copy;
}
function u64(value: unknown, name: string) {
  if (
    typeof value !== "string" ||
    value.length > 20 ||
    !/^(0|[1-9][0-9]*)$/.test(value) ||
    BigInt(value) > 18446744073709551615n
  )
    return bad(name);
  return value;
}
function address(value: unknown, name: string) {
  if (typeof value !== "string" || !/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(value))
    return bad(name);
  return value;
}
const hex = (bytes: Uint8Array) =>
  Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
const same = (a: Uint8Array, b: Uint8Array) =>
  a.length === b.length && a.every((n, i) => n === b[i]);
async function sha(bytes: Uint8Array) {
  if (!globalThis.crypto?.subtle)
    throw Error("Web Crypto is required for unsigned preparation");
  return hex(
    new Uint8Array(
      await crypto.subtle.digest("SHA-256", new Uint8Array(bytes)),
    ),
  );
}
/** No wallet, storage, auth, API or RPC calls. Only lazy static SDK loading. */
export async function prepareP30UnsignedPurchase(value: unknown) {
  const f = fields(
    value,
    [
      "inputKind",
      "sdkProfile",
      "descriptor",
      "connectedWallet",
      "trader",
      "sessionEpoch",
      "expectedAccount",
      "nextChallengeId",
      "tierIndex",
      "mint",
      "recentBlockhash",
      "priorityFee",
    ],
    "shape",
  );
  if (
    f.inputKind !== "p30-public-unsigned-input-v1" ||
    f.sdkProfile !== identity.profile
  )
    bad("purpose/profile");
  const descriptor = fields(
    f.descriptor,
    Object.keys(publicDescriptor),
    "descriptor",
  );
  for (const [key, want] of Object.entries(publicDescriptor))
    if (descriptor[key] !== want) bad("descriptor");
  const connectedWallet = address(f.connectedWallet, "connectedWallet"),
    traderAddress = address(f.trader, "trader");
  if (connectedWallet !== traderAddress) bad("wallet identity");
  const expectedAccount = address(f.expectedAccount, "expectedAccount"),
    recentBlockhash = address(f.recentBlockhash, "recentBlockhash");
  const nextChallengeId = u64(f.nextChallengeId, "nextChallengeId");
  if (typeof f.tierIndex !== "string" || !/^[0-9]$/.test(f.tierIndex))
    bad("tierIndex");
  const tierIndex = f.tierIndex as string;
  if (f.mint !== "usdc" && f.mint !== "usdt") bad("mint");
  const mint = f.mint as "usdc" | "usdt";
  if (
    typeof f.sessionEpoch !== "number" ||
    !Number.isSafeInteger(f.sessionEpoch) ||
    f.sessionEpoch < 0
  )
    bad("sessionEpoch");
  const sessionEpoch = f.sessionEpoch as number;
  const feeKind =
    typeof f.priorityFee === "object" && f.priorityFee !== null
      ? Object.getOwnPropertyDescriptor(f.priorityFee, "kind")?.value
      : undefined;
  const fee = fields(
    f.priorityFee,
    feeKind === "omitted" ? ["kind"] : ["kind", "value"],
    "priorityFee",
  );
  const priorityFee =
    fee.kind === "omitted"
      ? Object.freeze({ kind: "omitted" as const })
      : fee.kind === "micro_lamports_per_cu"
        ? Object.freeze({
            kind: "micro_lamports_per_cu" as const,
            value: u64(fee.value, "priorityFee"),
          })
        : bad("priorityFee");
  // Snapshot all public caller data before crossing the async import boundary.
  const { PublicKey, p30Devnet } = await import("@setl8/p30-sdk");
  if (
    p30Devnet.PROFILE_ID !== identity.profile ||
    p30Devnet.COMPUTE_UNIT_LIMIT !== 400000
  )
    bad("SDK identity");
  const ctx = new p30Devnet.Context(descriptor),
    trader = new PublicKey(traderAddress),
    blockhash = new PublicKey(recentBlockhash);
  if (
    trader.toBase58() !== traderAddress ||
    blockhash.toBase58() !== recentBlockhash ||
    new PublicKey(expectedAccount).toBase58() !== expectedAccount
  )
    bad("canonical public key");
  const derived = ctx
    .tradingAccount(trader, BigInt(nextChallengeId))[0]
    .toBase58();
  if (derived !== expectedAccount) bad("expected account");
  const purchase = {
    trader,
    nextChallengeId: BigInt(nextChallengeId),
    tierIndex: Number(tierIndex),
    mint,
  };
  ctx.validatePurchaseInstruction(purchase, ctx.buildOpenAccount(purchase));
  const compiled = ctx.compilePurchase(
    purchase,
    recentBlockhash,
    priorityFee.kind === "omitted" ? undefined : BigInt(priorityFee.value),
  );
  const message = new Uint8Array(compiled.serializedMessage),
    packet = new Uint8Array(compiled.unsignedTransaction);
  if (
    compiled.format !== "legacy" ||
    compiled.transactionSize !== packet.length ||
    packet.length > 1232 ||
    compiled.requiredSigners.length !== 1 ||
    compiled.requiredSigners[0].toBase58() !== traderAddress ||
    packet[0] !== 1 ||
    packet.slice(1, 65).some((x) => x !== 0) ||
    !same(packet.slice(65), message)
  )
    bad("unsigned legacy result");
  const [messageSha256, unsignedTransactionSha256] = await Promise.all([
    sha(message),
    sha(packet),
  ]);
  return Object.freeze({
    kind: "p30_unsigned_preparation" as const,
    sdk: Object.freeze({ ...identity }),
    context: Object.freeze({
      connectedWallet,
      trader: traderAddress,
      sessionEpoch,
      expectedAccount: derived,
      nextChallengeId,
      tierIndex,
      mint,
      mintAddress: ctx.mint(mint).toBase58(),
      recentBlockhash,
      priorityFee,
    }),
    format: "legacy" as const,
    computeUnitLimit: compiled.computeUnitLimit,
    transactionSize: packet.length,
    requiredSigners: Object.freeze([traderAddress]),
    messageHex: hex(message),
    unsignedTransactionHex: hex(packet),
    messageSha256,
    unsignedTransactionSha256,
    actions: Object.freeze({ sign: false, submit: false }),
    admission:
      "NOT_VERIFIED_DESCRIPTOR_IS_HISTORICAL_NO_QUOTE_OR_TOKEN_STATE_ADMITTED" as const,
  });
}
