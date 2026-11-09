// @vitest-environment node
import { describe, expect, it } from "vitest";
import bs58 from "bs58";
import { fromHex, hash, hex } from "../src/buy/bytes";
import {
  PRIORITY_FEE_CAP_LAMPORTS,
  classifyReturnedMessage,
  classifyRetained,
  priorityFeeLamports,
  verifyWalletReturn,
} from "../src/buy/walletReturn";
import { SignedPurchaseMismatch } from "../src/buy/signed";
import { PublicAttemptStore } from "../src/buy/recovery";
import type { CheckedPurchase, PublicAttempt } from "../src/buy/direct-types";
import { prepareP30UnsignedPurchase } from "../src/purchase/prepareUnsigned";
import { ephemeral, memoryStorage, ctx, descriptor } from "./f2-fixture";
import { PublicKey } from "@setl8/p30-sdk";
import identity from "../src/purchase/p30-artifact.json";
import {
  COMPUTE,
  LIGHTHOUSE,
  insert,
  packetOf,
  priceIx,
  split,
  u64le,
} from "./wallet-return-fixture";

const MSG =
  "The wallet changed the exact purchase message. No app broadcast is permitted.";
async function setup(over: Partial<CheckedPurchase> = {}) {
  const signer = await ephemeral(),
    account = ctx
      .tradingAccount(new PublicKey(signer.address), 0n)[0]
      .toBase58(),
    prepared = await prepareP30UnsignedPurchase({
      inputKind: "p30-public-unsigned-input-v1",
      sdkProfile: descriptor.profileId,
      descriptor,
      connectedWallet: signer.address,
      trader: signer.address,
      sessionEpoch: 1,
      expectedAccount: account,
      nextChallengeId: "0",
      tierIndex: "0",
      mint: "usdc",
      recentBlockhash: "11111111111111111111111111111111",
      priorityFee: { kind: "omitted" },
    });
  const c = {
    wallet: signer.address,
    epoch: 1,
    tier: "0",
    size: "2500000000",
    price: "30000000",
    feeBps: "40",
    fee: "120000",
    total: "30120000",
    solRequired: "42800",
    networkFee: "5000",
    rent: "37800",
    blockhash: prepared.context.recentBlockhash,
    lastValidBlockHeight: "700000000",
    checkedAt: "1",
    expiresAt: "2",
    minSlot: "600000000",
    fingerprint: "ab".repeat(32),
    expectedAccount: account,
    nextChallengeId: "0",
    prepared,
    checks: [],
    ...over,
  } as CheckedPurchase;
  const message = fromHex(prepared.messageHex);
  return { signer, c, message, split: split(message) };
}
type S = Awaited<ReturnType<typeof setup>>;
const signed = (s: S, message: Uint8Array) =>
  s.signer.signTransaction(packetOf(message));
async function refused(s: S, packet: Uint8Array) {
  try {
    await verifyWalletReturn(packet, s.c, s.c.wallet);
  } catch (e) {
    expect(e).toBeInstanceOf(SignedPurchaseMismatch);
    expect((e as Error).message).toBe(MSG);
    return (e as SignedPurchaseMismatch).diagnostics;
  }
  throw Error("expected a refusal");
}

describe("the prepared message", () => {
  it("is ComputeBudget SetComputeUnitLimit(400000) then one lev instruction, 717 bytes", async () => {
    const s = await setup();
    expect(s.message.length).toBe(717);
    expect(s.split.ixs.length).toBe(2);
    expect(s.split.computeIndex).toBeGreaterThan(0);
    expect(s.c.prepared.computeUnitLimit).toBe(400000);
    expect(Array.from(s.split.ixs[0])).toEqual([
      s.split.computeIndex,
      0,
      5,
      2,
      0x80,
      0x1a,
      6,
      0,
    ]);
  });
});

