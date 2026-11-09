// @vitest-environment node
// Offline only: every RPC response is manufactured in memory by tests/f2-fixture.ts. Nothing is signed by a real
// wallet, sent, or fetched. Proves reconcilePurchase against finalized receipts whose on-chain message is the
// prepared message plus the one allowed wallet-added SetComputeUnitPrice instruction.
import { describe, expect, it, vi } from "vitest";
import bs58 from "bs58";
import { DirectRpc, DEVNET_ENDPOINTS } from "../src/buy/rpc";
import { fromHex, hash, hex } from "../src/buy/bytes";
import { PurchasePreflight } from "../src/buy/preflight";
import { PurchaseFlow } from "../src/buy/purchaseFlow";
import { PublicAttemptStore, ATTEMPT_KEY } from "../src/buy/recovery";
import { reconcilePurchase } from "../src/buy/receipt";
import { SignedPurchaseMismatch } from "../src/buy/signed";
import { priorityFeeLamports } from "../src/buy/walletReturn";
import type { PublicAttempt, PurchasePort } from "../src/buy/direct-types";
import {
  descriptor,
  ephemeral,
  memoryStorage,
  offlineAccounts,
  offlineFetch,
  receiptFixture,
} from "./f2-fixture";
import {
  encodeModel,
  insert,
  packetOf,
  priceIx,
  priceModelIx,
  reverseWithin,
  split,
  toModel,
} from "./wallet-return-fixture";

const signal = () => new AbortController().signal;
const NOT_PLAN =
  "The retained signed message is not the approved purchase plan or its one allowed price instruction.";

/** A real offline approval gives a genuine retained attempt; scenarios then rewrite only its signed fields. */
async function setup() {
  const signer = await ephemeral(),
    accounts = offlineAccounts(signer.address),
    rpc = new DirectRpc(offlineFetch(accounts)),
    preflight = new PurchasePreflight(rpc),
    storage = memoryStorage(),
    store = new PublicAttemptStore(storage);
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
  await flow.approve(signer);
  const base = (await store.read())!,
    prepared = fromHex(base.messageHex);
  expect(base.signature).toBeTruthy();
  return {
    signer,
    storage,
    store,
    base,
    prepared,
    computeIndex: split(prepared).computeIndex,
    openProgramIndex: split(prepared).keys.indexOf(descriptor.levProgramId),
  };
}
type S = Awaited<ReturnType<typeof setup>>;

/**
 * The attempt as retained for `message`, plus the finalized receipt of the packet the wallet signed over it.
 * `shift` is how far the Opened-event inner-instruction group index is moved from the prepared index (1).
 */
async function scenario(
  s: S,
  message: Uint8Array,
  opts: {
    price?: bigint;
    shift?: number;
    retained?: Partial<PublicAttempt>;
  } = {},
) {
  const packet = await s.signer.signTransaction(packetOf(message)),
    signature = bs58.encode(packet.slice(1, 65)),
    // Chain metadata indexes accounts in the order of the message that actually ran (the signed one).
    fixture = await receiptFixture(
      s.signer.address,
      packet,
      signature,
      toModel(message).keys.map((k) => k.key),
    ),
    group = fixture.transaction.meta.innerInstructions[0];
  expect(group.index).toBe("1");
  group.index = String(1 + (opts.shift ?? 0));
  const attempt: PublicAttempt = {
    ...s.base,
    signature,
    stage: "signed",
    signedMessageHex: hex(message),
    signedMessageSha256: await hash(message),
    computeUnitPriceMicroLamports:
      opts.price === undefined ? null : opts.price.toString(),
    priorityFeeLamports:
      opts.price === undefined
        ? "0"
        : priorityFeeLamports(opts.price, 400000).toString(),
    ...opts.retained,
  };
  return {
    attempt,
    signature,
    fixture,
    reconcile: () =>
      reconcilePurchase(new DirectRpc(fixture.fetcher), attempt, signal()),
  };
}
/** Where the open instruction sits on chain after the price instruction is inserted at `at`. */
const shiftFor = (at: number) => (at <= 1 ? 1 : 0);

