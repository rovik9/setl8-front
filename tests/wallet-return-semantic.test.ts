// @vitest-environment node
import { describe, expect, it } from "vitest";
import bs58 from "bs58";
import { hash, hex } from "../src/buy/bytes";
import {
  classifyReturnedMessage,
  verifyWalletReturn,
} from "../src/buy/walletReturn";
import { SignedPurchaseMismatch } from "../src/buy/signed";
import type { CheckedPurchase } from "../src/buy/direct-types";
import { prepareP30UnsignedPurchase } from "../src/purchase/prepareUnsigned";
import { ephemeral, ctx, descriptor } from "./f2-fixture";
import { PublicKey } from "@setl8/p30-sdk";
import {
  COMPUTE,
  encodeModel,
  insert,
  packetOf,
  priceIx,
  priceModelIx,
  reverseWithin,
  split,
  toModel,
  type Model,
} from "./wallet-return-fixture";
import { fromHex } from "../src/buy/bytes";

async function setup() {
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
  } as CheckedPurchase;
  const message = fromHex(prepared.messageHex);
  return { signer, c, message, model: toModel(message), limit: 400000 };
}
type S = Awaited<ReturnType<typeof setup>>;
const clone = (m: Model): Model => ({
  keys: m.keys.map((k) => ({ ...k })),
  blockhash: m.blockhash.slice(),
  ixs: m.ixs.map((i) => ({
    program: i.program,
    accounts: [...i.accounts],
    data: i.data.slice(),
  })),
});
/** A Phantom-like recompile: price instruction first, keys regrouped and reordered, indexes remapped. */
const phantom = (
  s: S,
  mutate: (m: Model) => void = () => {},
  price = 5000n,
) => {
  const m = clone(s.model);
  m.ixs.splice(0, 0, priceModelIx(price));
  mutate(m);
  return encodeModel(m, reverseWithin);
};
const classify = (s: S, r: Uint8Array) =>
  classifyReturnedMessage(s.message, s.limit, r);
const lev = (m: Model) => m.ixs.find((i) => i.program !== COMPUTE)!;

describe("a wallet that re-serialises the message", () => {
  it("the fixture really differs in bytes, key order and indexes, with the same length as a splice", async () => {
    const s = await setup(),
      r = phantom(s);
    expect(r.length).toBe(s.message.length + 12);
    const sp = insert(
      s.message,
      0,
      priceIx(split(s.message).computeIndex, 5000n),
    );
    expect(hex(r)).not.toBe(hex(sp));
    const a = toModel(r).keys.map((k) => k.key),
      b = s.model.keys.map((k) => k.key);
    expect(a).not.toEqual(b);
    expect([...a].sort()).toEqual([...b].sort());
  });
  it.each([0, 1, 2])(
    "is accepted with the price instruction at position %i, and reports where it is",
    async (at) => {
      const s = await setup(),
        m = clone(s.model);
      m.ixs.splice(at, 0, priceModelIx(5000n));
      const r = encodeModel(m, reverseWithin),
        c = classify(s, r);
      expect(c).toMatchObject({
        kind: "priority_price_added",
        insertedAt: at,
        priceMicroLamportsPerCu: "5000",
        priorityFeeLamports: "2000",
        messageHex: hex(r),
      });
    },
  );
  it("end to end: the signature must verify over the returned bytes, which are kept verbatim", async () => {
    const s = await setup(),
      r = phantom(s),
      packet = await s.signer.signTransaction(packetOf(r)),
      v = await verifyWalletReturn(packet, s.c);
    expect(v.kind).toBe("priority_price_added");
    expect(v.messageHex).toBe(hex(r));
    expect(v.messageSha256).toBe(await hash(r));
    expect(v.signature).toBe(bs58.encode(packet.slice(1, 65)));
    // The same recompile signed over DIFFERENT bytes does not verify.
    const wrong = packetOf(r);
    wrong.set(
      (await s.signer.signTransaction(packetOf(s.message))).slice(1, 65),
      1,
    );
    await expect(verifyWalletReturn(wrong, s.c)).rejects.toThrow(
      "signature is invalid",
    );
  });
  it("a recompile in the prepared key order, and a rotated order, both pass at the price cap", async () => {
    const s = await setup(),
      m = clone(s.model);
    m.ixs.push(priceModelIx(2_500_000n));
    expect(classify(s, encodeModel(m)).priorityFeeLamports).toBe("1000000");
    expect(
      classify(
        s,
        // rotate every role group except the fee payer's
        encodeModel(m, (g) =>
          g[0]?.role === "sw" ? g : [...g.slice(1), ...g.slice(0, 1)],
        ),
      ).kind,
    ).toBe("priority_price_added");
  });
  it("an unchanged re-encode with no price instruction is not the exact prepared message and is refused", async () => {
    const s = await setup(),
      m = clone(s.model),
      r = encodeModel(m, reverseWithin);
    expect(hex(r)).not.toBe(hex(s.message));
    expect(() => classify(s, r)).toThrow(/price instruction/);
  });
});