describe("what is accepted", () => {
  it("accepts the exact prepared message unchanged (no priority fee)", async () => {
    const s = await setup(),
      r = await verifyWalletReturn(await signed(s, s.message), s.c);
    expect(r).toMatchObject({
      kind: "exact",
      insertedAt: null,
      priceMicroLamportsPerCu: null,
      priorityFeeLamports: "0",
      messageSha256: s.c.prepared.messageSha256,
    });
  });
  it.each([0, 1, 2])(
    "accepts exactly one SetComputeUnitPrice at position %i, signature over the returned bytes",
    async (at) => {
      const s = await setup(),
        m = insert(s.message, at, priceIx(s.split.computeIndex, 5000n)),
        packet = await signed(s, m);
      expect(packet.length).toBe(794);
      const r = await verifyWalletReturn(packet, s.c);
      expect(r.kind).toBe("priority_price_added");
      expect(r.insertedAt).toBe(at);
      expect(r.priceMicroLamportsPerCu).toBe("5000");
      expect(r.priorityFeeLamports).toBe("2000"); // ceil(5000 * 400000 / 1e6)
      expect(r.messageSha256).toBe(await hash(m));
      expect(r.messageSha256).not.toBe(s.c.prepared.messageSha256);
      expect(r.messageHex).toBe(hex(m));
      expect(r.signature).toBe(bs58.encode(packet.slice(1, 65)));
    },
  );
  it("computes the priority fee as ceil(price * limit / 1e6) and accepts exactly the 1,000,000 lamport cap", async () => {
    expect(priorityFeeLamports(2_500_000n, 400000)).toBe(1_000_000n);
    expect(priorityFeeLamports(2_500_001n, 400000)).toBe(1_000_001n);
    expect(priorityFeeLamports(1n, 400000)).toBe(1n);
    expect(PRIORITY_FEE_CAP_LAMPORTS).toBe(1_000_000n);
    const s = await setup(),
      ok = insert(s.message, 1, priceIx(s.split.computeIndex, 2_500_000n)),
      r = await verifyWalletReturn(await signed(s, ok), s.c);
    expect(r.priorityFeeLamports).toBe("1000000");
    const zero = await verifyWalletReturn(
      await signed(s, insert(s.message, 0, priceIx(s.split.computeIndex, 0n))),
      s.c,
    );
    expect(zero.priorityFeeLamports).toBe("0");
  });
});