describe("(a) a finalized receipt for the prepared message plus one price instruction reconciles like the exact message", () => {
  it("the exact message still reconciles to verified (baseline)", async () => {
    const s = await setup(),
      r = await (await scenario(s, s.prepared)).reconcile();
    expect(r).toMatchObject({
      state: "verified",
      actualDebit: "30120000",
      account: s.base.expectedAccount,
    });
  });
  it.each([0, 1, 2])(
    "price instruction at position %i, Opened group index shifted to %i accordingly: verified, same account and debit",
    async (at) => {
      const s = await setup(),
        exact = await (await scenario(s, s.prepared)).reconcile(),
        message = insert(s.prepared, at, priceIx(s.computeIndex, 5000n)),
        sc = await scenario(s, message, {
          price: 5000n,
          shift: shiftFor(at),
        });
      // The receipt is for the longer message and its group index really moved (position 2 stays at 1).
      expect(sc.fixture.transaction.meta.innerInstructions[0].index).toBe(
        String(1 + shiftFor(at)),
      );
      const r = await sc.reconcile();
      expect(r.state).toBe("verified");
      expect(r).toMatchObject({
        state: exact.state,
        message: exact.message,
        account: exact.account,
        actualDebit: exact.actualDebit,
        signature: sc.signature,
      });
      expect(r.signature).not.toBe(s.base.signature);
    },
  );
  it.each([0, 1, 2])(
    "price instruction at position %i with a debit that differs from the recorded review is finalized_observed, as for the exact message",
    async (at) => {
      const s = await setup(),
        total = { total: "30120001", price: "30000001" },
        exact = await (
          await scenario(s, s.prepared, { retained: total })
        ).reconcile(),
        message = insert(s.prepared, at, priceIx(s.computeIndex, 1n)),
        r = await (
          await scenario(s, message, {
            price: 1n,
            shift: shiftFor(at),
            retained: total,
          })
        ).reconcile();
      expect(exact.state).toBe("finalized_observed");
      expect(r).toMatchObject({
        state: "finalized_observed",
        message: exact.message,
        account: exact.account,
        actualDebit: exact.actualDebit,
      });
    },
  );
  it("a price exactly at the 1,000,000 lamport cap (2,500,000 micro-lamports per CU) reconciles", async () => {
    const s = await setup(),
      r = await (
        await scenario(
          s,
          insert(s.prepared, 1, priceIx(s.computeIndex, 2_500_000n)),
          { price: 2_500_000n, shift: 1 },
        )
      ).reconcile();
    expect(r.state).toBe("verified");
  });
});

describe("(b) the Opened-event group index shift matters", () => {
  it.each([0, 1])(
    "a receipt for the message with the price instruction at position %i is NOT accepted when its group index was not shifted",
    async (at) => {
      const s = await setup(),
        // The same receipt as in (a), except the group index stays at the prepared index 1, which on chain
        // is now the ComputeBudget limit/price instruction rather than the lev open instruction.
        r = await (
          await scenario(
            s,
            insert(s.prepared, at, priceIx(s.computeIndex, 5000n)),
            { price: 5000n, shift: 0 },
          )
        ).reconcile();
      expect(r).toEqual({
        state: "uncertain",
        message: "Opened CPI metadata is incomplete.",
      });
    },
  );
  it("position 2 (after the open instruction) does not shift: an index moved to 2 is refused", async () => {
    const s = await setup(),
      r = await (
        await scenario(
          s,
          insert(s.prepared, 2, priceIx(s.computeIndex, 5000n)),
          { price: 5000n, shift: 1 },
        )
      ).reconcile();
    expect(r).toEqual({
      state: "uncertain",
      message: "Opened CPI metadata is incomplete.",
    });
  });
  it("the exact message with a shifted group index is refused as well", async () => {
    const s = await setup(),
      r = await (await scenario(s, s.prepared, { shift: 1 })).reconcile();
    expect(r.state).toBe("uncertain");
  });
});

