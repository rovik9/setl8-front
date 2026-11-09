import { afterEach, beforeEach, it, expect, vi } from "vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { getWallets } from "@wallet-standard/app";
import bs58 from "bs58";
import { ApiClient } from "../src/api/client";
import { SessionManager } from "../src/auth/session";
import { AuthProvider } from "../src/auth/context";
import { WalletButton, WalletDialog } from "../src/components/WalletDialog";
import {
  walletChoices,
  type WalletChoice,
  type WalletConnection,
} from "../src/auth/wallet";
import { MyAccountView } from "../src/pages/MyAccount";
import { AccountResource } from "../src/account/resource";
import { BuyView } from "../src/pages/Buy";
import { PurchaseFlow } from "../src/buy/purchaseFlow";
import { PublicAttemptStore } from "../src/buy/recovery";
import { createGatedCheckoutPort } from "../src/buy/checkoutPort";
import type { PurchasePort } from "../src/buy/direct-types";
// This suite injects a controlled AccountResource; SDK derivation has its own node tests.
// Keep view/auth tests independent of jsdom's crypto typed-array realm.
vi.mock("../src/account/data", () => ({
  AccountReader: class {},
  A1_ACCOUNT: "A3ncHBKQRrRNKVaeH9WuhMmwZ22BNoKyeCFsxK6ZwpvU",
  PAGE_SIZE: 10n,
  publicAddress: (value: string) => value,
}));
const wallet = "J95j3drvYgYNrT3cocwSoR8hWd5zsaqVr12eW7UxL7zC",
  other = "7urBRSkXz6jAoz7j4QnVjgWWVLUxV6nzjZxNEWhxkLeF",
  base = "http://127.0.0.1:8788";
const managers: SessionManager[] = [],
  unregisters: (() => void)[] = [];
