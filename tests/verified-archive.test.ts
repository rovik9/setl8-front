// @vitest-environment node
// Offline only. The "Start another purchase" release: a purchase lock may be removed only for an attempt that is
// signed, recorded as verified AND that reconcilePurchase verifies again right now; the full record is archived first.
import { describe, expect, it, vi } from "vitest";
import bs58 from "bs58";
import { DirectRpc } from "../src/buy/rpc";
import { PurchasePreflight } from "../src/buy/preflight";
import { PurchaseFlow } from "../src/buy/purchaseFlow";
import {
  ARCHIVE_CAP,
  ARCHIVE_KEY,
  ATTEMPT_KEY,
  PublicAttemptStore,
  assertVerifiedForRelease,
} from "../src/buy/recovery";
import { hash } from "../src/buy/bytes";
import type {
  PublicAttempt,
  PurchasePort,
  Reconciliation,
} from "../src/buy/direct-types";
import {
  ephemeral,
  memoryStorage,
  offlineAccounts,
  offlineFetch,
} from "./f2-fixture";

const signal = () => new AbortController().signal;
const verifiedFor = (a: PublicAttempt): Reconciliation => ({
  state: "verified",
  message: "corroborated",
  signature: a.signature!,
  account: a.expectedAccount,
  actualDebit: a.total,
});
/** A genuine retained, signed attempt from a real offline approval. */
async function retained() {
  const signer = await ephemeral(),
    rpc = new DirectRpc(offlineFetch(offlineAccounts(signer.address))),
    storage = memoryStorage(),
    store = new PublicAttemptStore(storage),
    port: PurchasePort = {
      mode: "offline_mock",
      check: (...a) => new PurchasePreflight(rpc).check(...a),
      revalidate: vi.fn(async () => {}),
      broadcast: vi.fn(async () => {}),
      reconcile: vi.fn(async () => {
        throw Error("not used here");
      }),
    },
    flow = new PurchaseFlow(port, store, async (f) => f());
  await flow.restore();
  flow.select(signer.address, "0");
  await flow.check();
  await flow.approve(signer);
  const base = (await store.read())!;
  expect(base.signature).toBeTruthy();
  return { signer, storage, store, base };
}
type R = Awaited<ReturnType<typeof retained>>;
const lockKey = (s: R) => s.storage.values.get(ATTEMPT_KEY);
const archiveKey = (s: R) => s.storage.values.get(ARCHIVE_KEY);
/** Retain `record` (as the only attempt) and return what the store holds. */
async function holding(s: R, patch: Partial<PublicAttempt>) {
  const a = { ...s.base, ...patch } as PublicAttempt;
  await s.store.write(a);
  return (await s.store.read())!;
}
const signatureNo = (n: number) =>
  bs58.encode(Uint8Array.from({ length: 64 }, (_, i) => (i === 0 ? n : 7)));