describe("what is still refused", () => {
  it.each([2_500_001n, 10_000_000n, 2n ** 64n - 1n])(
    "a price of %s micro-lamports per CU is above the cap",
    async (price) => {
      const s = await setup(),
        d = await refused(
          s,
          await signed(
            s,
            insert(s.message, 1, priceIx(s.split.computeIndex, price)),
          ),
        );
      expect(d!.notes.join(" ")).toContain("cap");
    },
  );
  it("two extra price instructions", async () => {
    const s = await setup(),
      one = insert(s.message, 1, priceIx(s.split.computeIndex, 1n)),
      two = insert(one, 0, priceIx(s.split.computeIndex, 1n));
    await refused(s, await signed(s, two));
  });
  it.each([
    ["SetComputeUnitLimit", Uint8Array.of(2, 0x80, 0x1a, 6, 0)],
    ["RequestHeapFrame", Uint8Array.of(1, 0, 0, 4, 0)],
    ["SetLoadedAccountsDataSizeLimit", Uint8Array.of(4, 0, 0, 0, 1)],
    ["a deprecated RequestUnits", Uint8Array.of(0, 1, 0, 0, 0, 1, 0, 0, 0)],
  ])("a ComputeBudget %s instruction instead of a price", async (_n, data) => {
    const s = await setup(),
      raw = Uint8Array.of(s.split.computeIndex, 0, data.length, ...data);
    await refused(s, await signed(s, insert(s.message, 1, raw)));
  });
  it("a price-shaped instruction with a wrong discriminator, program, account count or data length", async () => {
    const s = await setup(),
      good = priceIx(s.split.computeIndex, 1n);
    const bad = (i: number, v: number) => {
      const x = good.slice();
      x[i] = v;
      return x;
    };
    for (const raw of [
      bad(0, s.split.keys.length - 1), // some other key as program
      bad(0, 0), // the fee payer as program
      bad(1, 1), // claims one account
      bad(2, 8),
      bad(2, 10),
      bad(3, 2),
      bad(3, 4),
      bad(3, 0),
    ])
      await refused(s, await signed(s, insert(s.message, 1, raw)));
  });
  it("a Lighthouse instruction with its own account keys", async () => {
    const s = await setup(),
      l = bs58.decode(LIGHTHOUSE),
      m = new Uint8Array([...s.message]);
    // Append a Lighthouse program key and a guard instruction the way a guarding wallet would.
    const keys = s.split.keys.length;
    // Simplest faithful shape: same length as a price instruction but pointing at an appended Lighthouse key.
    const withKey = Uint8Array.of(
      m[0],
      m[1],
      m[2] + 1,
      keys + 1,
      ...m.slice(4, 4 + keys * 32),
      ...l,
      ...m.slice(4 + keys * 32),
    );
    const guard = Uint8Array.of(keys, 0, 9, 3, ...u64le(1n));
    await refused(s, await signed(s, insert(withKey, 2, guard)));
    // A real Lighthouse assertion instruction (program, two accounts, eight data bytes) after the open instruction.
    const real = Uint8Array.of(keys, 2, 0, 1, 8, 1, 2, 3, 4, 5, 6, 7, 8);
    await refused(s, await signed(s, insert(withKey, 2, real)));
  });
  it("any single bit changed anywhere in the prepared message when one price instruction is present", async () => {
    const s = await setup(),
      ok = insert(s.message, 1, priceIx(s.split.computeIndex, 1000n)),
      limit = s.c.prepared.computeUnitLimit;
    // ok classifies; every one-bit flip of any byte (except the 8 price bytes, which are the allowed degree of freedom) must not.
    expect(classifyReturnedMessage(s.message, limit, ok).kind).toBe(
      "priority_price_added",
    );
    const priceAt = ok.length - split(ok).ixs[2].length - 12 + 4; // price bytes of the inserted instruction (position 1); // price bytes inside the inserted instruction
    let refusedCount = 0;
    for (let i = 0; i < ok.length; i++) {
      if (i >= priceAt && i < priceAt + 8) continue;
      for (const bit of [0, 7]) {
        const x = ok.slice();
        x[i] ^= 1 << bit;
        expect(
          () => classifyReturnedMessage(s.message, limit, x),
          `byte ${i} bit ${bit}`,
        ).toThrow();
        refusedCount++;
      }
    }
    expect(refusedCount).toBe((ok.length - 8) * 2);
  });
  it("truncated, extended, empty, v0 and trailing-byte messages", async () => {
    const s = await setup(),
      ok = insert(s.message, 1, priceIx(s.split.computeIndex, 1n)),
      limit = s.c.prepared.computeUnitLimit;
    for (const x of [
      ok.slice(0, ok.length - 1),
      Uint8Array.of(...ok, 0),
      new Uint8Array(0),
      Uint8Array.of(0x80, ...ok),
      Uint8Array.of(0x80, ...s.message, 0),
      s.message.slice(0, 100),
    ])
      expect(() => classifyReturnedMessage(s.message, limit, x)).toThrow();
  });
  it("a different blockhash, fee payer or account key with the price instruction present", async () => {
    const s = await setup(),
      ok = insert(s.message, 1, priceIx(s.split.computeIndex, 1n));
    const blockhashAt = 4 + s.split.keys.length * 32;
    for (const at of [blockhashAt, blockhashAt + 31, 4, 4 + 31, 4 + 32 * 3]) {
      const x = ok.slice();
      x[at] ^= 1;
      await refused(s, await signed(s, x));
    }
  });
  it("the total SOL cap counts the priority fee", async () => {
    // network fee + rent leave 99,999 lamports under the 10,000,000 cap: a 100,000 lamport priority fee tips it over.
    const s = await setup({ networkFee: "5000", rent: "9895001" }),
      m = insert(s.message, 1, priceIx(s.split.computeIndex, 250_000n));
    const d = await refused(s, await signed(s, m));
    expect(d!.notes.join(" ")).toContain("SOL limit");
    // The same message at a price that fits (99,999 lamports) is accepted.
    const fit = insert(s.message, 1, priceIx(s.split.computeIndex, 249_997n));
    expect(
      (await verifyWalletReturn(await signed(s, fit), s.c)).priorityFeeLamports,
    ).toBe("99999");
    // And exactly at the cap is accepted, one lamport over is not.
    const edge = await setup({ networkFee: "5000", rent: "9895000" });
    expect(
      (
        await verifyWalletReturn(
          await signed(
            edge,
            insert(edge.message, 1, priceIx(edge.split.computeIndex, 250_000n)),
          ),
          edge.c,
        )
      ).priorityFeeLamports,
    ).toBe("100000");
    const over = await setup({ networkFee: "5000", rent: "9895001" });
    await refused(
      over,
      await signed(
        over,
        insert(over.message, 1, priceIx(over.split.computeIndex, 250_000n)),
      ),
    );
  });
  it("a priority fee under the 1,000,000 lamport cap is still refused when it pushes the total over the owner SOL limit", async () => {
    // network 5,000 + rent 9,950,001 = 9,955,001: only 44,999 lamports of headroom under the 10,000,000 limit.
    const s = await setup({ networkFee: "5000", rent: "9950001" });
    // 150,000 micro-lamports x 400,000 CU = 60,000 lamports: under the fee cap, over the SOL limit.
    const fee = priorityFeeLamports(150_000n, 400000);
    expect(fee).toBe(60_000n);
    expect(fee < PRIORITY_FEE_CAP_LAMPORTS).toBe(true);
    const d = await refused(
      s,
      await signed(
        s,
        insert(s.message, 1, priceIx(s.split.computeIndex, 150_000n)),
      ),
    );
    expect(d!.notes.join(" ")).toContain("SOL limit");
    // The exact headroom (44,999 lamports) is accepted; one more lamport is not.
    const fit = await verifyWalletReturn(
      await signed(
        s,
        insert(s.message, 1, priceIx(s.split.computeIndex, 112_497n)),
      ),
      s.c,
    );
    expect(fit.priorityFeeLamports).toBe("44999");
    await refused(
      s,
      await signed(
        s,
        insert(s.message, 1, priceIx(s.split.computeIndex, 112_500n)),
      ),
    );
    // Without a priority instruction the same fixture is still accepted.
    expect(
      (await verifyWalletReturn(await signed(s, s.message), s.c)).kind,
    ).toBe("exact");
  });
  it("a signature that does not verify over the RETURNED message", async () => {
    const s = await setup(),
      ok = insert(s.message, 1, priceIx(s.split.computeIndex, 1000n)),
      other = await ephemeral();
    const wrongKey = await other.signTransaction(packetOf(ok));
    await expect(verifyWalletReturn(wrongKey, s.c)).rejects.toThrow(
      "signature is invalid",
    );
    const overPrepared = packetOf(ok);
    overPrepared.set((await signed(s, s.message)).slice(1, 65), 1);
    await expect(verifyWalletReturn(overPrepared, s.c)).rejects.toThrow(
      "signature is invalid",
    );
    const tampered = await signed(s, ok);
    tampered[5] ^= 1;
    await expect(verifyWalletReturn(tampered, s.c)).rejects.toThrow(
      "signature is invalid",
    );
  });
  it("packet shape: more than one signature slot, a zero count, an oversized packet", async () => {
    const s = await setup(),
      ok = await signed(
        s,
        insert(s.message, 1, priceIx(s.split.computeIndex, 1n)),
      );
    const two = new Uint8Array(ok.length + 64);
    two[0] = 2;
    two.set(ok.slice(65), 129);
    const zero = ok.slice();
    zero[0] = 0;
    const big = new Uint8Array(1233);
    big.set(ok);
    for (const p of [two, zero, big, ok.slice(0, 64), new Uint8Array(0)])
      await refused(s, p);
  });
});

