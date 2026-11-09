import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { webcrypto } from "node:crypto";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import sample from "./fixtures/verified-archive-sample.json";

const SAMPLE_WALLET = sample.wallet;
vi.mock("../src/auth/context", () => ({
  useAuth: () => ({
    session: { wallet: SAMPLE_WALLET },
    epoch: 4,
    manager: {
      getSnapshot: () => ({
        phase: "authenticated",
        epoch: 4,
        session: { wallet: SAMPLE_WALLET },
      }),
    },
  }),
  useOptionalAuth: () => undefined,
}));
vi.mock("../src/account/data", () => ({
  AccountReader: class {},
  A1_ACCOUNT: "A3ncHBKQRrRNKVaeH9WuhMmwZ22BNoKyeCFsxK6ZwpvU",
  PAGE_SIZE: 10n,
  publicAddress: (value: string) => value,
}));
import { BuyView } from "../src/pages/Buy";
import { PurchasePipeline } from "../src/devnet/PipelinePanel";
import { MyAccountView } from "../src/pages/MyAccount";
import { AccountResource } from "../src/account/resource";
import { PurchaseFlow } from "../src/buy/purchaseFlow";
import { ARCHIVE_KEY, PublicAttemptStore } from "../src/buy/recovery";
import type {
  PublicAttempt,
  PurchasePort,
  Reconciliation,
} from "../src/buy/direct-types";

beforeEach(() => {
  vi.stubGlobal("crypto", webcrypto);
  localStorage.clear();
});
afterEach(() => {
  window.history.pushState({}, "", "/");
  cleanup();
  vi.unstubAllGlobals();
});

// ---- the Buy page button ----
const attempt = (stage: PublicAttempt["stage"]) =>
  ({
    format: "setl8-direct-demo-attempt-v1",
    wallet: "J95j3drvYgYNrT3cocwSoR8hWd5zsaqVr12eW7UxL7zC",
    tier: "0",
    size: "2500000000",
    price: "30000000",
    fee: "120000",
    total: "30120000",
    nextChallengeId: "0",
    expectedAccount: "9aLv8BzUCAjYWnAav75K9aeSHnZAKKFu26VmEVyhcYxT",
    signature: "sig",
    signedMessageHex: "00",
    signedMessageSha256: "00",
    priorityFeeLamports: "0",
    stage,
  }) as unknown as PublicAttempt;
function buy(stored: PublicAttempt["stage"], answers: Reconciliation[]) {
  let current: PublicAttempt | null = attempt(stored);
  const release = vi.fn(async (_a: unknown, _e: unknown) => {
      current = null;
    }),
    reconcile = vi.fn(async () => answers.shift()!),
    store = {
      read: async () => current,
      write: async (r: PublicAttempt) => ((current = r), r),
      archiveVerifiedAndRelease: release,
    } as unknown as PublicAttemptStore,
    port = {
      mode: "offline_mock",
      check: vi.fn(),
      revalidate: vi.fn(),
      broadcast: vi.fn(),
      reconcile,
    } as unknown as PurchasePort,
    flow = new PurchaseFlow(port, store, async (f) => f());
  const reload = vi.fn();
  render(
    <MemoryRouter>
      <BuyView flow={flow} reload={reload} />
    </MemoryRouter>,
  );
  return { release, reconcile, reload };
}
const check = async () => {
  const b = await screen.findByRole("button", {
    name: "Check purchase status",
  });
  await waitFor(() => expect(b).toBeEnabled());
  fireEvent.click(b);
};
const another = () =>
  screen.queryByRole("button", { name: "Start another purchase" });
const verifiedAnswer: Reconciliation = {
  state: "verified",
  message: "ok",
  signature: "sig",
  account: "9aLv8BzUCAjYWnAav75K9aeSHnZAKKFu26VmEVyhcYxT",
  actualDebit: "30120000",
};