describe("the store releases a lock only for a verified, signed, just-verified purchase", () => {
  it("archives the full record first, then removes the lock key; the archive stays readable", async () => {
    const s = await retained(),
      a = await holding(s, { stage: "verified" });
    await s.store.archiveVerifiedAndRelease(
      a,
      verifiedFor(a),
      1_794_000_000_000,
    );
    expect(lockKey(s)).toBeUndefined();
    expect(await s.store.read()).toBeNull();
    const archive = await s.store.readArchive();
    expect(archive).toHaveLength(1);
    expect(archive[0].record).toEqual(a); // the FULL record, not a summary
    expect(archive[0].verifiedAtMs).toBe("1794000000000");
    expect(archive[0].evidence).toEqual({
      signature: a.signature,
      account: a.expectedAccount,
      actualDebit: a.total,
    });
  });
  it("finishes an interrupted release without duplicating the archived record", async () => {
    const s = await retained(),
      a = await holding(s, { stage: "verified" });
    await s.store.archiveVerifiedAndRelease(a, verifiedFor(a), 1);
    const afterFirst = archiveKey(s);
    await s.store.write(a); // the lock key reappears (crash between the two steps, replayed)
    await s.store.archiveVerifiedAndRelease(a, verifiedFor(a), 2);
    expect(archiveKey(s)).toBe(afterFirst);
    expect(lockKey(s)).toBeUndefined();
    expect(await s.store.readArchive()).toHaveLength(1);
  });
  it.each([
    "awaiting_wallet",
    "signed",
    "uncertain",
    "finalized_observed",
  ] as const)(
    "refuses a %s attempt even when the evidence says verified",
    async (stage) => {
      const s = await retained(),
        a = await holding(s, { stage });
      await expect(
        s.store.archiveVerifiedAndRelease(a, verifiedFor(a), 1),
      ).rejects.toThrow("checked and verified");
      expect(lockKey(s)).toBeDefined();
      expect(archiveKey(s)).toBeUndefined();
    },
  );
  it("refuses an unsigned attempt (no signature, no returned message) even if marked verified", async () => {
    const s = await retained(),
      a = await holding(s, {
        stage: "verified",
        signature: null,
        signedMessageHex: null,
        signedMessageSha256: null,
        computeUnitPriceMicroLamports: null,
        priorityFeeLamports: null,
      });
    await expect(
      s.store.archiveVerifiedAndRelease(
        a,
        {
          state: "verified",
          message: "",
          signature: undefined,
          account: a.expectedAccount,
          actualDebit: a.total,
        },
        1,
      ),
    ).rejects.toThrow("unsigned");
    expect(lockKey(s)).toBeDefined();
    expect(archiveKey(s)).toBeUndefined();
  });
  it("refuses a record that is missing just one of the signed facts, in either direction", async () => {
    const s = await retained(),
      complete = await holding(s, { stage: "verified" });
    for (const patch of [
      { signature: null }, // returned-message fields set, signature gone
      {
        signedMessageHex: null,
        signedMessageSha256: null,
        computeUnitPriceMicroLamports: null,
        priorityFeeLamports: null,
      }, // signature set, no returned message (pre-upgrade shape)
    ] as Partial<PublicAttempt>[]) {
      const a = await holding(s, { stage: "verified", ...patch });
      await expect(
        s.store.archiveVerifiedAndRelease(
          a,
          {
            state: "verified",
            message: "",
            signature: complete.signature!,
            account: a.expectedAccount,
            actualDebit: a.total,
          },
          1,
        ),
      ).rejects.toThrow("unsigned");
      expect(lockKey(s)).toBeDefined();
      expect(archiveKey(s)).toBeUndefined();
    }
    // field-by-field on the predicate itself
    for (const key of [
      "signature",
      "signedMessageHex",
      "signedMessageSha256",
      "priorityFeeLamports",
    ] as const)
      expect(() =>
        assertVerifiedForRelease(
          { ...complete, [key]: null },
          verifiedFor(complete),
        ),
      ).toThrow("unsigned");
  });
  it.each([
    [
      "uncertain",
      (a: PublicAttempt) => ({
        ...verifiedFor(a),
        state: "uncertain" as const,
      }),
    ],
    [
      "confirmed",
      (a: PublicAttempt) => ({
        ...verifiedFor(a),
        state: "confirmed" as const,
      }),
    ],
    [
      "finalized_observed",
      (a: PublicAttempt) => ({
        ...verifiedFor(a),
        state: "finalized_observed" as const,
      }),
    ],
    [
      "a different signature",
      (a: PublicAttempt) => ({ ...verifiedFor(a), signature: signatureNo(9) }),
    ],
    [
      "no signature",
      (a: PublicAttempt) => ({ ...verifiedFor(a), signature: undefined }),
    ],
    [
      "a different account",
      (a: PublicAttempt) => ({ ...verifiedFor(a), account: a.wallet }),
    ],
    [
      "no account",
      (a: PublicAttempt) => ({ ...verifiedFor(a), account: undefined }),
    ],
    [
      "a different debit",
      (a: PublicAttempt) => ({ ...verifiedFor(a), actualDebit: "30120001" }),
    ],
    [
      "no debit",
      (a: PublicAttempt) => ({ ...verifiedFor(a), actualDebit: undefined }),
    ],
  ])("refuses when the latest check returned %s", async (_n, evidence) => {
    const s = await retained(),
      a = await holding(s, { stage: "verified" });
    await expect(
      s.store.archiveVerifiedAndRelease(a, evidence(a), 1),
    ).rejects.toThrow("did not verify this exact purchase");
    expect(lockKey(s)).toBeDefined();
    expect(archiveKey(s)).toBeUndefined();
  });
  it("refuses an expired attempt that was never verified (stage uncertain, blockhash long gone)", async () => {
    const s = await retained(),
      a = await holding(s, { stage: "uncertain", lastValidBlockHeight: "1" });
    await expect(
      s.store.archiveVerifiedAndRelease(a, verifiedFor(a), 1),
    ).rejects.toThrow("checked and verified");
    expect(lockKey(s)).toBeDefined();
  });
  it("refuses when the retained record is not the attempt presented, or there is none", async () => {
    const s = await retained(),
      a = await holding(s, { stage: "verified" }),
      other = { ...a, signature: signatureNo(5) } as PublicAttempt;
    await expect(
      s.store.archiveVerifiedAndRelease(other, verifiedFor(other), 1),
    ).rejects.toThrow("retained purchase changed");
    s.storage.values.delete(ATTEMPT_KEY);
    await expect(
      s.store.archiveVerifiedAndRelease(a, verifiedFor(a), 1),
    ).rejects.toThrow("retained purchase changed");
    expect(archiveKey(s)).toBeUndefined();
  });
  it("refuses on storage that cannot remove a key (a read-only view)", async () => {
    const s = await retained(),
      a = await holding(s, { stage: "verified" }),
      view = new PublicAttemptStore({
        getItem: (k) => s.storage.getItem(k),
        setItem: () => {
          throw Error("Read-only");
        },
      });
    await expect(
      view.archiveVerifiedAndRelease(a, verifiedFor(a), 1),
    ).rejects.toThrow("cannot release");
    expect(lockKey(s)).toBeDefined();
  });
  it("never shrinks: the archive is capped at 20 and a 21st release is refused with the lock kept", async () => {
    const s = await retained();
    for (let n = 0; n < ARCHIVE_CAP; n++) {
      const a = await holding(s, {
        stage: "verified",
        signature: signatureNo(n + 1),
      });
      await s.store.archiveVerifiedAndRelease(a, verifiedFor(a), n);
    }
    expect(await s.store.readArchive()).toHaveLength(ARCHIVE_CAP);
    const before = archiveKey(s),
      a = await holding(s, { stage: "verified", signature: signatureNo(99) });
    await expect(
      s.store.archiveVerifiedAndRelease(a, verifiedFor(a), 99),
    ).rejects.toThrow("archive is full");
    expect(archiveKey(s)).toBe(before);
    expect(lockKey(s)).toBeDefined();
    // order and content are preserved: oldest first
    const list = await s.store.readArchive();
    expect(list.map((x) => x.record.signature)).toEqual(
      Array.from({ length: ARCHIVE_CAP }, (_, n) => signatureNo(n + 1)),
    );
  });
  it("a storage that silently drops the archive write keeps the lock", async () => {
    const s = await retained(),
      a = await holding(s, { stage: "verified" }),
      lossy = new PublicAttemptStore({
        getItem: (k) => s.storage.getItem(k),
        setItem: (k, v) => {
          if (k !== ARCHIVE_KEY) s.storage.setItem(k, v); // the archive write is lost
        },
        removeItem: (k) => s.storage.removeItem(k),
      });
    await expect(
      lossy.archiveVerifiedAndRelease(a, verifiedFor(a), 1),
    ).rejects.toThrow();
    expect(lockKey(s)).toBeDefined();
    expect(archiveKey(s)).toBeUndefined();
  });
  it.each([
    [
      "removeItem throws",
      (real: any) => ({
        removeItem: () => {
          throw Error("blocked");
        },
      }),
    ],
    [
      "removeItem silently does nothing",
      (real: any) => ({ removeItem: () => {} }),
    ],
  ])(
    "a storage where %s keeps the lock and reports it, with the archive intact",
    async (_n, over) => {
      const s = await retained(),
        a = await holding(s, { stage: "verified" }),
        broken = new PublicAttemptStore({
          getItem: (k) => s.storage.getItem(k),
          setItem: (k, v) => s.storage.setItem(k, v),
          ...over(s.storage),
        });
      await expect(
        broken.archiveVerifiedAndRelease(a, verifiedFor(a), 1),
      ).rejects.toThrow();
      expect(lockKey(s)).toBeDefined();
      // the purchase is safely archived even though the lock could not be released; a retry finishes it
      expect(await s.store.readArchive()).toHaveLength(1);
      await s.store.archiveVerifiedAndRelease(a, verifiedFor(a), 2);
      expect(lockKey(s)).toBeUndefined();
      expect(await s.store.readArchive()).toHaveLength(1);
    },
  );
  it("a storage that throws on write (quota) keeps the lock and archives nothing", async () => {
    const s = await retained(),
      a = await holding(s, { stage: "verified" }),
      full = new PublicAttemptStore({
        getItem: (k) => s.storage.getItem(k),
        setItem: (k, v) => {
          if (k === ARCHIVE_KEY) throw Error("QuotaExceededError");
          s.storage.setItem(k, v);
        },
        removeItem: (k) => s.storage.removeItem(k),
      });
    await expect(
      full.archiveVerifiedAndRelease(a, verifiedFor(a), 1),
    ).rejects.toThrow("Quota");
    expect(lockKey(s)).toBeDefined();
    expect(archiveKey(s)).toBeUndefined();
  });
  it("an entry already archived under the same signature must be the very same record", async () => {
    const s = await retained(),
      a = await holding(s, { stage: "verified" });
    await s.store.archiveVerifiedAndRelease(a, verifiedFor(a), 1);
    // the lock key reappears holding a DIFFERENT record that claims the archived signature
    const different = {
      ...a,
      size: "5000000000",
      price: "55000000",
      fee: "220000",
      total: "55220000",
    } as PublicAttempt;
    await s.store.write(different);
    await expect(
      s.store.archiveVerifiedAndRelease(different, verifiedFor(different), 2),
    ).rejects.toThrow("already archived for this signature");
    expect(lockKey(s)).toBeDefined();
    expect(await s.store.readArchive()).toHaveLength(1);
  });
  it("an altered archive is refused on read and blocks any further release", async () => {
    const s = await retained(),
      a = await holding(s, { stage: "verified", signature: signatureNo(1) });
    await s.store.archiveVerifiedAndRelease(a, verifiedFor(a), 1);
    const good = archiveKey(s)!;
    const env = JSON.parse(good);
    env.records[0].evidence.actualDebit = "1";
    s.storage.values.set(ARCHIVE_KEY, JSON.stringify(env));
    await expect(s.store.readArchive()).rejects.toThrow("integrity");
    // re-digested but with an unverified stage inside: still refused
    env.records[0].evidence.actualDebit = a.total;
    env.records[0].record.stage = "signed";
    env.digest = await hash(JSON.stringify(env.records));
    s.storage.values.set(ARCHIVE_KEY, JSON.stringify(env));
    await expect(s.store.readArchive()).rejects.toThrow();
    const b = await holding(s, {
      stage: "verified",
      signature: signatureNo(2),
    });
    await expect(
      s.store.archiveVerifiedAndRelease(b, verifiedFor(b), 2),
    ).rejects.toThrow();
    expect(lockKey(s)).toBeDefined();
  });
  it("assertVerifiedForRelease is the single predicate (direct cases)", async () => {
    const s = await retained(),
      a = await holding(s, { stage: "verified" });
    expect(() => assertVerifiedForRelease(a, verifiedFor(a))).not.toThrow();
    expect(() =>
      assertVerifiedForRelease({ ...a, stage: "signed" }, verifiedFor(a)),
    ).toThrow();
    expect(() =>
      assertVerifiedForRelease({ ...a, signature: null }, verifiedFor(a)),
    ).toThrow();
    expect(() =>
      assertVerifiedForRelease(
        { ...a, signedMessageHex: null },
        verifiedFor(a),
      ),
    ).toThrow();
    expect(() =>
      assertVerifiedForRelease(a, { ...verifiedFor(a), state: "uncertain" }),
    ).toThrow();
  });
});

