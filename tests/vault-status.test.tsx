import { expect, it, vi, afterEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { checkedVaultStatus, vaultElapsed, vaultTime } from "../src/data/vault";
import fixture from "./vault-fixture.json";
import Vault from "../src/pages/Vault";
import { fixed } from "../src/data/exact";
vi.mock("../src/components/WalletDialog", () => ({
  WalletButton: () => <button>Wallet</button>,
}));
afterEach(() => vi.unstubAllGlobals());
it("keeps exact token units, cycle interval and earliest eligibility distinct from payout time", () => {
  const data = checkedVaultStatus(fixture);
  expect(fixed(data.pools[0].balance_atoms, 6, 6)).toBe("50,099.325000");
  expect(data.cycle.next_payout_at_unix_s).toBeNull();
  expect(vaultTime(data.cycle.next_cycle_eligible_at_unix_s!)).toMatch(
    /2026-11-07/,
  );
  expect(vaultElapsed(data)).toBe(297337);
  const never = structuredClone(fixture);
  never.cycle.status = "never_started";
  never.cycle.started_at_unix_s = null as any;
  never.cycle.next_cycle_eligible_at_unix_s = null as any;
  expect(vaultElapsed(checkedVaultStatus(never))).toBeNull();
});
it.each([
  (v: any) => {
    v.pools[0].mint = "wrong";
  },
  (v: any) => {
    v.pools[0].balance_atoms = "500.5";
  },
  (v: any) => {
    v.cycle.next_payout_at_unix_s = "1794053993";
  },
  (v: any) => {
    v.cycle.next_cycle_eligible_at_unix_s = "1";
  },
  (v: any) => {
    v.provenance[1].operator = v.provenance[0].operator;
  },
  (v: any) => {
    v.pools = [null, null];
  },
])("refuses unsupported vault evidence", (mutate) => {
  const value = structuredClone(fixture);
  mutate(value);
  expect(() => checkedVaultStatus(value)).toThrow(/Vault evidence/);
});
const renderVault = () =>
  render(
    <MemoryRouter>
      <Vault />
    </MemoryRouter>,
  );
// Changed 6 Nov 2026 (was: a red role=alert saying "updated gateway"): a gateway that does not serve the route
// is an expected demo state, so it is a calm status plus a labelled recorded snapshot; nothing is invented.
it.each([
  ["404 route not served", () => new Response("{}", { status: 404 })],
  [
    "503 no current observation",
    () =>
      new Response(
        JSON.stringify({
          api_version: "1",
          error: { code: "vault_observation_unavailable", message: "later" },
        }),
        { status: 503 },
      ),
  ],
])(
  "an expected unavailable service (%s) shows no alert, a labelled recorded snapshot and no invented balance",
  async (_name, respond) => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => respond()),
    );
    renderVault();
    await screen.findByText("Recorded snapshot · live read unavailable");
    expect(screen.queryByRole("alert")).toBeNull();
    expect(
      screen.getByText("Live pool balances are not read in this view"),
    ).toBeVisible();
    expect(
      screen.getByText(/Live read: .*Nothing on this page is estimated/),
    ).toBeInTheDocument(); // inside the collapsed "Sources & verification" details
    // Recorded A1 values are present and labelled as not current ...
    expect(screen.getByText(/not current balances/)).toBeVisible();
    expect(
      screen.getByText(/200\.000000 test USDC, from the USDC payout pool/),
    ).toBeVisible();
    expect(screen.getByText(/99,933\.736000 → 100,133\.736000/)).toBeVisible();
    // ... and no live-looking balance, countdown or payout promise appears.
    expect(screen.queryByText("50,099.325000")).toBeNull();
    expect(screen.queryByText(/Corroborated finalized observation/)).toBeNull();
    expect(screen.getByText("5 days")).toBeVisible();
    expect(
      screen.getByText(
        "Next cycle eligibility appears when the live read is available",
      ),
    ).toBeVisible();
  },
);
it("an unreachable service and a timeout are also calm, not alerts", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => {
      throw new TypeError("Failed to fetch");
    }),
  );
  renderVault();
  await screen.findByText("Recorded snapshot · live read unavailable");
  expect(screen.queryByRole("alert")).toBeNull();
  // The technical reason lives in the collapsed "Sources & verification" section.
  expect(
    screen.getByText(/the service could not be reached/),
  ).toBeInTheDocument();
});
it("evidence that arrives but fails verification is still an alert and shows no snapshot as live", async () => {
  const bad = structuredClone(fixture);
  bad.pools[0].mint = "wrong";
  vi.stubGlobal(
    "fetch",
    vi.fn(
      async () =>
        new Response(JSON.stringify(bad), {
          headers: { "Content-Type": "application/json" },
        }),
    ),
  );
  renderVault();
  await waitFor(() =>
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Vault evidence could not be verified",
    ),
  );
  expect(screen.queryByText("50,099.325000")).toBeNull();
  // An integrity failure is not the same as "unavailable": the snapshot block does not stand in for it.
  expect(
    screen.queryByText("Recorded snapshot · live read unavailable"),
  ).toBeNull();
});
it("a live observation replaces the recorded snapshot", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(
      async () =>
        new Response(JSON.stringify(fixture), {
          headers: { "Content-Type": "application/json" },
        }),
    ),
  );
  renderVault();
  await screen.findByText("50,099.325000");
  expect(
    screen.queryByText("Recorded snapshot · live read unavailable"),
  ).toBeNull();
});

it("retains a verified balance and its observation time when refresh later fails", async () => {
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce(
      new Response(JSON.stringify(fixture), {
        headers: { "Content-Type": "application/json" },
      }),
    )
    .mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          error: {
            code: "vault_observation_unavailable",
            message: "Try again after 60 seconds",
          },
        }),
        { status: 503 },
      ),
    );
  vi.stubGlobal("fetch", fetcher);
  render(
    <MemoryRouter>
      <Vault />
    </MemoryRouter>,
  );
  await screen.findByText("50,099.325000");
  fireEvent.click(screen.getByRole("button", { name: "Refresh observation" }));
  // Changed 6 Nov 2026 (was an alert containing "60 seconds"): a refresh the service cannot answer is a status note.
  await screen.findByText(/Latest refresh unavailable/);
  expect(screen.queryByRole("alert")).toBeNull();
  expect(screen.getByText("50,099.325000")).toBeVisible();
  expect(
    screen.getByText(/Earlier observation · latest refresh unavailable/),
  ).toBeVisible();
});