describe("tampered recompiles are refused", () => {
  const refuse = async (
    name: string,
    mutate: (m: Model, s: S) => void,
    why?: RegExp,
  ) =>
    it(name, async () => {
      const s = await setup(),
        r = phantom(s, (m) => mutate(m, s));
      expect(() => classify(s, r)).toThrow(why);
      // And through the full verifier, with a valid signature over the tampered bytes.
      const packet = await s.signer.signTransaction(packetOf(r));
      await expect(verifyWalletReturn(packet, s.c)).rejects.toBeInstanceOf(
        SignedPurchaseMismatch,
      );
    });
  const key = (m: Model, role: string, not = "") =>
    m.keys.find((k) => k.role === role && k.key !== COMPUTE && k.key !== not)!;
  refuse(
    "a read-only key made writable",
    (m) => {
      key(m, "ro", lev(m).program).role = "w";
    },
    /signer or writable/,
  );
  refuse(
    "a writable key made read-only",
    (m) => {
      key(m, "w").role = "ro";
    },
    /signer or writable/,
  );
  refuse(
    "a non-signer made a signer",
    (m) => {
      key(m, "w").role = "sw";
    },
    /signer or writable/,
  );
  refuse(
    "a signer made read-only",
    (m) => {
      // the fee payer stays a signer; demote nothing but give the first writable key signer-readonly
      key(m, "w").role = "sr";
    },
    /signer or writable/,
  );
  refuse(
    "an added account key",
    (m) => {
      m.keys.push({ key: bs58.encode(new Uint8Array(32).fill(7)), role: "ro" });
    },
    /adds or removes/,
  );
  refuse(
    "a removed account key",
    (m) => {
      // Drop an unused-by-others key by pointing its instruction account at another key.
      const l = lev(m),
        gone = l.accounts.find(
          (a) =>
            a !== l.accounts[0] &&
            m.keys.find((k) => k.key === a)!.role === "ro" &&
            a !== l.program,
        )!;
      l.accounts = l.accounts.map((a) => (a === gone ? l.accounts[0] : a));
      m.keys = m.keys.filter((k) => k.key !== gone);
    },
    /adds or removes|differ/,
  );
  refuse(
    "two accounts swapped in the lev instruction",
    (m) => {
      const a = lev(m).accounts;
      const i = a.findIndex(
        (k, j) => j > 0 && k !== a[1] && a[1] !== undefined,
      );
      [a[1], a[i]] = [a[i], a[1]];
    },
    /instructions differ/,
  );
  refuse(
    "one account in the lev instruction replaced by another existing key",
    (m) => {
      const l = lev(m);
      l.accounts[3] =
        l.accounts[4] === l.accounts[3] ? l.accounts[5] : l.accounts[4];
    },
    /instructions differ/,
  );
  refuse(
    "a changed data byte in the lev instruction",
    (m) => {
      lev(m).data[2] ^= 1;
    },
    /instructions differ/,
  );
  refuse(
    "a changed compute-unit limit",
    (m) => {
      const l = m.ixs.find((i) => i.program === COMPUTE && i.data[0] === 2)!;
      l.data[1] ^= 1;
    },
    /instructions differ/,
  );
  refuse(
    "a changed blockhash",
    (m) => {
      m.blockhash[5] ^= 1;
    },
    /blockhash/,
  );
  refuse(
    "a changed fee payer",
    (m, s) => {
      const old = m.keys[0].key,
        fresh = bs58.encode(new Uint8Array(32).fill(9));
      m.keys[0].key = fresh;
      for (const i of m.ixs) {
        i.accounts = i.accounts.map((a) => (a === old ? fresh : a));
        if (i.program === old) i.program = fresh;
      }
      void s;
    },
    /fee payer/,
  );
  refuse(
    "the fee payer swapped with another writable key",
    (m) => {
      const o = key(m, "w");
      const a = m.keys[0].key;
      m.keys[0].key = o.key;
      o.key = a;
      for (const i of m.ixs)
        i.accounts = i.accounts.map((k) =>
          k === a ? o.key : k === o.key ? a : k,
        );
    },
    /fee payer|differ/,
  );
  refuse(
    "a second price instruction",
    (m) => {
      m.ixs.push(priceModelIx(1n));
    },
    /more than one price/,
  );
  refuse(
    "a price above the cap",
    (m) => {
      m.ixs[0] = priceModelIx(2_500_001n);
    },
    /cap/,
  );
  refuse(
    "the original instructions reordered",
    (m) => {
      const a = m.ixs.findIndex(
          (i) => i.program === COMPUTE && i.data[0] === 2,
        ),
        b = m.ixs.findIndex((i) => i.program !== COMPUTE);
      [m.ixs[a], m.ixs[b]] = [m.ixs[b], m.ixs[a]];
    },
    /instructions differ/,
  );
  refuse(
    "a removed instruction (the lev instruction)",
    (m) => {
      m.ixs = m.ixs.filter((i) => i.program === COMPUTE);
    },
    /instructions differ/,
  );
  refuse(
    "a removed instruction (the limit)",
    (m) => {
      m.ixs = m.ixs.filter((i) => !(i.program === COMPUTE && i.data[0] === 2));
    },
    /instructions differ/,
  );
  refuse(
    "an extra instruction that reuses existing keys",
    (m) => {
      m.ixs.push({
        ...clone({ keys: [], blockhash: m.blockhash, ixs: [lev(m)] }).ixs[0],
      });
    },
    /instructions differ/,
  );
  refuse(
    "a price-shaped instruction that is not ComputeBudget",
    (m) => {
      const p = m.ixs[0];
      p.program = lev(m).program;
    },
    /differ|price/,
  );
  refuse(
    "a price instruction with an account",
    (m) => {
      m.ixs[0].accounts = [m.keys[0].key];
    },
    /differ|price/,
  );
  refuse(
    "a price instruction with the limit discriminator",
    (m) => {
      m.ixs[0].data = Uint8Array.of(2, 0, 0, 0, 0);
    },
    /differ|price/,
  );
});

