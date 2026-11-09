import historicalDto from "../src/data/devnet-day2-settlement-history.json";
import type { DevnetSettlementHistory } from "../src/api/devnet-settlement-history-v1";
import { it, expect } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import {
  devnetJourney,
  verifiedHistoryMatches,
  day2HistoryStatus,
  type JourneyScope,
} from "../src/devnet/history";
import { DevnetJourney } from "../src/devnet/Journey";
import accepted from "../src/data/devnet-proof.json";
import observation from "../src/data/devnet-day2-observation.json";
const owner = "J95j3drvYgYNrT3cocwSoR8hWd5zsaqVr12eW7UxL7zC";
const scope: JourneyScope = {
  sessionWallet: owner,
  observedWallet: owner,
  account: "account-read-address",
  trader: owner,
  checked: true,
  slots: ["517604830", "517604831"],
};
it("new public day-two source matches the immutable tuple and the separately verified receipt DTO", () => {
  const s = day2HistoryStatus(null);
  expect(s.samePrograms).toBe(true);
  expect(s.arithmeticMatches).toBe(true);
  expect(s.receiptVerified).toBe(true);
  expect(s.canTransact).toBe(false);
  expect(s.label).toContain("two named RPC operators");
  expect(observation.reported.delta_micro_usdc).toBe("200000000");
  // Day 2 is done: the regenerated proof snapshot now carries the real queued/paid claim account.
  expect(accepted.payout.claim).toBe(
    "71ufTEdhUJ8j7HUuyKvLSFWgtxPiL55vX7GsjYuYjCpW",
  );
});
it("matching the public trader grants no transaction authority or paid claim", () => {
  const s = day2HistoryStatus(observation.account.trader);
  expect(s.belongsToSession).toBe(true);
  expect(s.canTransact).toBe(false);
  expect(s.receiptVerified).toBe(true);
  expect(day2HistoryStatus(owner).belongsToSession).toBe(false);
});
it.each([
  "awaiting_wallet",
  "signed",
  "uncertain",
  "finalized_observed",
  "verified",
])(
  "a retained %s purchase record never creates settlement evidence",
  (stage) => {
    const s = devnetJourney({
      ...scope,
      retainedAttempt: {
        wallet: owner,
        expectedAccount: scope.account!,
        signature: "public-local-signature",
        stage,
      },
    });
    expect(s.steps.find((s) => s.id === "purchase")!.state).toBe(
      "Recovery record retained",
    );
    expect(s.steps.find((s) => s.id === "settlement")!.state).toBe(
      "No verified settlement bound to this account",
    );
  },
);
it("a public explorer wallet or foreign trader cannot become this session wallet account", () => {
  expect(
    devnetJourney({ ...scope, trader: observation.account.trader }).owned,
  ).toBe(false);
  expect(
    devnetJourney({ ...scope, observedWallet: observation.account.trader })
      .owned,
  ).toBe(false);
  expect(devnetJourney({ ...scope, sessionWallet: null }).owned).toBe(false);
  expect(devnetJourney({ ...scope, checked: false }).owned).toBe(false);
});
it("elapsed pass timestamps alone cannot become a queued or paid claim", () => {
  const s = devnetJourney({
    ...scope,
    passPending: "2",
    passRequestedAt: "1",
    passProposedAt: "2",
  });
  expect(s.owned).toBe(true);
  expect(s.steps.find((s) => s.id === "queue")!.state).toBe(
    "Pass flag observed · claim not attested",
  );
  expect(s.steps.find((s) => s.id === "settlement")!.state).not.toMatch(
    /paid|complete|settled/i,
  );
});
it("the actual journey UI presents evidence stages and a separate public history without executable actions", () => {
  render(
    <MemoryRouter>
      <DevnetJourney scope={scope} />
    </MemoryRouter>,
  );
  expect(
    screen.getByRole("link", { name: "Review devnet checkout" }),
  ).toHaveAttribute("href", "/buy");
  expect(
    screen.getByRole("link", { name: "Separate public rehearsal history" }),
  ).toHaveAttribute("href", "/devnet-history");
  expect(
    screen.getByText("Devnet connection awaiting activation"),
  ).toBeInTheDocument();
  expect(
    screen.queryByRole("button", { name: /sign|settle|claim|transfer|pay/i }),
  ).toBeNull();
});

it.each([
  "recipient",
  "trader",
  "amount",
  "packet",
  "typed claim",
  "current balance",
  "owner history",
  "infrastructure independence",
])(
  "refuses a historical DTO with changed %s rather than presenting it as verified",
  (field) => {
    const v = structuredClone(historicalDto) as DevnetSettlementHistory;
    if (field === "recipient") v.transfer.destination = "other";
    if (field === "trader") v.trader = "other";
    if (field === "amount") v.transfer.amount_atoms = "200000001";
    if (field === "packet") v.receipts[0].packet_sha256 = "00".repeat(32);
    if (field === "typed claim")
      v.claim.typed_claim_fields_verified = true as false;
    if (field === "current balance")
      v.limits.current_token_balance_proven = true as false;
    if (field === "owner history")
      v.limits.connected_owner_history = true as false;
    if (field === "infrastructure independence")
      v.provenance.infrastructure_independence =
        "independent" as "not_established";
    expect(verifiedHistoryMatches(v)).toBe(false);
  },
);

// ---- recorded devnet purchase evidence (Challenge #0) ----
const REC_ACCOUNT = "9aLv8BzUCAjYWnAav75K9aeSHnZAKKFu26VmEVyhcYxT";
const REC_SIG =
  "4wzsDG7CwhSU6SNTZfzsivCMPKoRbmk5tRrUXdidzNc53Pa53XuHjLu5gmSXfMuZQdmRaoocurJKT6oQ1cXTburt";
