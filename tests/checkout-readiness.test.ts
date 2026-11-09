// @vitest-environment node
import { it, expect, vi } from "vitest";
import { createGatedPort } from "../src/buy/livePort";
import { createOfflineCheckoutPort } from "../src/buy/checkoutPort";
import {
  OWNER_RELEASE,
  assertLiveRelease,
  assertOwnerReview,
} from "../src/buy/executionGate";
import {
  DIRECT_GATE,
  type CheckedPurchase,
  type OwnerReview,
} from "../src/buy/direct-types";
import { PurchaseFlow } from "../src/buy/purchaseFlow";
import { sessionPurchaseSigner } from "../src/buy/sessionSigner";
import { verifySignedPurchase } from "../src/buy/signed";
import { PublicAttemptStore } from "../src/buy/recovery";
import { prepareP30UnsignedPurchase } from "../src/purchase/prepareUnsigned";
import { hash, fromHex, b64 } from "../src/buy/bytes";
import { DirectRpc } from "../src/buy/rpc";
import { PurchasePreflight } from "../src/buy/preflight";
import {
  ephemeral,
  memoryStorage,
  ctx,
  descriptor,
  offlineAccounts,
  offlineFetch,
} from "./f2-fixture";
import { PublicKey } from "@setl8/p30-sdk";
import { insert, packetOf, priceIx, split } from "./wallet-return-fixture";
async function setup(
  options: {
    simulationError?: boolean;
    signedError?: boolean;
    lostSend?: boolean;
    unsupportedSigned?: boolean;
    newerFloor?: boolean;
  } = {},
) {
  const signer = await ephemeral();
  let clock = Date.now();
  const account = ctx
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
  const c: CheckedPurchase = Object.freeze({
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
    checkedAt: String(clock),
    expiresAt: String(clock + 30000),
    minSlot: "600000000",
    fingerprint: "ab".repeat(32),
    expectedAccount: account,
    nextChallengeId: "0",
    prepared,
    checks: [],
  });
  const review: OwnerReview = {
      wallet: c.wallet,
      epoch: c.epoch,
      expectedAccount: c.expectedAccount,
      messageSha256: prepared.messageSha256,
      fingerprint: c.fingerprint,
      checkedAt: c.checkedAt,
      total: c.total,
      devnetTestTokens: true,
      noDebitCapAcknowledged: true,
    },
    storage = memoryStorage(),
    store = new PublicAttemptStore(storage),
    requests: {
      method: string;
      sigVerify?: boolean;
      packetHash?: string;
      maxRetries?: number;
      skipPreflight?: boolean;
      replaceRecentBlockhash?: boolean;
      expectedSignature?: string;
    }[] = [],
    events: string[] = [];
  let signature: string | null = null,
    beforeResponse: ((q: any) => Promise<void> | void) | null = null;
  const fetcher = (async (_url, init) => {
    const q = JSON.parse(String(init?.body));
    events.push(
      q.method +
        (q.params[1]?.sigVerify === undefined
          ? ""
          : ":" + q.params[1].sigVerify),
    );
    const request = {
      method: q.method,
      sigVerify: q.params[1]?.sigVerify,
      packetHash:
        q.params[0] && typeof q.params[0] === "string"
          ? await hash(new Uint8Array(Buffer.from(q.params[0], "base64")))
          : undefined,
      maxRetries: q.params[1]?.maxRetries,
      skipPreflight: q.params[1]?.skipPreflight,
      replaceRecentBlockhash: q.params[1]?.replaceRecentBlockhash,
    };
    requests.push(request);
    await beforeResponse?.(q);
    let result: any;
    if (q.method === "simulateTransaction") {
      if (q.params[1].sigVerify) {
        const retained = await store.read();
        expect(retained?.signature).toBeTruthy();
        signature = retained!.signature;
      }
      if (options.unsupportedSigned && q.params[1].sigVerify)
        return new Response(
          JSON.stringify({
            jsonrpc: "2.0",
            id: q.id,
            error: { code: -32602, message: "unsupported" },
          }),
        );
      result = {
        context: { slot: "600000001" },
        value: {
          err:
            options.simulationError ||
            (options.signedError && q.params[1].sigVerify)
              ? { InstructionError: [1, "Custom"] }
              : null,
          logs: ["Program success"],
          unitsConsumed: "50000",
        },
      };
    } else if (q.method === "sendTransaction") {
      const retained = await store.read();
      expect(retained?.signature).toBeTruthy();
      signature = retained!.signature;
      if (options.lostSend) throw Error("Mock send response lost");
      result = signature;
    } else throw Error("Unexpected mock checkout method");
    return new Response(JSON.stringify({ jsonrpc: "2.0", id: q.id, result }));
  }) as typeof fetch;
  const preflight = {
      contextFloor: () => (options.newerFloor ? "600000009" : c.minSlot),
      check: vi.fn(async () => c),
      revalidate: vi.fn(async () => {
        events.push("revalidate");
        if (clock >= Number(c.expiresAt))
          throw Error("Original blockhash/review expired");
      }),
    },
    port = createOfflineCheckoutPort(fetcher, preflight, () => clock),
    flow = new PurchaseFlow(
      port,
      store,
      async (f) => f(),
      () => clock,
    );
  await flow.restore();
  flow.select(signer.address, "0");
  await flow.check();
  return {
    c,
    review,
    signer,
    store,
    storage,
    requests,
    events,
    port,
    flow,
    preflight,
    get signature() {
      return signature;
    },
    setClock: (v: number) => {
      clock = v;
    },
    setBefore: (f: typeof beforeResponse) => {
      beforeResponse = f;
    },
  };
}
const OWNER = "J95j3drvYgYNrT3cocwSoR8hWd5zsaqVr12eW7UxL7zC";
const ADDED_WALLETS = [
  "E3T29izJ6aKE3zwpVi71mDDmbyDYp3vXMB4KkKVd32tK", // Rehearsal
  "HXC9pZxnqyqeb3awEtaBtWb2sJn21zwaNpzxaPQTrZPT", // Prof
  "2CRtrRwLFsrpnBas5z3Hx9gCuuESWZfscE5L2QzK1TYK", // Panel
]; // added 8 Nov 2026 by owner instruction
const OTHER = "7urBRSkXz6jAoz7j4QnVjgWWVLUxV6nzjZxNEWhxkLeF";
it("production release is exactly the narrow owner release: one wallet, time-bounded, sign-in required", async () => {
  // Opened for the owner demo only; every other wallet, any expired time and any missing session stay closed.
  expect(DIRECT_GATE.sign).toBe(true);
  expect(DIRECT_GATE.send).toBe(true);
  expect(OWNER_RELEASE).toEqual({
    enabled: true,
    wallets: [OWNER, ...ADDED_WALLETS],
    authorizationReference: "BTP-OWNER-2026-11-06-REPEAT-DEMO",
    validUntilMs: expect.any(Number),
  });
  const until = OWNER_RELEASE.validUntilMs!;
  expect(Number.isSafeInteger(until)).toBe(true);
  // Absolute bounds (not relative to the clock, so no time bomb): the window opened on 5 Nov 2026 and the
  // repeat-demo grant closes at 12 Nov 2026 23:59 IST (18:29 UTC). Widening it (or a seconds/milliseconds slip)
  // fails here.
  expect(until).toBeGreaterThan(Date.UTC(2026, 10, 5));
  expect(until).toBe(Date.UTC(2026, 10, 12, 18, 29, 0));
  expect(until).toBeLessThanOrEqual(Date.UTC(2026, 10, 13));
  expect(() => assertLiveRelease(OWNER, until - 1)).not.toThrow();
  expect(() => assertLiveRelease(OWNER, until)).toThrow("OFF"); // expired
  expect(() => assertLiveRelease(OWNER, until + 86_400_000)).toThrow("OFF");
  // Rehearsal, Prof and Panel have the same release and the same window as J95, nothing longer.
  for (const w of ADDED_WALLETS) {
    expect(() => assertLiveRelease(w, until - 1)).not.toThrow();
    expect(() => assertLiveRelease(w, until)).toThrow("OFF");
    expect(() => assertLiveRelease(w, until + 86_400_000)).toThrow("OFF");
  }
  expect(() => assertLiveRelease(OTHER, until - 1)).toThrow("OFF"); // other wallet
  expect(() => assertLiveRelease("11111111111111111111111111111111")).toThrow();
  const s = await setup();
  expect(() => assertLiveRelease(s.signer.address, until - 1)).toThrow("OFF");
  expect(() => createGatedPort().assertExecution?.(s.c, s.review)).toThrow();
  // The production port needs the signed-in session for that same wallet, and the release must be unexpired.
  const session = (wallet: string) => ({
    isPurchaseWallet: (w: string) => w === wallet,
  });
  vi.useFakeTimers({ toFake: ["Date"] });
  try {
    vi.setSystemTime(until - 60_000);
    expect(createGatedPort(session(OWNER)).canRequestApproval?.(OWNER)).toBe(
      true,
    );
    expect(createGatedPort().canRequestApproval?.(OWNER)).toBe(false); // no sign-in
    expect(createGatedPort(session(OTHER)).canRequestApproval?.(OWNER)).toBe(
      false,
    ); // session belongs to another wallet
    expect(
      createGatedPort({ isPurchaseWallet: () => true }).canRequestApproval?.(
        OTHER,
      ),
    ).toBe(false); // signed in, but not the released wallet
    vi.setSystemTime(until);
    expect(createGatedPort(session(OWNER)).canRequestApproval?.(OWNER)).toBe(
      false,
    ); // expired
  } finally {
    vi.useRealTimers();
  }
});
it("requires exact fresh owner terms and test-token/no-debit-cap review even in the new offline port", async () => {
  const s = await setup(),
    sign = vi.fn(s.signer.signTransaction);
  await s.flow.approve({ ...s.signer, signTransaction: sign });
  expect(sign).not.toHaveBeenCalled();
  expect(s.requests).toHaveLength(0);
  expect(await s.store.read()).toBeNull();
  expect(() => assertOwnerReview(s.c, { ...s.review, total: "1" })).toThrow();
});
it("persists attempt before unsigned simulation/prompt, exact signature before signed simulation, then sends once", async () => {
  const s = await setup();
  await s.flow.approve(
    {
      ...s.signer,
      async signTransaction(packet) {
        s.events.push("prompt");
        expect((await s.store.read())?.signature).toBeNull();
        return s.signer.signTransaction(packet);
      },
    },
    s.review,
  );
  expect(s.requests.map((r) => r.method)).toEqual([
    "simulateTransaction",
    "simulateTransaction",
    "sendTransaction",
  ]);
  expect(s.requests[0].sigVerify).toBe(false);
  expect(s.requests[1].sigVerify).toBe(true);
  expect(
    s.requests.slice(0, 2).every((r) => r.replaceRecentBlockhash === false),
  ).toBe(true);
  expect(s.requests[0].packetHash).toBe(s.c.prepared.unsignedTransactionSha256);
  expect(s.requests[1].packetHash).toBe(s.requests[2].packetHash);
  expect(s.requests[2].maxRetries).toBe(0);
  expect(s.requests[2].skipPreflight).toBe(false);
  expect(s.events.indexOf("simulateTransaction:false")).toBeLessThan(
    s.events.indexOf("prompt"),
  );
  expect(s.flow.getSnapshot().phase).toBe("uncertain");
  expect((await s.store.read())?.signature).toBeTruthy();
  expect(s.preflight.revalidate).toHaveBeenCalledTimes(2);
  await s.flow.approve(s.signer, s.review);
  expect(s.requests.filter((r) => r.method === "sendTransaction")).toHaveLength(
    1,
  );
});
it("unsigned simulation error blocks the wallet and retains public attempt", async () => {
  const s = await setup({ simulationError: true }),
    sign = vi.fn(s.signer.signTransaction);
  await s.flow.approve({ ...s.signer, signTransaction: sign }, s.review);
  expect(sign).not.toHaveBeenCalled();
  expect(s.requests).toHaveLength(1);
  expect((await s.store.read())?.signature).toBeNull();
  expect(s.flow.getSnapshot().phase).toBe("uncertain");
});
it.each(["failed", "unsupported"])(
  "%s signed simulation blocks send and retains exact signature",
  async (kind) => {
    const s = await setup({
      signedError: kind === "failed",
      unsupportedSigned: kind === "unsupported",
    });
    await s.flow.approve(s.signer, s.review);
    expect((await s.store.read())?.signature).toBeTruthy();
    expect(
      s.requests.filter((r) => r.method === "sendTransaction"),
    ).toHaveLength(0);
  },
);
it("expired original review during simulation prevents prompt", async () => {
  const s = await setup(),
    sign = vi.fn(s.signer.signTransaction);
  s.setBefore(() => s.setClock(Number(s.c.expiresAt)));
  await s.flow.approve({ ...s.signer, signTransaction: sign }, s.review);
  expect(sign).not.toHaveBeenCalled();
  expect(s.requests).toHaveLength(1);
});
it("wallet change during unsigned simulation cancels and prevents prompt", async () => {
  const s = await setup(),
    sign = vi.fn(s.signer.signTransaction);
  s.setBefore((q) => {
    if (q.method === "simulateTransaction") s.flow.select(null, "1");
  });
  await s.flow.approve({ ...s.signer, signTransaction: sign }, s.review);
  expect(sign).not.toHaveBeenCalled();
  expect(s.requests.filter((r) => r.method === "sendTransaction")).toHaveLength(
    0,
  );
});
it("wallet rejection remains unresolved with no signed simulation or send", async () => {
  const s = await setup();
  await s.flow.approve(
    {
      ...s.signer,
      signTransaction: async () => {
        throw Error("Rejected by mock wallet");
      },
    },
    s.review,
  );
  expect(s.requests.map((r) => r.method)).toEqual(["simulateTransaction"]);
  expect(s.flow.getSnapshot().phase).toBe("uncertain");
  expect((await s.store.read())?.signature).toBeNull();
});
it("changed signed message prevents signed simulation/send", async () => {
  const s = await setup();
  await s.flow.approve(
    {
      ...s.signer,
      async signTransaction(b) {
        const p = await s.signer.signTransaction(b);
        p[100] ^= 1;
        return p;
      },
    },
    s.review,
  );
  expect(s.requests).toHaveLength(1);
  expect((await s.store.read())?.signature).toBeNull();
});
it("wallet change after signing retains signature without sending", async () => {
  const s = await setup();
  await s.flow.approve(
    {
      ...s.signer,
      async signTransaction(b) {
        const p = await s.signer.signTransaction(b);
        s.flow.select(null, "1");
        return p;
      },
    },
    s.review,
  );
  expect((await s.store.read())?.signature).toBeTruthy();
  expect(s.requests).toHaveLength(1);
});
it("persistence failure before prompt blocks simulation/signing", async () => {
  const s = await setup(),
    sign = vi.fn(s.signer.signTransaction);
  s.storage.setItem = () => {
    throw Error("Quota");
  };
  await s.flow.approve({ ...s.signer, signTransaction: sign }, s.review);
  expect(sign).not.toHaveBeenCalled();
  expect(s.requests).toHaveLength(0);
});
it("signature persistence failure stops before signed simulation/send", async () => {
  const s = await setup(),
    save = s.storage.setItem;
  s.storage.setItem = (k, v) => {
    if (s.storage.values.size) throw Error("Quota");
    save(k, v);
  };
  await s.flow.approve(s.signer, s.review);
  expect(s.requests).toHaveLength(1);
  expect((await s.store.read())?.signature).toBeNull();
});
it("lost send response retains exact signature and port refuses another app send", async () => {
  const s = await setup({ lostSend: true });
  await s.flow.approve(s.signer, s.review);
  const a = await s.store.read();
  expect(a?.signature).toBeTruthy();
  expect(s.flow.getSnapshot().phase).toBe("uncertain");
  await s.flow.approve(s.signer, s.review);
  const packet = await s.signer.signTransaction(
    fromHex(s.c.prepared.unsignedTransactionHex),
  );
  await expect(
    s.port.broadcast(
      packet,
      a!.signature!,
      new AbortController().signal,
      s.c,
      s.review,
    ),
  ).rejects.toThrow("already");
  expect(s.requests.filter((r) => r.method === "sendTransaction")).toHaveLength(
    1,
  );
});
it("post-sign simulation cancellation cannot send", async () => {
  const s = await setup();
  s.setBefore((q) => {
    if (q.params[1].sigVerify === true) s.flow.select(null, "3");
  });
  await s.flow.approve(s.signer, s.review);
  expect((await s.store.read())?.signature).toBeTruthy();
  expect(s.requests.filter((r) => r.method === "sendTransaction")).toHaveLength(
    0,
  );
});
it.each(["fee", "rent"])(
  "revalidation checks original exact-message %s freshness",
  async (kind) => {
    const signer = await ephemeral(),
      accounts = offlineAccounts(signer.address);
    let changed = false;
    const rpc = new DirectRpc(
        offlineFetch(accounts, (m) =>
          changed && kind === "fee" && m === "getFeeForMessage"
            ? { context: { slot: "600000002" }, value: "6000" }
            : undefined,
        ),
      ),
      preflight = new PurchasePreflight(rpc);
    const c = await preflight.check(
      signer.address,
      "0",
      1,
      new AbortController().signal,
    );
    changed = true;
    if (kind === "rent") {
      const { RENT_SYSVAR } = await import("../src/buy/rentEvidence");
      const a = accounts[RENT_SYSVAR]!;
      const b = new Uint8Array(Buffer.from(a.data[0], "base64"));
      b[0] ^= 1;
      a.data[0] = b64(b);
    }
    await expect(
      preflight.revalidate(c, new AbortController().signal),
    ).rejects.toThrow();
  },
);