describe("PurchaseFlow.startAnother checks again at release time", () => {
  async function flowFor(
    s: R,
    results: (a: PublicAttempt) => Promise<Reconciliation>,
  ) {
    const reconcile = vi.fn(async (a: PublicAttempt) => results(a)),
      port: PurchasePort = {
        mode: "offline_mock",
        check: vi.fn(async () => {
          throw Error("not used");
        }),
        revalidate: vi.fn(async () => {}),
        broadcast: vi.fn(async () => {}),
        reconcile,
      },
      flow = new PurchaseFlow(port, s.store, async (f) => f());
    await flow.restore();
    return { flow, reconcile, port };
  }
  it("a verified purchase is re-verified, archived, unlocked, and a new purchase may then start", async () => {
    const s = await retained();
    await holding(s, { stage: "verified" });
    const { flow, reconcile } = await flowFor(s, async (a) => verifiedFor(a));
    expect(flow.getSnapshot().attempt?.stage).toBe("verified");
    await flow.startAnother();
    expect(reconcile).toHaveBeenCalledTimes(1);
    expect(flow.getSnapshot()).toMatchObject({
      attempt: null,
      phase: "idle",
      error: null,
    });
    expect(await s.store.read()).toBeNull();
    expect(await s.store.readArchive()).toHaveLength(1);
    // the lock is gone: a check may begin again (it reaches the port instead of "An earlier attempt exists")
    flow.select(s.signer.address, "0");
    await flow.check();
    expect(flow.getSnapshot().error ?? "").not.toMatch(
      /earlier attempt exists/,
    );
  });
  it.each([
    [
      "uncertain",
      (a: PublicAttempt): Reconciliation => ({
        state: "uncertain",
        message: "x",
      }),
    ],
    [
      "confirmed",
      (a: PublicAttempt): Reconciliation => ({
        state: "confirmed",
        message: "x",
        signature: a.signature!,
      }),
    ],
    [
      "finalized_observed",
      (a: PublicAttempt): Reconciliation => ({
        ...verifiedFor(a),
        state: "finalized_observed",
      }),
    ],
    [
      "verified for another signature",
      (a: PublicAttempt): Reconciliation => ({
        ...verifiedFor(a),
        signature: signatureNo(8),
      }),
    ],
    [
      "verified for another account",
      (a: PublicAttempt): Reconciliation => ({
        ...verifiedFor(a),
        account: a.wallet,
      }),
    ],
  ])("keeps the lock when the fresh check says %s", async (_n, answer) => {
    const s = await retained();
    await holding(s, { stage: "verified" });
    const { flow } = await flowFor(s, async (a) => answer(a));
    await expect(flow.startAnother()).rejects.toThrow();
    expect(lockKey(s)).toBeDefined();
    expect(archiveKey(s)).toBeUndefined();
    expect(flow.getSnapshot().attempt).not.toBeNull();
  });
  it("keeps the lock when the fresh check cannot be completed", async () => {
    const s = await retained();
    await holding(s, { stage: "verified" });
    const { flow } = await flowFor(s, async () => {
      throw Error("rpc down");
    });
    await expect(flow.startAnother()).rejects.toThrow("rpc down");
    expect(lockKey(s)).toBeDefined();
    expect(archiveKey(s)).toBeUndefined();
  });
  it.each([
    "awaiting_wallet",
    "signed",
    "uncertain",
    "finalized_observed",
  ] as const)(
    "a %s attempt never even reaches the network check",
    async (stage) => {
      const s = await retained();
      await holding(s, { stage });
      const { flow, reconcile } = await flowFor(s, async (a) => verifiedFor(a));
      await expect(flow.startAnother()).rejects.toThrow("checked and verified");
      expect(reconcile).not.toHaveBeenCalled();
      expect(lockKey(s)).toBeDefined();
      expect(archiveKey(s)).toBeUndefined();
    },
  );
  it("an unsigned attempt marked verified never reaches the network check", async () => {
    const s = await retained();
    await holding(s, {
      stage: "verified",
      signature: null,
      signedMessageHex: null,
      signedMessageSha256: null,
      computeUnitPriceMicroLamports: null,
      priorityFeeLamports: null,
    });
    const { flow, reconcile } = await flowFor(s, async (a) => verifiedFor(a));
    await expect(flow.startAnother()).rejects.toThrow("unsigned");
    expect(reconcile).not.toHaveBeenCalled();
    expect(lockKey(s)).toBeDefined();
  });
  it("does nothing without a retained attempt, and a cancelled check releases nothing", async () => {
    const s = await retained(),
      a = await holding(s, { stage: "verified" });
    // cancelled: the flow's epoch changes while the check is in flight
    let release!: (r: Reconciliation) => void;
    const { flow } = await flowFor(s, () => new Promise((r) => (release = r)));
    const pending = flow.startAnother();
    await Promise.resolve();
    flow.select(s.signer.address, "1"); // new selection aborts and bumps the epoch
    release(verifiedFor(a));
    await expect(pending).rejects.toThrow("Cancelled");
    expect(lockKey(s)).toBeDefined();
    expect(archiveKey(s)).toBeUndefined();
    const empty = new PurchaseFlow(
      {
        mode: "offline_mock",
        check: vi.fn(),
        revalidate: vi.fn(),
        broadcast: vi.fn(),
        reconcile: vi.fn(),
      } as unknown as PurchasePort,
      new PublicAttemptStore(memoryStorage()),
      async (f) => f(),
    );
    await expect(empty.startAnother()).resolves.toBeUndefined();
  });
  it("without a safe cross-tab lock (no navigator.locks) nothing is released", async () => {
    const s = await retained();
    await holding(s, { stage: "verified" });
    const { browserAttemptLock } = await import("../src/buy/recovery");
    const port = {
        mode: "offline_mock",
        check: vi.fn(),
        revalidate: vi.fn(),
        broadcast: vi.fn(),
        reconcile: vi.fn(async (a: PublicAttempt) => verifiedFor(a)),
      } as unknown as PurchasePort,
      flow = new PurchaseFlow(port, s.store, browserAttemptLock);
    await flow.restore();
    vi.stubGlobal("navigator", {}); // no locks API
    try {
      await expect(flow.startAnother()).rejects.toThrow("cannot safely lock");
    } finally {
      vi.unstubAllGlobals();
    }
    expect(lockKey(s)).toBeDefined();
    expect(archiveKey(s)).toBeUndefined();
  });
});