describe("(c) a retained attempt whose signed message is outside the allowed plan is not accepted", () => {
  const bad: [string, (s: S) => Uint8Array][] = [
    [
      "a second price instruction",
      (s) =>
        insert(
          insert(s.prepared, 1, priceIx(s.computeIndex, 1n)),
          0,
          priceIx(s.computeIndex, 1n),
        ),
    ],
    [
      "a price above the 1,000,000 lamport cap",
      (s) => insert(s.prepared, 1, priceIx(s.computeIndex, 2_500_001n)),
    ],
    [
      "an instruction of another program (the lev program, price-shaped bytes)",
      (s) => insert(s.prepared, 1, priceIx(s.openProgramIndex, 1n)),
    ],
    [
      "a non-price ComputeBudget instruction",
      (s) =>
        insert(
          s.prepared,
          1,
          Uint8Array.of(s.computeIndex, 0, 5, 4, 0, 0, 0, 1),
        ),
    ],
    [
      "a price instruction with an account",
      (s) =>
        insert(
          s.prepared,
          1,
          Uint8Array.of(s.computeIndex, 1, 0, 9, 3, 1, 0, 0, 0, 0, 0, 0, 0),
        ),
    ],
  ];
  it.each(bad)(
    "%s: uncertain, even though the finalized packet is exactly what that message signed",
    async (_n, build) => {
      const s = await setup(),
        message = build(s),
        sc = await scenario(s, message, { shift: 1 });
      // The attempt hash/price fields are consistent with the message; only the plan check can refuse it.
      expect(sc.attempt.signedMessageSha256).toBe(await hash(message));
      expect(await sc.reconcile()).toEqual({
        state: "uncertain",
        message: NOT_PLAN,
      });
    },
  );
  it("a retained signed hash that does not belong to the retained signed message is uncertain", async () => {
    const s = await setup(),
      message = insert(s.prepared, 1, priceIx(s.computeIndex, 5000n)),
      sc = await scenario(s, message, {
        price: 5000n,
        shift: 1,
        retained: { signedMessageSha256: "ab".repeat(32) },
      });
    expect(await sc.reconcile()).toEqual({
      state: "uncertain",
      message: NOT_PLAN,
    });
  });
  // verifySignedPurchase refuses a finalized packet that is not byte-for-byte the retained message by throwing the
  // usual SignedPurchaseMismatch (PurchaseFlow.checkAgain turns a throw into the uncertain phase with no unlock).
  it("a retained price message whose finalized packet carries a different price is refused", async () => {
    const s = await setup(),
      message = insert(s.prepared, 1, priceIx(s.computeIndex, 5000n)),
      other = insert(s.prepared, 1, priceIx(s.computeIndex, 5001n)),
      chain = await scenario(s, other, { price: 5001n, shift: 1 }),
      sc = await scenario(s, message, { price: 5000n, shift: 1 });
    await expect(
      reconcilePurchase(
        new DirectRpc(chain.fixture.fetcher),
        { ...sc.attempt, signature: chain.signature },
        signal(),
      ),
    ).rejects.toBeInstanceOf(SignedPurchaseMismatch);
  });
  it("a retained exact message whose finalized packet carries a price instruction is refused", async () => {
    const s = await setup(),
      chain = await scenario(
        s,
        insert(s.prepared, 1, priceIx(s.computeIndex, 5000n)),
        { price: 5000n, shift: 1 },
      ),
      exact = await scenario(s, s.prepared);
    await expect(
      reconcilePurchase(
        new DirectRpc(chain.fixture.fetcher),
        { ...exact.attempt, signature: chain.signature },
        signal(),
      ),
    ).rejects.toBeInstanceOf(SignedPurchaseMismatch);
  });
  it("the signature must be the one over the RETURNED message: a retained price message with the prepared-message signature is uncertain", async () => {
    const s = await setup(),
      sc = await scenario(
        s,
        insert(s.prepared, 1, priceIx(s.computeIndex, 5000n)),
        { price: 5000n, shift: 1 },
      );
    // The finalized packet is exactly the retained message, but the recorded signature is the old exact-message one.
    const r = await reconcilePurchase(
      new DirectRpc(sc.fixture.fetcher),
      { ...sc.attempt, signature: s.base.signature },
      signal(),
    );
    expect(r).toEqual({
      state: "uncertain",
      message:
        "The finalized transaction does not match the exact recorded signature/message.",
    });
  });
});

