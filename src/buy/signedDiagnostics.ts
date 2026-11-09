import bs58 from "bs58";
import { fromHex } from "./bytes";
import descriptor from "../../dependencies/p30/3e33090cf9193fd909f57ed75e10f9e59b9409e3c8a8f6c186272d8ee185f86d/p30-descriptor.json";

/**
 * Public-only diagnostics for a wallet response that does not match the prepared purchase message.
 * They are produced AFTER the acceptance check has already refused, change no accept/reject
 * decision, and carry only public message data: lengths, counts, flags, the message bytes (hex),
 * the header, ordered account keys, and per-instruction program index / account indexes / data.
 * Never the signature bytes, and never anything read from the signature section of the packet.
 */
export const KNOWN_PROGRAMS: Readonly<Record<string, string>> = Object.freeze({
  "11111111111111111111111111111111": "System",
  ComputeBudget111111111111111111111111111111: "ComputeBudget",
  TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA: "Token",
  ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL: "AssociatedToken",
  MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr: "Memo",
  Memo1UhkJRfHyvLMcVucJwxXeuD728EqVDDwQDxFMNo: "MemoV1",
  L2TExMFKdjpN9kozasaurPirfHy9P8sbXoAN1qA3S95: "Lighthouse",
  [descriptor.levProgramId]: "Setl8LevProgram",
  [descriptor.vaultProgramId]: "Setl8VaultProgram",
});
const MAX_PARSE = 4096;
export interface InstructionSummary {
  program: string;
  name: string;
  accounts: number;
  dataBytes: number;
}
export interface MessageSummary {
  ok: boolean;
  version?: "legacy" | "v0";
  error?: string;
  messageBytes: number;
  requiredSignatures?: number;
  accountKeys?: number;
  lookupTables?: number;
  instructions?: readonly InstructionSummary[];
}
export interface InstructionDetail {
  programIdIndex: number;
  accountIndexes: readonly number[];
  dataHex: string;
}
/** Public structure of one decoded message (message bytes only; never signature bytes). */
export interface MessageStructure {
  messageHex: string;
  /** numRequiredSignatures, numReadonlySignedAccounts, numReadonlyUnsignedAccounts (3 bytes). */
  header: readonly number[] | null;
  accountKeys: readonly string[] | null;
  instructions: readonly InstructionDetail[] | null;
}
/** How the returned bytes compare to the closest "prepared message + one price instruction" splice. */
export interface SpliceComparison {
  /** Insertion position of the candidate that matches the returned bytes for the longest prefix. */
  candidateInsertedAt: number;
  candidateBytes: number;
  returnedBytes: number;
  /** First byte offset (within the message) where candidate and returned differ; null if identical. */
  firstDifferingByteOffset: number | null;
  candidateByteAtOffset: string | null;
  returnedByteAtOffset: string | null;
  /** Which message section that offset falls in. */
  section: string | null;
}
export interface SignedMismatchDiagnostics {
  kind: "setl8-wallet-message-mismatch-v1";
  packetBytes: number;
  expectedPacketBytes: number;
  lengthMatches: boolean;
  signatureCountByte: number | null;
  expectedSignatureCountByte: 1;
  /** Bytes after the signature section, compared with the prepared message. */
  returnedMessageBytes: number;
  expectedMessageBytes: number;
  messageBytesEqual: boolean;
  expected: MessageSummary;
  returned: MessageSummary;
  programsExpected: readonly string[];
  programsReturned: readonly string[];
  /** Instructions present in the returned message that no prepared instruction explains. */
  extraPrograms: readonly string[];
  missingPrograms: readonly string[];
  feePayerSame: boolean | null;
  blockhashSame: boolean | null;
  /** Every prepared instruction (program, account keys with flags, data) appears in the same order. */
  originalInstructionsPreserved: boolean | null;
  extraInstructionCount: number | null;
  preparedMessageHex: string;
  returnedMessageHex: string | null;
  preparedHeader: readonly number[] | null;
  returnedHeader: readonly number[] | null;
  preparedAccountKeys: readonly string[] | null;
  returnedAccountKeys: readonly string[] | null;
  /** Same keys in the same order in both messages. */
  accountOrderIdentical: boolean | null;
  /** Same keys as a set (order ignored). */
  accountSetIdentical: boolean | null;
  preparedInstructions: readonly InstructionDetail[] | null;
  returnedInstructions: readonly InstructionDetail[] | null;
  spliceComparison: SpliceComparison | null;
  notes: readonly string[];
}
interface Parsed {
  summary: MessageSummary;
  feePayer?: string;
  blockhash?: string;
  /** Canonical per-instruction text: program|key:flags,...|data-hex. Compared, never emitted. */
  canon?: readonly string[];
  header?: readonly number[];
  keys?: readonly string[];
  details?: readonly InstructionDetail[];
  /** Raw bytes of each instruction, from its program index through its data. */
  raw?: readonly Uint8Array[];
  /** Offset of the instruction-count byte (the end of the blockhash). */
  headEnd?: number;
}
function shortvec(b: Uint8Array, at: number): [number, number] | null {
  let v = 0;
  for (let i = 0; i < 3; i++) {
    if (at + i >= b.length) return null;
    const x = b[at + i];
    v |= (x & 0x7f) << (7 * i);
    if ((x & 0x80) === 0) return [v, at + i + 1];
  }
  return null;
}
const nameOf = (id: string) => KNOWN_PROGRAMS[id] ?? "unknown";
const fail = (messageBytes: number, error: string): Parsed => ({
  summary: { ok: false, error, messageBytes },
});
function parseMessage(m: Uint8Array): Parsed {
  const n = m.length;
  if (n === 0 || n > MAX_PARSE) return fail(n, "length out of range");
  try {
    let at = 0,
      version: "legacy" | "v0" = "legacy";
    if (m[0] & 0x80) {
      if ((m[0] & 0x7f) !== 0) return fail(n, "unsupported message version");
      version = "v0";
      at = 1;
    }
    if (at + 3 > n) return fail(n, "truncated header");
    const sigs = m[at],
      roSigned = m[at + 1],
      roUnsigned = m[at + 2];
    at += 3;
    const kc = shortvec(m, at);
    if (!kc) return fail(n, "bad account count");
    const [keyCount] = kc;
    at = kc[1];
    if (keyCount > 64 || at + keyCount * 32 + 32 > n)
      return fail(n, "truncated accounts");
    if (
      sigs < 1 ||
      sigs > keyCount ||
      roSigned >= sigs ||
      roUnsigned > keyCount
    )
      return fail(n, "inconsistent header");
    const keys: string[] = [];
    for (let i = 0; i < keyCount; i++)
      keys.push(bs58.encode(m.slice(at + i * 32, at + (i + 1) * 32)));
    at += keyCount * 32;
    const blockhash = bs58.encode(m.slice(at, at + 32));
    at += 32;
    const headEnd = at,
      ic = shortvec(m, at);
    if (!ic) return fail(n, "bad instruction count");
    const [instrCount] = ic;
    at = ic[1];
    if (instrCount > 64) return fail(n, "too many instructions");
    const flags = (i: number) => {
      const signer = i < sigs,
        writable = signer ? i < sigs - roSigned : i < keyCount - roUnsigned;
      return (signer ? "s" : "") + (writable ? "w" : "");
    };
    const instructions: InstructionSummary[] = [],
      canon: string[] = [],
      details: InstructionDetail[] = [],
      raw: Uint8Array[] = [];
    for (let k = 0; k < instrCount; k++) {
      if (at >= n) return fail(n, "truncated instruction");
      const ixStart = at,
        p = m[at++];
      if (p >= keyCount) return fail(n, "program index is not a static key");
      const ac = shortvec(m, at);
      if (!ac) return fail(n, "bad instruction account count");
      at = ac[1];
      if (at + ac[0] > n) return fail(n, "truncated instruction accounts");
      const accs: string[] = [],
        accountIndexes: number[] = [];
      for (let j = 0; j < ac[0]; j++) {
        const idx = m[at + j];
        accountIndexes.push(idx);
        // Indexes beyond the static keys address lookup tables; they cannot be resolved offline.
        accs.push(idx < keyCount ? `${keys[idx]}:${flags(idx)}` : `lut${idx}`);
      }
      at += ac[0];
      const dc = shortvec(m, at);
      if (!dc) return fail(n, "bad instruction data length");
      at = dc[1];
      if (at + dc[0] > n) return fail(n, "truncated instruction data");
      const data = m.slice(at, at + dc[0]);
      at += dc[0];
      // Print an id only if it is a real program account (unsigned, read-only) or a known program.
      const isProgram = flags(p) === "" || keys[p] in KNOWN_PROGRAMS,
        name = nameOf(keys[p]);
      instructions.push({
        program: isProgram ? keys[p] : `non-program-account#${p}`,
        name: isProgram ? name : "not a program account",
        accounts: ac[0],
        dataBytes: dc[0],
      });
      const dataHex = Array.from(data, (x) =>
        x.toString(16).padStart(2, "0"),
      ).join("");
      canon.push(`${keys[p]}|${accs.join(",")}|${dataHex}`);
      details.push({ programIdIndex: p, accountIndexes, dataHex });
      raw.push(m.slice(ixStart, at));
    }
    let lookupTables: number | undefined;
    if (version === "v0") {
      const lc = shortvec(m, at);
      if (!lc) return fail(n, "bad lookup table count");
      lookupTables = lc[0];
      // Table contents are not parsed: v0 lookups are reported, never trusted.
      at = n;
    } else if (at !== n) return fail(n, "trailing bytes after instructions");
    return {
      summary: {
        ok: true,
        version,
        messageBytes: n,
        requiredSignatures: sigs,
        accountKeys: keyCount,
        lookupTables,
        instructions,
      },
      feePayer: keys[0],
      blockhash,
      canon,
      header: [sigs, roSigned, roUnsigned],
      keys,
      details,
      raw,
      headEnd,
    };
  } catch {
    return fail(n, "unparseable");
  }
}
const hex2 = (b: Uint8Array) =>
  Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