it("simulation cannot use a context older than the latest original-message revalidation", async () => {
  const s = await setup({ newerFloor: true }),
    sign = vi.fn(s.signer.signTransaction);
  await s.flow.approve({ ...s.signer, signTransaction: sign }, s.review);
  expect(sign).not.toHaveBeenCalled();
  expect(s.requests).toHaveLength(1);
  expect(s.flow.getSnapshot().phase).toBe("uncertain");
});

it("copies wallet-returned bytes before further awaits so a provider cannot mutate the app-owned packet", async () => {
  const s = await setup();
  let external: Uint8Array | null = null;
  s.preflight.revalidate.mockImplementation(async () => {
    if (external) external[100] ^= 1;
  });
  await s.flow.approve(
    {
      ...s.signer,
      async signTransaction(b) {
        external = await s.signer.signTransaction(b);
        return external;
      },
    },
    s.review,
  );
  expect(s.requests.filter((r) => r.method === "sendTransaction")).toHaveLength(
    1,
  );
  expect((await s.store.read())?.signature).toBeTruthy();
});

it.each(["session expiry", "account switch"])(
  "%s during wallet approval retains the exact original signature, locks repayment and reconciles the original attempt without sending",
  async (change) => {
    const s = await setup();
    let authenticated = true,
      connectedWallet = s.signer.address;
    let release!: () => void, prompted!: () => void;
    const waiting = new Promise<void>((r) => {
      release = r;
    });
    const opened = new Promise<void>((r) => {
      prompted = r;
    });
    let expectedSignature = "";
    const signer = sessionPurchaseSigner(
      {
        address: s.signer.address,
        async signTransaction(packet) {
          prompted();
          await waiting;
          const signed = await s.signer.signTransaction(packet);
          expectedSignature = await verifySignedPurchase(
            signed,
            s.c.prepared.messageHex,
            s.signer.address,
            s.c.prepared.messageSha256,
          );
          return signed;
        },
      },
      () => authenticated && connectedWallet === s.signer.address,
      () => s.flow.select(null, "0"),
    );
    const approval = s.flow.approve(signer, s.review);
    await opened;
    if (change === "session expiry") authenticated = false;
    else connectedWallet = "11111111111111111111111111111111";
    release();
    await approval;
    const retained = await s.store.read();
    expect(retained?.signature).toBe(expectedSignature);
    expect(retained?.wallet).toBe(s.signer.address);
    expect(retained?.expectedAccount).toBe(s.c.expectedAccount);
    expect(retained?.stage).toBe("signed");
    expect(s.flow.getSnapshot().phase).toBe("uncertain");
    expect(s.flow.getSnapshot().wallet).toBeNull();
    expect(s.flow.getSnapshot().error).toContain(
      "signed signature is retained",
    );
    // Only the pre-sign controlled simulation occurred. No signed simulation/send.
    expect(s.requests.map((r) => [r.method, r.sigVerify])).toEqual([
      ["simulateTransaction", false],
    ]);
    s.flow.select(s.signer.address, "0");
    await s.flow.check();
    expect(s.flow.getSnapshot().checked).toBeNull();
    const reconcile = vi.spyOn(s.port, "reconcile").mockResolvedValue({
      state: "uncertain",
      reason: "Controlled pending original signature",
    } as any);
    await s.flow.checkAgain();
    expect(reconcile.mock.calls[0][0]).toEqual(retained);
    await expect(signer.signTransaction(new Uint8Array())).rejects.toThrow(
      "sign-in or wallet changed",
    );
    expect((await s.store.read())?.signature).toBe(expectedSignature);
  },
);

