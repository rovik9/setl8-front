import { getWallets } from "@wallet-standard/app";
import type { Wallet, WalletAccount } from "@wallet-standard/base";
import type {
  StandardConnectFeature,
  StandardEventsFeature,
  StandardDisconnectFeature,
} from "@wallet-standard/features";
import type { SolanaSignMessageFeature } from "@solana/wallet-standard-features";
import { keyHex, assertPurchaseScope } from "../purchase/consumer/runtime";
import { P30_PROFILE } from "../purchase/isolated/profile";
export type LoginFeatures = StandardConnectFeature &
  StandardEventsFeature &
  SolanaSignMessageFeature &
  Partial<StandardDisconnectFeature>;
export const walletRegistry = () => getWallets();
export function discoverLoginWallets() {
  return getWallets()
    .get()
    .filter((w) =>
      ["standard:connect", "standard:events", "solana:signMessage"].every(
        (k) => k in w.features,
      ),
    );
}
export function checkLoginAccount(w: Wallet, a: WalletAccount) {
  const f = w.features as LoginFeatures;
  if (
    !w.chains.includes("solana:devnet") ||
    !a.chains.includes("solana:devnet") ||
    !a.features.includes("solana:signMessage") ||
    !["1.0.0", "1.1.0"].includes(f["solana:signMessage"]?.version)
  )
    throw Error(
      "Choose an account that supports Solana devnet message signing.",
    );
  assertPurchaseScope({
    wallet: a.address,
    deploymentId: P30_PROFILE.deployment,
    sessionEpoch: 0,
    evidencePurpose: "chain_observation",
  });
  if (
    a.publicKey.length !== 32 ||
    Array.from(a.publicKey, (n) => n.toString(16).padStart(2, "0")).join("") !==
      keyHex(a.address)
  )
    throw Error("The wallet account address does not match its public key.");
}
export function loginAccounts(w: Wallet, accounts: readonly WalletAccount[]) {
  return accounts.filter((a) => {
    try {
      checkLoginAccount(w, a);
      return true;
    } catch {
      return false;
    }
  });
}