describe("hardening found by the independent review", () => {
  it.each([
    ["networkFee", "-100000000"],
    ["networkFee", ""],
    ["networkFee", " 5 "],
    ["networkFee", "0x10"],
    ["rent", "-100000000"],
    ["rent", ""],
    ["rent", " 37800 "],
  ])(
    "a malformed %s %j is refused, never coerced into the SOL cap",
    async (field, value) => {
      const s = await setup({ [field]: value } as Partial<CheckedPurchase>),
        ok = insert(s.message, 1, priceIx(s.split.computeIndex, 250_000n));
      await refused(s, await signed(s, ok));
    },
  );
  it("a review whose prepared hash does not describe its prepared bytes refuses exact and price-added returns", async () => {
    const good = await setup(),
      bad = {
        ...good.c,
        prepared: { ...good.c.prepared, messageSha256: "00".repeat(32) },
      } as CheckedPurchase,
      s = { ...good, c: bad } as S;
    await refused(s, await signed(s, good.message));
    await refused(
      s,
      await signed(
        s,
        insert(good.message, 1, priceIx(good.split.computeIndex, 1n)),
      ),
    );
  });
  it("the packet is snapshotted: mutating the caller's array mid-verification cannot split the result", async () => {
    const s = await setup(),
      a = await signed(
        s,
        insert(s.message, 1, priceIx(s.split.computeIndex, 5000n)),
      ),
      b = await signed(
        s,
        insert(s.message, 1, priceIx(s.split.computeIndex, 200_000n)),
      );
    const live = a.slice(),
      pending = verifyWalletReturn(live, s.c);
    live.set(b); // overwrite right after the call started
    const r = await pending;
    expect(r.priceMicroLamportsPerCu).toBe("5000");
    expect(r.signature).toBe(bs58.encode(a.slice(1, 65)));
    expect(r.messageSha256).toBe(await hash(a.slice(65)));
  });
  it("a prepared message that already carries a price (or any non-limit ComputeBudget instruction) is not extended", async () => {
    const s = await setup(),
      limit = s.c.prepared.computeUnitLimit,
      withPrice = insert(s.message, 1, priceIx(s.split.computeIndex, 1000n)),
      twice = insert(withPrice, 0, priceIx(s.split.computeIndex, 2000n)),
      withHeap = insert(
        s.message,
        1,
        Uint8Array.of(s.split.computeIndex, 0, 5, 1, 0, 0, 4, 0),
      );
    expect(() => classifyReturnedMessage(withPrice, limit, twice)).toThrow();
    expect(() =>
      classifyReturnedMessage(withPrice, limit, withPrice),
    ).toThrow();
    expect(() =>
      classifyReturnedMessage(
        withHeap,
        limit,
        insert(withHeap, 0, priceIx(s.split.computeIndex, 1n)),
      ),
    ).toThrow();
  });
  it("the ComputeBudget key in the prepared message must be unsigned and read-only", async () => {
    const s = await setup(),
      limit = s.c.prepared.computeUnitLimit,
      price = (m: Uint8Array) =>
        insert(m, 1, priceIx(s.split.computeIndex, 1n));
    expect(
      classifyReturnedMessage(s.message, limit, price(s.message)).kind,
    ).toBe("priority_price_added");
    const writable = s.message.slice();
    writable[2] = 0; // no read-only unsigned keys: every key is writable
    expect(() =>
      classifyReturnedMessage(writable, limit, price(writable)),
    ).toThrow();
    const signer = s.message.slice();
    signer[0] = s.split.computeIndex + 1; // the ComputeBudget key falls in the signer range
    expect(() =>
      classifyReturnedMessage(signer, limit, price(signer)),
    ).toThrow();
  });
  it("the review's compute-unit limit must equal the limit written in the prepared message", async () => {
    const s = await setup(),
      ok = insert(s.message, 1, priceIx(s.split.computeIndex, 1n));
    for (const wrong of [399_999, 400_001, 200_000])
      expect(() => classifyReturnedMessage(s.message, wrong, ok)).toThrow();
    const c = {
      ...s.c,
      prepared: { ...s.c.prepared, computeUnitLimit: 400_001 },
    } as CheckedPurchase;
    await expect(
      verifyWalletReturn(await signed(s, ok), c),
    ).rejects.toBeInstanceOf(SignedPurchaseMismatch);
  });
});