it.each(["sign", "send"] as const)(
  "closing DIRECT_GATE.%s alone closes the release even for the released wallet inside the window",
  async (flag) => {
    vi.resetModules();
    vi.doMock("../src/buy/direct-types", async (original) => {
      const real = await original<typeof import("../src/buy/direct-types")>();
      return {
        ...real,
        DIRECT_GATE: Object.freeze({ ...real.DIRECT_GATE, [flag]: false }),
      };
    });
    try {
      const gate = await import("../src/buy/executionGate");
      const until = gate.OWNER_RELEASE.validUntilMs!;
      expect(gate.liveReleaseConfigured(until - 1)).toBe(false);
      expect(() => gate.assertLiveRelease(OWNER, until - 1)).toThrow("OFF");
    } finally {
      vi.doUnmock("../src/buy/direct-types");
      vi.resetModules();
    }
  },
);

// A wallet may add exactly one capped ComputeBudget price instruction; everything after the wallet then uses
// the returned packet. Everything else the wallet changes is still refused before any simulation or send.
const walletAdds =
  (
    s: Awaited<ReturnType<typeof setup>>,
    change: (m: Uint8Array) => Uint8Array,
  ) =>
  async (_: Uint8Array) =>
    s.signer.signTransaction(
      packetOf(change(fromHex(s.c.prepared.messageHex))),
    );
