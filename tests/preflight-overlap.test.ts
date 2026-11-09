// @vitest-environment node
import { expect, it, vi } from "vitest";
import { PurchasePreflight, readPair } from "../src/buy/preflight";
import { DirectRpc, DEVNET_ENDPOINTS } from "../src/buy/rpc";
import { ephemeral, offlineAccounts, offlineFetch } from "./f2-fixture";
it("overlaps operators while keeping one request per provider and all original validation reads", async () => {
  const wallet = await ephemeral(),
    accounts = offlineAccounts(wallet.address);
  const fixture = offlineFetch(accounts);
  const active = [0, 0],
    max = [0, 0];
  let overlap = false;
  const rpc = new DirectRpc((async (url, init) => {
    const p = String(url).startsWith(DEVNET_ENDPOINTS[1]) ? 1 : 0;
    active[p]++;
    max[p] = Math.max(max[p], active[p]);
    overlap ||= active.every((v) => v > 0);
    try {
      await new Promise((r) => setTimeout(r, 5));
      return await fixture(url, init);
    } finally {
      active[p]--;
    }
  }) as typeof fetch);
  const checked = await new PurchasePreflight(rpc).check(
    wallet.address,
    "9",
    1,
    new AbortController().signal,
  );
  expect(checked.tier).toBe("9");
  console.info(
    "controlled review RPC",
    JSON.stringify({
      requests: rpc.measurements().length,
      max_in_flight_per_provider: max,
      cross_provider_overlap: overlap,
    }),
  );
  expect(max).toEqual([1, 1]);
  expect(overlap).toBe(true);
  const measurements = rpc.measurements();
  expect(
    measurements.filter((m) => m.method === "getGenesisHash"),
  ).toHaveLength(2);
  expect(
    measurements.filter((m) => m.method === "getMultipleAccounts"),
  ).toHaveLength(4);
  expect(
    measurements.filter(
      (m) => m.method === "getMinimumBalanceForRentExemption",
    ),
  ).toHaveLength(6);
});
it("a paired read takes the slower provider delay and aborts its peer on failure", async () => {
  vi.useFakeTimers();
  try {
    const rpc = new DirectRpc((async (url, init) => {
      await new Promise((r) =>
        setTimeout(r, String(url).startsWith(DEVNET_ENDPOINTS[1]) ? 60 : 40),
      );
      const req = JSON.parse(String(init?.body));
      return new Response(
        JSON.stringify({
          jsonrpc: "2.0",
          id: req.id,
          result: { context: { slot: "1" }, value: [null] },
        }),
      );
    }) as typeof fetch);
    const start = Date.now();
    const task = readPair(rpc, ["key"], new AbortController().signal);
    await vi.advanceTimersByTimeAsync(60);
    await task;
    expect(Date.now() - start).toBe(60);
    expect(rpc.measurements()).toHaveLength(2);
  } finally {
    vi.useRealTimers();
  }
  let peer: AbortSignal | undefined;
  const failed = new DirectRpc((async (url, init) => {
    if (String(url).startsWith(DEVNET_ENDPOINTS[1])) {
      peer = init?.signal as AbortSignal;
      return new Promise(() => {});
    }
    throw Error("offline");
  }) as typeof fetch);
  await expect(
    readPair(failed, ["key"], new AbortController().signal),
  ).rejects.toThrow();
  expect(peer?.aborted).toBe(true);
});