beforeEach(() => {
  localStorage.clear();
  Object.defineProperty(HTMLDialogElement.prototype, "showModal", {
    configurable: true,
    value: function (this: HTMLDialogElement) {
      this.setAttribute("open", "");
    },
  });
  Object.defineProperty(HTMLDialogElement.prototype, "close", {
    configurable: true,
    value: function (this: HTMLDialogElement) {
      this.removeAttribute("open");
    },
  });
});
afterEach(() => {
  cleanup();
  managers.splice(0).forEach((m) => m.dispose());
  unregisters.splice(0).forEach((f) => f());
  vi.restoreAllMocks();
});
function setup(initial = false) {
  let logged = initial;
  const now = Date.now(),
    session = {
      api_version: "1",
      wallet,
      wallet_hex: "ab".repeat(32),
      csrf_token: "cd".repeat(32),
      expires_unix_s: String(Math.floor(now / 1000) + 3600),
      admin_read: false,
      trading_authority: "actual_trader_signature_per_intent",
      lifecycle_application: "operator_only",
    },
    message = "Exact server nonce message\nWhitespace stays. ",
    paths: { path: string; credentials: RequestCredentials | undefined }[] = [];
  const json = (b: unknown, status = 200) =>
    new Response(JSON.stringify(b), {
      status,
      headers: { "Content-Type": "application/json" },
    });
  const fetcher = vi.fn(
    async (input: RequestInfo | URL, init?: RequestInit) => {
      const path = String(input);
      paths.push({ path, credentials: init?.credentials });
      if (path.endsWith("/challenge")) {
        const b = JSON.parse(String(init?.body));
        return json({
          api_version: "1",
          wallet: b.wallet,
          challenge_id: "01".repeat(32),
          audience: base,
          browser_origin: location.origin,
          issued_unix_s: String(Math.floor(now / 1000)),
          expires_unix_s: String(Math.floor(now / 1000) + 120),
          message,
          encoding: "utf8",
          signature_encoding: "hex_ed25519_64_bytes",
        });
      }
      if (path.endsWith("/login")) {
        const b = JSON.parse(String(init?.body));
        expect(b.message).toBe(message);
        expect(b.signature_hex).toMatch(/^[a-f0-9]{128}$/);
        logged = true;
        return json(session);
      }
      if (path.endsWith("/logout")) {
        logged = false;
        return json({ api_version: "1", logged_out: true });
      }
      return logged
        ? json(session)
        : json({ error: { code: "unauthenticated", message: "Sign in" } }, 401);
    },
  );
  const m = new SessionManager(
    new ApiClient(base, fetcher as typeof fetch),
    location.origin,
    () => now,
  );
  managers.push(m);
  return { m, fetcher, paths, session, message };
}
function connection() {
  let changed: ((a: string | null) => void) | undefined;
  const signMessage = vi.fn(async () => new Uint8Array(64).fill(7)),
    tx = vi.fn(async (b: Uint8Array) => b),
    account = {
      address: wallet,
      publicKey: bs58.decode(wallet),
      chains: ["solana:devnet"] as const,
      features: ["solana:signMessage", "solana:signTransaction"] as const,
    };
  const purchase: import("../src/buy/wallets").DirectWalletConnection = {
    name: "Controlled test wallet",
    accounts: [account],
    signer: () => ({ address: wallet, signTransaction: tx }),
    onChange: () => () => {},
    disconnect: vi.fn(async () => {}),
    dispose: vi.fn(),
  };
  const choice: WalletChoice = {
    name: "Controlled test wallet",
    connect: vi.fn(async () => ({
      address: wallet,
      purchaseConnection: purchase,
      signMessage,
      onChange: (f: Parameters<WalletConnection["onChange"]>[0]) => {
        changed = f;
        return () => {};
      },
      disconnect: vi.fn(async () => {}),
    })),
  };
  return { choice, signMessage, tx, purchase, change: () => changed?.(null) };
}
async function login(
  s: ReturnType<typeof setup>,
  w: ReturnType<typeof connection>,
) {
  await act(async () => {
    await s.m.choose(w.choice);
    await s.m.sign();
  });
}
function wrap(m: SessionManager, node: React.ReactNode) {
  return (
    <MemoryRouter>
      <AuthProvider manager={m}>{node}</AuthProvider>
    </MemoryRouter>
  );
}
it("always shows Connect and honest selectable unavailable-wallet states without requesting login", async () => {
  const s = setup();
  render(
    wrap(
      s.m,
      <>
        <WalletButton />
        <WalletDialog />
      </>,
    ),
  );
  fireEvent.click(screen.getByRole("button", { name: /^Connect wallet$/ }));
  expect(
    await screen.findByText("No wallet detected in this browser."),
  ).toBeTruthy();
  fireEvent.click(
    screen.getByRole("button", { name: /Phantom.*Not detected/i }),
  );
  expect(screen.getByRole("status").textContent).toContain(
    "browser where Phantom is installed",
  );
  expect(s.paths.some((x) => x.path.endsWith("/challenge"))).toBe(false);
});
it("signed nonce session drives the owned dashboard without a paste step; logout clears it", async () => {
  const s = setup(),
    w = connection(),
    read = vi.fn(async (address: string, page: string) => ({
      wallet: address,
      page,
      counter: "0",
      rows: [],
      slots: ["123", "123"],
      observedAt: String(Date.now()),
      rules: null,
      config: null,
      rulesError: null,
      profileFound: false,
    }));
  const resource = new AccountResource({
    mode: "public_read",
    read,
    demo: vi.fn(),
  });
  render(wrap(s.m, <MyAccountView resource={resource} />));
  await waitFor(() => expect(s.m.getSnapshot().phase).toBe("guest"));
  expect(screen.queryByLabelText("Public wallet address")).toBeNull();
  await login(s, w);
  await waitFor(() => expect(read).toHaveBeenCalled());
  expect(read.mock.calls[0][0]).toBe(wallet);
  expect(
    screen.getByText("Your challenges, progress and account history."),
  ).toBeTruthy();
  expect(screen.queryByLabelText("Public wallet address")).toBeNull();
  expect(w.signMessage).toHaveBeenCalledWith(
    new TextEncoder().encode(s.message),
  );
  expect(s.paths.every((x) => x.credentials === "include")).toBe(true);
  await act(async () => {
    await s.m.logout();
  });
  await waitFor(() => expect(resource.getSnapshot().wallet).toBeNull());
  expect(screen.getByText("Your wallet is your sign-in.")).toBeTruthy();
});
it("typed public lookup never authenticates or unlocks checkout/payment", async () => {
  const s = setup(),
    read = vi.fn(async (address: string, page: string) => ({
      wallet: address,
      page,
      counter: "0",
      rows: [],
      slots: ["123", "123"],
      observedAt: String(Date.now()),
      rules: null,
      config: null,
      rulesError: null,
      profileFound: false,
    })),
    resource = new AccountResource({
      mode: "public_read",
      read,
      demo: vi.fn(),
    });
  render(wrap(s.m, <MyAccountView resource={resource} />));
  await waitFor(() => expect(s.m.getSnapshot().phase).toBe("guest"));
  fireEvent.click(
    screen.getByRole("button", {
      name: "Explore a public address — read only",
    }),
  );
  fireEvent.change(screen.getByLabelText("Public wallet address"), {
    target: { value: wallet },
  });
  fireEvent.click(screen.getByRole("button", { name: /View address/ }));
  await waitFor(() => expect(read).toHaveBeenCalled());
  expect(s.m.getSnapshot().session).toBeNull();
  expect(s.m.isPurchaseWallet(wallet)).toBe(false);
  const p = createGatedCheckoutPort(s.m);
  await expect(
    p.check(wallet, "0", 1, new AbortController().signal),
  ).rejects.toThrow("Sign in");
  expect(p.canRequestApproval?.(wallet)).toBe(false);
});
it("session changes immediately invalidate wallet transport instead of accepting a displayed identity", async () => {
  const s = setup(),
    w = connection();
  await s.m.restore();
  await login(s, w);
  expect(s.m.isPurchaseWallet(wallet)).toBe(true);
  expect(s.m.isPurchaseWallet(other)).toBe(false);
  w.change();
  expect(s.m.getSnapshot().session).toBeNull();
  expect(s.m.getPurchaseConnection()).toBeNull();
  expect(w.purchase.dispose).toHaveBeenCalled();
});
it("a changed server session is revoked and cannot carry a previous signing connection", async () => {
  const s = setup(),
    w = connection();
  await s.m.restore();
  await login(s, w);
  s.session.wallet = other;
  await s.m.check();
  expect(s.m.getSnapshot().session).toBeNull();
  expect(s.m.isPurchaseWallet(wallet)).toBe(false);
  expect(s.paths.some((x) => x.path.endsWith("/logout"))).toBe(true);
});
it("Buy cancels an in-flight review on logout and offers no manual payment fallback", async () => {
  const s = setup(),
    w = connection();
  let resolve!: (v: any) => void;
  const check = vi.fn(
      () =>
        new Promise<any>((r) => {
          resolve = r;
        }),
    ),
    port = {
      mode: "gated_live",
      check,
      requiresOwnerReview: true,
      revalidate: vi.fn(),
      broadcast: vi.fn(),
      reconcile: vi.fn(),
    } as unknown as PurchasePort;
  const store = new PublicAttemptStore({
      getItem: () => null,
      setItem: () => {},
    }),
    flow = new PurchaseFlow(port, store, async (f) => f());
  render(wrap(s.m, <BuyView flow={flow} />));
  await waitFor(() => expect(s.m.getSnapshot().phase).toBe("guest"));
  expect(
    screen.queryByLabelText(/recipient|payment address|transaction signature/i),
  ).toBeNull();
  expect(screen.getByText(/Connect your wallet to continue/)).toBeTruthy();
  await login(s, w);
  await waitFor(() => expect(flow.getSnapshot().wallet).toBe(wallet));
  await act(async () => {
    void flow.check();
  });
  expect(check).toHaveBeenCalled();
  await act(async () => {
    await s.m.logout(false);
    resolve(undefined);
  });
  await waitFor(() => expect(flow.getSnapshot().wallet).toBeNull());
  expect(flow.getSnapshot().checked).toBeNull();
  expect(w.tx).not.toHaveBeenCalled();
  expect(port.broadcast).not.toHaveBeenCalled();
});
it("reuses the registered connected account on login and cookie restore without another prompt", async () => {
  const s = setup(),
    a = {
      address: wallet,
      publicKey: bs58.decode(wallet),
      chains: ["solana:devnet"],
      features: ["solana:signMessage", "solana:signTransaction"],
    };
  let accounts: readonly any[] = [];
  const events = new Set<() => void>(),
    connect = vi.fn(async () => {
      accounts = [a];
      return { accounts };
    }),
    sign = vi.fn(async ({ message }: any) => [
      { signedMessage: message, signature: new Uint8Array(64).fill(7) },
    ]);
  const standard = {
    version: "1.0.0",
    name: "Controlled standard wallet",
    icon: "data:image/svg+xml;base64,PHN2Zy8+",
    chains: ["solana:devnet"],
    get accounts() {
      return accounts;
    },
    features: {
      "standard:connect": { version: "1.0.0", connect },
      "standard:disconnect": { version: "1.0.0", disconnect: async () => {} },
      "standard:events": {
        version: "1.0.0",
        on: (_e: any, f: () => void) => {
          events.add(f);
          return () => events.delete(f);
        },
      },
      "solana:signMessage": { version: "1.0.0", signMessage: sign },
      "solana:signTransaction": {
        version: "1.0.0",
        supportedTransactionVersions: ["legacy"],
        signTransaction: vi.fn(),
      },
    },
  };
  unregisters.push(getWallets().register(standard as any));
  await s.m.restore();
  await s.m.choose(walletChoices().find((w) => w.name === standard.name)!);
  await s.m.sign();
  expect(s.m.isPurchaseWallet(wallet)).toBe(true);
  expect(connect).toHaveBeenCalledTimes(1);
  const restored = setup(true);
  await restored.m.restore();
  expect(restored.m.isPurchaseWallet(wallet)).toBe(true);
  expect(connect).toHaveBeenCalledTimes(1);
  expect(sign).toHaveBeenCalledTimes(1);
  events.forEach((f) => f());
  expect(restored.m.getSnapshot().session).toBeNull();
});

