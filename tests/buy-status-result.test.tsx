import { afterEach, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { BuyView } from "../src/pages/Buy";
import { PurchaseFlow } from "../src/buy/purchaseFlow";
import type {
  PublicAttempt,
  PurchasePort,
  Reconciliation,
} from "../src/buy/direct-types";

afterEach(cleanup);
// A retained attempt as the page sees it after a reload; reconcile itself is covered in reconcile-priority.test.ts.
const attempt = {
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
  stage: "signed",
} as unknown as PublicAttempt;
function view(results: Reconciliation[]) {
  const written: unknown[] = [],
    reconcile = vi.fn(async () => results.shift()!),
    port = {
      mode: "offline_mock",
      check: vi.fn(),
      revalidate: vi.fn(),
      broadcast: vi.fn(),
      reconcile,
    } as unknown as PurchasePort,
    store = {
      read: async () => attempt,
      write: async (r: unknown) => (written.push(r), r),
    } as any,
    flow = new PurchaseFlow(port, store, async (f) => f());
  render(
    <MemoryRouter>
      <BuyView flow={flow} />
    </MemoryRouter>,
  );
  return { reconcile, written };
}
const press = async () => {
  const b = await screen.findByRole("button", {
    name: "Check purchase status",
  });
  await waitFor(() => expect(b).toBeEnabled());
  fireEvent.click(b);
};
it("an uncertain status check says why, instead of looking like nothing happened", async () => {
  const { reconcile } = view([
    {
      state: "uncertain",
      message: "Opened event authority/parent is not established.",
    },
  ]);
  await press();
  expect(
    await screen.findByText(
      "Opened event authority/parent is not established.",
    ),
  ).toBeVisible();
  expect(reconcile).toHaveBeenCalledTimes(1);
  // Still uncertain: the button stays so the check can be repeated; no payment is offered.
  expect(
    screen.getByRole("button", { name: "Check purchase status" }),
  ).toBeEnabled();
  expect(screen.queryByRole("button", { name: /Approve purchase/ })).toBeNull();
});
it("a verified status check is retained as verified and shows the verified state", async () => {
  const { written } = view([
    {
      state: "verified",
      message: "corroborated",
      signature: "sig",
      account: attempt.expectedAccount,
      actualDebit: "30120000",
    },
  ]);
  await press();
  expect(
    await screen.findByText(/Your purchase has been verified/),
  ).toBeVisible();
  expect(
    screen.queryByRole("button", { name: "Check purchase status" }),
  ).toBeNull();
  expect(written).toEqual([expect.objectContaining({ stage: "verified" })]);
});
it("a later answer replaces an earlier one", async () => {
  view([
    { state: "uncertain", message: "First answer." },
    { state: "confirmed", message: "Second answer.", signature: "sig" },
  ]);
  await press();
  await screen.findByText("First answer.");
  await press();
  await screen.findByText("Second answer.");
  expect(screen.queryByText("First answer.")).toBeNull();
});
