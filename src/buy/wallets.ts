import { getWallets } from "@wallet-standard/app";
import type { Wallet, WalletAccount } from "@wallet-standard/base";
import type {
  StandardConnectFeature,
  StandardEventsFeature,
  StandardDisconnectFeature,
} from "@wallet-standard/features";
import type { SolanaSignTransactionFeature } from "@solana/wallet-standard-features";
import bs58 from "bs58";
import { same } from "./bytes";
import type { PurchaseSigner } from "./purchaseFlow";
type Features = StandardConnectFeature &
  StandardEventsFeature &
  Partial<StandardDisconnectFeature> &
  SolanaSignTransactionFeature;
export interface DirectWalletConnection {
  name: string;
  accounts: readonly WalletAccount[];
  signer(account: WalletAccount): PurchaseSigner;
  onChange(fn: () => void): () => void;
  disconnect(): Promise<void>;
  dispose(): void;
}
export interface DirectWalletChoice {
  name: string;
  unsupported: string | null;
  connect(): Promise<DirectWalletConnection>;
}
function validAccount(a: WalletAccount) {
  try {
    return (
      a.chains.includes("solana:devnet") &&
      a.features.includes("solana:signTransaction") &&
      same(bs58.decode(a.address), new Uint8Array(a.publicKey)) &&
      a.publicKey.length === 32
    );
  } catch {
    return false;
  }
}
function unsupportedReason(wallet: Wallet): string | null {
  const f = wallet.features as Features;
  return !wallet.chains.includes("solana:devnet")
    ? "Does not advertise Solana devnet"
    : typeof f["standard:connect"]?.connect !== "function" ||
        typeof f["standard:events"]?.on !== "function"
      ? "Wallet connection/events are unavailable"
      : typeof f["solana:signTransaction"]?.signTransaction !== "function"
        ? "Requires signTransaction; signing and sending together is unsupported"
        : !Array.isArray(
              f["solana:signTransaction"].supportedTransactionVersions,
            ) ||
            !f["solana:signTransaction"].supportedTransactionVersions.includes(
              "legacy",
            )
          ? "Legacy transaction signing is unavailable"
          : null;
}
/** Adopt an already connected Wallet Standard account; this never connects or prompts. */
export function directConnection(
  wallet: Wallet,
  connectedAccounts: readonly WalletAccount[],
): DirectWalletConnection {
  const unsupported = unsupportedReason(wallet);
  if (unsupported) throw Error(unsupported);
  const f = wallet.features as Features,
    accounts = connectedAccounts.filter(validAccount);
  if (!accounts.length)
    throw Error(
      "Choose a devnet account supporting transaction signing in your wallet.",
    );
  let changed = false;
  const off = f["standard:events"].on("change", () => {
    changed = true;
  });
  return {
    name: wallet.name,
    accounts,
    signer(account) {
      if (!accounts.includes(account))
        throw Error("Choose a connected wallet account.");
      return {
        address: account.address,
        async signTransaction(transaction) {
          if (
            changed ||
            !wallet.accounts.some(
              (a) => a.address === account.address && validAccount(a),
            )
          )
            throw Error("Wallet account changed. Reconnect and review.");
          const result = await f["solana:signTransaction"].signTransaction({
            account,
            transaction: new Uint8Array(transaction),
            chain: "solana:devnet",
          });
          if (
            result.length !== 1 ||
            !(result[0].signedTransaction instanceof Uint8Array)
          )
            throw Error("Wallet signing response is incomplete.");
          return new Uint8Array(result[0].signedTransaction);
        },
      };
    },
    onChange(fn) {
      return f["standard:events"].on("change", fn);
    },
    dispose: off,
    async disconnect() {
      off();
      await f["standard:disconnect"]?.disconnect();
    },
  };
}
export function directChoice(wallet: Wallet): DirectWalletChoice {
  const f = wallet.features as Features,
    unsupported = unsupportedReason(wallet);
  return {
    name: wallet.name,
    unsupported,
    async connect() {
      if (unsupported) throw Error(unsupported);
      const result = await f["standard:connect"].connect();
      return directConnection(wallet, result.accounts);
    },
  };
}
export const directWalletChoices = () => getWallets().get().map(directChoice);
export function watchDirectWallets(fn: () => void) {
  const r = getWallets(),
    a = r.on("register", fn),
    b = r.on("unregister", fn);
  return () => {
    a();
    b();
  };
}
