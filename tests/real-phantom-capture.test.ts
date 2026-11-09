// @vitest-environment node
import { describe, expect, it } from "vitest";
import bs58 from "bs58";
import { fromHex, hash } from "../src/buy/bytes";
import {
  PRIORITY_FEE_CAP_LAMPORTS,
  assertPriorityWithinOwnerCap,
  classifyReturnedMessage,
  priorityFeeLamports,
} from "../src/buy/walletReturn";
import capture from "./fixtures/real-phantom-capture.json";
import { encodeModel, priceModelIx, toModel } from "./wallet-return-fixture";

// Public message bytes only, captured from a real Phantom (Testnet Mode) signTransaction. No signature.
const prepared = fromHex(capture.preparedMessageHex),
  returned = fromHex(capture.returnedMessageHex);
const LIMIT = 400000;

describe("the real Phantom capture", () => {
  it("hashes match the capture's recorded prepared and returned digests", async () => {
    expect(await hash(prepared)).toBe(capture.preparedMessageSha256);
    expect(await hash(returned)).toBe(capture.returnedMessageSha256);
    expect(capture.returnedMessageSha256).not.toBe(
      capture.preparedMessageSha256,
    );
  });
  it("is a genuine re-sort: same length as a splice, different key order and bytes", () => {
    expect(returned.length).toBe(prepared.length + 12);
    const a = toModel(prepared).keys.map((k) => k.key),
      b = toModel(returned).keys.map((k) => k.key);
    expect(b).not.toEqual(a);
    expect([...b].sort()).toEqual([...a].sort());
    expect(b[0]).toBe(capture.wallet);
    expect(bs58.encode(returned.slice(4, 36))).toBe(capture.wallet);
  });
  it("is accepted: one SetComputeUnitPrice at index 0, 375000 micro-lamports/CU = 150000 lamports", () => {
    expect(classifyReturnedMessage(prepared, LIMIT, returned)).toEqual({
      kind: "priority_price_added",
      messageHex: capture.returnedMessageHex,
      insertedAt: 0,
      priceMicroLamportsPerCu: "375000",
      priorityFeeLamports: "150000",
    });
  });
  it("fits the reviewed owner SOL scope with a realistic network fee and ~3.7M lamports of rent", () => {
    expect(() =>
      assertPriorityWithinOwnerCap(
        { networkFee: "5000", rent: "3700000" },
        "150000",
      ),
    ).not.toThrow();
    // Phantom showed about -0.003871 SOL in total: 3,700,000 + 5,000 + 150,000 = 3,855,000 + wallet rounding.
    expect(5_000n + 3_700_000n + 150_000n).toBeLessThan(10_000_000n);
  });
  it("is refused if the prepared limit given to the classifier is wrong", () => {
    expect(() =>
      classifyReturnedMessage(prepared, 399_999, returned),
    ).toThrow();
  });
});

describe("the priority fee cap is 1,000,000 lamports (0.001 SOL)", () => {
  // Phantom-style recompile of the real prepared message with a chosen price.
  const withPrice = (price: bigint) => {
    const m = toModel(prepared);
    m.ixs.splice(0, 0, priceModelIx(price));
    return encodeModel(m, (g) =>
      g[0]?.role === "sw" ? g : g.slice().reverse(),
    );
  };
  it("the constant and the arithmetic agree", () => {
    expect(PRIORITY_FEE_CAP_LAMPORTS).toBe(1_000_000n);
    expect(priorityFeeLamports(2_500_000n, LIMIT)).toBe(1_000_000n);
    expect(priorityFeeLamports(2_500_001n, LIMIT)).toBe(1_000_001n);
    expect(priorityFeeLamports(375_000n, LIMIT)).toBe(150_000n);
  });
  it("exactly 1,000,000 lamports is accepted", () => {
    const c = classifyReturnedMessage(prepared, LIMIT, withPrice(2_500_000n));
    expect(c).toMatchObject({
      kind: "priority_price_added",
      priceMicroLamportsPerCu: "2500000",
      priorityFeeLamports: "1000000",
    });
  });
  it("999,999 lamports is accepted", () => {
    // ceil(2_499_997 * 0.4) = 999,999
    expect(priorityFeeLamports(2_499_997n, LIMIT)).toBe(999_999n);
    expect(
      classifyReturnedMessage(prepared, LIMIT, withPrice(2_499_997n))
        .priorityFeeLamports,
    ).toBe("999999");
  });
  it("1,000,001 lamports is refused", () => {
    expect(() =>
      classifyReturnedMessage(prepared, LIMIT, withPrice(2_500_001n)),
    ).toThrow(/1000000 lamport cap/);
    expect(() =>
      classifyReturnedMessage(prepared, LIMIT, withPrice(2n ** 64n - 1n)),
    ).toThrow(/cap/);
  });
  it("the old 100,000 lamport cap no longer applies", () => {
    expect(
      classifyReturnedMessage(prepared, LIMIT, withPrice(250_001n))
        .priorityFeeLamports,
    ).toBe("100001");
  });
  it("the owner SOL scope (10,000,000) still binds on top of the fee cap", () => {
    // 5,000 + 8,995,000 + 1,000,000 = 10,000,000 exactly: allowed. One more lamport of rent: refused.
    expect(() =>
      assertPriorityWithinOwnerCap(
        { networkFee: "5000", rent: "8995000" },
        "1000000",
      ),
    ).not.toThrow();
    expect(() =>
      assertPriorityWithinOwnerCap(
        { networkFee: "5000", rent: "8995001" },
        "1000000",
      ),
    ).toThrow(/SOL limit/);
  });
  it("the fee is priced at the prepared message's own compute-unit limit", () => {
    // Same real message with a 200,000 CU limit: 5,000,000 micro-lamports/CU = 1,000,000 lamports (at cap),
    // 5,000,001 is over it; at the 400,000 limit the same price would have been twice as expensive.
    const m = toModel(prepared),
      limitIx = m.ixs.find((i) => i.data[0] === 2 && i.data.length === 5)!;
    new DataView(limitIx.data.buffer, limitIx.data.byteOffset + 1, 4).setUint32(
      0,
      200_000,
      true,
    );
    const half = encodeModel(m),
      ret = (price: bigint) => {
        const r = toModel(half);
        r.ixs.splice(0, 0, priceModelIx(price));
        return encodeModel(r);
      };
    expect(
      classifyReturnedMessage(half, 200_000, ret(5_000_000n))
        .priorityFeeLamports,
    ).toBe("1000000");
    expect(() =>
      classifyReturnedMessage(half, 200_000, ret(5_000_001n)),
    ).toThrow(/cap/);
  });
});