describe("(d) a legacy retained record without the signed fields still reconciles the exact message", () => {
  it("in memory: all four signed fields null", async () => {
    const s = await setup(),
      sc = await scenario(s, s.prepared, {
        retained: {
          signedMessageHex: null,
          signedMessageSha256: null,
          computeUnitPriceMicroLamports: null,
          priorityFeeLamports: null,
        },
      });
    expect(sc.attempt.signedMessageHex).toBeNull();
    expect(await sc.reconcile()).toMatchObject({
      state: "verified",
      actualDebit: "30120000",
      account: s.base.expectedAccount,
    });
  });
  it("as stored: a record written before the fields existed is read back and reconciles to verified", async () => {
    const s = await setup(),
      {
        signedMessageHex: _a,
        signedMessageSha256: _b,
        computeUnitPriceMicroLamports: _c,
        priorityFeeLamports: _d,
        ...legacy
      } = s.base,
      sc = await scenario(s, s.prepared),
      storage = memoryStorage();
    expect(Object.keys(legacy)).not.toContain("signedMessageHex");
    // The legacy record is the prepared-message attempt exactly as stored by an older build.
    const record = { ...legacy, signature: sc.signature };
    storage.setItem(
      ATTEMPT_KEY,
      JSON.stringify({
        record,
        digest: await hash(JSON.stringify(record)),
      }),
    );
    const read = (await new PublicAttemptStore(storage).read())!;
    expect(read).toMatchObject({
      signedMessageHex: null,
      signedMessageSha256: null,
      computeUnitPriceMicroLamports: null,
      priorityFeeLamports: null,
    });
    expect(
      await reconcilePurchase(
        new DirectRpc(sc.fixture.fetcher),
        read as PublicAttempt,
        signal(),
      ),
    ).toMatchObject({ state: "verified", actualDebit: "30120000" });
  });
  it("a legacy record cannot be used to reconcile a finalized packet that carries a price instruction (refused)", async () => {
    const s = await setup(),
      chain = await scenario(
        s,
        insert(s.prepared, 1, priceIx(s.computeIndex, 5000n)),
        { price: 5000n, shift: 1 },
      );
    await expect(
      reconcilePurchase(
        new DirectRpc(chain.fixture.fetcher),
        {
          ...s.base,
          signature: chain.signature,
          signedMessageHex: null,
          signedMessageSha256: null,
          computeUnitPriceMicroLamports: null,
          priorityFeeLamports: null,
        },
        signal(),
      ),
    ).rejects.toBeInstanceOf(SignedPurchaseMismatch);
  });
});

/**
 * Found on the real 6 Nov 2026 purchase: the two public operators return the SAME getTransaction data but emit
 * object keys in a different order, and reconcile used to compare the raw JSON text, so it answered "metadata
 * reports disagree" for a good receipt. Data is compared now; order of keys is not data.
 */
