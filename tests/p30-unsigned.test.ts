// @vitest-environment node
import { it, expect, vi } from "vitest";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { PublicKey, p30Devnet } from "@setl8/p30-sdk";
import vectors from "./fixtures/p30-synthetic.json";
import descriptor from "../dependencies/p30/3e33090cf9193fd909f57ed75e10f9e59b9409e3c8a8f6c186272d8ee185f86d/p30-descriptor.json";
import { prepareP30UnsignedPurchase } from "../src/purchase/prepareUnsigned";
const digest = (hex: string) =>
  createHash("sha256").update(Buffer.from(hex, "hex")).digest("hex");
const input = (v = vectors.cases[0]) => ({
  inputKind: "p30-public-unsigned-input-v1",
  sdkProfile: descriptor.profileId,
  descriptor: { ...descriptor },
  connectedWallet: v.trader,
  trader: v.trader,
  sessionEpoch: 4,
  expectedAccount: v.pdas.tradingAccount.address,
  nextChallengeId: v.challengeId,
  tierIndex: String(v.tierIndex),
  mint: v.mint,
  recentBlockhash: "11111111111111111111111111111111",
  priorityFee:
    v.priorityFee === null
      ? { kind: "omitted" }
      : { kind: "micro_lamports_per_cu", value: String(v.priorityFee) },
});
/** Independent bounded legacy framing read, not SDK compilation. */
function parse(hex: string) {
  const b = Buffer.from(hex, "hex");
  let i = 3;
  const compact = () => {
    let n = 0,
      shift = 0,
      k;
    do {
      k = b[i++];
      n |= (k & 127) << shift;
      shift += 7;
      if (shift > 21) throw Error("bad compact");
    } while (k & 128);
    return n;
  };
  const count = compact(),
    keys = [];
  for (let n = 0; n < count; n++) {
    keys.push(new PublicKey(b.subarray(i, i + 32)).toBase58());
    i += 32;
  }
  i += 32;
  const instructions = [];
  const size = compact();
  for (let n = 0; n < size; n++) {
    const program = keys[b[i++]],
      accounts = [];
    let len = compact();
    for (let k = 0; k < len; k++) accounts.push(keys[b[i++]]);
    len = compact();
    const data = b.subarray(i, i + len).toString("hex");
    i += len;
    instructions.push({ program, accounts, data });
  }
  expect(i).toBe(b.length);
  return { keys, instructions };
}
it.each(vectors.cases)(
  "exact unsigned consumer message and oracle metas/data for $mint challenge $challengeId",
  async (v) => {
    const f = input(v),
      result = await prepareP30UnsignedPurchase(f),
      ctx = new p30Devnet.Context(descriptor);
    const expected = ctx.compilePurchase(
      {
        trader: new PublicKey(v.trader),
        nextChallengeId: BigInt(v.challengeId),
        tierIndex: v.tierIndex,
        mint: v.mint as "usdc" | "usdt",
      },
      f.recentBlockhash,
      v.priorityFee === null ? undefined : BigInt(v.priorityFee),
    );
    expect(result.messageHex).toBe(
      Buffer.from(expected.serializedMessage).toString("hex"),
    );
    expect(result.unsignedTransactionHex).toBe(
      Buffer.from(expected.unsignedTransaction).toString("hex"),
    );
    expect(result.messageSha256).toBe(digest(result.messageHex));
    expect(result.unsignedTransactionSha256).toBe(
      digest(result.unsignedTransactionHex),
    );
    expect(result.transactionSize).toBe(v.packetSize);
    expect(result.transactionSize).toBeLessThanOrEqual(1232);
    expect(result.computeUnitLimit).toBe(400000);
    expect(result.context.nextChallengeId).toBe(v.challengeId);
    expect(result.context.expectedAccount).toBe(v.pdas.tradingAccount.address);
    expect(result.requiredSigners).toEqual([v.trader]);
    const parsed = parse(result.messageHex),
      last = parsed.instructions.at(-1)!;
    expect(parsed.instructions[0].data).toBe("02801a0600");
    expect(last.program).toBe(descriptor.levProgramId);
    expect(last.accounts).toEqual(v.metas.map((m) => m.pubkey));
    expect(last.data).toBe(v.data);
    expect(result.actions).toEqual({ sign: false, submit: false });
    expect(result.admission).toContain("NOT_VERIFIED");
  },
);
it("omitted priority fee and exact zero remain different messages", async () => {
  const f = input(),
    none = await prepareP30UnsignedPurchase({
      ...f,
      priorityFee: { kind: "omitted" },
    }),
    zero = await prepareP30UnsignedPurchase({
      ...f,
      priorityFee: { kind: "micro_lamports_per_cu", value: "0" },
    });
  expect(none.messageSha256).not.toBe(zero.messageSha256);
  expect(parse(none.messageHex).instructions).toHaveLength(2);
  expect(parse(zero.messageHex).instructions[1].data).toBe(
    "030000000000000000",
  );
});
it.each([
  ["profile", { sdkProfile: "setl8-sdk-dev-v1" }],
  ["purpose", { inputKind: "checkout_demo" }],
  ["wallet", { connectedWallet: descriptor.feeWallet }],
  ["expected account", { expectedAccount: descriptor.config }],
  ["tier float", { tierIndex: 1.5 }],
  ["tier overflow", { tierIndex: "10" }],
  ["tier leading zero", { tierIndex: "01" }],
  ["mint", { mint: "demo-credits" }],
  ["blockhash", { recentBlockhash: "" }],
  ["id float", { nextChallengeId: 1.5 }],
  ["unsafe numeric id", { nextChallengeId: 9007199254740992 }],
  ["negative id", { nextChallengeId: "-1" }],
  ["id overflow", { nextChallengeId: "18446744073709551616" }],
  ["rounded price extra", { price: 67842.5 }],
  ["chart price extra", { value_e18: "67842500000000000000000" }],
  ["quoted amount extra", { quote: { total: "30.12" } }],
  [
    "priority float",
    { priorityFee: { kind: "micro_lamports_per_cu", value: 0.5 } },
  ],
  [
    "priority overflow",
    {
      priorityFee: {
        kind: "micro_lamports_per_cu",
        value: "18446744073709551616",
      },
    },
  ],
  ["priority hidden value", { priorityFee: { kind: "omitted", value: "0" } }],
  ["absent priority", { priorityFee: undefined }],
  ["session", { sessionEpoch: -1 }],
])("rejects wrong public context/value: %s", async (_label, edit) => {
  await expect(
    prepareP30UnsignedPurchase({ ...input(), ...edit }),
  ).rejects.toThrow();
});
it("descriptor drift, missing/extra fields and accessors fail before caller getters execute", async () => {
  for (const d of [
    { ...descriptor, cluster: "mainnet-beta" },
    { ...descriptor, usdcMint: descriptor.usdtMint },
    { ...descriptor, extra: "value" },
  ])
    await expect(
      prepareP30UnsignedPurchase({ ...input(), descriptor: d }),
    ).rejects.toThrow();
  const d = { ...descriptor };
  delete (d as Partial<typeof descriptor>).profileId;
  await expect(
    prepareP30UnsignedPurchase({ ...input(), descriptor: d }),
  ).rejects.toThrow();
  let reads = 0;
  const f = input();
  Object.defineProperty(f, "trader", {
    get() {
      reads++;
      return f.connectedWallet;
    },
    enumerable: true,
  });
  await expect(prepareP30UnsignedPurchase(f)).rejects.toThrow();
  expect(reads).toBe(0);
});
it("snapshots caller input before lazy import; returned public bytes/context are immutable", async () => {
  const f = input(),
    p = prepareP30UnsignedPurchase(f);
  f.nextChallengeId = "88";
  f.descriptor.cluster = "other";
  const result = await p;
  expect(result.context.nextChallengeId).toBe(vectors.cases[0].challengeId);
  expect(Object.isFrozen(result)).toBe(true);
  expect(Object.isFrozen(result.context)).toBe(true);
  expect(Object.isFrozen(result.context.priorityFee)).toBe(true);
  expect(typeof result.messageHex).toBe("string");
});
it("does not fetch, access wallet/storage or accept a demo catalog as preparation", async () => {
  const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(() => {
    throw Error("No network");
  });
  await prepareP30UnsignedPurchase(input());
  await expect(
    prepareP30UnsignedPurchase({
      id: "medium",
      size: "100000000000",
      price: "69000000",
    }),
  ).rejects.toThrow();
  expect(fetchSpy).not.toHaveBeenCalled();
});
it("keeps existing pages and original SDK files unchanged", () => {
  const old = JSON.parse(
    readFileSync("artifacts/p30-unsigned/frozen-files.json", "utf8"),
  );
  // The design layer (F1) and later journey work (history/proof/terminal/prototype routes and providers)
  // deliberately edit these; all other frozen files must stay identical.
  const designOwned = new Set([
    "src/main.tsx",
    "src/styles.css",
    "src/pages/Landing.tsx",
    "src/pages/Purchase.tsx",
  ]);
  // Files legitimately changed by later accepted work (wallet login, account update, recorded candles, day-2
  // proof regeneration) were re-baselined on 5 Nov 2026; they must still match that newer pin exactly.
  const rebaselined: Record<string, string> = JSON.parse(
    readFileSync("tests/fixtures/frozen-rebaseline-2026-11-05.json", "utf8"),
  ).files;
  for (const [p, original] of Object.entries(old).filter(
    ([p]) => !designOwned.has(p),
  )) {
    const sha = rebaselined[p] ?? original;
    let content: Buffer | string = readFileSync(p);
    if (p === "src/main.tsx") {
      content = content.toString("utf8");
      // F2 and F3 each own exactly one lazy import and one public route. Preserve all other bytes.
      for (const addition of [
        'const Buy = lazy(() => import("./pages/Buy"));\n',
        'const MyAccount = lazy(() => import("./pages/MyAccount"));\n',
        '                  <Route path="/buy" element={<Buy />} />\n',
        '                  <Route path="/my-account" element={<MyAccount />} />\n',
      ]) {
        expect(content.split(addition).length, addition).toBe(2);
        content = content.replace(addition, "");
      }
    }
    expect(createHash("sha256").update(content).digest("hex"), p).toBe(sha);
  }
  const before = JSON.parse(
      readFileSync("artifacts/p30-unsigned/package-lock-before.json", "utf8"),
    ).packages,
    after = JSON.parse(readFileSync("package-lock.json", "utf8")).packages;
  for (const [key, value] of Object.entries(before)) {
    if (!key) continue;
    const { dev: ignored, ...oldEntry } = value as Record<string, unknown>;
    const { dev: unused, ...newEntry } = after[key];
    expect(newEntry, key).toEqual(oldEntry);
  }
});