it("is not offered for a retained attempt that has not been checked, even one stored as verified", async () => {
  for (const stage of [
    "awaiting_wallet",
    "signed",
    "uncertain",
    "finalized_observed",
    "verified",
  ] as const) {
    const { reconcile } = buy(stage, []);
    await screen.findByRole("button", { name: "Check purchase status" });
    expect(another(), stage).toBeNull();
    expect(reconcile).not.toHaveBeenCalled();
    cleanup();
  }
});
it.each([
  ["uncertain", { state: "uncertain", message: "x" }],
  ["confirmed", { state: "confirmed", message: "x", signature: "sig" }],
  ["finalized_observed", { ...verifiedAnswer, state: "finalized_observed" }],
] as [string, Reconciliation][])(
  "is not offered after a status check that returns %s",
  async (_n, answer) => {
    const { reconcile } = buy("signed", [answer]);
    await check();
    await waitFor(() => expect(reconcile).toHaveBeenCalledTimes(1));
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Check purchase status" }),
      ).toBeEnabled(),
    );
    expect(another()).toBeNull();
  },
);
it("is offered only after a check returned verified; it re-verifies, releases, and the page returns to a fresh purchase", async () => {
  const { release, reconcile, reload } = buy("signed", [
    verifiedAnswer,
    verifiedAnswer,
  ]);
  await check();
  const button = await screen.findByRole("button", {
    name: "Start another purchase",
  });
  expect(reconcile).toHaveBeenCalledTimes(1);
  await waitFor(() => expect(button).toBeEnabled());
  fireEvent.click(button);
  await waitFor(() => expect(release).toHaveBeenCalledTimes(1));
  expect(reconcile).toHaveBeenCalledTimes(2); // fresh evidence at release time
  expect(release.mock.calls[0][1]).toMatchObject({
    state: "verified",
    signature: "sig",
  });
  await waitFor(() => expect(another()).toBeNull());
  expect(
    screen.queryByRole("button", { name: "Check purchase status" }),
  ).toBeNull();
  // a fresh page (fresh checkout port, so its one-send-per-load guard is not reused) follows the release
  await waitFor(() => expect(reload).toHaveBeenCalledTimes(1));
});
it("a second check that is no longer verified keeps the lock and says why", async () => {
  const { release, reload } = buy("signed", [
    verifiedAnswer,
    { state: "uncertain", message: "provider lagging" },
  ]);
  await check();
  fireEvent.click(
    await screen.findByRole("button", { name: "Start another purchase" }),
  );
  expect(await screen.findByRole("alert")).toHaveTextContent(
    /stays locked.*provider lagging/,
  );
  expect(release).not.toHaveBeenCalled();
  expect(reload).not.toHaveBeenCalled();
});

// ---- recovery and dashboard views keep showing archived verified purchases ----
it("the recovery view lists an archived verified purchase after its lock is gone", async () => {
  localStorage.setItem(ARCHIVE_KEY, sample.archive);
  render(
    <MemoryRouter>
      <PurchasePipeline />
    </MemoryRouter>,
  );
  const summary = await screen.findByText("Verified purchases (1)");
  expect(summary).toBeInTheDocument();
  expect(screen.getByText(sample.expectedAccount)).toBeInTheDocument();
  expect(screen.getByText(sample.signature)).toBeInTheDocument();
});
it("another wallet's archived purchase is not shown, and a tampered archive is reported instead of trusted", async () => {
  const other = JSON.parse(sample.archive);
  other.records[0].record.wallet =
    "7urBRSkXz6jAoz7j4QnVjgWWVLUxV6nzjZxNEWhxkLeF";
  localStorage.setItem(ARCHIVE_KEY, JSON.stringify(other));
  render(
    <MemoryRouter>
      <PurchasePipeline />
    </MemoryRouter>,
  );
  // digest no longer matches: refused, shown as an alert, never listed
  expect(await screen.findByRole("alert")).toHaveTextContent(
    /archive integrity/,
  );
  expect(screen.queryByText(/Verified purchases/)).toBeNull();
});
it("the dashboard marks the archived purchase's account row", async () => {
  localStorage.setItem(ARCHIVE_KEY, sample.archive);
  const row = {
    state: "checked",
    address: sample.expectedAccount,
    reason: "Account found",
    account: null,
  };
  const resource = new AccountResource({
    mode: "public_read",
    read: vi.fn(async (address: string, page: string) => ({
      wallet: address,
      page,
      counter: "1",
      rows: [row],
      slots: ["1", "1"],
      observedAt: String(Date.now()),
      rules: null,
      config: null,
      rulesError: null,
      profileFound: true,
    })) as any,
    demo: vi.fn(),
  });
  // The page reads the address from window.location (public read-only lookup of the wallet).
  window.history.pushState({}, "", "/my-account?wallet=" + sample.wallet);
  render(
    <MemoryRouter>
      <MyAccountView
        resource={resource}
        walletChoices={() => []}
        watch={() => () => {}}
      />
    </MemoryRouter>,
  );
  await waitFor(() =>
    expect(document.body.textContent).toMatch(
      /Matches a verified purchase you made/,
    ),
  );
});

it("a damaged archive is reported beside a live purchase's panel instead of replacing it", async () => {
  const bad = JSON.parse(sample.archive);
  bad.digest = "00".repeat(32);
  localStorage.setItem(ARCHIVE_KEY, JSON.stringify(bad));
  const live = JSON.parse(sample.archive).records[0].record as PublicAttempt;
  render(
    <MemoryRouter>
      <PurchasePipeline attempt={live} />
    </MemoryRouter>,
  );
  expect(await screen.findByRole("alert")).toHaveTextContent(
    /archive integrity/,
  );
  expect(
    await screen.findByRole("button", { name: "Verify original purchase" }),
  ).toBeInTheDocument();
  expect(screen.queryByText(/Verified purchases/)).toBeNull();
});
