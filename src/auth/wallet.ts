import { directConnection, type DirectWalletConnection } from "../buy/wallets";
import { prototypeEnabled, prototypeBridge } from "../prototype/profile";
import bs58 from "bs58";
import { getWallets } from "@wallet-standard/app";
import type { Wallet, WalletAccount } from "@wallet-standard/base";
import type {
  StandardConnectFeature,
  StandardDisconnectFeature,
  StandardEventsFeature,
} from "@wallet-standard/features";
import type { SolanaSignMessageFeature } from "@solana/wallet-standard-features";
export interface WalletConnection {
  address: string;
  purchaseConnection?: DirectWalletConnection;
  purchaseUnavailable?: string;
  signMessage(message: Uint8Array): Promise<Uint8Array>;
  onChange(fn: (address: string | null) => void): () => void;
  disconnect(): Promise<void>;
}
export interface WalletChoice {
  name: string;
  unsupported?: string | null;
  connect(): Promise<WalletConnection>;
}
type Features = StandardConnectFeature &
  StandardDisconnectFeature &
  StandardEventsFeature &
  SolanaSignMessageFeature;
function connectedStandard(
  wallet: Wallet,
  account: WalletAccount,
): WalletConnection {
  const features = wallet.features as Features;
  let purchaseConnection: DirectWalletConnection | undefined;
  let purchaseUnavailable: string | undefined;
  try {
    purchaseConnection = directConnection(wallet, [account]);
  } catch (error) {
    purchaseUnavailable =
      error instanceof Error
        ? error.message
        : "Transaction signing is unavailable for this wallet.";
  }
  return {
    address: account.address,
    purchaseConnection,
    purchaseUnavailable,
    async signMessage(message) {
      const [signed] = await features["solana:signMessage"].signMessage({
        account,
        message,
      });
      if (
        !signed ||
        signed.signature.length !== 64 ||
        signed.signedMessage.length !== message.length ||
        !signed.signedMessage.every((b, i) => b === message[i])
      )
        throw Error(
          "The wallet returned a different message or an invalid signature.",
        );
      return signed.signature;
    },
    onChange: (fn) => features["standard:events"].on("change", () => fn(null)),
    disconnect: async () => {
      purchaseConnection?.dispose();
      await features["standard:disconnect"]?.disconnect();
    },
  };
}
function standardChoice(wallet: Wallet): WalletChoice {
  const supported =
    wallet.chains.some((c) => c.startsWith("solana:")) &&
    ["standard:connect", "standard:events", "solana:signMessage"].every(
      (k) => k in wallet.features,
    );
  return {
    name: wallet.name,
    unsupported: supported
      ? null
      : "This wallet cannot sign in with a Solana message.",
    async connect() {
      if (!supported)
        throw Error("This wallet cannot sign in with a Solana message.");
      const result = await (wallet.features as Features)[
        "standard:connect"
      ].connect();
      const solana = result.accounts.filter(
        (a) =>
          a.chains.some((c) => c.startsWith("solana:")) &&
          a.features.includes("solana:signMessage"),
      );
      const account =
        solana.find((a) => {
          try {
            const connected = directConnection(wallet, [a]);
            connected.dispose();
            return true;
          } catch {
            return false;
          }
        }) ?? solana[0];
      if (!account) throw Error("Choose a Solana account in your wallet.");
      return connectedStandard(wallet, account);
    },
  };
}
/** Restore only an already authorized matching provider/account; never call connect or sign. */
export function connectedSessionWallet(
  address: string,
): WalletConnection | null {
  if (typeof window === "undefined") return null;
  let messageOnly: WalletConnection | null = null;
  for (const wallet of getWallets().get()) {
    if (standardChoice(wallet).unsupported) continue;
    const account = wallet.accounts.find(
      (a) =>
        a.address === address && a.chains.some((c) => c.startsWith("solana:")),
    );
    if (account) {
      const connection = connectedStandard(wallet, account);
      if (connection.purchaseConnection) return connection;
      messageOnly ??= connection;
    }
  }
  for (const [name, provider] of [
    ["Phantom", window.phantom?.solana],
    ["Solflare", window.solflare],
  ] as const) {
    if (provider?.publicKey?.toString() === address)
      return connectedInjected(name, provider, address);
  }
  return messageOnly;
}
export interface InjectedProvider {
  publicKey?: { toString(): string } | null;
  connect(): Promise<{ publicKey: { toString(): string } }>;
  signMessage(
    bytes: Uint8Array,
    encoding?: string,
  ): Promise<{ signature: Uint8Array } | Uint8Array>;
  signTransaction?(
    transaction: import("@solana/web3.js").Transaction,
  ): Promise<import("@solana/web3.js").Transaction>;
  disconnect(): Promise<void>;
  on(event: string, fn: (key?: { toString(): string } | null) => void): void;
  removeListener(
    event: string,
    fn: (key?: { toString(): string } | null) => void,
  ): void;
}
declare global {
  interface Window {
    phantom?: { solana?: InjectedProvider };
    solflare?: InjectedProvider;
  }
}
/** Injected signing accepts the exact legacy packet prepared and verified by checkout. */
function connectedInjected(
  name: string,
  provider: InjectedProvider,
  address: string,
): WalletConnection {
  const publicKey = bs58.decode(address);
  if (publicKey.length !== 32) throw Error("Choose a valid Solana account.");
  let changed = false;
  const change = () => {
    changed = true;
  };
  const events = [
    "accountChanged",
    "disconnect",
    "chainChanged",
    "networkChanged",
  ];
  const account: WalletAccount = {
    address,
    publicKey,
    chains: ["solana:devnet"],
    features: [
      "solana:signMessage",
      ...(provider.signTransaction ? ["solana:signTransaction" as const] : []),
    ],
  };
  let disposed = false;
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    events.forEach((e) => provider.removeListener(e, change));
  };
  const purchaseConnection: DirectWalletConnection | undefined =
    provider.signTransaction
      ? {
          name,
          accounts: [account],
          signer(selected) {
            if (selected !== account)
              throw Error("Choose the connected wallet account.");
            return {
              address,
              async signTransaction(packet) {
                if (
                  changed ||
                  disposed ||
                  provider.publicKey?.toString() !== address
                )
                  throw Error("Wallet account changed. Review again.");
                const { Transaction } = await import("@solana/web3.js");
                if (
                  changed ||
                  disposed ||
                  provider.publicKey?.toString() !== address
                )
                  throw Error("Wallet account changed. Review again.");
                const signed = await provider.signTransaction!(
                  Transaction.from(new Uint8Array(packet)),
                );
                return new Uint8Array(
                  signed.serialize({
                    requireAllSignatures: true,
                    verifySignatures: true,
                  }),
                );
              },
            };
          },
          onChange(fn) {
            events.forEach((e) => provider.on(e, fn));
            return () => events.forEach((e) => provider.removeListener(e, fn));
          },
          dispose,
          async disconnect() {
            dispose();
            await provider.disconnect();
          },
        }
      : undefined;
  if (purchaseConnection) events.forEach((e) => provider.on(e, change));
  return {
    address,
    purchaseConnection,
    purchaseUnavailable: purchaseConnection
      ? undefined
      : "This wallet supports sign-in but does not provide transaction signing.",
    async signMessage(bytes) {
      const result = await provider.signMessage(bytes, "utf8");
      return result instanceof Uint8Array ? result : result.signature;
    },
    onChange(fn) {
      const changed = () => fn(null);
      events.forEach((e) => provider.on(e, changed));
      return () => events.forEach((e) => provider.removeListener(e, changed));
    },
    async disconnect() {
      dispose();
      await provider.disconnect();
    },
  };
}
function injectedChoice(
  name: string,
  provider: InjectedProvider,
): WalletChoice {
  return {
    name,
    async connect() {
      const { publicKey } = await provider.connect();
      // A Standard registration may become available during the connect call.
      const standard = getWallets()
        .get()
        .find(
          (w) =>
            w.name.toLowerCase().includes(name.toLowerCase()) &&
            w.accounts.some((a) => a.address === publicKey.toString()),
        );
      const account = standard?.accounts.find(
        (a) =>
          a.address === publicKey.toString() &&
          a.features.includes("solana:signMessage"),
      );
      if (standard && account) {
        const connection = connectedStandard(standard, account);
        if (connection.purchaseConnection) return connection;
      }
      return connectedInjected(name, provider, publicKey.toString());
    },
  };
}
export function walletChoices(): WalletChoice[] {
  if (prototypeEnabled()) {
    const bridge = prototypeBridge();
    return bridge
      ? [
          {
            name: "Disposable synthetic wallet",
            connect: async () => ({
              address: bridge.info.wallet,
              signMessage: async (message) =>
                Uint8Array.from(await bridge.signLogin(Array.from(message))),
              onChange: () => () => {},
              disconnect: async () => {},
            }),
          },
        ]
      : [];
  }
  const wallets = getWallets().get();
  const choices = wallets.map(standardChoice);
  if (window.phantom?.solana && !choices.some((w) => /phantom/i.test(w.name)))
    choices.push(injectedChoice("Phantom", window.phantom.solana));
  if (window.solflare && !choices.some((w) => /solflare/i.test(w.name)))
    choices.push(injectedChoice("Solflare", window.solflare));
  return choices;
}
export function watchWallets(update: () => void) {
  const registry = getWallets();
  const off1 = registry.on("register", update);
  const off2 = registry.on("unregister", update);
  return () => {
    off1();
    off2();
  };
}