it.each([0, 1, 2])(
  "a wallet-added price instruction at position %i: signed simulation and the single send use the returned packet, hash and fee are retained",
  async (at) => {
    const s = await setup(),
      prepared = fromHex(s.c.prepared.messageHex),
      returned = insert(
        prepared,
        at,
        priceIx(split(prepared).computeIndex, 5000n),
      ),
      packet = packetOf(returned);
    await s.flow.approve(
      { ...s.signer, signTransaction: walletAdds(s, () => returned) },
      s.review,
    );
    expect(s.requests.map((r) => r.method)).toEqual([
      "simulateTransaction",
      "simulateTransaction",
      "sendTransaction",
    ]);
    // Unsigned simulation: the prepared packet. Signed simulation and send: the returned packet, byte for byte.
    expect(s.requests[0].packetHash).toBe(
      s.c.prepared.unsignedTransactionSha256,
    );
    const signedPacket = await s.signer.signTransaction(packet);
    expect(s.requests[1].packetHash).toBe(await hash(signedPacket));
    expect(s.requests[2].packetHash).toBe(s.requests[1].packetHash);
    expect(s.requests[2].maxRetries).toBe(0);
    expect(s.requests[2].skipPreflight).toBe(false);
    const kept = await s.store.read();
    expect(kept).toMatchObject({
      messageSha256: s.c.prepared.messageSha256,
      signedMessageSha256: await hash(returned),
      computeUnitPriceMicroLamports: "5000",
      priorityFeeLamports: "2000",
      stage: "signed",
    });
    expect(kept?.signature).toBeTruthy();
    const st = s.flow.getSnapshot();
    expect(st.phase).toBe("uncertain");
    expect(st.simulation?.messageSha256).toBe(await hash(returned));
    // The one-shot lock holds: another approval neither prompts nor sends.
    await s.flow.approve(s.signer, s.review);
    expect(
      s.requests.filter((r) => r.method === "sendTransaction"),
    ).toHaveLength(1);
  },
);
it.each([
  [
    "a second price instruction",
    (m: Uint8Array) => {
      const c = split(m).computeIndex;
      return insert(insert(m, 1, priceIx(c, 1n)), 0, priceIx(c, 1n));
    },
  ],
  [
    "a price above the 1,000,000 lamport cap",
    (m: Uint8Array) => insert(m, 1, priceIx(split(m).computeIndex, 2_500_001n)),
  ],
  [
    "a changed blockhash",
    (m: Uint8Array) => {
      const x = insert(m, 1, priceIx(split(m).computeIndex, 1n));
      x[4 + split(m).keys.length * 32] ^= 1;
      return x;
    },
  ],
  [
    "a changed fee payer",
    (m: Uint8Array) => {
      const x = insert(m, 1, priceIx(split(m).computeIndex, 1n));
      x[4] ^= 1;
      return x;
    },
  ],
  [
    "a changed original instruction",
    (m: Uint8Array) => {
      const x = insert(m, 2, priceIx(split(m).computeIndex, 1n));
      x[x.length - 1] ^= 1;
      return x;
    },
  ],
  [
    "a non-price ComputeBudget instruction",
    (m: Uint8Array) =>
      insert(m, 1, Uint8Array.of(split(m).computeIndex, 0, 5, 4, 0, 0, 0, 1)),
  ],
])(
  "%s from the wallet stops before any signed simulation or send and keeps the lock",
  async (_n, change) => {
    const s = await setup();
    await s.flow.approve(
      { ...s.signer, signTransaction: walletAdds(s, change) },
      s.review,
    );
    expect(s.requests.map((r) => r.method)).toEqual(["simulateTransaction"]);
    expect(s.requests[0].sigVerify).toBe(false);
    expect((await s.store.read())?.signature).toBeNull();
    expect((await s.store.read())?.signedMessageSha256).toBeNull();
    const st = s.flow.getSnapshot();
    expect(st.phase).toBe("uncertain");
    expect(st.diagnostics).toBeTruthy();
    await s.flow.approve(s.signer, s.review);
    expect(s.requests).toHaveLength(1);
  },
);
// The owner SOL limit counts the wallet's priority fee in the real flow. The checked object is frozen, so
// the over-limit case is a copy: network 5,000 + rent 9,950,001 leaves only 44,999 lamports of headroom.
it.each([
  [
    "60,000 lamports (under the 1,000,000 cap, over the SOL limit)",
    150_000n,
    false,
  ],
  ["45,000 lamports (one lamport over the limit)", 112_500n, false],
  ["44,999 lamports (exactly the headroom)", 112_497n, true],
  ["40,000 lamports (well inside the headroom)", 100_000n, true],
])(
  "the flow counts a wallet-added priority fee of %s toward the owner SOL limit",
  async (_n, price, accepted) => {
    const s = await setup(),
      tight: CheckedPurchase = Object.freeze({
        ...s.c,
        rent: "9950001",
        solRequired: String(5000 + 9950001),
      });
    s.preflight.check.mockImplementation(async () => tight);
    await s.flow.check();
    expect(s.flow.getSnapshot().checked).toBe(tight);
    const prepared = fromHex(tight.prepared.messageHex),
      returned = insert(
        prepared,
        1,
        priceIx(split(prepared).computeIndex, price),
      );
    await s.flow.approve(
      { ...s.signer, signTransaction: walletAdds(s, () => returned) },
      s.review,
    );
    const sent = s.requests.filter((r) => r.method === "sendTransaction");
    if (accepted) {
      expect(sent).toHaveLength(1);
      expect((await s.store.read())?.signedMessageSha256).toBe(
        await hash(returned),
      );
    } else {
      expect(s.requests.map((r) => r.method)).toEqual(["simulateTransaction"]);
      expect(sent).toHaveLength(0);
      expect((await s.store.read())?.signature).toBeNull();
      expect(s.flow.getSnapshot().diagnostics?.notes.join(" ")).toContain(
        "SOL limit",
      );
    }
  },
);
