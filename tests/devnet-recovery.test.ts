// @vitest-environment node
import { expect, it, vi } from "vitest";
import { encodeOrder, signingMessage, IntentKind } from "@setl8/order-codec";
import {
  DevnetIntentStore,
  DevnetIntentRecovery,
  retainApprovedDevnetMessage,
  type DevnetSignedRecord,
  type DevnetIntentTransport,
} from "../src/devnet/intentRecovery";
import { hex, fromHex } from "../src/buy/bytes";
import type { DevnetRecordedIntent } from "../src/api/devnet-execution-v1";
import type { SessionManager } from "../src/auth/session";
import type { PreparedDraft } from "../src/data/orderDraft";
// Every transport below is controlled offline. No real wallet or API is used.
const wallet = "fixture-wallet",
  account = "21".repeat(32),
  clock = 1793640000n;
function setup() {
  const data = new Map<string, string>();
  const storage = {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => {
      data.set(k, v);
    },
  };
  const store = new DevnetIntentStore(storage);
  const order = encodeOrder({
    kind: IntentKind.Market,
    market: 0,
    side: 0,
    qty: 10000n,
    priceE12: 0n,
    slE12: 0n,
    tpE12: 0n,
    targetNonce: 0,
    clientTime: clock,
  });
  const body = { nonce: 7, order: hex(order), signature: "07".repeat(64) };
  const r: DevnetSignedRecord = {
    format: "setl8-genuine-devnet-intent-v1",
    wallet,
    account,
    nonce: "7",
    messageHex: hex(signingMessage(fromHex(account), 7, order)),
    body,
    receipt: null,
    submission: "not_sent",
    createdAt: "2026-11-02T00:00:00Z",
  };
  store.write(r);
  const recorded: DevnetRecordedIntent = {
    api_version: "1",
    devnet_execution_version: "1",
    account,
    signed_intent: { ...body },
    input_seq: "13",
    recorded_input_sha256: "31".repeat(32),
    status: "received",
    complete_outcomes_available: false,
    admitted_unix_ns: "1793640000000000000",
    arrival_unix_s: "1793640000",
    source_input_seq: "11",
    arrival_tick_input_seq: "12",
  };
  const submit = vi.fn<DevnetIntentTransport["submit"]>(async () => ({
    api_version: "1" as const,
    input_seq: "13",
    state: "received" as const,
    duplicate: false,
  }));
  const recoverReceipt = vi.fn(async () => structuredClone(recorded));
  const transport: DevnetIntentTransport = { submit, recoverReceipt };
  let current = true;
  const engine = new DevnetIntentRecovery(
    wallet,
    account,
    store,
    transport,
    () => current,
  );
  return {
    data,
    storage,
    store,
    r,
    recorded,
    submit,
    recoverReceipt,
    engine,
    changeSession: () => {
      current = false;
    },
  };
}
function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((a, b) => {
    resolve = a;
    reject = b;
  });
  return { resolve, reject, promise };
}
it("persists uncertainty before forwarding and a durable receipt remains only received", async () => {
  const x = setup();
  x.submit.mockImplementation(async (w, a, b) => {
    expect(w).toBe(wallet);
    expect(a).toBe(account);
    expect(b).toEqual(x.r.body);
    expect(x.store.read(wallet, account)?.submission).toBe("uncertain");
    return {
      api_version: "1",
      input_seq: "13",
      state: "received",
      duplicate: false,
    };
  });
  const r = await x.engine.submit();
  expect(r.submission).toBe("received");
  expect(r.receipt?.state).toBe("received");
  expect(x.submit).toHaveBeenCalledTimes(1);
  await expect(x.engine.submit()).rejects.toThrow("no repeat POST");
  expect(x.submit).toHaveBeenCalledTimes(1);
});
it.each([401, 409, 503])(
  "a %s or unknown failure never frees the reference or permits another POST",
  async (status) => {
    const x = setup();
    x.submit.mockRejectedValue(
      Object.assign(Error("controlled failure"), { status }),
    );
    await expect(x.engine.submit()).rejects.toThrow("controlled");
    expect(x.store.read(wallet, account)?.submission).toBe("uncertain");
    await expect(x.engine.submit()).rejects.toThrow("no repeat POST");
    expect(x.submit).toHaveBeenCalledTimes(1);
    expect(() => x.engine.retireUnsent(String(clock + 20n))).toThrow(
      "Only a signature never forwarded",
    );
  },
);
it("a reload recovers the identical recorded body through GET only, without a new signature or POST", async () => {
  const x = setup();
  x.store.write({ ...x.r, submission: "uncertain" });
  const restored = new DevnetIntentRecovery(
    wallet,
    account,
    new DevnetIntentStore(x.storage),
    { submit: x.submit, recoverReceipt: x.recoverReceipt },
    () => true,
  );
  const r = await restored.reconcile();
  expect(r.submission).toBe("received");
  expect(r.receipt).toBeNull();
  expect(r.recorded).toEqual(x.recorded);
  expect(x.recoverReceipt).toHaveBeenCalledWith(
    account,
    x.r.body,
    expect.any(AbortSignal),
  );
  expect(x.submit).not.toHaveBeenCalled();
});
it.each(["account", "nonce", "order", "signature", "input_seq", "hash"])(
  "rejects changed %s receipt evidence without replacing original recovery bytes",
  async (field) => {
    const x = setup(),
      r = structuredClone(x.recorded);
    if (field === "account") r.account = "42".repeat(32);
    if (field === "nonce") r.signed_intent.nonce = 8;
    if (field === "order") r.signed_intent.order = "00".repeat(48);
    if (field === "signature") r.signed_intent.signature = "00".repeat(64);
    if (field === "input_seq") r.input_seq = "0";
    if (field === "hash") r.recorded_input_sha256 = "";
    x.recoverReceipt.mockResolvedValue(r);
    await expect(x.engine.reconcile()).rejects.toThrow("does not match");
    expect(x.store.read(wallet, account)).toEqual(x.r);
    expect(x.submit).not.toHaveBeenCalled();
  },
);
it("a missing receipt leaves an uncertain original request blocked, even if it may arrive later", async () => {
  const x = setup();
  x.store.write({ ...x.r, submission: "uncertain" });
  x.recoverReceipt.mockRejectedValue(
    Object.assign(Error("not found"), { status: 404 }),
  );
  await expect(x.engine.reconcile()).rejects.toThrow("not found");
  expect(x.store.read(wallet, account)?.submission).toBe("uncertain");
  await expect(x.engine.submit()).rejects.toThrow("no repeat POST");
  expect(x.submit).not.toHaveBeenCalled();
});
it("switching during delayed submission aborts the original request and retains its original-wallet evidence only", async () => {
  const x = setup(),
    d = deferred<Awaited<ReturnType<DevnetIntentTransport["submit"]>>>();
  let signal: AbortSignal | undefined;
  x.submit.mockImplementation(async (_w, _a, _b, s) => {
    signal = s;
    return d.promise;
  });
  const work = x.engine.submit();
  x.changeSession();
  x.engine.dispose();
  expect(signal?.aborted).toBe(true);
  d.resolve({
    api_version: "1",
    input_seq: "13",
    state: "received",
    duplicate: false,
  });
  await expect(work).rejects.toThrow("session changed");
  expect(x.store.read(wallet, account)?.receipt?.input_seq).toBe("13");
  expect(x.store.read("different-wallet", account)).toBeNull();
});
it("delayed old receipt cannot overwrite a newer account-local signature", async () => {
  const x = setup(),
    d = deferred<DevnetRecordedIntent>();
  x.recoverReceipt.mockReturnValue(d.promise);
  const work = x.engine.reconcile();
  x.engine.dispose();
  x.changeSession();
  const newer = { ...x.r, body: { ...x.r.body, signature: "08".repeat(64) } };
  x.store.write(newer);
  d.resolve(x.recorded);
  await expect(work).rejects.toThrow("session changed");
  expect(x.store.read(wallet, account)?.body.signature).toBe(
    newer.body.signature,
  );
  expect(
    JSON.parse(
      x.data.get(x.store.key(wallet, account) + ":7:" + x.r.body.signature)!,
    ).recorded,
  ).toEqual(x.recorded);
});
it("a concurrent operation cannot issue another receipt request while one is in flight", async () => {
  const x = setup(),
    d = deferred<DevnetRecordedIntent>();
  x.recoverReceipt.mockReturnValue(d.promise);
  const work = x.engine.reconcile();
  await expect(x.engine.reconcile()).rejects.toThrow("already in progress");
  await expect(x.engine.submit()).rejects.toThrow("already in progress");
  expect(x.recoverReceipt).toHaveBeenCalledTimes(1);
  expect(x.submit).not.toHaveBeenCalled();
  d.resolve(x.recorded);
  await work;
});
it("storage failure stops submission before any bytes are forwarded", async () => {
  const x = setup();
  const store = new DevnetIntentStore({
    getItem: x.storage.getItem,
    setItem: () => {
      throw Error("storage unavailable");
    },
  });
  const engine = new DevnetIntentRecovery(
    wallet,
    account,
    store,
    { submit: x.submit, recoverReceipt: x.recoverReceipt },
    () => true,
  );
  await expect(engine.submit()).rejects.toThrow("storage unavailable");
  expect(x.submit).not.toHaveBeenCalled();
});
it("retirement requires explicit stale unsent bytes and preserves the archived signature", () => {
  const x = setup();
  expect(() => x.engine.retireUnsent(String(clock + 5n))).toThrow("stale");
  expect(x.engine.retireUnsent(String(clock + 6n)).submission).toBe(
    "retired_not_sent",
  );
  expect(
    x.data.get(x.store.key(wallet, account) + ":7:" + x.r.body.signature),
  ).toContain(x.r.body.signature);
  expect(() => x.engine.retireUnsent(String(clock + 30n))).toThrow(
    "Only a signature never forwarded",
  );
  expect(x.submit).not.toHaveBeenCalled();
});
it("an unresolved signed reference blocks a second wallet signature before wallet invocation", async () => {
  const x = setup(),
    sign = vi.fn();
  const manager = {
    getSnapshot: () => ({
      phase: "authenticated",
      epoch: 4,
      session: { wallet, wallet_hex: "31".repeat(32) },
    }),
    signSessionMessage: sign,
  } as unknown as SessionManager;
  const draft = {
    scope: { account, wallet: "31".repeat(32), sessionEpoch: 4 },
    nonce: "7",
    messageHex: x.r.messageHex,
    orderHex: x.r.body.order,
  } as PreparedDraft;
  await expect(
    retainApprovedDevnetMessage(draft, wallet, manager, x.store, () => {}),
  ).rejects.toThrow("Retained signed reference");
  expect(sign).not.toHaveBeenCalled();
});
it("canonical message tampering or JSON-string nonce blocks local recovery", () => {
  const x = setup(),
    key = x.store.key(wallet, account);
  x.data.set(key, JSON.stringify({ ...x.r, messageHex: "00".repeat(93) }));
  expect(() => x.store.read(wallet, account)).toThrow("canonical message");
  x.data.set(
    key,
    JSON.stringify({ ...x.r, body: { ...x.r.body, nonce: "7" } }),
  );
  expect(() => x.store.read(wallet, account)).toThrow("changed or unavailable");
});

it("does not forward a different local candidate substituted after its exact review", async () => {
  const x = setup();
  x.store.write({ ...x.r, body: { ...x.r.body, signature: "08".repeat(64) } });
  await expect(x.engine.submit(x.r)).rejects.toThrow("changed after review");
  expect(x.submit).not.toHaveBeenCalled();
  expect(x.store.read(wallet, account)?.submission).toBe("not_sent");
});