describe("the retained attempt", () => {
  async function attempt(
    s: S,
    message: Uint8Array,
    extra: Partial<PublicAttempt> = {},
  ) {
    const info = classifyReturnedMessage(
        s.message,
        s.c.prepared.computeUnitLimit,
        message,
      ),
      packet = await signed(s, message);
    return {
      format: "setl8-direct-demo-attempt-v1" as const,
      profile: identity.profile,
      source: identity.source_archive_sha256,
      npm: identity.npm_sha256,
      descriptor: identity.descriptor_sha256,
      wallet: s.c.wallet,
      tier: "0",
      size: s.c.size,
      price: s.c.price,
      fee: s.c.fee,
      total: s.c.total,
      expectedAccount: s.c.expectedAccount,
      nextChallengeId: "0",
      blockhash: s.c.blockhash,
      lastValidBlockHeight: s.c.lastValidBlockHeight,
      messageHex: s.c.prepared.messageHex,
      messageSha256: s.c.prepared.messageSha256,
      fingerprint: s.c.fingerprint,
      minSlot: s.c.minSlot,
      createdAt: "1",
      signature: bs58.encode(packet.slice(1, 65)),
      signedMessageHex: info.messageHex,
      signedMessageSha256: await hash(message),
      computeUnitPriceMicroLamports: info.priceMicroLamportsPerCu,
      priorityFeeLamports: info.priorityFeeLamports,
      stage: "signed" as const,
      ...extra,
    } satisfies PublicAttempt;
  }
  it("stores and reads back the returned message hash and priority fee", async () => {
    const s = await setup(),
      store = new PublicAttemptStore(memoryStorage()),
      m = insert(s.message, 2, priceIx(s.split.computeIndex, 7000n)),
      a = await attempt(s, m);
    await store.write(a);
    const back = await store.read();
    expect(back).toMatchObject({
      signedMessageSha256: await hash(m),
      priorityFeeLamports: "2800",
      computeUnitPriceMicroLamports: "7000",
      messageSha256: s.c.prepared.messageSha256,
    });
    expect((await classifyRetained(back!)).insertedAt).toBe(2);
  });
  it("refuses to store or read a returned message that is not the allowed plan", async () => {
    const s = await setup(),
      store = new PublicAttemptStore(memoryStorage()),
      good = insert(s.message, 1, priceIx(s.split.computeIndex, 7000n)),
      two = insert(good, 0, priceIx(s.split.computeIndex, 1n)),
      a = await attempt(s, good);
    await expect(
      store.write({
        ...a,
        signedMessageHex: hex(two),
        signedMessageSha256: await hash(two),
      }),
    ).rejects.toThrow();
    await expect(
      store.write({ ...a, priorityFeeLamports: "1" }),
    ).rejects.toThrow();
    await expect(
      store.write({ ...a, signedMessageSha256: "00".repeat(32) }),
    ).rejects.toThrow();
    await expect(
      store.write({ ...a, computeUnitPriceMicroLamports: "7001" }),
    ).rejects.toThrow();
    // all-or-nothing: a half-set group is invalid
    await expect(
      store.write({ ...a, signedMessageHex: null }),
    ).rejects.toThrow();
    const over = insert(
      s.message,
      1,
      priceIx(s.split.computeIndex, 2_500_001n),
    );
    await expect(
      store.write({
        ...a,
        signedMessageHex: hex(over),
        signedMessageSha256: await hash(over),
        computeUnitPriceMicroLamports: "2500001",
        priorityFeeLamports: "1000001",
      }),
    ).rejects.toThrow();
  });
  it("still reads a retained record written before these fields existed", async () => {
    const s = await setup(),
      storage = memoryStorage(),
      store = new PublicAttemptStore(storage),
      a = await attempt(s, s.message, {
        stage: "awaiting_wallet",
        signature: null,
      });
    const {
      signedMessageHex,
      signedMessageSha256,
      computeUnitPriceMicroLamports,
      priorityFeeLamports,
      ...legacy
    } = a;
    void signedMessageHex;
    void signedMessageSha256;
    void computeUnitPriceMicroLamports;
    void priorityFeeLamports;
    const json = JSON.stringify(legacy),
      digest = await hash(json);
    storage.setItem(
      "setl8.direct-p30.public-attempt.v1",
      JSON.stringify({ record: legacy, digest }),
    );
    expect(await store.read()).toMatchObject({
      stage: "awaiting_wallet",
      signature: null,
      signedMessageHex: null,
      priorityFeeLamports: null,
    });
  });
});
