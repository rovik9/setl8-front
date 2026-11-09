import { it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
vi.mock("../src/auth/context", () => ({ useAuth: () => ({ session: null }) }));
vi.mock("../src/components/WalletDialog", () => ({
  WalletButton: () => <button>Connect wallet</button>,
}));
import History from "../src/pages/DevnetHistory";
it("leads with the exact historical payment and ownership, retaining diagnostics in a closed verification section", () => {
  render(
    <MemoryRouter>
      <History />
    </MemoryRouter>,
  );
  expect(
    screen.getByRole("heading", { name: "Devnet payout history" }),
  ).toBeVisible();
  expect(screen.getByText("Paid · finalized")).toBeVisible();
  expect(
    screen.getByText("$200.000000", {
      exact: false,
      selector: ".payout-amount",
    }),
  ).toBeVisible();
  expect(
    screen.getByText(
      /This historical payout belongs to public rehearsal account A1/,
    ),
  ).toBeVisible();
  expect(screen.getByText("$99,933.736000")).toBeVisible();
  expect(screen.getByText("$100,133.736000")).toBeVisible();
  const details = screen
    .getByText("Verification and full history")
    .closest("details")!;
  expect(details.open).toBe(false);
  expect(
    screen.getByRole("link", { name: /View settlement on Explorer/ }),
  ).toHaveAttribute("href", expect.stringContaining("?cluster=devnet"));
  expect(screen.getByText("Queued")).toBeVisible();
  expect(screen.getByText("Settled")).toBeVisible();
  fireEvent.click(screen.getByText("Verification and full history"));
  expect(details.open).toBe(true);
  expect(screen.getByText("Finalized day-two transactions")).toBeVisible();
  expect(
    details.querySelectorAll(".devnet-history-transactions article"),
  ).toHaveLength(5);
});
