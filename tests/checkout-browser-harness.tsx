/** Explicit development-only checkout fixture; production main never imports it. */
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
import { createOfflineCheckoutPort } from "../src/buy/checkoutPort";
import { PurchasePreflight } from "../src/buy/preflight";
import { DirectRpc } from "../src/buy/rpc";
import { ephemeral, offlineAccounts, offlineFetch } from "./f2-fixture";
const signer = await ephemeral(),
  account: WalletAccount = {
    address: signer.address,
    publicKey: new PublicKey(signer.address).toBytes(),
    chains: ["solana:devnet"],
    features: ["solana:signTransaction"],
  };
const wallet: Wallet = {
  version: "1.0.0",
  name: "Offline checkout wallet",
  icon: "data:image/svg+xml;base64,PHN2Zy8+",
  chains: ["solana:devnet"],
  accounts: [account],
  features: {
    "standard:connect": { connect: async () => ({ accounts: [account] }) },
    "standard:events": { on: () => () => {} },
    "solana:signTransaction": {
      supportedTransactionVersions: ["legacy"],
      signTransaction: async (...a: { transaction: Uint8Array }[]) => [
        { signedTransaction: await signer.signTransaction(a[0].transaction) },
      ],
    },
  },
};
getWallets().register(wallet);
const store = new PublicAttemptStore({
    getItem: (k) => localStorage.getItem(k),
    setItem: (k, v) => localStorage.setItem(k, v),
  }),
  calls: { method: string; sigVerify?: boolean }[] = [];
const base = offlineFetch(offlineAccounts(signer.address));
const fetcher = (async (url, init) => {
  const q = JSON.parse(String(init?.body));
  if (q.method === "simulateTransaction") {
    calls.push({ method: q.method, sigVerify: q.params[1].sigVerify });
    return new Response(
      JSON.stringify({
        jsonrpc: "2.0",
        id: q.id,
        result: {
          context: { slot: "600000002" },
          value: {
            err: null,
            unitsConsumed: "50000",
            logs: ["Program success"],
          },
        },
      }),
    );
  }
  if (q.method === "sendTransaction") {
    calls.push({ method: q.method });
    const retained = await store.read();
    if (!retained?.signature) throw Error("Exact signature was not retained");
    return new Response(
      JSON.stringify({ jsonrpc: "2.0", id: q.id, result: retained.signature }),
    );
  }
  return base(url, init);
}) as typeof fetch;
Object.defineProperty(window, "__CHECKOUT_FIXTURE_COUNTS__", { value: calls });
const preflight = new PurchasePreflight(new DirectRpc(fetcher)),
  flow = new PurchaseFlow(
    createOfflineCheckoutPort(fetcher, preflight),
    store,
    browserAttemptLock,
  );
createRoot(document.getElementById("root")!).render(
  <MemoryRouter>
    <BuyView flow={flow} />
  </MemoryRouter>,
);
