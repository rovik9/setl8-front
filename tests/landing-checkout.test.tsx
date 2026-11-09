import { expect, it, vi, beforeAll } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
import Landing from "../src/pages/Landing";
import { TIERS, formatMicro } from "../src/buy/tiers";
vi.mock("../src/pages/Buy", () => ({
  default: () => <div>Checkout selection{useLocation().search}</div>,
}));
vi.mock("../src/components/WalletDialog", () => ({
  WalletButton: () => <button>Wallet</button>,
}));
beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute("open", "");
  };
  HTMLDialogElement.prototype.close = function () {
    this.removeAttribute("open");
  };
});
function renderLanding(entry = "/") {
  return render(
    <MemoryRouter initialEntries={[entry]}>
      <Landing />
    </MemoryRouter>,
  );
}
it("offers all ten current tiers with their exact totals and carries the selected tier into checkout", async () => {
  renderLanding();
  for (const tier of TIERS) {
    expect(
      screen.getByRole("button", {
        name:
          "Choose $" + tier.accountSizeUsd.toLocaleString("en-US") + " account",
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Total " + formatMicro(tier.totalMicro) + " test USDC"),
    ).toBeInTheDocument();
  }
  fireEvent.click(
    screen.getByRole("button", { name: "Choose $50,000 account" }),
  );
  await waitFor(() =>
    expect(screen.getByText(/Checkout selection/)).toHaveTextContent(
      "?checkout=6",
    ),
  );
  fireEvent.click(screen.getByRole("button", { name: "Close dialog" }));
  expect(screen.queryByText(/Checkout selection/)).toBeNull();
});
it("restores a checkout URL directly and removes its selection when closed", async () => {
  renderLanding("/?checkout=9");
  await waitFor(() =>
    expect(screen.getByText(/Checkout selection/)).toHaveTextContent(
      "?checkout=9",
    ),
  );
  fireEvent.click(screen.getByRole("button", { name: "Close dialog" }));
  expect(screen.queryByText(/Checkout selection/)).toBeNull();
});
it("does not open an invalid tier and keeps current five-phase terms", () => {
  renderLanding("/?checkout=99");
  expect(screen.queryByText(/Checkout selection/)).toBeNull();
  expect(screen.getByRole("button", { name: "Phase 1" })).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Phases 2–5" }));
  expect(screen.getByText(/An 8% target in each phase/)).toHaveTextContent(
    "100% profit split",
  );
});
