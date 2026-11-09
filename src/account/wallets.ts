import { getWallets } from "@wallet-standard/app";
import type { WalletAccount } from "@wallet-standard/base";
import type {
  StandardConnectFeature,
  StandardEventsFeature,
} from "@wallet-standard/features";
import { publicAddress } from "./data";
export interface ReadWallet {
  name: string;
  connect(): Promise<{
    accounts: readonly WalletAccount[];
    onChange(fn: () => void): () => void;
  }>;
}
/** Connect-only. No message/transaction signing capabilities are read or exposed. */
export function readWallets(): ReadWallet[] {
  return getWallets()
    .get()
    .filter(
      (w) =>
        w.chains.includes("solana:devnet") &&
        typeof (w.features as StandardConnectFeature)["standard:connect"]
          ?.connect === "function" &&
        typeof (w.features as StandardEventsFeature)["standard:events"]?.on ===
          "function",
    )
    .map((w) => ({
      name: w.name,
      async connect() {
        const result = await (w.features as StandardConnectFeature)[
          "standard:connect"
        ].connect();
        const accounts = result.accounts.filter((a) => {
          try {
            return (
              publicAddress(a.address) === a.address &&
              a.chains.includes("solana:devnet")
            );
          } catch {
            return false;
          }
        });
        if (!accounts.length)
          throw Error("Choose a Solana devnet account in your wallet.");
        return {
          accounts,
          onChange: (fn: () => void) =>
            (w.features as StandardEventsFeature)["standard:events"].on(
              "change",
              fn,
            ),
        };
      },
    }));
}
export function watchReadWallets(fn: () => void) {
  const r = getWallets(),
    a = r.on("register", fn),
    b = r.on("unregister", fn);
  return () => {
    a();
    b();
  };
}
