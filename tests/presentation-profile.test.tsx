import { it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { sitePresentation } from "../src/data/sitePresentation";
import { demoBuild } from "../src/data/demoScope";
import Landing from "../src/pages/Landing";
import Purchase from "../src/pages/Purchase";
import { DIRECT_GATE } from "../src/buy/direct-types";
import { OWNER_RELEASE, REVIEWED_OWNER_SCOPE } from "../src/buy/executionGate";
beforeEach(() => {
  vi.stubGlobal(
    "IntersectionObserver",
    class {
      observe() {}
      disconnect() {}
    },
  );
});
it("the real localhost3000 presentation has canonical wallet navigation and five-phase availability without enabling a demo; the only execution release is the owner-scoped one", () => {
  const p = sitePresentation("http://localhost:3000", false);
  expect(p.profile).toBe("localhost3000");
  expect(p.accountPath).toBe("/my-account");
  expect(p.copy.tabs.map(([id]) => id)).toEqual(["evaluation", "payable"]);
  expect(p.copy.afterPhaseFive).toBeNull();
  expect(p.copy.preview).toContain(
    "Purchase signing, resets and payouts are off",
  );
  expect(demoBuild({})).toBe(false);
  // Presentation never widens the release: it is the four reviewed wallets, time-bounded.
  expect(OWNER_RELEASE.enabled).toBe(true);
  expect(OWNER_RELEASE.wallets).toEqual(REVIEWED_OWNER_SCOPE.wallets);
  expect(OWNER_RELEASE.wallets).toHaveLength(4);
  expect(OWNER_RELEASE.validUntilMs).toEqual(expect.any(Number));
  expect(DIRECT_GATE.sign).toBe(true);
  expect(DIRECT_GATE.send).toBe(true);
});
it("preserves historical5173 copy/navigation and its explicit demo-build behavior", () => {
  const old = sitePresentation("http://127.0.0.1:5173", false),
    demo = sitePresentation("http://127.0.0.1:5173", true);
  expect(old.accountPath).toBe("/app/accounts");
  expect(old.copy.tabs.some(([id]) => id === "live")).toBe(true);
  expect(demo.accountPath).toBe("/my-account");
  expect(demo.copy.tabs.some(([id]) => id === "live")).toBe(false);
});
it("the actual landing CTA leads to My accounts and omits unsupported future Live navigation", () => {
  render(
    <MemoryRouter>
      <Landing />
    </MemoryRouter>,
  );
  screen
    .getAllByRole("link", { name: /^Dashboard$/ })
    .forEach((link) => expect(link).toHaveAttribute("href", "/my-account"));
  expect(screen.queryByRole("button", { name: /^Live$/ })).toBeNull();
  expect(screen.getByRole("button", { name: "Phase 1" })).toBeInTheDocument();
  expect(
    screen.getByRole("button", { name: "Phases 2–5" }),
  ).toBeInTheDocument();
  expect(
    screen.getByText(/Wallet sign-in and account reads are available/),
  ).toBeInTheDocument();
});
it("availability page account CTAs follow the same canonical wallet workspace", () => {
  render(
    <MemoryRouter>
      <Purchase />
    </MemoryRouter>,
  );
  expect(
    screen.getByRole("link", { name: /Account overview/ }),
  ).toHaveAttribute("href", "/my-account");
  expect(
    screen.getByRole("link", { name: /Browse your accounts/ }),
  ).toHaveAttribute("href", "/my-account");
});
it("the explicit visual purchase demo keeps its separate fixture accounts route", () => {
  render(
    <MemoryRouter>
      <Purchase demo />
    </MemoryRouter>,
  );
  expect(
    screen.getByRole("link", { name: /Account overview/ }),
  ).toHaveAttribute("href", "/demo/accounts");
});
