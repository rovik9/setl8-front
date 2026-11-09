// @vitest-environment node
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { getWallets } from "@wallet-standard/app";
import { Keypair, SystemProgram, Transaction } from "@solana/web3.js";
import {
  connectedSessionWallet,
  walletChoices,
  type InjectedProvider,
} from "../src/auth/wallet";

getWallets();
beforeEach(() =>
  vi.stubGlobal("window", { location: { origin: "http://localhost:3000" } }),
);
const unregister: (() => void)[] = [];
afterEach(() => {
  unregister.splice(0).forEach((off) => off());
  delete window.phantom;
  delete window.solflare;
});
function injected(signing = true) {
  const key = Keypair.generate();
  const listeners = new Map<string, Set<Function>>();
  const sign = vi.fn(async (transaction: Transaction) => {
    transaction.partialSign(key);
    return transaction;
  });
  const provider: InjectedProvider = {
    publicKey: key.publicKey,
    connect: vi.fn(async () => ({ publicKey: key.publicKey })),
    signMessage: vi.fn(async () => new Uint8Array(64)),
    ...(signing ? { signTransaction: sign } : {}),
    disconnect: vi.fn(async () => {}),
    on(event, fn) {
      if (!listeners.has(event)) listeners.set(event, new Set());
      listeners.get(event)!.add(fn);
    },
    removeListener(event, fn) {
      listeners.get(event)?.delete(fn);
    },
  };
  window.phantom = { solana: provider };
  return {
    key,
    provider,
    sign,
    change: () => listeners.get("accountChanged")?.forEach((fn) => fn()),
  };
}
it("adopts injected legacy signing on the first login connection, with a separate transaction prompt", async () => {
  const { key, provider, sign } = injected();
  const connection = await walletChoices()
    .find((w) => w.name === "Phantom")!
    .connect();
  expect(provider.connect).toHaveBeenCalledTimes(1);
  expect(sign).not.toHaveBeenCalled();
  const direct = connection.purchaseConnection!;
  expect(direct.accounts[0].address).toBe(connection.address);
  const tx = new Transaction({
    feePayer: key.publicKey,
    recentBlockhash: "11111111111111111111111111111111",
  }).add(
    SystemProgram.transfer({
      fromPubkey: key.publicKey,
      toPubkey: Keypair.generate().publicKey,
      lamports: 1,
    }),
  );
  const packet = new Uint8Array(
    tx.serialize({ requireAllSignatures: false, verifySignatures: false }),
  );
  const result = await direct
    .signer(direct.accounts[0])
    .signTransaction(packet);
  expect(Transaction.from(result).serializeMessage()).toEqual(
    tx.serializeMessage(),
  );
  expect(Transaction.from(result).verifySignatures()).toBe(true);
  expect(sign).toHaveBeenCalledTimes(1);
  direct.dispose();
});
it("restores only an already authorized matching injected wallet without reconnecting or signing", () => {
  const { key, provider, sign } = injected();
  const restored = connectedSessionWallet(key.publicKey.toBase58())!;
  expect(restored.purchaseConnection).toBeDefined();
  expect(provider.connect).not.toHaveBeenCalled();
  expect(sign).not.toHaveBeenCalled();
  expect(
    connectedSessionWallet(Keypair.generate().publicKey.toBase58()),
  ).toBeNull();
  restored.purchaseConnection!.dispose();
});
it("retains message-only login with an accurate reason and blocks a changed injected account before signing", async () => {
  const messageOnly = injected(false);
  const connection = await walletChoices()
    .find((w) => w.name === "Phantom")!
    .connect();
  expect(connection.purchaseConnection).toBeUndefined();
  expect(connection.purchaseUnavailable).toMatch(
    /does not provide transaction signing/,
  );
  await expect(
    connection.signMessage(new Uint8Array([1])),
  ).resolves.toHaveLength(64);
  const current = injected();
  const signed = await walletChoices()
    .find((w) => w.name === "Phantom")!
    .connect();
  current.change();
  await expect(
    signed
      .purchaseConnection!.signer(signed.purchaseConnection!.accounts[0])
      .signTransaction(new Uint8Array()),
  ).rejects.toThrow(/changed/);
  expect(current.sign).not.toHaveBeenCalled();
  signed.purchaseConnection!.dispose();
});
it("selects the authorized devnet signing account when a message-only account comes first", async () => {
  const keys = [Keypair.generate(), Keypair.generate()];
  const accounts = keys.map((key, i) => ({
    address: key.publicKey.toBase58(),
    publicKey: key.publicKey.toBytes(),
    chains: i ? ["solana:devnet"] : ["solana:mainnet"],
    features: i
      ? ["solana:signMessage", "solana:signTransaction"]
      : ["solana:signMessage"],
  }));
  const wallet: any = {
    version: "1.0.0",
    name: "Multiple accounts",
    icon: "data:image/svg+xml;base64,PHN2Zy8+",
    chains: ["solana:mainnet", "solana:devnet"],
    accounts,
    features: {
      "standard:connect": { connect: vi.fn(async () => ({ accounts })) },
      "standard:events": { on: () => () => {} },
      "solana:signMessage": { signMessage: vi.fn() },
      "solana:signTransaction": {
        supportedTransactionVersions: ["legacy"],
        signTransaction: vi.fn(),
      },
    },
  };
  unregister.push(getWallets().register(wallet));
  const connection = await walletChoices()
    .find((w) => w.name === wallet.name)!
    .connect();
  expect(connection.address).toBe(accounts[1].address);
  expect(connection.purchaseConnection?.accounts[0].address).toBe(
    accounts[1].address,
  );
  expect(
    wallet.features["solana:signTransaction"].signTransaction,
  ).not.toHaveBeenCalled();
  connection.purchaseConnection!.dispose();
});
