import { describe, expect, it, vi } from "vitest";
import {
  DEVNET_ENDPOINTS,
  DirectRpc,
  resolveDevnetEndpoints,
} from "../src/buy/rpc";

const SOLANA = "https://api.devnet.solana.com";
const ONFINALITY = "https://solana-devnet.api.onfinality.io/public";
// Obviously fake operator URLs; the real private URL never appears in a test.
const OWN = "https://devnet.example-rpc.test/v2/FAKE-KEY-FOR-TESTS";

describe("devnet operator list", () => {
  it("uses the two public operators in the tests (env stubbed empty)", () => {
    expect([...DEVNET_ENDPOINTS]).toEqual([SOLANA, ONFINALITY]);
  });
  it("puts a valid private devnet URL first and keeps one public operator second", () => {
    expect([...resolveDevnetEndpoints(OWN)]).toEqual([OWN, SOLANA]);
    expect([...resolveDevnetEndpoints("  " + OWN + "  ")]).toEqual([
      OWN,
      SOLANA,
    ]);
    expect([
      ...resolveDevnetEndpoints("https://x.solana-devnet.example.test/KEY"),
    ]).toEqual(["https://x.solana-devnet.example.test/KEY", SOLANA]);
    expect(Object.isFrozen(resolveDevnetEndpoints(OWN))).toBe(true);
  });
  it.each([
    ["missing", undefined],
    ["empty", ""],
    ["blank", "   "],
    ["not a string", 42],
    ["not a url", "devnet-but-not-a-url"],
    ["no devnet", "https://rpc.example.test/v2/KEY"],
    ["mainnet", "https://mainnet.example-rpc.test/v2/KEY"],
    ["devnet and mainnet", "https://devnet.example-rpc.test/mainnet-beta"],
    ["MAINNET in capitals", "https://DEVNET.example-rpc.test/MAINNET"],
    ["plain http", "http://devnet.example-rpc.test/v2/KEY"],
    ["websocket", "wss://devnet.example-rpc.test/v2/KEY"],
    ["credentials in url", "https://user:pw@devnet.example-rpc.test/v2/KEY"],
    ["fragment", "https://devnet.example-rpc.test/v2/KEY#x"],
    ["too long", "https://devnet.example-rpc.test/" + "a".repeat(600)],
    ["duplicate of the public operator", SOLANA],
    ["duplicate of the second public operator", ONFINALITY],
    ["public operator with a path", "https://api.devnet.solana.com/extra"],
  ])("falls back to the two public operators when the URL is %s", (_n, v) => {
    expect([...resolveDevnetEndpoints(v)]).toEqual([SOLANA, ONFINALITY]);
  });
  it("never puts the URL in an error, a measurement or a request other than to that operator", async () => {
    const urls: string[] = [];
    const fetcher = vi.fn(async (u: RequestInfo | URL) => {
      urls.push(String(u));
      return new Response("", { status: 500 });
    });
    const rpc = new DirectRpc(fetcher as unknown as typeof fetch);
    const signal = new AbortController().signal;
    let message = "";
    try {
      await rpc.read(0, "getGenesisHash", [], signal);
    } catch (e) {
      message = String((e as Error).message) + JSON.stringify(e);
    }
    expect(JSON.stringify(rpc.measurements()) + message).not.toContain("FAKE");
    expect(urls).toEqual([DEVNET_ENDPOINTS[0]]);
  });
});

describe("with a private operator configured", () => {
  async function load() {
    vi.resetModules();
    vi.stubEnv("VITE_DEVNET_RPC_URL", OWN);
    try {
      return await import("../src/buy/rpc");
    } finally {
      vi.stubEnv("VITE_DEVNET_RPC_URL", "");
    }
  }
  const body = (id: string, result: unknown) =>
    JSON.stringify({ jsonrpc: "2.0", id, result });
  it("reads the env var, sends provider 0 to the private URL and provider 1 to the public one", async () => {
    const m = await load();
    expect([...m.DEVNET_ENDPOINTS]).toEqual([OWN, SOLANA]);
    expect(m.PRIVATE_DEVNET_ACTIVE).toBe(true);
    const urls: string[] = [];
    const fetcher = vi.fn(async (u: RequestInfo | URL, init?: RequestInit) => {
      urls.push(String(u));
      const q = JSON.parse(String(init?.body));
      return new Response(body(q.id, "genesis"));
    });
    const rpc = new m.DirectRpc(fetcher as unknown as typeof fetch);
    const signal = new AbortController().signal;
    expect(await rpc.read(0, "getGenesisHash", [], signal)).toBe("genesis");
    expect(await rpc.read(1, "getGenesisHash", [], signal)).toBe("genesis");
    expect(urls).toEqual([OWN, SOLANA]);
  });
  it("keeps the 403 and 429 behaviour on the private operator: one call, then both providers stop", async () => {
    const m = await load();
    for (const status of [403, 429]) {
      const fetcher = vi.fn(
        async (_u: RequestInfo | URL, _i?: RequestInit) =>
          new Response("", { status, headers: { "Retry-After": "60" } }),
      );
      const rpc = new m.DirectRpc(fetcher as unknown as typeof fetch);
      const signal = new AbortController().signal;
      await expect(rpc.read(0, "getGenesisHash", [], signal)).rejects.toThrow();
      await expect(rpc.read(1, "getGenesisHash", [], signal)).rejects.toThrow();
      expect(fetcher).toHaveBeenCalledTimes(1);
      expect(fetcher.mock.calls[0][0]).toBe(OWN);
    }
  });
  it("does not retry or fail over automatically on a server error", async () => {
    const m = await load();
    const fetcher = vi.fn(async () => new Response("", { status: 503 }));
    const rpc = new m.DirectRpc(fetcher as unknown as typeof fetch);
    await expect(
      rpc.read(0, "getGenesisHash", [], new AbortController().signal),
    ).rejects.toThrow();
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it("rejects a redirect away from the private URL and keeps the read allowlist closed", async () => {
    const m = await load();
    const fetcher = vi.fn(async (_u: RequestInfo | URL, init?: RequestInit) => {
      const q = JSON.parse(String(init?.body));
      const r = new Response(body(q.id, "x"));
      Object.defineProperty(r, "url", { value: "https://elsewhere.test/" });
      return r;
    });
    const rpc = new m.DirectRpc(fetcher as unknown as typeof fetch);
    const signal = new AbortController().signal;
    await expect(rpc.read(0, "getGenesisHash", [], signal)).rejects.toThrow();
    for (const method of ["sendTransaction", "requestAirdrop", "getBalance"])
      await expect(rpc.read(0, method, [], signal)).rejects.toThrow();
  });
});
