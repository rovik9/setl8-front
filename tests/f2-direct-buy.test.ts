// @vitest-environment node
import { describe, it, expect, vi } from "vitest";
import { DirectRpc, DEVNET_ENDPOINTS } from "../src/buy/rpc";
import {
  exactJson,
  fromHex,
  hash,
  u64,
  safeNumber,
  b64,
  un64,
} from "../src/buy/bytes";
import { PurchasePreflight } from "../src/buy/preflight";
import { PurchaseFlow } from "../src/buy/purchaseFlow";
import { PublicAttemptStore, ATTEMPT_KEY } from "../src/buy/recovery";
import { verifySignedPurchase } from "../src/buy/signed";
import { reconcilePurchase } from "../src/buy/receipt";
import type { CheckedPurchase, PurchasePort } from "../src/buy/direct-types";
import {
  ephemeral,
  offlineAccounts,
  offlineFetch,
  memoryStorage,
  ctx,
  descriptor,
  v,
  receiptFixture,
} from "./f2-fixture";
async function setup() {
  const signer = await ephemeral(),
    accounts = offlineAccounts(signer.address),
    rpc = new DirectRpc(offlineFetch(accounts)),
    preflight = new PurchasePreflight(rpc),
    store = new PublicAttemptStore(memoryStorage());
  const port: PurchasePort = {
    mode: "offline_mock",
    check: (...a) => preflight.check(...a),
    revalidate: vi.fn(async () => {}),
    broadcast: vi.fn(async () => {}),
    reconcile: (a, s) => reconcilePurchase(rpc, a, s),
  };
  const flow = new PurchaseFlow(port, store, async (f) => f());
  await flow.restore();
  flow.select(signer.address, "0");
  await flow.check();
  expect(flow.getSnapshot().phase).toBe("ready");
  return { flow, port, store, signer, accounts, rpc, preflight };
}
const signal = () => new AbortController().signal;
describe("exact read/preflight boundaries", () => {
  it("preserves u64 JSON lexemes, strings and rejects unsafe request projections", () => {
    const x = exactJson(
      '{"a":9007199254740993,"b":"123\\\"45","c":1.5,"d":true}',
    );
    expect(x).toEqual({
      a: "9007199254740993",
      b: '123"45',
      c: "1.5",
      d: true,
    });
    expect(u64(x.a)).toBe("9007199254740993");
    expect(() => u64(x.c)).toThrow();
    expect(() => u64("18446744073709551616")).toThrow();
    expect(() => safeNumber(x.a)).toThrow();
    expect(() => exactJson('{"a":01}')).toThrow();
  });
  it("corroborates first-use nonce zero, exact fees/rent and all SDK terms", async () => {
    const c = await new PurchasePreflight(new DirectRpc(offlineFetch())).check(
      v.trader,
      "0",
      3,
      signal(),
    );
    expect(c).toMatchObject({
      nextChallengeId: "0",
      price: "30000000",
      fee: "120000",
      total: "30120000",
      size: "2500000000",
      networkFee: "5000",
      rent: "76200",
      solRequired: "81200",
    });
    expect(c.expectedAccount).toBe(
      ctx
        .tradingAccount(
          new (await import("@setl8/p30-sdk")).PublicKey(v.trader),
          0n,
        )[0]
        .toBase58(),
    );
  });
  it.each([
    "missing_source",
    "insufficient_usdc",
    "insufficient_sol",
    "genesis",
    "different_provider",
    "image",
  ])("fails closed for %s", async (kind) => {
    const accounts = offlineAccounts(),
      source = ctx
        .tokenAccount(
          new (await import("@setl8/p30-sdk")).PublicKey(v.trader),
          "usdc",
        )
        .toBase58();
    if (kind === "missing_source") accounts[source] = null;
    if (kind === "insufficient_usdc") {
      const b = un64(accounts[source]!.data[0]);
      new DataView(b.buffer).setBigUint64(64, 1n, true);
      accounts[source]!.data[0] = b64(b);
    }
    if (kind === "insufficient_sol") accounts[v.trader]!.lamports = "1";
    if (kind === "image") {
      const key = Object.keys(accounts).find(
        (k) => accounts[k]?.data[0].length! > 1000000,
      )!;
      const b = un64(accounts[key]!.data[0]);
      b[100] ^= 1;
      accounts[key]!.data[0] = b64(b);
    }
    const fetcher = offlineFetch(accounts, (m, p, n) =>
      kind === "genesis" && m === "getGenesisHash"
        ? "wrong"
        : kind === "different_provider" &&
            m === "getMultipleAccounts" &&
            n === 1
          ? { context: { slot: "600000000" }, value: p[0].map(() => null) }
          : undefined,
    );
    await expect(
      new PurchasePreflight(new DirectRpc(fetcher)).check(
        v.trader,
        "0",
        1,
        signal(),
      ),
    ).rejects.toThrow();
  });
  it("never treats an RPC error as first-use account absence", async () => {
    const fetcher = (async () =>
      new Response('{"jsonrpc":"2.0","error":{"code":-1}}')) as typeof fetch;
    await expect(
      new PurchasePreflight(new DirectRpc(fetcher)).check(
        v.trader,
        "0",
        1,
        signal(),
      ),
    ).rejects.toThrow();
  });
  it.each([403, 429])("stops both providers on HTTP %s", async (status) => {
    const fetcher = vi.fn(
      async (_url: RequestInfo | URL, _init?: RequestInit) =>
        new Response("", { status, headers: { "Retry-After": "60" } }),
    );
    const rpc = new DirectRpc(fetcher);
    await expect(rpc.read(0, "getGenesisHash", [], signal())).rejects.toThrow();
    await expect(rpc.read(1, "getGenesisHash", [], signal())).rejects.toThrow();
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fetcher.mock.calls[0][0]).toBe(DEVNET_ENDPOINTS[0]);
  });
  it("honors Retry-After even on success and forbids sends", async () => {
    const fetcher = vi.fn(
        async (_url: RequestInfo | URL, _init?: RequestInit) =>
          new Response("{}", { headers: { "Retry-After": "120" } }),
      ),
      rpc = new DirectRpc(fetcher);
    await expect(rpc.read(0, "getGenesisHash", [], signal())).rejects.toThrow();
    expect(() => rpc.begin()).toThrow();
    await expect(rpc.sendTransaction()).rejects.toThrow();
    await expect(
      rpc.read(0, "sendTransaction", [], signal()),
    ).rejects.toThrow();
  });
  it("bounds request/response work and cancels even a fetch ignoring its signal", async () => {
    const large = new DirectRpc(
      (async () =>
        new Response("", {
          headers: { "Content-Length": "2500001" },
        })) as typeof fetch,
    );
    await expect(
      large.read(0, "getGenesisHash", [], signal()),
    ).rejects.toMatchObject({ code: "response_limit" });
    const c = new AbortController(),
      rpc = new DirectRpc((() => new Promise(() => {})) as typeof fetch),
      p = rpc.read(0, "getGenesisHash", [], c.signal);
    c.abort();
    await expect(p).rejects.toMatchObject({ code: "read_interrupted" });
    const bounded = new DirectRpc(offlineFetch());
    for (let i = 0; i < 32; i++)
      await bounded.read(0, "getGenesisHash", [], signal());
    await expect(
      bounded.read(1, "getGenesisHash", [], signal()),
    ).rejects.toMatchObject({ code: "work_limit" });
  });
});
describe("offline-only signing and persistent recovery", () => {
  it("production gate never invokes a wallet or broadcasts", async () => {
    const s = await setup();
    (s.port as { mode: string }).mode = "gated_live";
    const sign = vi.fn(s.signer.signTransaction);
    await s.flow.approve({ ...s.signer, signTransaction: sign });
    expect(sign).not.toHaveBeenCalled();
    expect(s.port.broadcast).not.toHaveBeenCalled();
  });
  it("persists before the prompt, verifies exact signed bytes and retains signature before a single send", async () => {
    const s = await setup();
    let signature: string | null = null;
    await s.flow.approve({
      ...s.signer,
      async signTransaction(b) {
        const a = await s.store.read();
        expect(a?.stage).toBe("awaiting_wallet");
        expect(a?.signature).toBeNull();
        return s.signer.signTransaction(b);
      },
    });
    signature = (await s.store.read())!.signature;
    expect(signature).toBeTruthy();
    expect(s.port.broadcast).toHaveBeenCalledTimes(1);
    expect(s.flow.getSnapshot().phase).toBe("uncertain");
    await s.flow.approve(s.signer);
    expect(s.port.broadcast).toHaveBeenCalledTimes(1);
  });
  it.each(["message", "signature"])(
    "refuses modified %s before send",
    async (kind) => {
      const s = await setup();
      await s.flow.approve({
        ...s.signer,
        async signTransaction(b) {
          const p = await s.signer.signTransaction(b);
          p[kind === "message" ? 100 : 3] ^= 1;
          return p;
        },
      });
      expect(s.flow.getSnapshot().phase).toBe("uncertain");
      expect(s.port.broadcast).not.toHaveBeenCalled();
      expect((await s.store.read())!.signature).toBeNull();
    },
  );
  it("refuses wrong signer even for the exact message", async () => {
    const s = await setup(),
      other = await ephemeral(),
      c = s.flow.getSnapshot().checked!,
      packet = await other.signTransaction(
        fromHex(c.prepared.unsignedTransactionHex),
      );
    await expect(
      verifySignedPurchase(
        packet,
        c.prepared.messageHex,
        s.signer.address,
        c.prepared.messageSha256,
      ),
    ).rejects.toThrow("signature");
  });
  it("storage failure blocks the prompt", async () => {
    const s = await setup(),
      store = new PublicAttemptStore({
        getItem: () => null,
        setItem: () => {
          throw Error("quota");
        },
      }),
      flow = new PurchaseFlow(s.port, store, async (f) => f());
    flow.select(s.signer.address, "0");
    await flow.check();
    const sign = vi.fn(s.signer.signTransaction);
    await flow.approve({ ...s.signer, signTransaction: sign });
    expect(sign).not.toHaveBeenCalled();
    expect(s.port.broadcast).not.toHaveBeenCalled();
    expect(flow.getSnapshot().phase).toBe("blocked");
  });
  it("signature persistence failure blocks broadcast and retains original unresolved attempt", async () => {
    const s = await setup(),
      storage = memoryStorage(),
      write = storage.setItem;
    storage.setItem = (k, v) => {
      if (storage.values.size) throw Error("quota");
      write(k, v);
    };
    const store = new PublicAttemptStore(storage),
      flow = new PurchaseFlow(s.port, store, async (f) => f());
    flow.select(s.signer.address, "0");
    await flow.check();
    await flow.approve(s.signer);
    expect(s.port.broadcast).not.toHaveBeenCalled();
    expect((await store.read())?.stage).toBe("awaiting_wallet");
    expect(flow.getSnapshot().phase).toBe("uncertain");
  });
  it("wallet rejection and elapsed blockhash never unlock payment; reload/wallet switches retain it", async () => {
    const s = await setup();
    await s.flow.approve({
      ...s.signer,
      signTransaction: async () => {
        throw Error("User rejected");
      },
    });
    expect(s.flow.getSnapshot().phase).toBe("uncertain");
    const loaded = new PurchaseFlow(
      s.port,
      s.store,
      async (f) => f(),
      () => Date.now() + 999999999,
    );
    await loaded.restore();
    loaded.select((await ephemeral()).address, "9");
    await loaded.checkAgain();
    expect(loaded.getSnapshot().phase).toBe("uncertain");
    expect(loaded.getSnapshot().attempt?.wallet).toBe(s.signer.address);
    expect(loaded.getSnapshot().result?.message).toContain(
      "No exact signature",
    );
    await loaded.check();
    expect(loaded.getSnapshot().checked).toBeNull();
  });
  it("wallet switch during signing stores the returned signature without broadcasting", async () => {
    const s = await setup();
    let release!: (b: Uint8Array) => void;
    const pending = s.flow.approve({
      ...s.signer,
      signTransaction: (b) =>
        new Promise((resolve) => {
          release = async () => resolve(await s.signer.signTransaction(b));
        }),
    });
    await vi.waitFor(() =>
      expect(s.flow.getSnapshot().phase).toBe("awaiting_wallet"),
    );
    s.flow.select((await ephemeral()).address, "1");
    release(new Uint8Array());
    await pending;
    expect((await s.store.read())?.signature).toBeTruthy();
    expect(s.port.broadcast).not.toHaveBeenCalled();
    expect(s.flow.getSnapshot().phase).toBe("uncertain");
  });
  it("discards delayed old checks after a wallet/tier change", async () => {
    const s = await setup(),
      old = s.flow.getSnapshot().checked!;
    let done!: (c: CheckedPurchase) => void;
    s.port.check = () =>
      new Promise((resolve) => {
        done = resolve;
      });
    s.flow.select(s.signer.address, "1");
    const pending = s.flow.check();
    await vi.waitFor(() => expect(s.flow.getSnapshot().phase).toBe("checking"));
    s.flow.select(null, "2");
    done(old);
    await pending;
    expect(s.flow.getSnapshot()).toMatchObject({
      wallet: null,
      tier: "2",
      checked: null,
      phase: "idle",
    });
  });
  it("corrupt recovery is a blocking state, not an empty/new attempt", async () => {
    const storage = memoryStorage();
    storage.setItem(ATTEMPT_KEY, '{"digest":"bad","record":{}}');
    const s = await setup(),
      flow = new PurchaseFlow(
        s.port,
        new PublicAttemptStore(storage),
        async (f) => f(),
      );
    await flow.restore();
    flow.select(s.signer.address, "0");
    await flow.check();
    expect(flow.getSnapshot().phase).toBe("blocked");
    expect(flow.getSnapshot().checked).toBeNull();
  });
  it("an occupied cross-tab lock prevents approval", async () => {
    const s = await setup(),
      flow = new PurchaseFlow(s.port, s.store, async () => {
        throw Error("Another tab");
      });
    flow.select(s.signer.address, "0");
    await flow.check();
    const sign = vi.fn(s.signer.signTransaction);
    await flow.approve({ ...s.signer, signTransaction: sign });
    expect(sign).not.toHaveBeenCalled();
  });
});
describe("review timing and revalidation", () => {
  it("does not prompt if the original review expires during revalidation", async () => {
    const s = await setup();
    let now = Date.now();
    const flow = new PurchaseFlow(
      s.port,
      s.store,
      async (f) => f(),
      () => now,
    );
    flow.select(s.signer.address, "0");
    await flow.check();
    s.port.revalidate = async () => {
      now = Number(flow.getSnapshot().checked!.expiresAt);
    };
    const sign = vi.fn(s.signer.signTransaction);
    await flow.approve({ ...s.signer, signTransaction: sign });
    expect(sign).not.toHaveBeenCalled();
    expect(s.port.broadcast).not.toHaveBeenCalled();
  });
  it("retains a signed attempt if current terms change before broadcast", async () => {
    const s = await setup();
    let checks = 0;
    s.port.revalidate = async () => {
      if (++checks === 2) throw Error("Terms changed");
    };
    await s.flow.approve(s.signer);
    expect((await s.store.read())?.signature).toBeTruthy();
    expect(s.port.broadcast).not.toHaveBeenCalled();
    expect(s.flow.getSnapshot().phase).toBe("uncertain");
  });
  it("expired original blockhash is not replaced by a newer latest hash", async () => {
    const s = await setup();
    const original = s.rpc.read.bind(s.rpc);
    vi.spyOn(s.rpc, "read").mockImplementation((p, m, args, signal) =>
      m === "getBlockHeight"
        ? Promise.resolve("700000001")
        : original(p, m, args, signal),
    );
    await expect(
      s.preflight.revalidate(s.flow.getSnapshot().checked!, signal()),
    ).rejects.toThrow("expired");
  });
});
describe("bounded finalized receipt/account origin reconciliation", () => {
  it("keeps a confirmed observation pending; missing status remains uncertain", async () => {
    const s = await setup();
    await s.flow.approve(s.signer);
    const a = (await s.store.read())!;
    const rpc = new DirectRpc(
      offlineFetch(s.accounts, (m) =>
        m === "getSignatureStatuses"
          ? {
              value: [
                {
                  slot: "600000003",
                  err: null,
                  confirmationStatus: "confirmed",
                },
              ],
            }
          : undefined,
      ),
    );
    expect((await reconcilePurchase(rpc, a, signal())).state).toBe("confirmed");
    expect((await reconcilePurchase(s.rpc, a, signal())).state).toBe(
      "uncertain",
    );
  });
  it("corroborates an exact finalized receipt, debit and expected account; retains public origin only", async () => {
    const s = await setup(),
      c = s.flow.getSnapshot().checked!,
      packet = await s.signer.signTransaction(
        fromHex(c.prepared.unsignedTransactionHex),
      );
    await s.flow.approve(s.signer);
    const a = (await s.store.read())!,
      fixture = await receiptFixture(s.signer.address, packet, a.signature!);
    const result = await reconcilePurchase(
      new DirectRpc(fixture.fetcher),
      a,
      signal(),
    );
    expect(result).toMatchObject({
      state: "verified",
      actualDebit: "30120000",
      account: a.expectedAccount,
    });
  });
  it.each(["truncated", "event", "missing_history", "debit"])(
    "refuses incomplete/contradictory %s provenance",
    async (kind) => {
      const s = await setup(),
        c = s.flow.getSnapshot().checked!,
        packet = await s.signer.signTransaction(
          fromHex(c.prepared.unsignedTransactionHex),
        );
      await s.flow.approve(s.signer);
      const a = (await s.store.read())!,
        fixture = await receiptFixture(s.signer.address, packet, a.signature!);
      if (kind === "truncated")
        fixture.transaction.meta.logMessages.push("Log truncated");
      if (kind === "event")
        fixture.transaction.meta.innerInstructions[0].instructions.pop();
      if (kind === "debit")
        fixture.transaction.meta.postTokenBalances[0].uiTokenAmount.amount =
          "1";
      const fetcher =
        kind === "missing_history"
          ? offlineFetch(offlineAccounts(s.signer.address, true), (m) =>
              m === "getSignatureStatuses"
                ? {
                    value: [
                      {
                        slot: "600000003",
                        err: null,
                        confirmationStatus: "finalized",
                      },
                    ],
                  }
                : m === "getTransaction"
                  ? fixture.transaction
                  : m === "getSignaturesForAddress"
                    ? []
                    : undefined,
            )
          : fixture.fetcher;
      expect(
        (await reconcilePurchase(new DirectRpc(fetcher), a, signal())).state,
      ).toBe("uncertain");
    },
  );
});