it("replaces an out-of-scope purchase action with the permitted tier, retains the wallet, then begins review", async () => {
  const s = setup(),
    w = connection();
  const check = vi.fn(() => new Promise<any>(() => {}));
  const port = {
    mode: "gated_live",
    check,
    canRequestApproval: () => true,
    purchaseRestriction: (_wallet: string, tier: string) =>
      tier === "0"
        ? null
        : "This purchase test permits only the $2,500 account. Choose $2.5K to continue.",
    revalidate: vi.fn(),
    broadcast: vi.fn(),
    reconcile: vi.fn(),
  } as unknown as PurchasePort;
  const flow = new PurchaseFlow(
    port,
    new PublicAttemptStore({ getItem: () => null, setItem: () => {} }),
    async (fn) => fn(),
  );
  render(wrap(s.m, <BuyView flow={flow} />));
  await waitFor(() => expect(s.m.getSnapshot().phase).toBe("guest"));
  await login(s, w);
  await waitFor(() => expect(flow.getSnapshot().wallet).toBe(wallet));
  fireEvent.change(screen.getByLabelText("Choose an account size"), {
    target: { value: "9" },
  });
  expect(screen.getByText(/This purchase test permits only/)).toBeVisible();
  expect(screen.queryByRole("button", { name: "Review total" })).toBeNull();
  expect(check).not.toHaveBeenCalled();
  fireEvent.click(
    screen.getByRole("button", { name: "Use $2.5K test account" }),
  );
  expect(flow.getSnapshot().wallet).toBe(wallet);
  expect(flow.getSnapshot().tier).toBe("0");
  fireEvent.click(screen.getByRole("button", { name: "Review total" }));
  await waitFor(() => expect(check).toHaveBeenCalledTimes(1));
  expect(
    screen.getByRole("button", { name: "Checking purchase…" }),
  ).toBeDisabled();
});