describe("tampered splices are refused too", () => {
  it("the same tampering applied to a byte-splice message", async () => {
    const s = await setup(),
      ok = insert(s.message, 1, priceIx(split(s.message).computeIndex, 1000n));
    expect(classify(s, ok).kind).toBe("priority_price_added");
    const flipRo = ok.slice();
    flipRo[2] -= 1; // one fewer read-only unsigned key: the last one becomes writable
    expect(() => classify(s, flipRo)).toThrow();
    const dup = toModel(ok);
    dup.keys.push({ ...dup.keys[dup.keys.length - 1] });
    expect(() => classify(s, encodeModel(dup))).toThrow();
  });
});

describe("account-set and role rules, on a prepared message that carries unreferenced keys", () => {
  const fresh = (n: number) => bs58.encode(new Uint8Array(32).fill(n));
  /** Prepared message with extra keys no instruction uses, so key-set and role changes are isolated. */
  const custom = (s: S, extra: Model["keys"]) => {
    const m = clone(s.model);
    m.keys.push(...extra);
    return encodeModel(m);
  };
  const withPrice = (m: Model) => {
    const x = clone(m);
    x.ixs.splice(1, 0, priceModelIx(1000n));
    return x;
  };
  const run = (prepared: Uint8Array, returned: Uint8Array) =>
    classifyReturnedMessage(prepared, 400000, returned);
  it("the same extra keys in any order pass; the baseline for the cases below", async () => {
    const s = await setup(),
      extra: Model["keys"] = [
        { key: fresh(1), role: "ro" },
        { key: fresh(2), role: "sr" },
        { key: fresh(3), role: "sw" },
      ],
      prepared = custom(s, extra),
      back = withPrice(toModel(prepared));
    expect(run(prepared, encodeModel(back, reverseWithin)).kind).toBe(
      "priority_price_added",
    );
  });
  it("a removed key is refused even when every remaining key is known", async () => {
    const s = await setup(),
      prepared = custom(s, [{ key: fresh(1), role: "ro" }]),
      back = withPrice(toModel(prepared));
    back.keys = back.keys.filter((k) => k.key !== fresh(1));
    expect(() => run(prepared, encodeModel(back))).toThrow(/adds or removes/);
  });
  it("a swapped unused key of the same count is refused", async () => {
    const s = await setup(),
      prepared = custom(s, [{ key: fresh(1), role: "ro" }]),
      back = withPrice(toModel(prepared));
    back.keys.find((k) => k.key === fresh(1))!.key = fresh(2);
    expect(() => run(prepared, encodeModel(back))).toThrow(/adds or removes/);
  });
  it("a duplicated key replacing an unused one is refused", async () => {
    const s = await setup(),
      prepared = custom(s, [{ key: fresh(1), role: "ro" }]),
      back = withPrice(toModel(prepared)),
      other = back.keys.find((k) => k.role === "ro" && k.key !== COMPUTE)!;
    back.keys.find((k) => k.key === fresh(1))!.key = other.key;
    expect(() => run(prepared, encodeModel(back))).toThrow(/repeats/);
    // And a prepared message that itself repeats a key is never a base.
    expect(() => run(encodeModel(back), encodeModel(back))).toThrow();
  });
  it("a signer's writable flag flipped (read-only signer <-> writable signer) is refused", async () => {
    const s = await setup(),
      prepared = custom(s, [
        { key: fresh(1), role: "sr" },
        { key: fresh(2), role: "sw" },
      ]),
      back = withPrice(toModel(prepared));
    back.keys.find((k) => k.key === fresh(1))!.role = "sw";
    back.keys.find((k) => k.key === fresh(2))!.role = "sr";
    expect(() => run(prepared, encodeModel(back))).toThrow(
      /signer or writable/,
    );
  });
  it("an instruction account list that only gains a trailing account is refused", async () => {
    const s = await setup(),
      back = withPrice(s.model);
    lev(back).accounts.push(lev(back).accounts[2]);
    expect(() => run(s.message, encodeModel(back))).toThrow(
      /instructions differ/,
    );
  });
  it("an instruction account list that only loses its trailing account is refused", async () => {
    const s = await setup(),
      back = withPrice(s.model);
    lev(back).accounts.pop();
    expect(() => run(s.message, encodeModel(back))).toThrow(
      /instructions differ/,
    );
  });
  it.each([8, 10, 17])(
    "a ComputeBudget price-looking instruction with %i data bytes is not a price instruction",
    async (n) => {
      const s = await setup(),
        back = clone(s.model);
      back.ixs.splice(1, 0, {
        program: COMPUTE,
        accounts: [],
        data: Uint8Array.of(3, ...new Uint8Array(n - 1)),
      });
      expect(() => classify(s, encodeModel(back))).toThrow(/price instruction/);
    },
  );
  it("malformed headers are refused", async () => {
    const s = await setup(),
      ok = phantom(s);
    expect(classify(s, ok).kind).toBe("priority_price_added");
    for (const [at, v] of [
      [1, 1], // fee payer read-only
      [2, 255],
      [0, 0],
      [0, 200],
    ] as const) {
      const x = ok.slice();
      x[at] = v;
      expect(() => classify(s, x), `header byte ${at}=${v}`).toThrow();
    }
  });
  it("a v0 message with the same bytes behind the version marker is refused", async () => {
    const s = await setup();
    expect(() => classify(s, Uint8Array.of(0x80, ...phantom(s), 0))).toThrow();
  });
  it("every one-bit flip of a recompiled message is refused, except inside the price", async () => {
    const s = await setup(),
      ok = phantom(s, () => {}, 1000n);
    const m = toModel(ok);
    const at = (() => {
      // locate the 8 price bytes: they follow the unique [prog,0,9,3] header of the price instruction
      for (let i = 0; i < ok.length - 11; i++)
        if (ok[i + 1] === 0 && ok[i + 2] === 9 && ok[i + 3] === 3) return i + 4;
      throw Error("no price instruction found");
    })();
    expect(m.ixs.length).toBe(3);
    let refused = 0;
    for (let i = 0; i < ok.length; i++) {
      if (i >= at && i < at + 8) continue;
      for (const bit of [0, 7]) {
        const x = ok.slice();
        x[i] ^= 1 << bit;
        expect(() => classify(s, x), `byte ${i} bit ${bit}`).toThrow();
        refused++;
      }
    }
    expect(refused).toBe((ok.length - 8) * 2);
  });
});
