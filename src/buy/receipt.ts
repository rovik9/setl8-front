import type { PublicAttempt, Reconciliation } from "./direct-types";
import { DirectRpc } from "./rpc";
import { readPair, verifyProgramImage, LOADER } from "./preflight";
import { verifySignedPurchase } from "./signed";
import { un64, hash, hex, u64, canonicalJson, fromHex } from "./bytes";
import { classifyRetained } from "./walletReturn";
import { staticKeys } from "./accountDerivation";
import descriptor from "../../dependencies/p30/3e33090cf9193fd909f57ed75e10f9e59b9409e3c8a8f6c186272d8ee185f86d/p30-descriptor.json";
import bs58 from "bs58";
const unknown = (message: string): Reconciliation => ({
  state: "uncertain",
  message,
});
/** Bounded two-operator supplied-metadata correlation. This is not a cryptographic execution/finality proof. */
export async function reconcilePurchase(
  rpc: DirectRpc,
  a: PublicAttempt,
  signal: AbortSignal,
): Promise<Reconciliation> {
  rpc.begin("reconciliation");
  const sdk = await import("@setl8/p30-sdk"),
    ctx = new sdk.p30Devnet.Context(descriptor),
    trader = new sdk.PublicKey(a.wallet),
    expected = ctx.tradingAccount(trader, BigInt(a.nextChallengeId))[0];
  if (expected.toBase58() !== a.expectedAccount)
    throw Error("Recovery PDA differs from the captured public attempt.");
  // Even a signature never returned by a wallet may have been sent outside this app. Missing history never unlocks payment.
  if (!a.signature) {
    await readPair(
      rpc,
      [a.expectedAccount, ctx.wallet(trader)[0].toBase58()],
      signal,
    );
    for (const p of [0, 1] as const)
      await rpc.read(
        p,
        "getSignaturesForAddress",
        [a.expectedAccount, { commitment: "finalized", limit: 20 }],
        signal,
      );
    return unknown(
      "No exact signature is recorded. Account/history discovery is bounded and incomplete; do not make another payment.",
    );
  }
  const status = [];
  for (const p of [0, 1] as const) {
    const r = await rpc.read(
      p,
      "getSignatureStatuses",
      [[a.signature], { searchTransactionHistory: true }],
      signal,
    );
    status.push(r?.value?.[0] ?? null);
  }
  if (status.some((s) => !s)) {
    return unknown(
      "Signature status is missing from at least one provider. Expiry or missing status is not proof of nonexecution.",
    );
  }
  if (status.some((s) => s.err !== null))
    return unknown(
      "A provider reports an unsuccessful or contradictory transaction. Reconciliation is required; no repayment is enabled.",
    );
  if (status.some((s) => s.confirmationStatus !== "finalized"))
    return {
      state: "confirmed",
      message:
        "The signature is observed but not corroborated as finalized. Ownership and purchase verification are still pending.",
      signature: a.signature,
    };
  if (status[0].slot !== status[1].slot)
    return unknown(
      "Finalized slots disagree. Reconciliation remains uncertain.",
    );
  const slot = u64(status[0].slot),
    transactions = [];
  for (const p of [0, 1] as const) {
    const t = await rpc.read(
      p,
      "getTransaction",
      [
        a.signature,
        {
          encoding: "base64",
          commitment: "finalized",
          maxSupportedTransactionVersion: 0,
        },
      ],
      signal,
    );
    if (!t)
      return unknown(
        "Finalized transaction history is unavailable. Do not repay.",
      );
    transactions.push(t);
  }
  const t = transactions[0];
  // Compare data, not the order each operator happens to emit object keys (the two operators differ).
  if (
    (await hash(canonicalJson(t))) !==
    (await hash(canonicalJson(transactions[1])))
  )
    return unknown(
      "The transaction metadata reports disagree. No complete history is inferred.",
    );
  if (
    t.slot !== slot ||
    t.meta?.err !== null ||
    t.meta?.logMessages === null ||
    !Array.isArray(t.meta?.innerInstructions) ||
    !Array.isArray(t.transaction) ||
    t.transaction[1] !== "base64"
  )
    return unknown("Successful finalized receipt metadata is incomplete.");
  const packet = un64(t.transaction[0]);
  // The chain holds the message the wallet signed: the prepared one or it plus one capped price instruction.
  let retained;
  try {
    retained = await classifyRetained(a);
  } catch {
    return unknown(
      "The retained signed message is not the approved purchase plan or its one allowed price instruction.",
    );
  }
  if (
    (await verifySignedPurchase(
      packet,
      retained.messageHex,
      a.wallet,
      retained.messageSha256,
    )) !== a.signature
  )
    return unknown(
      "The finalized transaction does not match the exact recorded signature/message.",
    );
  const compiled = ctx.compilePurchase(
    {
      trader,
      nextChallengeId: BigInt(a.nextChallengeId),
      tierIndex: Number(a.tier),
      mint: "usdc",
    },
    a.blockhash,
  );
  if (hex(compiled.serializedMessage) !== a.messageHex)
    return unknown(
      "The retained message is not the exact approved SDK purchase plan.",
    );
  const message = compiled.message;
  // The prepared message fixes which instruction is the open instruction. Transaction metadata (inner
  // instructions, token balances) indexes the accounts of the message that actually ran on chain: the signed
  // message, whose key order a wallet may have changed. Resolve metadata against that, never the prepared order.
  const preparedKeys = message.staticAccountKeys.map((k) => k.toBase58()),
    keys = staticKeys(fromHex(retained.messageHex)),
    preparedOpenIndex = message.compiledInstructions.length - 1,
    open = message.compiledInstructions[preparedOpenIndex],
    // A wallet-added price instruction placed at or before the open instruction shifts its on-chain index.
    openIndex =
      preparedOpenIndex +
      (retained.insertedAt !== null && retained.insertedAt <= preparedOpenIndex
        ? 1
        : 0);
  if (preparedKeys[open.programIdIndex] !== descriptor.levProgramId)
    return unknown("The receipt has no matching signed open-account parent.");
  const logs = t.meta.logMessages;
  if (!Array.isArray(logs) || logs.length > 512)
    return unknown("The receipt trace is unavailable/truncated.");
  let eventInvokes = 0;
  const stack: string[] = [];
  for (const log of logs) {
    if (typeof log !== "string" || log.length > 2048 || /truncat/i.test(log))
      return unknown("Receipt trace exceeds its bound.");
    const call = /^Program ([1-9A-HJ-NP-Za-km-z]+) invoke \[([0-9]+)\]$/.exec(
        log,
      ),
      success = /^Program ([1-9A-HJ-NP-Za-km-z]+) success$/.exec(log);
    if (call) {
      if (Number(call[2]) !== stack.length + 1)
        return unknown("CPI trace nesting is incomplete.");
      if (
        call[1] === descriptor.levProgramId &&
        call[2] === "2" &&
        stack[0] === descriptor.levProgramId
      )
        eventInvokes++;
      stack.push(call[1]);
    } else if (success) {
      if (stack.pop() !== success[1])
        return unknown("CPI success provenance is incomplete.");
    } else if (/^Program .* failed:/.test(log))
      return unknown("Receipt trace reports a failure.");
  }
  if (stack.length || eventInvokes !== 1)
    return unknown("The canonical self-CPI origin is not established.");
  const group = t.meta.innerInstructions.filter(
    (g: any) => g.index === String(openIndex),
  );
  if (group.length !== 1 || group[0].instructions.length > 32)
    return unknown("Opened CPI metadata is incomplete.");
  const inner = group[0].instructions,
    events = inner.filter(
      (i: any) =>
        keys[Number(i.programIdIndex)] === descriptor.levProgramId &&
        i.stackHeight === "2",
    );
  if (
    events.length !== 1 ||
    events[0].accounts.length !== 1 ||
    keys[Number(events[0].accounts[0])] !== ctx.eventAuthority()[0].toBase58()
  )
    return unknown("Opened event authority/parent is not established.");
  try {
    ctx.decodeOpenedReceipt(
      new sdk.PublicKey(descriptor.levProgramId),
      bs58.decode(events[0].data),
      {
        purchase: {
          trader,
          nextChallengeId: BigInt(a.nextChallengeId),
          tierIndex: Number(a.tier),
          mint: "usdc",
        },
        sizeS: BigInt(a.size),
        genesisHash: await sdk.journalGenesisHash(expected.toBytes()),
      },
    );
  } catch {
    return unknown(
      "The finalized Opened event differs from the captured expected account/terms.",
    );
  }
  const source = ctx.tokenAccount(trader, "usdc").toBase58(),
    destinations = [
      descriptor.usdcPool,
      ctx
        .tokenAccount(new sdk.PublicKey(descriptor.vaultSl8Wallet), "usdc")
        .toBase58(),
      ctx
        .tokenAccount(new sdk.PublicKey(descriptor.feeWallet), "usdc")
        .toBase58(),
    ],
    owners = [
      descriptor.vaultState,
      descriptor.vaultSl8Wallet,
      descriptor.feeWallet,
    ];
  function balance(items: any[], address: string, owner: string) {
    if (!Array.isArray(items)) throw Error("Token balances missing");
    const matches = items.filter(
      (b) => keys[Number(b.accountIndex)] === address,
    );
    if (matches.length !== 1) throw Error("Token balance incomplete");
    const b = matches[0];
    if (
      b.owner !== owner ||
      b.mint !== descriptor.usdcMint ||
      b.uiTokenAmount?.decimals !== "6" ||
      (b.programId &&
        b.programId !== "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA")
    )
      throw Error("Token balance identity differs");
    return BigInt(u64(b.uiTokenAmount.amount));
  }
  let debit: bigint, credits: bigint[];
  try {
    debit =
      balance(t.meta.preTokenBalances, source, a.wallet) -
      balance(t.meta.postTokenBalances, source, a.wallet);
    credits = destinations.map(
      (d, i) =>
        balance(t.meta.postTokenBalances, d, owners[i]) -
        balance(t.meta.preTokenBalances, d, owners[i]),
    );
  } catch {
    return unknown("Exact token debit/credit evidence is incomplete.");
  }
  if (
    debit < 0n ||
    credits.some((x) => x < 0n) ||
    credits.reduce((x, y) => x + y, 0n) !== debit
  )
    return unknown("The actual token movements do not reconcile.");
  const transfers = inner.filter(
    (i: any) =>
      keys[Number(i.programIdIndex)] ===
      "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
  );
  if (transfers.length !== 3)
    return unknown("Unsupported token transfer path.");
  for (let n = 0; n < 3; n++) {
    const matches = transfers.filter(
      (i: any) => keys[Number(i.accounts?.[2])] === destinations[n],
    );
    if (matches.length !== 1)
      return unknown("Transfer destination provenance is incomplete.");
    const i = matches[0],
      b = bs58.decode(i.data);
    if (
      i.accounts.length !== 4 ||
      keys[Number(i.accounts[0])] !== source ||
      keys[Number(i.accounts[1])] !== descriptor.usdcMint ||
      keys[Number(i.accounts[3])] !== a.wallet ||
      b.length !== 10 ||
      b[0] !== 12 ||
      b[9] !== 6 ||
      new DataView(b.buffer, b.byteOffset).getBigUint64(1, true) !==
        credits[n] ||
      i.stackHeight !== (n === 2 ? "2" : "3")
    )
      return unknown(
        "Transfer instruction/parent does not match actual amounts.",
      );
  }
  const programs = [descriptor.levProgramId, descriptor.vaultProgramId],
    dataAddresses = programs.map((p) =>
      sdk.PublicKey.findProgramAddressSync(
        [new sdk.PublicKey(p).toBytes()],
        new sdk.PublicKey(LOADER),
      )[0].toBase58(),
    );
  const records = await readPair(
    rpc,
    [
      a.expectedAccount,
      ctx.wallet(trader)[0].toBase58(),
      ctx.traderState(trader, BigInt(a.nextChallengeId))[0].toBase58(),
      ...programs,
      ...dataAddresses,
    ],
    signal,
    slot,
  );
  for (let n = 0; n < 2; n++)
    await verifyProgramImage(
      records.accounts[programs[n]],
      records.accounts[dataAddresses[n]],
      dataAddresses[n],
      n === 0 ? descriptor.levImageSha256 : descriptor.vaultImageSha256,
      n === 0 ? descriptor.levImageSize : descriptor.vaultImageSize,
      slot,
    );
  const account = records.accounts[a.expectedAccount],
    wallet = records.accounts[ctx.wallet(trader)[0].toBase58()];
  if (!account || !wallet)
    return unknown(
      "The expected account/counter is not corroborated. Read errors are not absence.",
    );
  try {
    const v = ctx.decodeTradingAccount(
        expected,
        new sdk.PublicKey(account.owner),
        un64(account.data[0]),
      ),
      w = ctx.decodeWalletProfile(
        ctx.wallet(trader)[0],
        new sdk.PublicKey(wallet.owner),
        un64(wallet.data[0]),
      );
    if (
      !v.trader.equals(trader) ||
      !w.trader.equals(trader) ||
      v.challengeId.toString() !== a.nextChallengeId ||
      v.sizeS.toString() !== a.size ||
      w.nextChallengeId <= BigInt(a.nextChallengeId)
    )
      throw Error();
    const tr =
      records.accounts[
        ctx.traderState(trader, BigInt(a.nextChallengeId))[0].toBase58()
      ];
    if (!tr) throw Error();
    const state = ctx.decodeTraderState(
      ctx.traderState(trader, BigInt(a.nextChallengeId))[0],
      new sdk.PublicKey(tr.owner),
      un64(tr.data[0]),
    );
    if (
      !state.traderWallet.equals(trader) ||
      state.challengeId.toString() !== a.nextChallengeId ||
      state.accountSize.toString() !== a.size
    )
      throw Error();
  } catch {
    return unknown(
      "Account ownership, size or counter does not match the recorded origin.",
    );
  }
  for (const p of [0, 1] as const) {
    const history = await rpc.read(
      p,
      "getSignaturesForAddress",
      [a.expectedAccount, { commitment: "finalized", limit: 20 }],
      signal,
    );
    if (
      !Array.isArray(history) ||
      !history.some(
        (h: any) =>
          h.signature === a.signature && h.slot === slot && h.err === null,
      )
    )
      return unknown(
        "The exact origin is absent from bounded account history. Coverage is unknown.",
      );
  }
  const match =
    credits[0] + credits[1] === BigInt(a.price) &&
    credits[2] === BigInt(a.fee) &&
    debit === BigInt(a.total);
  return {
    state: match ? "verified" : "finalized_observed",
    message: match
      ? "The exact message/signature, finalized receipt and account origin are corroborated. History coverage remains origin-only; trading access is separate."
      : "A finalized account origin is observed, but actual debit differs from the recorded review. Do not repay; review the evidence.",
    signature: a.signature,
    account: a.expectedAccount,
    actualDebit: debit.toString(),
  };
}