describe("(e) two operators that serve the same finalized transaction with their keys in a different order", () => {
  const reorder = (v: any): any =>
    Array.isArray(v)
      ? v.map(reorder)
      : v && typeof v === "object"
        ? Object.fromEntries(
            Object.keys(v)
              .reverse()
              .map((k) => [k, reorder(v[k])]),
          )
        : v;
  /** The second operator's getTransaction answer is rewritten by `rewrite` (default: only key order reversed). */
  /** `rewrite` edits a copy in place (or returns a replacement); the original response object is never touched. */
  const mutated = (result: any, rewrite: (tx: any) => any = (tx) => tx) => {
    const copy = structuredClone(result);
    return rewrite(copy) ?? copy;
  };
  const viaSecondOperator = (
    fetcher: typeof fetch,
    rewrite: (tx: any) => any = (tx) => tx,
  ): typeof fetch =>
    (async (url, init) => {
      const res = await fetcher(url, init);
      if (!String(url).startsWith(DEVNET_ENDPOINTS[1])) return res;
      const body = await res.json();
      if (JSON.parse(String(init?.body)).method === "getTransaction")
        body.result = reorder(mutated(body.result, rewrite));
      return new Response(JSON.stringify(body), {
        status: res.status,
        headers: { "Content-Type": "application/json" },
      });
    }) as typeof fetch;
  const run = async (
    s: S,
    message: Uint8Array,
    price: bigint | undefined,
    shift: number,
    rewrite?: (tx: any) => any,
  ) => {
    const sc = await scenario(s, message, { price, shift });
    return reconcilePurchase(
      new DirectRpc(viaSecondOperator(sc.fixture.fetcher, rewrite)),
      sc.attempt,
      signal(),
    );
  };
  it("the exact message still reconciles to verified", async () => {
    const s = await setup();
    expect((await run(s, s.prepared, undefined, 0)).state).toBe("verified");
  });
  it.each([0, 1])(
    "the message with the price instruction at position %i still reconciles to verified",
    async (at) => {
      const s = await setup(),
        r = await run(
          s,
          insert(s.prepared, at, priceIx(s.computeIndex, 375_000n)),
          375_000n,
          shiftFor(at),
        );
      expect(r.state).toBe("verified");
    },
  );
  it.each([
    [
      "a differing token balance",
      (tx: any) => {
        tx.meta.postTokenBalances[0].uiTokenAmount.amount = "1";
      },
    ],
    [
      "a differing log line",
      (tx: any) => {
        tx.meta.logMessages[0] += " ";
      },
    ],
    [
      "a differing fee",
      (tx: any) => {
        tx.meta.fee = "1";
      },
    ],
    [
      "an extra key",
      (tx: any) => {
        tx.meta.extra = true;
      },
    ],
    [
      "a missing key",
      (tx: any) => {
        delete tx.blockTime; // present (null) on the first operator, absent on the second
      },
    ],
    [
      "reordered inner instructions (array order is data)",
      (tx: any) => {
        tx.meta.innerInstructions[0].instructions.reverse();
      },
    ],
  ])("%s between the operators is still uncertain", async (_n, rewrite) => {
    const s = await setup();
    expect(await run(s, s.prepared, undefined, 0, rewrite)).toEqual({
      state: "uncertain",
      message:
        "The transaction metadata reports disagree. No complete history is inferred.",
    });
  });
});

/**
 * Found on the real 6 Nov 2026 purchase: Phantom re-sorted the account keys, so the finalized transaction's
 * inner-instruction and token-balance indexes follow the SIGNED message's order, not the prepared one. Reconcile
 * used to resolve them against the prepared order and answered "Opened event authority/parent is not established".
 */
describe("(f) a wallet that re-sorts the account keys", () => {
  const phantom = (s: S, at: number, price = 375_000n) => {
    const m = toModel(s.prepared);
    m.ixs.splice(at, 0, priceModelIx(price));
    return encodeModel(m, reverseWithin);
  };
  it.each([0, 1])(
    "a receipt for the re-sorted message with the price instruction at position %i is verified",
    async (at) => {
      const s = await setup(),
        message = phantom(s, at);
      // The fixture really differs from the prepared order, or this test would prove nothing.
      expect(toModel(message).keys.map((k) => k.key)).not.toEqual(
        toModel(s.prepared).keys.map((k) => k.key),
      );
      const r = await (
        await scenario(s, message, { price: 375_000n, shift: shiftFor(at) })
      ).reconcile();
      expect(r.state).toBe("verified");
      expect(r.actualDebit).toBe("30120000");
    },
  );
  it("metadata indexed in the PREPARED order for a re-sorted signed message is not accepted", async () => {
    const s = await setup(),
      message = phantom(s, 0),
      sc = await scenario(s, message, { price: 375_000n, shift: 1 }),
      wrong = await receiptFixture(
        s.signer.address,
        await s.signer.signTransaction(packetOf(message)),
        sc.signature,
        toModel(s.prepared).keys.map((k) => k.key),
      ),
      group = wrong.transaction.meta.innerInstructions[0];
    group.index = "2";
    const r = await reconcilePurchase(
      new DirectRpc(wrong.fetcher),
      sc.attempt,
      signal(),
    );
    expect(r.state).toBe("uncertain");
  });
});