const publicView: JourneyScope = {
  sessionWallet: null,
  observedWallet: owner,
  account: REC_ACCOUNT,
  trader: owner,
  checked: true,
  slots: ["519231117", "519231115"],
};
const purchaseStep = (s: JourneyScope) =>
  devnetJourney(s).steps.find((x) => x.id === "purchase")!;
it("the recorded purchase is shown as labelled evidence for exactly its wallet and account", () => {
  const step = purchaseStep(publicView);
  expect(step.state).toBe("Recorded devnet purchase (verified earlier)");
  expect(step.description).toMatch(/not re-verified in this browser/);
  render(
    <MemoryRouter>
      <DevnetJourney scope={publicView} />
    </MemoryRouter>,
  );
  expect(
    screen.getByText("Recorded devnet purchase (verified earlier)"),
  ).toBeInTheDocument();
  expect(screen.getByText(REC_SIG)).toBeInTheDocument();
  expect(screen.getByText("519104975")).toBeInTheDocument();
  expect(screen.getByText("finalized")).toBeInTheDocument();
  expect(screen.getByText("30.12 test USDC")).toBeInTheDocument();
  const link = screen.getByRole("link", {
    name: "View transaction on Explorer (devnet)",
  });
  expect(link).toHaveAttribute(
    "href",
    `https://explorer.solana.com/tx/${REC_SIG}?cluster=devnet`,
  );
  // never presented as verified here, and it grants nothing
  expect(document.body.textContent).not.toMatch(
    /(?<!re-)verified in this browser|Purchase receipt not recorded yet/,
  );
  expect(devnetJourney(publicView).owned).toBe(false);
  expect(
    screen.queryByRole("button", { name: /sign|settle|claim|transfer|pay/i }),
  ).toBeNull();
});
it("the recorded purchase does not change the settlement or queue steps", () => {
  const steps = devnetJourney(publicView).steps;
  expect(steps.find((s) => s.id === "settlement")!.state).toBe(
    "No verified settlement bound to this account",
  );
  expect(steps.find((s) => s.id === "queue")!.state).toBe(
    "No claim queue attested for this account",
  );
});
it.each([
  [
    "another account",
    { account: "7AMvgh1hCPKvJYKCMSNmHqyLKfNxZJXW8aKdM83zaxUv" },
  ],
  ["no account", { account: null }],
  ["another observed wallet", { observedWallet: "someone-else" }],
  ["no observed wallet", { observedWallet: null }],
  ["another decoded trader", { trader: "someone-else" }],
  ["no decoded trader", { trader: null }],
  ["an unchecked account read", { checked: false }],
] as [string, Partial<JourneyScope>][])(
  "no recorded purchase is shown for %s",
  (_n, change) => {
    const s = purchaseStep({ ...publicView, ...change });
    expect(s.state).toBe("No purchase receipt verified here");
    expect("recorded" in s && s.recorded).toBeFalsy();
  },
);
it("a local record of the signed-in wallet takes precedence over the recorded purchase", () => {
  for (const stage of ["signed", "uncertain", "verified"]) {
    const s = purchaseStep({
      ...publicView,
      sessionWallet: owner,
      retainedAttempt: {
        wallet: owner,
        expectedAccount: REC_ACCOUNT,
        signature: "local-signature",
        stage,
      },
    });
    expect(s.state).toBe("Recovery record retained");
    expect("recorded" in s && s.recorded).toBeFalsy();
  }
  // a local record that belongs to some other wallet is ignored, so it cannot hide or fake the recorded one
  expect(
    purchaseStep({
      ...publicView,
      sessionWallet: owner,
      retainedAttempt: {
        wallet: "someone-else",
        expectedAccount: REC_ACCOUNT,
        signature: "x",
        stage: "verified",
      },
    }).state,
  ).toBe("Recorded devnet purchase (verified earlier)");
});

// ---- review follow-ups: evidence names its wallet and account; a local copy is noted, never replaced ----
it("the recorded evidence names the wallet and account it belongs to, so a different signed-in wallet cannot mistake it for its own", () => {
  const other = { ...publicView, sessionWallet: "some-other-wallet" };
  render(
    <MemoryRouter>
      <DevnetJourney scope={other} />
    </MemoryRouter>,
  );
  expect(screen.getByText(owner)).toBeInTheDocument();
  expect(screen.getByText(`Challenge #0 · ${REC_ACCOUNT}`)).toBeInTheDocument();
  expect(devnetJourney(other).owned).toBe(false);
});
it("a local record for the same purchase is noted beside the recorded evidence, and other local records are not", () => {
  const withLocal = (records: JourneyScope["localRecords"]) =>
    render(
      <MemoryRouter>
        <DevnetJourney scope={{ ...publicView, localRecords: records }} />
      </MemoryRouter>,
    );
  const note = /keeps a local record of this purchase/;
  withLocal([{ wallet: owner, expectedAccount: REC_ACCOUNT }]);
  expect(screen.getByText(note)).toBeInTheDocument();
  cleanup();
  withLocal([{ wallet: owner, expectedAccount: "another-account" }]);
  expect(screen.queryByText(note)).toBeNull();
  cleanup();
  withLocal([{ wallet: "someone-else", expectedAccount: REC_ACCOUNT }]);
  expect(screen.queryByText(note)).toBeNull();
  cleanup();
  withLocal(undefined);
  expect(screen.queryByText(note)).toBeNull();
});
