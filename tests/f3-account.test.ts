// @vitest-environment node
import { describe, it, expect, vi } from "vitest";
import {
  AccountReader,
  pageIds,
  publicAddress,
  type AccountPage,
  type AccountPort,
} from "../src/account/data";
import {
  AccountResource,
  pollAllowed,
  pollDelay,
} from "../src/account/resource";
import { DirectRpc, DEVNET_ENDPOINTS } from "../src/buy/rpc";
import {
  exactAmount,
  pendingValue,
  proofSections,
  stateName,
  chainTime,
} from "../src/account/presentation";
import fixture from "./fixtures/f3-account.json";
import { b64, un64 } from "../src/buy/bytes";
import descriptor from "../dependencies/p30/3e33090cf9193fd909f57ed75e10f9e59b9409e3c8a8f6c186272d8ee185f86d/p30-descriptor.json";
function mock(
  options: {
    counter?: string;
    owner?: string;
    status?: number;
    empty?: boolean;
  } = {},
) {
  const calls: any[] = [],
    accounts: Record<string, any> = structuredClone(fixture.accounts);
  if (options.empty) accounts[fixture.profile] = null;
  if (options.counter) {
    const b = un64(accounts[fixture.profile].data[0]);
    new DataView(b.buffer).setBigUint64(40, BigInt(options.counter), true);
    accounts[fixture.profile].data[0] = b64(b);
  }
  if (options.owner) accounts[fixture.account].owner = options.owner;
  const fetcher = (async (_url, init) => {
    const q = JSON.parse(String(init?.body));
    calls.push(q);
    if (options.status)
      return new Response("", {
        status: options.status,
        headers: { "Retry-After": "120" },
      });
    return new Response(
      JSON.stringify({
        jsonrpc: "2.0",
        id: q.id,
        result:
          q.method === "getGenesisHash"
            ? descriptor.genesisHash
            : {
                context: { slot: "600000000" },
                value: q.params[0].map((k: string) => accounts[k] ?? null),
              },
      }),
    );
  }) as typeof fetch;
  return { reader: new AccountReader(new DirectRpc(fetcher)), calls };
}
const signal = () => new AbortController().signal;
describe("F3 checked public account pages", () => {
  it("bounds even a maximum u64 counter to ten descending IDs", () => {
    expect(pageIds("18446744073709551615", "0")).toHaveLength(10);
    expect(pageIds("13", "1")).toEqual([2n, 1n, 0n]);
    expect(pageIds("1", "1")).toEqual([]);
    expect(() => pageIds("18446744073709551616", "0")).toThrow();
  });
  it("checks trader/PDA/layout and displays only decoder values", async () => {
    const m = mock(),
      r = await m.reader.read(fixture.wallet, "0", signal());
    expect(r.counter).toBe("1");
    expect(r.rows[0]).toMatchObject({
      state: "checked",
      id: "0",
      address: fixture.account,
    });
    expect(r.rows[0].account!.b).toBe(2500000000n);
    expect(r.rules?.feeBps).toBe(40);
    expect(m.calls).toHaveLength(6);
  });
  it("large counter never expands the getMultipleAccounts request beyond one page", async () => {
    const m = mock({ counter: "18446744073709551615" });
    const r = await m.reader.read(fixture.wallet, "0", signal());
    expect(r.rows).toHaveLength(10);
    expect(
      m.calls
        .filter((x) => x.method === "getMultipleAccounts")
        .every((x) => x.params[0].length <= 12),
    ).toBe(true);
  });
  it("wrong owner is rejected as an unverified row", async () => {
    const m = mock({ owner: "11111111111111111111111111111111" }),
      r = await m.reader.read(fixture.wallet, "0", signal());
    expect(r.rows[0].state).toBe("unverified");
    expect(r.rows[0].account).toBeUndefined();
  });
  it("absent profile is an explicit empty observation, not full history", async () => {
    const r = await mock({ empty: true }).reader.read(
      fixture.wallet,
      "0",
      signal(),
    );
    expect(r.profileFound).toBe(false);
    expect(r.rows).toEqual([]);
  });
  it("new account appears only after a fresh checked counter", async () => {
    let r = await mock({ counter: "0" }).reader.read(
      fixture.wallet,
      "0",
      signal(),
    );
    expect(r.rows).toHaveLength(0);
    r = await mock({ counter: "1" }).reader.read(fixture.wallet, "0", signal());
    expect(r.rows[0].state).toBe("checked");
  });
  it.each([403, 429])(
    "a %s blocks subsequent provider/read operations rather than proving absence",
    async (status) => {
      const m = mock({ status });
      await expect(
        m.reader.read(fixture.wallet, "0", signal()),
      ).rejects.toThrow();
      await expect(
        m.reader.read(fixture.wallet, "0", signal()),
      ).rejects.toThrow();
      expect(m.calls).toHaveLength(1);
    },
  );
  it("A1 is independently checked rather than inferred from proof text", async () => {
    const r = await mock().reader.demo(signal());
    expect(r.rows[0].state).toBe("checked");
    expect(r.rows[0].address).toBe(fixture.account);
  });
  it("invalid address and page numbers fail before any fetch", async () => {
    const m = mock();
    expect(() => publicAddress("not a wallet")).toThrow();
    await expect(
      m.reader.read(fixture.wallet, "-1", signal()),
    ).rejects.toThrow();
    expect(m.calls).toHaveLength(0);
  });
});
describe("F3 isolation and observation policy", () => {
  it("late old data cannot cross wallet/page boundaries", async () => {
    let resolve!: (v: AccountPage) => void;
    const port: AccountPort = {
        mode: "offline_mock",
        read: () =>
          new Promise((r) => {
            resolve = r;
          }),
        demo: vi.fn(),
      },
      resource = new AccountResource(port);
    resource.select(fixture.wallet);
    const pending = resource.refresh();
    resource.select("11111111111111111111111111111111", "1");
    resolve(await mock().reader.read(fixture.wallet, "0", signal()));
    await pending;
    expect(resource.getSnapshot()).toMatchObject({
      wallet: "11111111111111111111111111111111",
      page: "1",
      data: null,
      loading: false,
    });
  });
  it("cancel hides in-flight results while retaining a clearly dated earlier observation", async () => {
    const m = mock(),
      resource = new AccountResource(m.reader);
    resource.select(fixture.wallet);
    await resource.refresh();
    const previous = resource.getSnapshot().data;
    let resolve!: (v: AccountPage) => void;
    m.reader.read = () =>
      new Promise((r) => {
        resolve = r;
      });
    const p = resource.refresh();
    resource.cancel();
    resolve(previous!);
    await p;
    expect(resource.getSnapshot().data).toBe(previous);
    expect(resource.getSnapshot().loading).toBe(false);
  });
  it("visible-only opt-in polling backs off within 60–300 seconds", () => {
    expect([0, 1, 2, 3, 99].map(pollDelay)).toEqual([
      60000, 120000, 240000, 300000, 300000,
    ]);
    expect(pollAllowed(false, true, fixture.wallet, false)).toBe(false);
    expect(pollAllowed(true, false, fixture.wallet, false)).toBe(false);
    expect(pollAllowed(true, true, fixture.wallet, true)).toBe(false);
    expect(pollAllowed(true, true, fixture.wallet, false)).toBe(true);
  });
  it("money stays exact, statuses follow canonical constants and null evidence stays pending", () => {
    expect(exactAmount(-1000001n)).toBe("−1.000001");
    expect(exactAmount("9007199254740993")).toBe("9,007,199,254.740993");
    expect(stateName(2)).toBe("Abandoned");
    expect(stateName(3)).toBe("Graduated");
    expect(pendingValue(null)).toBe("Pending");
    // After day 2 every proof section carries real evidence; none is pending any more.
    expect(proofSections().filter((s) => s.pending)).toHaveLength(0);
    expect(chainTime(0n)).toBe("Not recorded");
    expect(chainTime(9223372036854775807n)).toBe("Outside display range");
  });
});

it("allows browser-normalized trailing slash only on the fixed RPC URL", async () => {
  const rpc = new DirectRpc((async (_url, init) => {
    const q = JSON.parse(String(init?.body));
    const response = new Response(
      JSON.stringify({
        jsonrpc: "2.0",
        id: q.id,
        result: descriptor.genesisHash,
      }),
    );
    Object.defineProperty(response, "url", {
      value: DEVNET_ENDPOINTS[0] + "/",
    });
    return response;
  }) as typeof fetch);
  expect(await rpc.read(0, "getGenesisHash", [], signal())).toBe(
    descriptor.genesisHash,
  );
});
