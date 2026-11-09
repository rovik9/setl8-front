// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import bs58 from "bs58";
import { fromHex, hex } from "../src/buy/bytes";
import { PurchasePreflight } from "../src/buy/preflight";
import { PurchaseFlow } from "../src/buy/purchaseFlow";
import { PublicAttemptStore } from "../src/buy/recovery";
import { reconcilePurchase } from "../src/buy/receipt";
import { DirectRpc } from "../src/buy/rpc";
import {
  SignedPurchaseMismatch,
  verifySignedPurchase,
} from "../src/buy/signed";
import {
  KNOWN_PROGRAMS,
  diagnoseSignedMismatch,
} from "../src/buy/signedDiagnostics";
import type { PurchasePort } from "../src/buy/direct-types";
import {
  ephemeral,
  offlineAccounts,
  offlineFetch,
  memoryStorage,
} from "./f2-fixture";

const LIGHTHOUSE = "L2TExMFKdjpN9kozasaurPirfHy9P8sbXoAN1qA3S95";
const COMPUTE = "ComputeBudget111111111111111111111111111111";
const key = (n: number) => bs58.encode(new Uint8Array(32).fill(n));
const GUARD_MEMORY = key(9);

interface Ix {
  program: string;
  accounts: { key: string; signer: boolean; writable: boolean }[];
  data: Uint8Array;
}
interface Msg {
  feePayer: string;
  blockhash: string;
  ixs: Ix[];
}
function sv(n: number) {
  const o: number[] = [];
  do {
    let b = n & 0x7f;
    n >>= 7;
    if (n) b |= 0x80;
    o.push(b);
  } while (n);
  return o;
}
/** Test-side legacy decoder (independent of the production parser). */
function decode(m: Uint8Array): Msg {
  let at = 0;
  const rd = () => {
    let v = 0,
      s = 0;
    for (;;) {
      const b = m[at++];
      v |= (b & 0x7f) << s;
      s += 7;
      if (!(b & 0x80)) return v;
    }
  };
  const sigs = m[at],
    roS = m[at + 1],
    roU = m[at + 2];
  at += 3;
  const nk = rd(),
    keys: string[] = [];
  for (let i = 0; i < nk; i++)
    keys.push(bs58.encode(m.slice(at + i * 32, at + i * 32 + 32)));
  at += nk * 32;
  const blockhash = bs58.encode(m.slice(at, at + 32));
  at += 32;
  const ni = rd(),
    ixs: Ix[] = [];
  for (let k = 0; k < ni; k++) {
    const p = m[at++],
      na = rd(),
      accounts = [];
    for (let j = 0; j < na; j++) {
      const i = m[at++];
      accounts.push({
        key: keys[i],
        signer: i < sigs,
        writable: i < sigs ? i < sigs - roS : i < nk - roU,
      });
    }
    const nd = rd();
    ixs.push({ program: keys[p], accounts, data: m.slice(at, at + nd) });
    at += nd;
  }
  return { feePayer: keys[0], blockhash, ixs };
}
/** Test-side legacy compiler: fee payer first, then signer-w, signer-ro, unsigned-w, unsigned-ro. */
function encode(msg: Msg): Uint8Array {
  const flags = new Map<string, { s: boolean; w: boolean }>();
  const add = (k: string, s: boolean, w: boolean) => {
    const f = flags.get(k) ?? { s: false, w: false };
    flags.set(k, { s: f.s || s, w: f.w || w });
  };
  add(msg.feePayer, true, true);
  for (const ix of msg.ixs) {
    for (const a of ix.accounts) add(a.key, a.signer, a.writable);
    add(ix.program, false, false);
  }
  const all = [...flags.keys()];
  const group = (s: boolean, w: boolean) =>
    all.filter(
      (k) =>
        k !== msg.feePayer && flags.get(k)!.s === s && flags.get(k)!.w === w,
    );
  const keys = [
    msg.feePayer,
    ...group(true, true),
    ...group(true, false),
    ...group(false, true),
    ...group(false, false),
  ];
  const nSigners = 1 + group(true, true).length + group(true, false).length;
  const out: number[] = [
    nSigners,
    group(true, false).length,
    group(false, false).length,
  ];
  out.push(...sv(keys.length));
  for (const k of keys) out.push(...bs58.decode(k));
  out.push(...bs58.decode(msg.blockhash));
  out.push(...sv(msg.ixs.length));
  for (const ix of msg.ixs) {
    out.push(keys.indexOf(ix.program), ...sv(ix.accounts.length));
    for (const a of ix.accounts) out.push(keys.indexOf(a.key));
    out.push(...sv(ix.data.length), ...ix.data);
  }
  return Uint8Array.from(out);
}
const lighthouseIx = (payer: string): Ix => ({
  program: LIGHTHOUSE,
  accounts: [
    { key: GUARD_MEMORY, signer: false, writable: true },
    { key: payer, signer: true, writable: true },
  ],
  data: Uint8Array.from([1, 2, 3, 4, 5, 6, 7, 8]),
});
const priceIx = (): Ix => ({
  program: COMPUTE,
  accounts: [],
  data: Uint8Array.from([3, 1, 0, 0, 0, 0, 0, 0, 0]),
});
const packetOf = (message: Uint8Array) => {
  const p = new Uint8Array(65 + message.length);
  p[0] = 1;
  p.set(message, 65);
  return p;
};