const MAX_HEX_BYTES = 2048;
const sameSet = (a: readonly string[], b: readonly string[]) =>
  a.length === b.length &&
  new Set(a).size === a.length &&
  a.every((k) => b.includes(k));
const sameList = (a: readonly string[], b: readonly string[]) =>
  a.length === b.length && a.every((k, i) => k === b[i]);
function sectionAt(p: Parsed, offset: number): string {
  if (p.header === undefined || p.keys === undefined || p.headEnd === undefined)
    return "unknown";
  const keysStart = 4; // legacy: header(3) + one-byte key count (<= 64 keys)
  if (offset < 3) return "header";
  if (offset < keysStart) return "account count";
  const keyAt = offset - keysStart;
  if (keyAt < p.keys.length * 32)
    return `account key #${Math.floor(keyAt / 32)}`;
  if (offset < p.headEnd) return "blockhash";
  if (offset === p.headEnd) return "instruction count";
  return "instructions";
}
/**
 * Closest "prepared message + one 12-byte SetComputeUnitPrice" splice to the returned bytes: the
 * candidate (over every insertion position, price taken from the returned message when it has one)
 * that agrees with the returned bytes for the longest prefix.
 */
function compareToSplice(
  prepared: Parsed,
  preparedBytes: Uint8Array,
  returnedBytes: Uint8Array | null,
  returned: Parsed,
): SpliceComparison | null {
  if (
    !returnedBytes ||
    !prepared.summary.ok ||
    !prepared.raw ||
    prepared.headEnd === undefined ||
    !prepared.keys
  )
    return null;
  const computeIndex = prepared.keys.indexOf(
    "ComputeBudget111111111111111111111111111111",
  );
  if (computeIndex < 0) return null;
  let price = new Uint8Array(8);
  const found = returned.details?.find(
    (d) =>
      returned.keys?.[d.programIdIndex] ===
        "ComputeBudget111111111111111111111111111111" &&
      d.accountIndexes.length === 0 &&
      d.dataHex.length === 18 &&
      d.dataHex.startsWith("03"),
  );
  if (found) price = Uint8Array.from(fromHex(found.dataHex).subarray(1, 9));
  const head = preparedBytes.slice(0, prepared.headEnd),
    n = prepared.raw.length;
  let best: SpliceComparison | null = null;
  for (let at = 0; at <= n; at++) {
    const parts = [
      head,
      Uint8Array.of(n + 1),
      ...prepared.raw.slice(0, at),
      Uint8Array.of(computeIndex, 0, 9, 3, ...price),
      ...prepared.raw.slice(at),
    ];
    const cand = new Uint8Array(parts.reduce((t, x) => t + x.length, 0));
    let o = 0;
    for (const x of parts) {
      cand.set(x, o);
      o += x.length;
    }
    const lim = Math.min(cand.length, returnedBytes.length);
    let d = 0;
    while (d < lim && cand[d] === returnedBytes[d]) d++;
    const differs = d < lim || cand.length !== returnedBytes.length;
    if (!best || d > (best.firstDifferingByteOffset ?? Infinity))
      best = {
        candidateInsertedAt: at,
        candidateBytes: cand.length,
        returnedBytes: returnedBytes.length,
        firstDifferingByteOffset: differs ? d : null,
        candidateByteAtOffset:
          differs && d < cand.length ? hex2(cand.subarray(d, d + 1)) : null,
        returnedByteAtOffset:
          differs && d < returnedBytes.length
            ? hex2(returnedBytes.subarray(d, d + 1))
            : null,
        section: differs
          ? sectionAt(returned.summary.ok ? returned : prepared, d)
          : null,
      };
  }
  return best;
}
/** True when `needle` is an in-order (not necessarily contiguous) subsequence of `hay`. */
const inOrder = (needle: readonly string[], hay: readonly string[]) => {
  let j = 0;
  for (const h of hay) if (j < needle.length && h === needle[j]) j++;
  return j === needle.length;
};
export function diagnoseSignedMismatch(
  packet: Uint8Array,
  preparedMessageHex: string,
  reason?: string,
): SignedMismatchDiagnostics {
  const notes: string[] = [];
  if (reason) notes.push(`Refused: ${reason}.`);
  let prepared = new Uint8Array(0);
  try {
    prepared = fromHex(preparedMessageHex);
  } catch {
    notes.push("The prepared message could not be decoded.");
  }
  // Compact-u16 signature count (the app expects exactly one signature).
  const sc = packet.length ? shortvec(packet, 0) : null;
  const sigSection = sc ? sc[1] + sc[0] * 64 : 65;
  if (sc && sc[0] !== 1)
    notes.push("The wallet returned a different signature count.");
  // Parse the message only for exactly one signature, so signature bytes are never read as keys.
  const returned =
    sc && sc[0] === 1 && packet.length > sigSection
      ? parseMessage(packet.subarray(sigSection))
      : fail(
          Math.max(0, packet.length - sigSection),
          "unexpected signature count",
        );
  const expected = parseMessage(prepared);
  const returnedBytes = Math.max(0, packet.length - sigSection);
  const bytesEqual =
    returnedBytes === prepared.length &&
    prepared.every((v, i) => v === packet[sigSection + i]);
  const progs = (p: Parsed) =>
    p.summary.instructions?.map((i) => i.program) ?? [];
  const pe = progs(expected),
    pr = progs(returned),
    exCount = new Map<string, number>(),
    reCount = new Map<string, number>();
  for (const p of pe) exCount.set(p, (exCount.get(p) ?? 0) + 1);
  for (const p of pr) reCount.set(p, (reCount.get(p) ?? 0) + 1);
  const label = (id: string) => `${id} (${nameOf(id)})`;
  const extra: string[] = [],
    missing: string[] = [];
  for (const [p, c] of reCount)
    for (let i = exCount.get(p) ?? 0; i < c; i++) extra.push(label(p));
  for (const [p, c] of exCount)
    for (let i = reCount.get(p) ?? 0; i < c; i++) missing.push(label(p));
  const both = expected.summary.ok && returned.summary.ok;
  if (!returned.summary.ok)
    notes.push(
      `The returned message could not be parsed: ${returned.summary.error}.`,
    );
  if (
    returned.summary.version &&
    returned.summary.version !== expected.summary.version
  )
    notes.push("The returned message uses a different message version.");
  if (returned.summary.lookupTables)
    notes.push("The returned message uses address lookup tables.");
  const preserved =
    both && expected.canon && returned.canon
      ? inOrder(expected.canon, returned.canon)
      : null;
  const returnedMessage =
    sc && sc[0] === 1 && packet.length > sigSection
      ? packet.slice(sigSection)
      : null;
  const bothKeys = expected.keys && returned.keys;
  return {
    kind: "setl8-wallet-message-mismatch-v1",
    packetBytes: packet.length,
    expectedPacketBytes: 65 + prepared.length,
    lengthMatches: packet.length === 65 + prepared.length,
    // Only a plausible count is shown; anything else could be signature material.
    signatureCountByte: packet.length && packet[0] <= 8 ? packet[0] : null,
    expectedSignatureCountByte: 1,
    returnedMessageBytes: returnedBytes,
    expectedMessageBytes: prepared.length,
    messageBytesEqual: bytesEqual,
    expected: expected.summary,
    returned: returned.summary,
    programsExpected: pe.map(label),
    programsReturned: pr.map(label),
    extraPrograms: extra,
    missingPrograms: missing,
    feePayerSame: both ? expected.feePayer === returned.feePayer : null,
    blockhashSame: both ? expected.blockhash === returned.blockhash : null,
    originalInstructionsPreserved: preserved,
    extraInstructionCount: both
      ? (returned.summary.instructions?.length ?? 0) -
        (expected.summary.instructions?.length ?? 0)
      : null,
    preparedMessageHex: hex2(prepared.subarray(0, MAX_HEX_BYTES)),
    returnedMessageHex: returnedMessage
      ? hex2(returnedMessage.subarray(0, MAX_HEX_BYTES))
      : null,
    preparedHeader: expected.header ?? null,
    returnedHeader: returned.header ?? null,
    preparedAccountKeys: expected.keys ?? null,
    returnedAccountKeys: returned.keys ?? null,
    accountOrderIdentical: bothKeys
      ? sameList(expected.keys!, returned.keys!)
      : null,
    accountSetIdentical: bothKeys
      ? sameSet(expected.keys!, returned.keys!)
      : null,
    preparedInstructions: expected.details ?? null,
    returnedInstructions: returned.details ?? null,
    spliceComparison: compareToSplice(
      expected,
      prepared,
      returnedMessage,
      returned,
    ),
    notes: Object.freeze(notes),
  };
}
