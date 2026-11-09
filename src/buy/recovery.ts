import type { PublicAttempt, Reconciliation } from "./direct-types";
import identity from "../purchase/p30-artifact.json";
import { hash, fromHex, u64 } from "./bytes";
import bs58 from "bs58";
import { classifyRetained } from "./walletReturn";
export const ATTEMPT_KEY = "setl8.direct-p30.public-attempt.v1";
/** Append-only record of purchases that were finalized AND verified, kept after their lock is released. */
export const ARCHIVE_KEY = "setl8.direct-p30.verified-attempts.v1";
export const ARCHIVE_CAP = 20;
export interface PublicStorage {
  getItem(k: string): string | null;
  setItem(k: string, v: string): void;
  /** Only the explicit "start another purchase" release uses this; read-only views omit it. */
  removeItem?(k: string): void;
}
export interface ArchivedPurchase {
  /** The full verified attempt record exactly as it was retained. */
  record: PublicAttempt;
  /** Unix ms when the verified status was observed and the lock released. */
  verifiedAtMs: string;
  evidence: { signature: string; account: string; actualDebit: string };
}
const legacyKeys =
  "blockhash,createdAt,descriptor,expectedAccount,fee,fingerprint,format,lastValidBlockHeight,messageHex,messageSha256,minSlot,nextChallengeId,npm,price,profile,signature,size,source,stage,tier,total,wallet";
const keys = [
  ...legacyKeys.split(","),
  "computeUnitPriceMicroLamports",
  "priorityFeeLamports",
  "signedMessageHex",
  "signedMessageSha256",
]
  .sort()
  .join(",");
/** Records written before the returned-message fields existed carry them as null. */
function upgrade(v: any): PublicAttempt {
  if (
    v &&
    typeof v === "object" &&
    Object.keys(v).sort().join(",") === legacyKeys
  )
    return {
      ...v,
      signedMessageHex: null,
      signedMessageSha256: null,
      computeUnitPriceMicroLamports: null,
      priorityFeeLamports: null,
    };
  return v;
}
async function validate(v: PublicAttempt) {
  if (
    Object.keys(v).sort().join(",") !== keys ||
    v.format !== "setl8-direct-demo-attempt-v1" ||
    v.profile !== identity.profile ||
    v.source !== identity.source_archive_sha256 ||
    v.npm !== identity.npm_sha256 ||
    v.descriptor !== identity.descriptor_sha256 ||
    !/^[0-9]$/.test(v.tier) ||
    ![
      "awaiting_wallet",
      "signed",
      "uncertain",
      "finalized_observed",
      "verified",
    ].includes(v.stage)
  )
    throw Error("Public recovery context needs review");
  for (const k of [
    "size",
    "price",
    "fee",
    "total",
    "lastValidBlockHeight",
    "minSlot",
    "nextChallengeId",
    "createdAt",
  ] as const)
    u64(v[k]);
  for (const x of [v.wallet, v.expectedAccount, v.blockhash])
    if (bs58.decode(x).length !== 32)
      throw Error("Recovery address is invalid");
  if (v.signature !== null && bs58.decode(v.signature).length !== 64)
    throw Error("Recovery signature is invalid");
  if (
    !/^[a-f0-9]{64}$/.test(v.messageSha256) ||
    !/^[a-f0-9]{64}$/.test(v.fingerprint) ||
    v.messageHex.length > 2334 ||
    fromHex(v.messageHex).length < 69
  )
    throw Error("Recovery message is invalid");
  if (BigInt(v.price) + BigInt(v.fee) !== BigInt(v.total))
    throw Error("Recovery charge is invalid");
  // The returned-message fields are all null (not yet signed) or all set, and a set message must still be
  // the prepared message or exactly that plus one capped price instruction.
  const signed = [
    v.signedMessageHex,
    v.signedMessageSha256,
    v.computeUnitPriceMicroLamports,
    v.priorityFeeLamports,
  ];
  const unset = signed.every((x) => x === null);
  if (!unset) {
    if (
      typeof v.signedMessageHex !== "string" ||
      v.signedMessageHex.length > 2400 ||
      !/^[a-f0-9]{64}$/.test(String(v.signedMessageSha256)) ||
      typeof v.priorityFeeLamports !== "string"
    )
      throw Error("Recovery signed message is invalid");
    u64(v.priorityFeeLamports);
    if (v.computeUnitPriceMicroLamports !== null)
      u64(v.computeUnitPriceMicroLamports);
    let info;
    try {
      info = await classifyRetained(v);
    } catch {
      throw Error("Recovery signed message differs from the allowed plan");
    }
    if (
      info.priorityFeeLamports !== v.priorityFeeLamports ||
      info.priceMicroLamportsPerCu !== v.computeUnitPriceMicroLamports
    )
      throw Error("Recovery priority fee differs from the signed message");
  }
  return v;
}
const sortedKeys = (v: unknown) =>
  v && typeof v === "object" ? Object.keys(v).sort().join(",") : "";
