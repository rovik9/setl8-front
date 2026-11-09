// Test-side byte tools, independent of src/buy/walletReturn.ts: split a legacy message into raw
// instructions and splice raw instruction bytes in, so tests state exactly which bytes changed.
import bs58 from "bs58";

export const COMPUTE = "ComputeBudget111111111111111111111111111111";
export const LIGHTHOUSE = "L2TExMFKdjpN9kozasaurPirfHy9P8sbXoAN1qA3S95";
export interface Split {
  head: Uint8Array;
  ixs: Uint8Array[];
  keys: string[];
  computeIndex: number;
}
export function split(m: Uint8Array): Split {
  let at = 3;
  const nKeys = m[at++],
    keys: string[] = [];
  for (let i = 0; i < nKeys; i++)
    keys.push(bs58.encode(m.slice(at + i * 32, at + i * 32 + 32)));
  at += nKeys * 32 + 32;
  const headEnd = at + 1,
    nIx = m[at++],
    ixs: Uint8Array[] = [];
  for (let k = 0; k < nIx; k++) {
    const start = at;
    at++; // program index
    const na = m[at++];
    at += na;
    const nd = m[at++];
    at += nd;
    ixs.push(m.slice(start, at));
  }
  if (at !== m.length) throw Error("fixture split: trailing bytes");
  return {
    head: m.slice(0, headEnd - 1),
    ixs,
    keys,
    computeIndex: keys.indexOf(COMPUTE),
  };
}
const cat = (parts: Uint8Array[]) => {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
};
export const u64le = (n: bigint) => {
  const b = new Uint8Array(8);
  new DataView(b.buffer).setBigUint64(0, n, true);
  return b;
};
/** [program index][0 accounts][9 data bytes][disc 3][price u64 le] */
export const priceIx = (computeIndex: number, price: bigint) =>
  cat([Uint8Array.of(computeIndex, 0, 9, 3), u64le(price)]);
/** The message with the given raw instruction bytes inserted at `at` (the count byte grows by one). */
export function insert(m: Uint8Array, at: number, raw: Uint8Array) {
  const s = split(m);
  return cat([
    s.head,
    Uint8Array.of(s.ixs.length + 1),
    ...s.ixs.slice(0, at),
    raw,
    ...s.ixs.slice(at),
  ]);
}
export const packetOf = (message: Uint8Array) => {
  const p = new Uint8Array(65 + message.length);
  p[0] = 1;
  p.set(message, 65);
  return p;
};

// ---- Semantic model: decode a legacy message, change meaning or just layout, re-encode. ----
export type Role = "sw" | "sr" | "w" | "ro";
export interface Ix {
  program: string;
  accounts: string[];
  data: Uint8Array;
}
export interface Model {
  /** Keys with their roles, in message order. */
  keys: { key: string; role: Role }[];
  blockhash: Uint8Array;
  ixs: Ix[];
}
const sv = (n: number) => {
  const o: number[] = [];
  do {
    let b = n & 0x7f;
    n >>= 7;
    if (n) b |= 0x80;
    o.push(b);
  } while (n);
  return o;
};
export function toModel(m: Uint8Array): Model {
  const sigs = m[0],
    roS = m[1],
    roU = m[2],
    n = m[3],
    keys: Model["keys"] = [];
  for (let i = 0; i < n; i++)
    keys.push({
      key: bs58.encode(m.slice(4 + i * 32, 4 + i * 32 + 32)),
      role:
        i < sigs ? (i < sigs - roS ? "sw" : "sr") : i < n - roU ? "w" : "ro",
    });
  let at = 4 + n * 32;
  const blockhash = m.slice(at, at + 32);
  at += 32;
  const nIx = m[at++],
    ixs: Ix[] = [];
  for (let k = 0; k < nIx; k++) {
    const prog = m[at++],
      na = m[at++],
      accounts = Array.from(m.slice(at, at + na), (i) => keys[i].key);
    at += na;
    const nd = m[at++];
    ixs.push({
      program: keys[prog].key,
      accounts,
      data: m.slice(at, at + nd),
    });
    at += nd;
  }
  if (at !== m.length) throw Error("toModel: trailing bytes");
  return { keys, blockhash, ixs };
}
const ORDER: Role[] = ["sw", "sr", "w", "ro"];
/**
 * Encode a model the way a wallet recompiles it: keys grouped by role (fee payer first), header
 * counts recomputed, every instruction index remapped. `within` orders keys inside a role group.
 */
export function encodeModel(
  mo: Model,
  within: (group: Model["keys"]) => Model["keys"] = (g) => g,
): Uint8Array {
  const keys = ORDER.flatMap((r) =>
    within(mo.keys.filter((k) => k.role === r)),
  );
  const idx = (key: string) => {
    const i = keys.findIndex((k) => k.key === key);
    if (i < 0)
      throw Error("encodeModel: instruction uses a key not in the list");
    return i;
  };
  const count = (r: Role) => keys.filter((k) => k.role === r).length;
  const out: number[] = [
    count("sw") + count("sr"),
    count("sr"),
    count("ro"),
    ...sv(keys.length),
  ];
  for (const k of keys) out.push(...bs58.decode(k.key));
  out.push(...mo.blockhash, ...sv(mo.ixs.length));
  for (const ix of mo.ixs)
    out.push(
      idx(ix.program),
      ...sv(ix.accounts.length),
      ...ix.accounts.map(idx),
      ...sv(ix.data.length),
      ...ix.data,
    );
  return Uint8Array.from(out);
}
export const priceModelIx = (price: bigint): Ix => ({
  program: COMPUTE,
  accounts: [],
  data: Uint8Array.of(3, ...u64le(price)),
});
/** Reverse each role group but keep the fee payer first: a different, equally valid key order. */
export const reverseWithin = (g: Model["keys"]) =>
  g[0]?.role === "sw" ? [g[0], ...g.slice(1).reverse()] : g.slice().reverse();