describe("checkAgain never overwrites a record that is not the one it checked (stale tab)", () => {
  async function flowFor(s: R, answer: (a: PublicAttempt) => Reconciliation) {
    const port = {
        mode: "offline_mock",
        check: vi.fn(),
        revalidate: vi.fn(),
        broadcast: vi.fn(),
        reconcile: vi.fn(async (a: PublicAttempt) => answer(a)),
      } as unknown as PurchasePort,
      flow = new PurchaseFlow(port, s.store, async (f) => f());
    await flow.restore();
    return flow;
  }
  it("still records a verified result for the very record it checked", async () => {
    const s = await retained();
    await holding(s, { stage: "signed" });
    const flow = await flowFor(s, (a) => verifiedFor(a));
    await flow.checkAgain();
    expect(flow.getSnapshot().phase).toBe("verified");
    expect((await s.store.read())?.stage).toBe("verified");
  });
  it("does not resurrect a released purchase in another tab's lock key", async () => {
    const s = await retained(),
      a = await holding(s, { stage: "verified" });
    const flow = await flowFor(s, (x) => ({
      ...verifiedFor(x),
      state: "finalized_observed",
    }));
    // another tab verifies, archives and releases this purchase while this tab is still showing it
    await s.store.archiveVerifiedAndRelease(a, verifiedFor(a), 1);
    expect(lockKey(s)).toBeUndefined();
    await flow.checkAgain();
    expect(lockKey(s)).toBeUndefined(); // not written back
    expect(flow.getSnapshot().error).toMatch(/changed in another tab/);
  });
  it("does not overwrite a NEW purchase that another tab began after the release", async () => {
    const s = await retained(),
      a = await holding(s, { stage: "verified" });
    const flow = await flowFor(s, (x) => ({
      ...verifiedFor(x),
      state: "finalized_observed",
    }));
    await s.store.archiveVerifiedAndRelease(a, verifiedFor(a), 1);
    const fresh = {
      ...a,
      stage: "signed",
      signature: signatureNo(77),
    } as PublicAttempt;
    await s.store.write(fresh); // the other tab's new, in-flight purchase
    const before = lockKey(s);
    await flow.checkAgain();
    expect(lockKey(s)).toBe(before);
    expect((await s.store.read())?.signature).toBe(signatureNo(77));
  });
});