/**
 * The ONLY condition under which a purchase lock may be released: the retained attempt was signed, was
 * recorded as verified, and a reconciliation for exactly that signature and account just returned verified
 * with the debit the review recorded. Anything else (unsigned, uncertain, confirmed, finalized-but-not-
 * verified, mismatching evidence) throws.
 */
export function assertVerifiedForRelease(
  a: Readonly<PublicAttempt>,
  e: Reconciliation,
) {
  if (a.stage !== "verified")
    throw Error(
      "Only a purchase that was checked and verified can be closed. Check its status first.",
    );
  if (
    a.signature === null ||
    a.signedMessageHex === null ||
    a.signedMessageSha256 === null ||
    a.priorityFeeLamports === null
  )
    throw Error("An unsigned attempt can never be closed.");
  if (
    e.state !== "verified" ||
    e.signature !== a.signature ||
    e.account !== a.expectedAccount ||
    e.actualDebit !== a.total
  )
    throw Error(
      "The latest check did not verify this exact purchase, so its lock stays.",
    );
}
export class PublicAttemptStore {
  constructor(private storage: PublicStorage) {}
  /** Archived verified purchases, oldest first. Throws if the archive was altered. */
  async readArchive(): Promise<readonly Readonly<ArchivedPurchase>[]> {
    const raw = this.storage.getItem(ARCHIVE_KEY);
    if (raw === null) return [];
    if (raw.length > 262144)
      throw Error("Verified purchase archive exceeds its bound");
    const envelope = JSON.parse(raw);
    if (
      sortedKeys(envelope) !== "digest,records" ||
      !Array.isArray(envelope.records) ||
      envelope.records.length > ARCHIVE_CAP ||
      (await hash(JSON.stringify(envelope.records))) !== envelope.digest
    )
      throw Error("Verified purchase archive integrity needs review");
    const out: Readonly<ArchivedPurchase>[] = [],
      seen = new Set<string>();
    for (const e of envelope.records) {
      if (sortedKeys(e) !== "evidence,record,verifiedAtMs")
        throw Error("Verified purchase archive entry needs review");
      const r = await validate(upgrade(e.record));
      if (
        r.stage !== "verified" ||
        r.signature === null ||
        r.signedMessageHex === null ||
        (await hash(fromHex(r.messageHex))) !== r.messageSha256 ||
        sortedKeys(e.evidence) !== "account,actualDebit,signature" ||
        e.evidence.signature !== r.signature ||
        e.evidence.account !== r.expectedAccount ||
        e.evidence.actualDebit !== r.total ||
        seen.has(r.signature)
      )
        throw Error("Verified purchase archive entry needs review");
      u64(e.verifiedAtMs);
      seen.add(r.signature);
      out.push(
        Object.freeze({
          record: r,
          verifiedAtMs: e.verifiedAtMs,
          evidence: e.evidence,
        }),
      );
    }
    return Object.freeze(out);
  }
  /**
   * Append the full verified record to the archive, then remove the lock key. Refuses unless
   * assertVerifiedForRelease holds for the attempt that is retained right now. Idempotent for a record that is
   * already archived (a crash between the two steps just finishes the release). Never deletes archive entries.
   */
  async archiveVerifiedAndRelease(
    a: Readonly<PublicAttempt>,
    evidence: Reconciliation,
    nowMs: number,
  ) {
    const remove = this.storage.removeItem?.bind(this.storage);
    if (!remove) throw Error("This storage cannot release the purchase lock.");
    assertVerifiedForRelease(a, evidence);
    const current = await this.read();
    if (!current || JSON.stringify(current) !== JSON.stringify(a))
      throw Error(
        "The retained purchase changed. Reload and check its status again.",
      );
    const existing = await this.readArchive(),
      prior = existing.find((x) => x.record.signature === a.signature);
    if (prior && JSON.stringify(prior.record) !== JSON.stringify(a))
      throw Error(
        "A different record is already archived for this signature; lock kept.",
      );
    if (!prior) {
      if (existing.length >= ARCHIVE_CAP)
        throw Error(
          "The verified purchase archive is full (" +
            ARCHIVE_CAP +
            "). Nothing was removed.",
        );
      const records = [
          ...existing.map((x) => ({
            record: x.record,
            verifiedAtMs: x.verifiedAtMs,
            evidence: x.evidence,
          })),
          {
            record: a,
            verifiedAtMs: u64(String(Math.trunc(nowMs))),
            evidence: {
              signature: a.signature!,
              account: evidence.account!,
              actualDebit: evidence.actualDebit!,
            },
          },
        ],
        value = JSON.stringify({
          records,
          digest: await hash(JSON.stringify(records)),
        });
      this.storage.setItem(ARCHIVE_KEY, value);
      if (this.storage.getItem(ARCHIVE_KEY) !== value)
        throw Error("The verified purchase archive was not retained exactly.");
    }
    // The purchase is now durably archived: only then may the lock key go.
    if (
      !(await this.readArchive()).some(
        (x) => x.record.signature === a.signature,
      )
    )
      throw Error("The verified purchase is not in the archive; lock kept.");
    remove(ATTEMPT_KEY);
    if (this.storage.getItem(ATTEMPT_KEY) !== null)
      throw Error("The purchase lock could not be released.");
  }
  async read(): Promise<Readonly<PublicAttempt> | null> {
    const raw = this.storage.getItem(ATTEMPT_KEY);
    if (raw === null) return null;
    if (raw.length > 16384) throw Error("Recovery record exceeds its bound");
    const envelope = JSON.parse(raw);
    if (
      Object.keys(envelope).sort().join(",") !== "digest,record" ||
      (await hash(JSON.stringify(envelope.record))) !== envelope.digest
    )
      throw Error("Public recovery record integrity needs review");
    const r = await validate(upgrade(envelope.record));
    if ((await hash(fromHex(r.messageHex))) !== r.messageSha256)
      throw Error("Recovery exact message hash differs");
    return Object.freeze(r);
  }
  async write(record: PublicAttempt) {
    await validate(record);
    const r = Object.freeze({ ...record }),
      json = JSON.stringify(r),
      value = JSON.stringify({ record: r, digest: await hash(json) });
    if (value.length > 16384) throw Error("Recovery record exceeds its bound");
    this.storage.setItem(ATTEMPT_KEY, value);
    if (this.storage.getItem(ATTEMPT_KEY) !== value)
      throw Error("Recovery storage did not retain the exact attempt");
    return r;
  }
  // Deliberately no delete/unlock API. Expiry/absent status/rejected prompt never authorize another payment.
}
export type WithAttemptLock = <T>(work: () => Promise<T>) => Promise<T>;
export const browserAttemptLock: WithAttemptLock = async (work) => {
  if (!navigator.locks)
    throw Error(
      "This browser cannot safely lock the public recovery record. Wallet approval stays blocked.",
    );
  return navigator.locks.request(
    ATTEMPT_KEY,
    { ifAvailable: true },
    async (lock) => {
      if (!lock)
        throw Error(
          "Another tab is handling this purchase. Check its progress first.",
        );
      return work();
    },
  );
};
