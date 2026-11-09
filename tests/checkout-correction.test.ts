// @vitest-environment node
import { it, expect, vi } from "vitest";
import { writeFileSync, mkdirSync } from "node:fs";
import { PublicKey } from "@setl8/p30-sdk";
import { createOfflineCheckoutPort } from "../src/buy/checkoutPort";
import { PurchaseFlow } from "../src/buy/purchaseFlow";
import { PurchasePreflight } from "../src/buy/preflight";
import { DirectRpc } from "../src/buy/rpc";
import { PublicAttemptStore } from "../src/buy/recovery";
import { RENT_SYSVAR, exactRent } from "../src/buy/rentEvidence";
import { b64, un64 } from "../src/buy/bytes";
import {
  ephemeral,
  memoryStorage,
  offlineAccounts,
  offlineFetch,
  receiptFixture,
  ctx,
} from "./f2-fixture";
import type { OwnerReview } from "../src/buy/direct-types";
async function frame(
  options: {
    delay?: number;
    bandwidth?: number;
    walletDelay?: number;
    existing?: boolean;
    change?: string;
    changePhase?: "pre_wallet" | "pre_send";
    expiredBlockhash?: boolean;
    cancel?: boolean;
    denial?: number;
  } = {},
) {
  const signer = await ephemeral(),
    accounts = offlineAccounts(signer.address, options.existing ?? false),
    storage = memoryStorage(),
    store = new PublicAttemptStore(storage),
    start = Date.UTC(2026, 10, 1, 12);
  let at = start,
    wireAvailableAt = start,
    phase = "review",
    changed = false,
    preparedReceipt: Awaited<ReturnType<typeof receiptFixture>> | null = null,
    signedPacket: Uint8Array | null = null;
  const serverSizes: { phase: string; bytes: number; method: string }[] = [],
    requestOptions: any[] = [];
  const mutate = () => {
    if (
      changed ||
      !options.change ||
      phase !== (options.changePhase ?? "pre_send")
    )
      return;
    changed = true;
    let address: string;
    if (options.change === "image") {
      address = Object.keys(accounts).find(
        (k) => accounts[k]?.data[0].length! > 1000000,
      )!;
      const bytes = un64(accounts[address]!.data[0]);
      bytes[100] ^= 1;
      accounts[address]!.data[0] = b64(bytes);
    } else if (options.change === "counter") {
      const key = ctx.wallet(new PublicKey(signer.address))[0].toBase58();
      accounts[key] = offlineAccounts(signer.address, true)[key];
    } else {
      address =
        options.change === "rent"
          ? RENT_SYSVAR
          : options.change === "token"
            ? ctx.tokenAccount(new PublicKey(signer.address), "usdc").toBase58()
            : ctx.config()[0].toBase58();
      const b = un64(accounts[address]!.data[0]);
      b[options.change === "token" ? 64 : 0] ^= 1;
      accounts[address]!.data[0] = b64(b);
    }
  };
  const base = offlineFetch(accounts, (method) =>
    options.expiredBlockhash &&
    phase === "pre_send" &&
    method === "getBlockHeight"
      ? "700000001"
      : undefined,
  );
  let port: ReturnType<typeof createOfflineCheckoutPort>;
  const transport = (async (url, init) => {
    const q = JSON.parse(String(init?.body)),
      requestStartedAt = at;
    phase = port.measurements!().at(-1)!.phase;
    requestOptions.push({ phase, method: q.method, params: q.params });
    if (q.method === "getMultipleAccounts") mutate();
    let response: Response;
    if (
      options.denial &&
      phase === "pre_wallet" &&
      q.method === "getFeeForMessage"
    )
      response = new Response("", {
        status: options.denial,
        headers: { "Retry-After": "120" },
      });
    else if (q.method === "simulateTransaction")
      response = new Response(
        JSON.stringify({
          jsonrpc: "2.0",
          id: q.id,
          result: {
            context: { slot: "600000002" },
            value: {
              err: null,
              logs: ["Program success"],
              unitsConsumed: "50000",
            },
          },
        }),
      );
    else if (q.method === "sendTransaction") {
      const a = (await store.read())!;
      preparedReceipt = await receiptFixture(
        signer.address,
        signedPacket!,
        a.signature!,
      );
      response = new Response(
        JSON.stringify({ jsonrpc: "2.0", id: q.id, result: a.signature }),
      );
    } else if (phase === "reconciliation" && preparedReceipt)
      response = await preparedReceipt.fetcher(url, init);
    else response = await base(url, init);
    const bytes = (await response.clone().arrayBuffer()).byteLength;
    serverSizes.push({ phase, bytes, method: q.method });
    const readyAt = requestStartedAt + (options.delay ?? 250);
    wireAvailableAt =
      Math.max(wireAvailableAt, readyAt) +
      Math.ceil((bytes * 1000) / (options.bandwidth ?? 2 * 1024 * 1024));
    at = Math.max(at, wireAvailableAt);
    return response;
  }) as typeof fetch;
  port = createOfflineCheckoutPort(transport, undefined, () => at);
  const flow = new PurchaseFlow(
    port,
    store,
    async (work) => work(),
    () => at,
  );
  await flow.restore();
  flow.select(signer.address, "0");
  await flow.check();
  const c = flow.getSnapshot().checked!;
  expect(c).toBeTruthy();
  const review: OwnerReview = {
    wallet: c.wallet,
    epoch: c.epoch,
    expectedAccount: c.expectedAccount,
    messageSha256: c.prepared.messageSha256,
    fingerprint: c.fingerprint,
    checkedAt: c.checkedAt,
    total: c.total,
    devnetTestTokens: true,
    noDebitCapAcknowledged: true,
  };
  const prompt = vi.fn(async (packet: Uint8Array) => {
    at += options.walletDelay ?? 20000;
    if (options.cancel) flow.select(null, "1");
    signedPacket = await signer.signTransaction(packet);
    return signedPacket;
  });
  return {
    port,
    flow,
    store,
    c,
    review,
    prompt,
    serverSizes,
    requestOptions,
    start,
    now: () => at,
    advance: (n: number) => {
      at += n;
    },
    approve: () =>
      flow.approve(
        { address: signer.address, signTransaction: prompt },
        review,
      ),
  };
}
function groups(
  measurements: ReturnType<
    NonNullable<ReturnType<typeof createOfflineCheckoutPort>["measurements"]>
  >,
) {
  const out: Record<
    string,
    { requests: number; requestBytes: number; responseBytesRead: number }
  > = {};
  for (const m of measurements) {
    const p = (out[m.phase] ??= {
      requests: 0,
      requestBytes: 0,
      responseBytesRead: 0,
    });
    p.requests++;
    p.requestBytes += m.requestBytes;
    p.responseBytesRead += m.responseBytesRead;
  }
  return out;
}
it("measures37-call success with250ms/read,2MiB/s decoded responses,1s explicit review and20s owner signing", async () => {
  const f = await frame();
  const created = Number(f.c.checkedAt);
  expect(created).toBeGreaterThan(f.start);
  expect(Number(f.c.expiresAt)).toBe(created + 30000);
  expect(f.c.oldestEvidenceAt).toBe(String(f.start));
  f.advance(1000);
  await f.approve();
  expect(f.prompt).toHaveBeenCalledTimes(1);
  expect(f.flow.getSnapshot().phase).toBe("uncertain");
  const sendAt = f.now();
  expect(sendAt).toBeLessThan(Number(f.c.expiresAt));
  const checkout = f.port.measurements!(),
    g = groups(checkout);
  expect(
    Object.fromEntries(Object.entries(g).map(([k, v]) => [k, v.requests])),
  ).toEqual({
    review: 18,
    pre_wallet: 8,
    unsigned_simulation: 1,
    pre_send: 8,
    signed_simulation: 1,
    send: 1,
  });
  expect(checkout).toHaveLength(37);
  expect(checkout.reduce((n, m) => n + m.responseBytesRead, 0)).toBe(
    f.serverSizes.reduce((n, m) => n + m.bytes, 0),
  );
  expect(checkout.every((m) => m.completedBody)).toBe(true);
  expect(
    f.requestOptions.filter((r) => r.method === "getLatestBlockhash"),
  ).toHaveLength(1);
  expect(
    f.requestOptions.filter(
      (r) => r.method === "getMinimumBalanceForRentExemption",
    ),
  ).toHaveLength(6);
  expect(
    f.requestOptions
      .filter((r) => r.method === "getMultipleAccounts")
      .every((r) => !r.params[1].dataSlice),
  ).toBe(true);
  expect(checkout.reduce((n, m) => n + m.responseBytesRead, 0)).toBeGreaterThan(
    11000000,
  );
  expect(checkout.reduce((n, m) => n + m.responseBytesRead, 0)).toBeLessThan(
    11400000,
  );
  const original = {
    checkedAt: f.c.checkedAt,
    expiresAt: f.c.expiresAt,
    message: f.c.prepared.messageSha256,
    blockhash: f.c.blockhash,
  };
  await f.flow.checkAgain();
  expect(f.flow.getSnapshot().phase).toBe("verified");
  expect(f.c).toMatchObject({
    checkedAt: original.checkedAt,
    expiresAt: original.expiresAt,
    blockhash: original.blockhash,
  });
  expect(f.c.prepared.messageSha256).toBe(original.message);
  const all = f.port.measurements!();
  expect(groups(all).reconciliation.requests).toBe(8);
  const evidenceDir =
    process.env.SETL8_CHECKOUT_EVIDENCE_DIR ?? "artifacts/checkout-correction";
  mkdirSync(evidenceDir, { recursive: true });
  writeFileSync(
    `${evidenceDir}/measured-success.json`,
    JSON.stringify(
      {
        classification: "OFFLINE_DETERMINISTIC_REAL_IMPLEMENTATION",
        latencyPerRequestMs: 250,
        decodedResponseBandwidthBytesPerSecond: 2 * 1024 * 1024,
        ownerReviewDelayMs: 1000,
        ownerWalletDelayMs: 20000,
        oldestEvidenceAt: f.c.oldestEvidenceAt,
        createdAt: f.c.checkedAt,
        expiresAt: f.c.expiresAt,
        sendAt,
        quoteCreationMs: created - f.start,
        approvalToSendMs: sendAt - created - 1000,
        remainingLeaseAtSendMs: Number(f.c.expiresAt) - sendAt,
        phases: groups(all),
        checkoutRequests: checkout.length,
        totalIncludingSuccessfulReconciliation: all.length,
        measurements: all,
        noImageDataSlice: true,
        compilationsGetLatestBlockhash: 1,
      },
      null,
      2,
    ) + "\n",
  );
});
it("existing-profile path is35 calls with the same two boundaries", async () => {
  const f = await frame({ existing: true });
  await f.approve();
  expect(f.flow.getSnapshot().phase).toBe("uncertain");
  expect(f.port.measurements!()).toHaveLength(35);
  expect(groups(f.port.measurements!()).review.requests).toBe(16);
});
it.each(["image", "config", "counter", "token", "rent"])(
  "post-wallet %s changes fail closed with known signature and no send",
  async (change) => {
    const f = await frame({ change });
    await f.approve();
    expect(f.flow.getSnapshot().phase).toBe("uncertain");
    expect((await f.store.read())?.signature).toBeTruthy();
    expect(
      f.port.measurements!().some((m) => m.method === "sendTransaction"),
    ).toBe(false);
  },
);
it("a full image-body change with identical header blocks before the wallet", async () => {
  const f = await frame({ change: "image", changePhase: "pre_wallet" });
  await f.approve();
  expect(f.prompt).not.toHaveBeenCalled();
  expect(await f.store.read()).toBeNull();
});
it("a31s wallet delay expires the ORIGINAL lease without re-quote/send/repayment", async () => {
  const f = await frame({ walletDelay: 31000 });
  await f.approve();
  expect(f.flow.getSnapshot().phase).toBe("uncertain");
  expect((await f.store.read())?.signature).toBeTruthy();
  expect(
    f.port.measurements!().some((m) => m.method === "sendTransaction"),
  ).toBe(false);
  expect(
    f.requestOptions.filter((r) => r.method === "getLatestBlockhash"),
  ).toHaveLength(1);
});
it("wallet cancellation still persists the exact signature and sends nothing", async () => {
  const f = await frame({ cancel: true });
  await f.approve();
  expect((await f.store.read())?.signature).toBeTruthy();
  expect(
    f.port.measurements!().some((m) => m.method === "sendTransaction"),
  ).toBe(false);
});
it("original blockhash expiry after owner delay fails before signed simulation/send", async () => {
  const f = await frame({ expiredBlockhash: true });
  await f.approve();
  expect((await f.store.read())?.signature).toBeTruthy();
  expect(
    f.port.measurements!().some(
      (m) => m.phase === "signed_simulation" || m.method === "sendTransaction",
    ),
  ).toBe(false);
});
it("creation lifetime starts on completion but is capped by oldest evidence+60s", async () => {
  const f = await frame({
    delay: 3300,
    bandwidth: 100 * 1024 * 1024,
    walletDelay: 0,
  });
  expect(Number(f.c.checkedAt) - f.start).toBeGreaterThan(30000);
  expect(Number(f.c.expiresAt)).toBe(f.start + 60000);
  expect(Number(f.c.expiresAt) - Number(f.c.checkedAt)).toBeLessThan(30000);
});
it("revalidation never calls discovery/check or refreshes quote identity", async () => {
  const signer = await ephemeral(),
    rpc = new DirectRpc(offlineFetch(offlineAccounts(signer.address))),
    p = new PurchasePreflight(rpc),
    spy = vi.spyOn(p, "check");
  const c = await p.check(signer.address, "0", 1, new AbortController().signal),
    expiry = c.expiresAt;
  await p.revalidate(c, new AbortController().signal, "pre_wallet");
  await p.revalidate(c, new AbortController().signal, "pre_send");
  expect(spy).toHaveBeenCalledTimes(1);
  expect(c.expiresAt).toBe(expiry);
  expect(groups(rpc.measurements()).pre_wallet.requests).toBe(8);
});
it("Rent cache requires exact supported parameters and RPC corroboration", async () => {
  const accounts = offlineAccounts(),
    a = accounts[RENT_SYSVAR]!,
    b = un64(a.data[0]);
  new DataView(b.buffer).setFloat64(8, 2.5, true);
  expect(() => exactRent({ ...a, data: [b64(b), "base64"] }, 207)).toThrow(
    "Unsupported",
  );
  const signer = await ephemeral(),
    p = new PurchasePreflight(
      new DirectRpc(
        offlineFetch(offlineAccounts(signer.address), (m) =>
          m === "getMinimumBalanceForRentExemption" ? "1" : undefined,
        ),
      ),
    );
  await expect(
    p.check(signer.address, "0", 1, new AbortController().signal),
  ).rejects.toThrow("disagree");
});

it.each([403, 429])(
  "bounded original-dependency group stops on%d without the next provider or wallet",
  async (denial) => {
    const f = await frame({ denial, walletDelay: 0 });
    await f.approve();
    expect(f.prompt).not.toHaveBeenCalled();
    expect(await f.store.read()).toBeNull();
    const reads = f.port.measurements!().filter(
      (m) => m.phase === "pre_wallet",
    );
    expect(reads).toHaveLength(5);
    expect(
      reads.some((m) => m.provider === 1 && m.method !== "getMultipleAccounts"),
    ).toBe(false);
    expect(reads.some((m) => m.status === denial)).toBe(true);
  },
);