async function setup() {
  const signer = await ephemeral(),
    rpc = new DirectRpc(offlineFetch(offlineAccounts(signer.address))),
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
  const c = flow.getSnapshot().checked!;
  return {
    flow,
    port,
    store,
    signer,
    c,
    original: decode(fromHex(c.prepared.messageHex)),
  };
}
const verify = (s: Awaited<ReturnType<typeof setup>>, packet: Uint8Array) =>
  verifySignedPurchase(
    packet,
    s.c.prepared.messageHex,
    s.signer.address,
    s.c.prepared.messageSha256,
  );
async function resign(
  s: Awaited<ReturnType<typeof setup>>,
  message: Uint8Array,
) {
  return s.signer.signTransaction(packetOf(message));
}
async function refused(
  s: Awaited<ReturnType<typeof setup>>,
  packet: Uint8Array,
) {
  try {
    await verify(s, packet);
  } catch (e) {
    expect(e).toBeInstanceOf(SignedPurchaseMismatch);
    expect((e as Error).message).toBe(
      "The wallet changed the exact purchase message. No app broadcast is permitted.",
    );
    return (e as SignedPurchaseMismatch).diagnostics!;
  }
  throw Error("expected a refusal");
}

describe("the prepared message", () => {
  it("is a legacy message with the known ComputeBudget instruction and passes untouched", async () => {
    const s = await setup();
    expect(
      await verify(
        s,
        await s.signer.signTransaction(
          fromHex(s.c.prepared.unsignedTransactionHex),
        ),
      ),
    ).toMatch(/^[1-9A-HJ-NP-Za-km-z]{80,90}$/);
    expect(s.original.ixs.some((i) => i.program === COMPUTE)).toBe(true);
    expect(KNOWN_PROGRAMS[COMPUTE]).toBe("ComputeBudget");
    expect(KNOWN_PROGRAMS[LIGHTHOUSE]).toBe("Lighthouse");
  });
  it("is exactly a ComputeBudget limit followed by one lev-program instruction", async () => {
    const s = await setup();
    expect(s.original.ixs.map((i) => KNOWN_PROGRAMS[i.program])).toEqual([
      "ComputeBudget",
      "Setl8LevProgram",
    ]);
    expect(decode(encode(s.original))).toEqual(s.original);
  });
});

