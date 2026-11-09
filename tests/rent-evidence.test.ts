// @vitest-environment node
import { it, expect } from "vitest";
import {
  exactRent,
  estimateClassicTokenAtaRent,
  RENT_SYSVAR,
  SYSVAR_OWNER,
} from "../src/buy/rentEvidence";
import { b64, un64 } from "../src/buy/bytes";
import { PurchasePreflight, type RpcAccount } from "../src/buy/preflight";
import { DirectRpc } from "../src/buy/rpc";
import { ephemeral, offlineAccounts, offlineFetch } from "./f2-fixture";
// Recorded paired whole Rent account, owner-funding-read-1 responses03/04,
// finalized slots517582545/517582551; data SHA256 e6833309a1b7d9ce57849bd64d1d5834144a14cbc659346a9fda424a3e7ae219.
const recordedRent: RpcAccount = {
  owner: "Sysvar1111111111111111111111111111111111111",
  executable: false,
  lamports: "1009200",
  data: ["2BMAAAAAAAAAAAAAAADwPzI=", "base64"],
};
function rentWith({
  rate = 5080n,
  bits = 0x3ff0000000000000n,
  burn = 50,
  length = 17,
}: {
  rate?: bigint;
  bits?: bigint;
  burn?: number;
  length?: number;
} = {}): RpcAccount {
  const bytes = un64(recordedRent.data[0]);
  const v = new DataView(bytes.buffer, bytes.byteOffset);
  v.setBigUint64(0, rate, true);
  v.setBigUint64(8, bits, true);
  bytes[16] = burn;
  const data = new Uint8Array(length);
  data.set(bytes.slice(0, length));
  return { ...recordedRent, data: [b64(data), "base64"] };
}
it("uses saved paired current Rent bytes for exact purchase and separate ATA estimates", () => {
  expect(recordedRent.owner).toBe(SYSVAR_OWNER);
  expect(exactRent(recordedRent, 56)).toBe("934720");
  expect(exactRent(recordedRent, 207)).toBe("1701800");
  expect(exactRent(recordedRent, 115)).toBe("1234440");
  expect(estimateClassicTokenAtaRent(recordedRent)).toBe("1488440");
  const total = [56, 207, 115].reduce(
    (n, s) => n + BigInt(exactRent(recordedRent, s)),
    0n,
  );
  expect(total).toBe(3870960n);
  expect(total + BigInt(estimateClassicTokenAtaRent(recordedRent))).toBe(
    5359400n,
  );
  expect(() => exactRent(recordedRent, 165)).toThrow("could not be verified");
});
it.each([56, 115, 207])(
  "keeps old threshold2.0 arithmetic unchanged for size%d",
  (size) => {
    expect(
      exactRent(rentWith({ rate: 3480n, bits: 0x4000000000000000n }), size),
    ).toBe(((128n + BigInt(size)) * 3480n * 2n).toString());
  },
);
it("supports the same exact2.0 policy for the separately labelled ATA estimate", () => {
  expect(
    estimateClassicTokenAtaRent(
      rentWith({ rate: 3480n, bits: 0x4000000000000000n }),
    ),
  ).toBe("2039280");
});
it.each([
  0n,
  0x3ff8000000000000n,
  0x4004000000000000n,
  0xbff0000000000000n,
  0x7ff0000000000000n,
  0x7ff8000000000000n,
  0x3ff0000000000001n,
  0x4000000000000001n,
])("rejects unreviewed threshold bits%s", (bits) => {
  expect(() => exactRent(rentWith({ bits }), 56)).toThrow(
    "Unsupported Rent parameters",
  );
  expect(() => estimateClassicTokenAtaRent(rentWith({ bits }))).toThrow(
    "Unsupported Rent parameters",
  );
});
it.each([16, 18])("rejects whole sysvar length%d", (length) => {
  expect(() => exactRent(rentWith({ length }), 207)).toThrow(
    "Unsupported Rent sysvar layout",
  );
});
it("requires sysvar identity, nonexecutability, base64, positive rate and valid burn", () => {
  for (const a of [
    null,
    { ...recordedRent, owner: "11111111111111111111111111111111" },
    { ...recordedRent, executable: true },
    { ...recordedRent, data: [recordedRent.data[0], "base58"] },
  ]) {
    expect(() => exactRent(a as RpcAccount | null, 56)).toThrow();
    expect(() => estimateClassicTokenAtaRent(a as RpcAccount | null)).toThrow();
  }
  expect(() => exactRent(rentWith({ rate: 0n }), 56)).toThrow(
    "Unsupported Rent parameters",
  );
  expect(() => exactRent(rentWith({ burn: 101 }), 56)).toThrow(
    "Unsupported Rent parameters",
  );
  expect(exactRent(rentWith({ burn: 100 }), 56)).toBe("934720");
});
it.each([-1, 0, 55, 57, 164, 165, 208, NaN, Infinity, 56.5])(
  "keeps purchase allocations bounded for size%s",
  (size) => {
    expect(() => exactRent(recordedRent, size)).toThrow(
      "could not be verified",
    );
  },
);
it.each([1n, 2n])(
  "enforces exact supported integer product boundary at multiplier%s",
  (multiplier) => {
    const bits = multiplier === 1n ? 0x3ff0000000000000n : 0x4000000000000000n;
    for (const size of [56, 115, 165, 207]) {
      const factor = (128n + BigInt(size)) * multiplier,
        rate = BigInt(Number.MAX_SAFE_INTEGER) / factor;
      const read = (a: RpcAccount) =>
        size === 165 ? estimateClassicTokenAtaRent(a) : exactRent(a, size);
      expect(read(rentWith({ rate, bits }))).toBe((rate * factor).toString());
      expect(() => read(rentWith({ rate: rate + 1n, bits }))).toThrow(
        "exact-integer boundary",
      );
    }
    expect(() =>
      exactRent(rentWith({ rate: 18446744073709551615n, bits }), 56),
    ).toThrow("exact-integer boundary");
  },
);
it.each([false, true])(
  "corroborates1.0 in actual preflight without adding ATA to purchase allocations(existing=%s)",
  async (existing) => {
    const signer = await ephemeral(),
      accounts = offlineAccounts(signer.address, existing),
      // Per provider: since 6 Nov 2026 the two operators are read concurrently, so only each operator's OWN
      // call order is defined (the old assertion also pinned the interleaving between the two operators).
      sizes: number[][] = [[], []];
    accounts[RENT_SYSVAR] = { ...recordedRent, data: [...recordedRent.data] };
    const rpc = new DirectRpc(
      offlineFetch(accounts, (method, params, provider) => {
        if (method === "getMinimumBalanceForRentExemption") {
          sizes[provider].push(params[0]);
          return ((128n + BigInt(params[0])) * 5080n).toString();
        }
      }),
    );
    const p = new PurchasePreflight(rpc),
      signal = new AbortController().signal;
    const c = await p.check(signer.address, "0", 1, signal);
    const expected = existing ? [207, 115] : [56, 207, 115];
    expect(sizes).toEqual([expected, expected]);
    expect(c.rent).toBe(existing ? "2936240" : "3870960");
    await p.revalidate(c, signal, "pre_wallet");
    expect(sizes).toEqual([expected, expected]);
    accounts[RENT_SYSVAR] = rentWith({ bits: 0x4000000000000000n });
    await expect(p.revalidate(c, signal, "pre_send")).rejects.toThrow(
      "evidence changed",
    );
  },
);
