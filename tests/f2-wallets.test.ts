// @vitest-environment node
import { it, expect, vi } from "vitest";
import type { Wallet, WalletAccount } from "@wallet-standard/base";
import { PublicKey } from "@setl8/p30-sdk";
import { directChoice } from "../src/buy/wallets";
function fixture() {
  const account: WalletAccount = {
      address: "11111111111111111111111111111111",
      publicKey: new PublicKey("11111111111111111111111111111111").toBytes(),
      chains: ["solana:devnet"],
      features: ["solana:signTransaction"],
    },
    events = new Set<() => void>(),
    sign = vi.fn(async () => [
      { signedTransaction: new Uint8Array([1, 2, 3]) },
    ]),
    send = vi.fn(() => {
      throw Error("Must never send through wallet");
    });
  const wallet: Wallet = {
    version: "1.0.0",
    name: "Mock standard",
    icon: "data:image/svg+xml;base64,PHN2Zy8+",
    chains: ["solana:devnet"],
    accounts: [account],
    features: {
      "standard:connect": { connect: async () => ({ accounts: [account] }) },
      "standard:events": {
        on: (_event: string, fn: () => void) => {
          events.add(fn);
          return () => events.delete(fn);
        },
      },
      "solana:signTransaction": {
        supportedTransactionVersions: ["legacy"],
        signTransaction: sign,
      },
      "solana:signAndSendTransaction": { signAndSendTransaction: send },
    },
  };
  return { wallet, account, events, sign, send };
}
it("signs only the explicit devnet account using signTransaction", async () => {
  const f = fixture(),
    c = await directChoice(f.wallet).connect();
  expect(
    await c.signer(f.account).signTransaction(new Uint8Array([5])),
  ).toEqual(new Uint8Array([1, 2, 3]));
  expect(f.sign).toHaveBeenCalledWith({
    account: f.account,
    transaction: new Uint8Array([5]),
    chain: "solana:devnet",
  });
  expect(f.send).not.toHaveBeenCalled();
  c.dispose();
  expect(f.events.size).toBe(0);
});
it("account/network events invalidate a captured signer", async () => {
  const f = fixture(),
    c = await directChoice(f.wallet).connect(),
    s = c.signer(f.account);
  for (const fn of f.events) fn();
  await expect(s.signTransaction(new Uint8Array())).rejects.toThrow("changed");
  expect(f.sign).not.toHaveBeenCalled();
  c.dispose();
});
it.each(["send_only", "wrong_chain", "no_legacy", "malformed"])(
  "lists %s wallets as unsupported",
  async (kind) => {
    const f = fixture();
    const features = { ...f.wallet.features };
    if (kind === "send_only") delete features["solana:signTransaction"];
    if (kind === "no_legacy")
      features["solana:signTransaction"] = {
        supportedTransactionVersions: [0],
        signTransaction: f.sign,
      };
    if (kind === "malformed")
      features["solana:signTransaction"] = { signTransaction: f.sign };
    const choice = directChoice({
      ...f.wallet,
      features,
      ...(kind === "wrong_chain"
        ? { chains: ["solana:mainnet"] as const }
        : {}),
    });
    expect(choice.unsupported).toBeTruthy();
    await expect(choice.connect()).rejects.toThrow();
    expect(f.sign).not.toHaveBeenCalled();
  },
);
