import { afterEach, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { IsolatedPurchaseAdapter } from "../src/purchase/isolated/adapter";
import { createLiveP30ReadOnlyAdapter } from "../src/purchase/isolated/live";
import {
  ReadOnlyAccounts,
  observedAge,
} from "../src/purchase/isolated/live-view";
import { P30_PROFILE } from "../src/purchase/isolated/profile";
import { P30_RELEASE } from "../src/purchase/isolated/identity";
import { keyHex } from "../src/purchase/consumer/runtime";
import {
  createPurchaseFixtures,
  fixtureId,
  fixtureWallets,
} from "../src/purchase/consumer/fixtures";
import descriptor from "../dependencies/p30/3e33090cf9193fd909f57ed75e10f9e59b9409e3c8a8f6c186272d8ee185f86d/p30-descriptor.json";
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
const now = Date.now(),
  wallet = fixtureWallets[0],
  sig = () => new AbortController().signal;
const auth = {
  api_version: "1",
  wallet,
  wallet_hex: keyHex(wallet),
  admin_read: false,
  csrf_token: "ab".repeat(32),
  expires_unix_s: String(Math.floor(now / 1000) + 3600),
  trading_authority: "actual_trader_signature_per_intent",
  lifecycle_application: "operator_only",
};
const json = (v: unknown, status = 200) =>
  new Response(JSON.stringify(v), {
    status,
    headers: { "content-type": "application/json" },
  });
it("live factory is explicit and refused outside exact5174 entry; default and forged modes stay disabled", async () => {
  const fetch = vi.fn(async () => json(auth));
  for (const location of [
    { origin: "http://127.0.0.1:5173", pathname: "/p30-live.html" },
    { origin: P30_PROFILE.browserOrigin, pathname: "/purchase-preview.html" },
  ]) {
    vi.stubGlobal("window", { location, fetch });
    expect(() => createLiveP30ReadOnlyAdapter()).toThrow();
  }
  vi.stubGlobal("window", {
    location: { origin: P30_PROFILE.browserOrigin, pathname: "/p30-live.html" },
    fetch,
  });
  const a = createLiveP30ReadOnlyAdapter();
  expect(fetch).not.toHaveBeenCalled();
  await a.restore();
  expect(fetch).toHaveBeenCalledOnce();
  await expect(
    a.transport.quote({} as any, {} as any, sig()),
  ).rejects.toMatchObject({ code: "action_gate_disabled" });
  await expect(
    a.transport.prepareAttempt({} as any, {} as any, sig()),
  ).rejects.toMatchObject({ code: "action_gate_disabled" });
  expect(fetch).toHaveBeenCalledOnce();
  expect(
    () =>
      new IsolatedPurchaseAdapter(
        {
          kind: "live_read_only",
          fetch,
          browserOrigin: () => P30_PROFILE.browserOrigin,
        } as any,
        Symbol("forged"),
      ),
  ).toThrow();
  a.dispose();
});
async function connected(populated = false) {
  const f = createPurchaseFixtures(() => BigInt(now) * 1000000n),
    s = {
      wallet,
      deploymentId: P30_PROFILE.deployment,
      sessionEpoch: 1,
      evidencePurpose: "synthetic_test" as const,
    };
  if (populated) {
    const q: any = await f.transport.quote(
      s,
      {
        deployment_id: s.deploymentId,
        request_id: fixtureId(2),
        tier_index: "0",
        mint: descriptor.usdcMint,
      },
      sig(),
    );
    const ack: any = await f.transport.prepareAttempt(
      s,
      {
        deployment_id: s.deploymentId,
        request_id: fixtureId(3),
        quote_id: q.quote_id,
        message_sha256: fixtureId(4),
        expected_account: q.expected_account,
        recent_blockhash: "11111111111111111111111111111111",
        last_valid_block_height: "999",
      },
      sig(),
    );
    for (let i = 0; i < 3; i++)
      await f.transport.status(s, ack.purchase.purchase_id, sig());
  }
  let fail = false;
  const transport = vi.fn(async (input: RequestInfo | URL) => {
    const u = String(input);
    if (u.endsWith("/v1/auth/session")) return json(auth);
    if (u.endsWith("/v1/auth/logout"))
      return json({ api_version: "1", logged_out: true });
    if (fail)
      return json({ api_version: "1", error: { code: "unavailable" } }, 503);
    const raw: any = u.includes("/v1/owned-accounts/")
      ? await f.transport.account(s, u.split("/").at(-1)!.split("?")[0], sig())
      : await f.transport.owned(s, null, sig());
    raw.evidence_purpose = "chain_observation";
    raw.deployment.sdk_artifact_sha256 = P30_RELEASE.source_archive_sha256;
    for (const r of raw.rows ?? [raw.row])
      if (r?.current_chain_state)
        r.current_chain_state.snapshot.corroboration =
          "two_approved_rpc_sources";
    return json(raw);
  });
  const a = new IsolatedPurchaseAdapter({
    kind: "explicit_mock_http_contract",
    fetch: transport,
    browserOrigin: () => P30_PROFILE.browserOrigin,
    now: () => now,
  });
  await a.restore();
  return {
    a,
    f,
    transport,
    setFail: () => {
      fail = true;
    },
  };
}
it("partial empty read stays incomplete and never becomes a no-accounts claim", async () => {
  const { a, f } = await connected();
  f.setScenario("partial");
  render(<ReadOnlyAccounts connection={a} />);
  await userEvent.click(
    screen.getByRole("button", { name: "Refresh account records" }),
  );
  await screen.findByText(/The account search is incomplete/);
  expect(screen.queryByText(/No accounts were found/)).not.toBeInTheDocument();
  expect(
    screen.queryByRole("button", { name: /purchase|send|trade/i }),
  ).not.toBeInTheDocument();
  a.dispose();
});
it("last-observed populated fixture retains time basis and stays visible after unavailable refresh", async () => {
  const { a, setFail } = await connected(true);
  render(<ReadOnlyAccounts connection={a} />);
  await userEvent.click(
    screen.getByRole("button", { name: "Refresh account records" }),
  );
  await screen.findByRole("button", { name: "View recorded details" });
  expect(screen.getByText(/Observed .*ago/)).toBeInTheDocument();
  expect(
    screen.getByText(/do not guarantee continuing ownership/),
  ).toBeInTheDocument();
  setFail();
  await userEvent.click(
    screen.getByRole("button", { name: "Refresh account records" }),
  );
  await screen.findByRole("alert");
  expect(
    screen.getByRole("button", { name: "View recorded details" }),
  ).toBeInTheDocument();
  a.dispose();
});
it("epoch invalidation removes displayed records and permits fresh sign-in controls", async () => {
  const { a } = await connected(true);
  render(<ReadOnlyAccounts connection={a} />);
  await userEvent.click(
    screen.getByRole("button", { name: "Refresh account records" }),
  );
  await screen.findByRole("button", { name: "View recorded details" });
  act(() => a.walletChanged(fixtureWallets[1]));
  await waitFor(() =>
    expect(
      screen.queryByRole("button", { name: "View recorded details" }),
    ).not.toBeInTheDocument(),
  );
  expect(
    screen.getAllByRole("button", { name: "Retry sign-out" }),
  ).toHaveLength(1);
  a.dispose();
});
it.each([
  ["0", 1000, "1s ago"],
  ["1000000000", 61000, "1m ago"],
  ["0", 86400000, "1d ago"],
  ["10000000000", 1000, "Recorded time is ahead of this device"],
])(
  "observation age is a bounded presentation, not live-state authority",
  (ns, clock, expected) => {
    expect(observedAge(String(ns), Number(clock))).toBe(expected);
  },
);

it("registered detail routes report unavailable records while a missing list route stays a prerequisite", async () => {
  const fetch = vi.fn(async (input: RequestInfo | URL) =>
    String(input).endsWith("/v1/auth/session")
      ? json(auth)
      : json({ api_version: "1", error: { code: "not_found" } }, 404),
  );
  const a = new IsolatedPurchaseAdapter({
    kind: "explicit_mock_http_contract",
    fetch,
    browserOrigin: () => P30_PROFILE.browserOrigin,
    now: () => now,
  });
  const s = await a.restore();
  await expect(
    a.transport.account(s, fixtureId(1), sig()),
  ).rejects.toMatchObject({ status: 404, code: "record_unavailable" });
  await expect(
    a.transport.status(s, fixtureId(2), sig()),
  ).rejects.toMatchObject({ status: 404, code: "record_unavailable" });
  await expect(a.transport.owned(s, null, sig())).rejects.toMatchObject({
    status: 404,
    code: "service_prerequisite",
  });
  a.dispose();
});
