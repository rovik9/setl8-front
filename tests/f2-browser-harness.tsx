/* Development-only offline harness, never imported by src/main.tsx or the production build. */
import { createRoot } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { getWallets } from "@wallet-standard/app";
import type { Wallet, WalletAccount } from "@wallet-standard/base";
import { PublicKey } from "@setl8/p30-sdk";
import "@fontsource-variable/outfit";
import "@fontsource/ibm-plex-mono/latin-400.css";
import "../src/styles.css";
import { BuyView } from "../src/pages/Buy";
import { PurchaseFlow } from "../src/buy/purchaseFlow";
import { PublicAttemptStore, browserAttemptLock } from "../src/buy/recovery";
import { PurchasePreflight } from "../src/buy/preflight";
import { DirectRpc } from "../src/buy/rpc";
import { reconcilePurchase } from "../src/buy/receipt";
import { fromHex } from "../src/buy/bytes";
import {
  ephemeral,
  offlineAccounts,
  offlineFetch,
  receiptFixture,
  ctx,
} from "./f2-fixture";
const scenario =
    new URLSearchParams(location.search).get("scenario") ?? "happy",
  signer = await ephemeral(),
  account: WalletAccount = {
    address: signer.address,
    publicKey: new PublicKey(signer.address).toBytes(),
    chains: ["solana:devnet"],
    features: ["solana:signTransaction"],
  };
const listeners = new Set<() => void>();
let packet: Uint8Array | null = null,
  receipt: Awaited<ReturnType<typeof receiptFixture>> | null = null;
const wallet: Wallet = {
  version: "1.0.0",
  name: "Offline test wallet",
  icon: "data:image/svg+xml;base64,PHN2Zy8+",
  chains: ["solana:devnet"],
  get accounts() {
    return [account];
  },
  features: {
    "standard:connect": {
      version: "1.0.0",
      connect: async () => ({ accounts: [account] }),
    },
    "standard:events": {
      version: "1.0.0",
      on: (_event: string, fn: () => void) => {
        listeners.add(fn);
        return () => listeners.delete(fn);
      },
    },
    "standard:disconnect": { version: "1.0.0", disconnect: async () => {} },
    "solana:signTransaction": {
      version: "1.0.0",
      supportedTransactionVersions: ["legacy"],
      signTransaction: async (...inputs: { transaction: Uint8Array }[]) => {
        if (scenario === "reject")
          throw Error("Mock wallet rejected the request");
        packet = await signer.signTransaction(inputs[0].transaction);
        if (scenario === "changed_message") packet[100] ^= 1;
        return [{ signedTransaction: packet }];
      },
    },
    "solana:signAndSendTransaction": {
      version: "1.0.0",
      signAndSendTransaction: () => {
        throw Error("FORBIDDEN signAndSendTransaction");
      },
    },
  },
};
getWallets().register(wallet, {
  ...wallet,
  name: "Unsupported send-only wallet",
  features: {
    "standard:connect": wallet.features["standard:connect"],
    "standard:events": wallet.features["standard:events"],
  },
});
const accounts = offlineAccounts(signer.address);
if (scenario === "missing_ata")
  accounts[ctx.tokenAccount(new PublicKey(signer.address), "usdc").toBase58()] =
    null;
if (scenario === "insufficient_sol") accounts[signer.address]!.lamports = "1";
const rpc = new DirectRpc(offlineFetch(accounts)),
  preflight = new PurchasePreflight(rpc),
  flow = new PurchaseFlow(
    {
      mode: "offline_mock",
      check: (...a) => preflight.check(...a),
      revalidate: (...a) => preflight.revalidate(...a),
      broadcast: async (bytes, signature) => {
        receipt = await receiptFixture(
          signer.address,
          new Uint8Array(bytes),
          signature,
        );
        if (scenario === "lost_send")
          throw Error(
            "Mock send response lost. Outcome uncertain; check again.",
          );
      },
      reconcile: async (a, s) =>
        scenario === "expiry"
          ? reconcilePurchase(rpc, a, s)
          : receipt
            ? reconcilePurchase(new DirectRpc(receipt.fetcher), a, s)
            : reconcilePurchase(rpc, a, s),
    },
    new PublicAttemptStore({
      getItem: (k) => localStorage.getItem(k),
      setItem: (k, v) => localStorage.setItem(k, v),
    }),
    browserAttemptLock,
  );
// Ephemeral key remains only in this page's memory. No storage, report or screenshot contains it.
void fromHex;
createRoot(document.getElementById("root")!).render(
  <MemoryRouter>
    <BuyView flow={flow} />
  </MemoryRouter>,
);
