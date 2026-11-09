// OFFLINE MOCK ONLY. Every RPC response below is manufactured in memory.
import {
  PublicKey,
  p30Devnet,
  lifecycleProtocol,
  journalGenesisHash,
} from "@setl8/p30-sdk";
import bs58 from "bs58";
import images from "./fixtures/f2-public-images.json";
import vectors from "./fixtures/p30-synthetic.json";
import descriptor from "../dependencies/p30/3e33090cf9193fd909f57ed75e10f9e59b9409e3c8a8f6c186272d8ee185f86d/p30-descriptor.json";
import { b64, fromHex, hex, un64 } from "../src/buy/bytes";
import { DEVNET_ENDPOINTS } from "../src/buy/rpc";
import { RENT_SYSVAR, SYSVAR_OWNER } from "../src/buy/rentEvidence";
import { CLASSIC_TOKEN, SYSTEM, type RpcAccount } from "../src/buy/preflight";
export { descriptor };
export const ctx = new p30Devnet.Context(descriptor),
  v = vectors.cases[0];
export function memoryStorage() {
  const values = new Map<string, string>();
  return {
    values,
    getItem: (k: string) => values.get(k) ?? null,
    setItem: (k: string, s: string) => {
      values.set(k, s);
    },
    removeItem: (k: string) => {
      values.delete(k);
    },
  };
}
export async function ephemeral() {
  const keys = await crypto.subtle.generateKey({ name: "Ed25519" }, false, [
    "sign",
    "verify",
  ]);
  const address = bs58.encode(
    new Uint8Array(await crypto.subtle.exportKey("raw", keys.publicKey)),
  );
  return {
    address,
    async signTransaction(packet: Uint8Array) {
      const copy = new Uint8Array(packet);
      copy.set(
        new Uint8Array(
          await crypto.subtle.sign(
            { name: "Ed25519" },
            keys.privateKey,
            new Uint8Array(copy.slice(65)),
          ),
        ),
        1,
      );
      return copy;
    },
  };
}
export function offlineAccounts(wallet = v.trader, existing = false) {
  const map: Record<string, RpcAccount | null> = structuredClone(
    images.accounts,
  ) as unknown as Record<string, RpcAccount>;
  const record = (role: keyof typeof v.records) => {
    const a = v.records[role];
    return {
      owner: a.owner,
      executable: false,
      lamports: "10000000",
      data: [b64(fromHex(a.data)), "base64"] as [string, "base64"],
    };
  };
  for (const r of ["SectorConfig", "RuleSet", "VaultState"] as const)
    map[v.records[r].address] = record(r);
  map[descriptor.registry] = {
    owner: images.catalog.owner,
    executable: false,
    lamports: "10000000",
    data: [b64(fromHex(images.catalog.data)), "base64"],
  };
  const rent = new Uint8Array(17),
    rentView = new DataView(rent.buffer);
  rentView.setBigUint64(0, 50n, true);
  rentView.setBigUint64(8, 0x4000000000000000n, true);
  rent[16] = 50;
  map[RENT_SYSVAR] = {
    owner: SYSVAR_OWNER,
    executable: false,
    lamports: "1",
    data: [b64(rent), "base64"],
  };
  const trader = new PublicKey(wallet),
    w = ctx.wallet(trader),
    account = ctx.tradingAccount(trader, 0n),
    tr = ctx.traderState(trader, 0n);
  map[wallet] = {
    owner: SYSTEM,
    executable: false,
    lamports: "9007199254740993",
    data: ["", "base64"],
  };
  const mint = new Uint8Array(82);
  mint[44] = 6;
  mint[45] = 1;
  map[descriptor.usdcMint] = {
    owner: CLASSIC_TOKEN,
    executable: false,
    lamports: "2000000",
    data: [b64(mint), "base64"],
  };
  for (const [address, owner] of [
    [ctx.tokenAccount(trader, "usdc").toBase58(), wallet],
    [descriptor.usdcPool, descriptor.vaultState],
    [
      ctx
        .tokenAccount(new PublicKey(descriptor.vaultSl8Wallet), "usdc")
        .toBase58(),
      descriptor.vaultSl8Wallet,
    ],
    [
      ctx.tokenAccount(new PublicKey(descriptor.feeWallet), "usdc").toBase58(),
      descriptor.feeWallet,
    ],
  ]) {
    const b = new Uint8Array(165);
    b.set(new PublicKey(descriptor.usdcMint).toBytes(), 0);
    b.set(new PublicKey(owner).toBytes(), 32);
    new DataView(b.buffer).setBigUint64(64, 9000000000n, true);
    b[108] = 1;
    map[address] = {
      owner: CLASSIC_TOKEN,
      executable: false,
      lamports: "2000000",
      data: [b64(b), "base64"],
    };
  }
  map[w[0].toBase58()] = null;
  map[account[0].toBase58()] = null;
  map[tr[0].toBase58()] = null;
  if (existing) {
    const wb = fromHex(v.records.WalletProfile.data);
    wb.set(trader.toBytes(), 8);
    new DataView(wb.buffer).setBigUint64(40, 1n, true);
    wb[49] = w[1];
    map[w[0].toBase58()] = {
      ...record("WalletProfile"),
      data: [b64(wb), "base64"],
    };
    const ab = fromHex(v.records.TradingAccount.data);
    ab.set(trader.toBytes(), 8);
    ab[
      lifecycleProtocol.types.TradingAccount.fields.find(
        (x) => x.tsName === "bump",
      )!.offset
    ] = account[1];
    map[account[0].toBase58()] = {
      ...record("TradingAccount"),
      data: [b64(ab), "base64"],
    };
    const tb = fromHex(v.records.TraderState.data);
    tb.set(trader.toBytes(), 8);
    tb[tb.length - 1] = tr[1];
    map[tr[0].toBase58()] = {
      ...record("TraderState"),
      data: [b64(tb), "base64"],
    };
  }
  return map;
}
export function offlineFetch(
  accounts = offlineAccounts(),
  override?: (method: string, params: any[], provider: number) => unknown,
): typeof fetch {
  return (async (url, init) => {
    const req = JSON.parse(String(init?.body)),
      p = String(url).startsWith(DEVNET_ENDPOINTS[1]) ? 1 : 0;
    let result = override?.(req.method, req.params, p);
    if (result === undefined)
      switch (req.method) {
        case "getGenesisHash":
          result = descriptor.genesisHash;
          break;
        case "getMultipleAccounts":
          result = {
            context: {
              slot: String(
                BigInt(req.params[1]?.minContextSlot ?? "0") > 600000000n
                  ? BigInt(req.params[1].minContextSlot)
                  : 600000000n,
              ),
            },
            value: req.params[0].map((a: string) => accounts[a] ?? null),
          };
          break;
        case "getLatestBlockhash":
          result = {
            context: { slot: "600000001" },
            value: { blockhash: SYSTEM, lastValidBlockHeight: "700000000" },
          };
          break;
        case "isBlockhashValid":
          result = { context: { slot: "600000002" }, value: true };
          break;
        case "getBlockHeight":
          result = "600000003";
          break;
        case "getFeeForMessage":
          result = { context: { slot: "600000002" }, value: "5000" };
          break;
        case "getMinimumBalanceForRentExemption":
          result = String((req.params[0] + 128) * 100);
          break;
        case "getSignatureStatuses":
          result = { context: { slot: "600000003" }, value: [null] };
          break;
        case "getSignaturesForAddress":
          result = [];
          break;
        case "getTransaction":
          result = null;
          break;
        default:
          throw Error("Unexpected offline RPC method: " + req.method);
      }
    return new Response(
      JSON.stringify({ jsonrpc: "2.0", id: req.id, result }),
      { headers: { "Content-Type": "application/json" } },
    );
  }) as typeof fetch;
}
export async function receiptFixture(
  wallet: string,
  packet: Uint8Array,
  signature: string,
  /** Account order of the message that ran on chain (default: the prepared order). A wallet may re-sort it. */
  chainKeys?: readonly string[],
) {
  const trader = new PublicKey(wallet),
    compiled = ctx.compilePurchase(
      { trader, nextChallengeId: 0n, tierIndex: 0, mint: "usdc" },
      SYSTEM,
    ),
    keys =
      chainKeys ?? compiled.message.staticAccountKeys.map((k) => k.toBase58()),
    idx = (a: string) => String(keys.indexOf(a)),
    program = descriptor.levProgramId,
    vault = descriptor.vaultProgramId;
  const event = fromHex(v.opened.data);
  event.set(ctx.tradingAccount(trader, 0n)[0].toBytes(), 16);
  event.set(trader.toBytes(), 48);
  event.set(
    await journalGenesisHash(ctx.tradingAccount(trader, 0n)[0].toBytes()),
    100,
  );
  const source = ctx.tokenAccount(trader, "usdc").toBase58(),
    dests = [
      descriptor.usdcPool,
      ctx
        .tokenAccount(new PublicKey(descriptor.vaultSl8Wallet), "usdc")
        .toBase58(),
      ctx.tokenAccount(new PublicKey(descriptor.feeWallet), "usdc").toBase58(),
    ],
    owners = [
      descriptor.vaultState,
      descriptor.vaultSl8Wallet,
      descriptor.feeWallet,
    ],
    amounts = [29700000n, 300000n, 120000n];
  const transfer = (n: number) => {
    const b = new Uint8Array(10);
    b[0] = 12;
    b[9] = 6;
    new DataView(b.buffer).setBigUint64(1, amounts[n], true);
    return {
      programIdIndex: idx(CLASSIC_TOKEN),
      accounts: [
        idx(source),
        idx(descriptor.usdcMint),
        idx(dests[n]),
        idx(wallet),
      ],
      data: bs58.encode(b),
      stackHeight: n === 2 ? "2" : "3",
    };
  };
  const tokenBalance = (a: string, owner: string, amount: bigint) => ({
    accountIndex: idx(a),
    owner,
    mint: descriptor.usdcMint,
    programId: CLASSIC_TOKEN,
    uiTokenAmount: { amount: String(amount), decimals: "6", uiAmount: null },
  });
  const before = [
      tokenBalance(source, wallet, 1000000000n),
      ...dests.map((d, i) => tokenBalance(d, owners[i], 0n)),
    ],
    after = [
      tokenBalance(source, wallet, 969880000n),
      ...dests.map((d, i) => tokenBalance(d, owners[i], amounts[i])),
    ];
  const transaction = {
    slot: "600000003",
    blockTime: null,
    transaction: [b64(packet), "base64"],
    meta: {
      err: null,
      logMessages: [
        `Program ${program} invoke [1]`,
        `Program ${CLASSIC_TOKEN} invoke [2]`,
        `Program ${CLASSIC_TOKEN} success`,
        `Program ${vault} invoke [2]`,
        `Program ${CLASSIC_TOKEN} invoke [3]`,
        `Program ${CLASSIC_TOKEN} success`,
        `Program ${CLASSIC_TOKEN} invoke [3]`,
        `Program ${CLASSIC_TOKEN} success`,
        `Program ${vault} success`,
        `Program ${program} invoke [2]`,
        `Program ${program} success`,
        `Program ${program} success`,
      ],
      innerInstructions: [
        {
          index: "1",
          instructions: [
            transfer(2),
            transfer(0),
            transfer(1),
            {
              programIdIndex: idx(program),
              accounts: [idx(ctx.eventAuthority()[0].toBase58())],
              stackHeight: "2",
              data: bs58.encode(event),
            },
          ],
        },
      ],
      preTokenBalances: before,
      postTokenBalances: after,
    },
  };
  return {
    transaction,
    fetcher: offlineFetch(offlineAccounts(wallet, true), (method) =>
      method === "getSignatureStatuses"
        ? {
            value: [
              { slot: "600000003", err: null, confirmationStatus: "finalized" },
            ],
          }
        : method === "getTransaction"
          ? transaction
          : method === "getSignaturesForAddress"
            ? [{ signature, slot: "600000003", err: null }]
            : undefined,
    ),
  };
}