describe("diagnostics on a refused wallet response (nothing is accepted)", () => {
  it("names the extra Lighthouse and ComputeBudget instructions a wallet guard adds", async () => {
    const s = await setup(),
      m = encode({
        ...s.original,
        ixs: [priceIx(), ...s.original.ixs, lighthouseIx(s.original.feePayer)],
      });
    const d = await refused(s, await resign(s, m));
    expect(d.lengthMatches).toBe(false);
    expect(d.packetBytes).toBe(65 + m.length);
    expect(d.expectedPacketBytes).toBe(65 + s.c.prepared.messageHex.length / 2);
    expect(d.signatureCountByte).toBe(1);
    expect(d.messageBytesEqual).toBe(false);
    expect([...d.extraPrograms].sort()).toEqual(
      [`${COMPUTE} (ComputeBudget)`, `${LIGHTHOUSE} (Lighthouse)`].sort(),
    );
    expect(d.missingPrograms).toEqual([]);
    expect(d.feePayerSame).toBe(true);
    expect(d.blockhashSame).toBe(true);
    expect(d.originalInstructionsPreserved).toBe(true);
    expect(d.extraInstructionCount).toBe(2);
    expect(d.returned.version).toBe("legacy");
  });
  it.each([
    [
      "an instruction data byte",
      (m: Msg) =>
        (m.ixs[m.ixs.length - 1].data[
          m.ixs[m.ixs.length - 1].data.length - 1
        ] ^= 1),
    ],
    ["the blockhash", (m: Msg) => (m.blockhash = key(5))],
    ["the fee payer", (m: Msg) => (m.feePayer = key(6))],
    ["a removed instruction", (m: Msg) => m.ixs.pop()],
    ["a swapped instruction order", (m: Msg) => m.ixs.reverse()],
  ])("flags %s as not preserved", async (_n, change) => {
    const s = await setup(),
      m = structuredClone(s.original);
    m.ixs = s.original.ixs.map((i) => ({
      ...i,
      data: new Uint8Array(i.data),
      accounts: i.accounts.map((a) => ({ ...a })),
    }));
    change(m);
    const d = await refused(s, packetOf(encode(m)));
    expect(
      d.originalInstructionsPreserved === false ||
        d.feePayerSame === false ||
        d.blockhashSame === false,
    ).toBe(true);
  });
  it("refuses and describes a second signature slot, a truncated packet, trailing bytes and garbage", async () => {
    const s = await setup(),
      base = fromHex(s.c.prepared.unsignedTransactionHex);
    const two = new Uint8Array(base.length + 64);
    two[0] = 2;
    two.set(base.slice(65), 129);
    for (const p of [
      two,
      base.slice(0, base.length - 3),
      Uint8Array.from([...base, 0]),
      new Uint8Array(0),
      Uint8Array.from([1]),
      new Uint8Array(5000).fill(255),
      Uint8Array.from({ length: 700 }, (_, i) => (i * 37) & 255),
    ]) {
      const d = await refused(s, p);
      expect(d.kind).toBe("setl8-wallet-message-mismatch-v1");
      expect(d.packetBytes).toBe(p.length);
    }
  });
  it("reports a v0 message and its lookup tables without trusting them", async () => {
    const s = await setup(),
      legacy = encode(s.original),
      v0 = Uint8Array.from([0x80, ...legacy, 0]);
    const d = await refused(s, await resign(s, v0));
    expect(d.returned.version).toBe("v0");
    expect(d.returned.lookupTables).toBe(0);
    expect(d.notes.join(" ")).toContain("different message version");
  });
  it("never contains the signature bytes; it does carry the public message structure", async () => {
    const s = await setup(),
      m = encode({
        ...s.original,
        ixs: [priceIx(), ...s.original.ixs, lighthouseIx(s.original.feePayer)],
      }),
      packet = await resign(s, m),
      d = await refused(s, packet),
      text = JSON.stringify(d),
      sig = packet.slice(1, 65);
    expect(text).not.toContain(bs58.encode(sig));
    expect(text).not.toContain(hex(sig));
    // The message bytes (not the packet) are emitted, and nothing before them.
    expect(d.returnedMessageHex).toBe(hex(m));
    expect(d.preparedMessageHex).toBe(s.c.prepared.messageHex);
    expect(text).not.toContain(hex(packet.slice(0, 65)));
    expect(d.preparedHeader).toHaveLength(3);
    expect(d.returnedHeader).toHaveLength(3);
    expect(d.preparedAccountKeys![0]).toBe(s.signer.address);
    expect(d.returnedAccountKeys).toContain(GUARD_MEMORY);
    expect(d.accountOrderIdentical).toBe(false);
    expect(d.returnedInstructions).toHaveLength(4);
    expect(d.returnedInstructions![0]).toMatchObject({
      accountIndexes: [],
      dataHex: expect.stringMatching(/^03/),
    });
    expect(d.spliceComparison).not.toBeNull();
  });
  it("logs the same public data to the console", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const s = await setup(),
      d = await refused(
        s,
        packetOf(
          encode({
            ...s.original,
            ixs: [...s.original.ixs, lighthouseIx(s.original.feePayer)],
          }),
        ),
      );
    expect(warn).toHaveBeenCalledWith(
      "[setl8] wallet message mismatch",
      JSON.stringify(d),
    );
  });
  it("is deterministic and never throws on arbitrary input", () => {
    for (let n = 0; n < 200; n++) {
      const p = Uint8Array.from(
        { length: n * 7 },
        (_, i) => (i * 131 + n) & 255,
      );
      expect(() => diagnoseSignedMismatch(p, "00")).not.toThrow();
      expect(() => diagnoseSignedMismatch(p, "zz")).not.toThrow();
    }
  });
});

describe("the flow stays closed and shows the diagnostics", () => {
  it("keeps the retained attempt, sends nothing, signs once and exposes diagnostics", async () => {
    const s = await setup(),
      sign = vi.fn(async (b: Uint8Array) => {
        const o = decode(fromHex(s.c.prepared.messageHex));
        return resign(
          s,
          encode({
            ...o,
            ixs: [priceIx(), ...o.ixs, lighthouseIx(o.feePayer)],
          }),
        );
      });
    await s.flow.approve({ address: s.signer.address, signTransaction: sign });
    const st = s.flow.getSnapshot();
    expect(sign).toHaveBeenCalledTimes(1);
    expect(st.phase).toBe("uncertain");
    expect(st.error).toBe(
      "The wallet changed the exact purchase message. No app broadcast is permitted.",
    );
    expect(st.diagnostics?.extraPrograms.join(" ")).toContain("Lighthouse");
    expect(s.port.broadcast).not.toHaveBeenCalled();
    expect(s.port.revalidate).not.toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      "pre_send",
    );
    const kept = await s.store.read();
    expect(kept?.signature).toBeNull();
    expect(kept?.stage).toBe("awaiting_wallet");
    // The one-shot lock holds: a second approval does not prompt the wallet again.
    await s.flow.approve({ address: s.signer.address, signTransaction: sign });
    expect(sign).toHaveBeenCalledTimes(1);
  });
});
