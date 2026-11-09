import { describe, it, expect, vi } from "vitest";
import { ApiClient, ApiError } from "../src/api/client";
import {
  prototypeProfile,
  PROTOTYPE_OPT_IN,
  assertSyntheticDraft,
  type PrototypeBridge,
  type PrototypeInfo,
} from "../src/prototype/profile";
import { SyntheticSubmission } from "../src/prototype/submission";
import {
  prepareOrderDraft,
  emptyDraft,
  type DraftScope,
  type PreparedDraft,
} from "../src/data/orderDraft";
const base = "http://127.0.0.1:8790",
  origin = "http://127.0.0.1:5173";
const info: PrototypeInfo = {
  id: "session-1",
  account: "a7".repeat(32),
  wallet: "DisposablePublicKey",
  walletHex: "11".repeat(32),
  clock: "1791813600",
  phase: "staged-open",
  gateway: base,
  origin,
};
const scope: DraftScope = {
  account: info.account,
  market: "0",
  wallet: info.walletHex,
  sessionEpoch: 1,
  mode: "prototype",
  gateway: base,
  syntheticSession: info.id,
};
const prepared = () =>
  prepareOrderDraft(scope, {
    ...emptyDraft(),
    accountConfirmed: true,
    quantity: "1",
    nonce: "1",
    clientTime: info.clock,
  });
const receipt = {
  api_version: "1",
  input_seq: "2",
  duplicate: false,
  state: "received",
};
function gate<T>() {
  let resolve!: (v: T) => void, reject!: (e: unknown) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
async function fixture() {
  const draft = await prepared(),
    bridge: PrototypeBridge = {
      info: { ...info },
      readInfo: vi.fn(async () => ({ ...info })),
      signLogin: vi.fn(),
      signOrder: vi.fn(async () => "ab".repeat(64)),
      operate: vi.fn(),
    };
  const client = new ApiClient(base);
  client.csrf = "csrf-in-memory";
  const request = vi.spyOn(client, "request");
  const changed = vi.fn(),
    discard = vi.fn();
  const engine = new SyntheticSubmission(
    draft,
    bridge,
    info.walletHex,
    changed,
    client,
    discard,
    () => true,
  );
  return { draft, bridge, client, request, changed, engine, discard };
}
describe("explicit prototype gate", () => {
  it.each([
    base,
    "http://localhost:8790",
    "http://127.0.0.1:8790/",
    "http://127.0.0.1:8788",
    "http://127.0.0.1:87900",
    "https://127.0.0.1:8790",
  ])("only exact numeric loopback URL may opt in: %s", (url) =>
    expect(prototypeProfile(url, PROTOTYPE_OPT_IN, origin)).toBe(url === base),
  );
  it("also requires opt-in and exact origin", () => {
    expect(prototypeProfile(base, undefined, origin)).toBe(false);
    expect(
      prototypeProfile(base, PROTOTYPE_OPT_IN, "http://localhost:5173"),
    ).toBe(false);
  });
  it("Close is previewable only in the prototype, with exact canonical fields", async () => {
    const f = {
      ...emptyDraft(),
      kind: "Close" as const,
      accountConfirmed: true,
      quantity: "0",
      nonce: "2",
      clientTime: info.clock,
    };
    const p = await prepareOrderDraft(scope, f);
    expect(p.decoded).toEqual({
      kind: 3,
      market: 0,
      side: 0,
      qty: "0",
      priceE12: "0",
      slE12: "0",
      tpE12: "0",
      targetNonce: 0,
      clientTime: info.clock,
    });
    await expect(
      prepareOrderDraft({ ...scope, mode: "connected" }, f),
    ).rejects.toThrow();
  });
  it("refuses real/default/demo/mismatched scopes and preview-only fields", async () => {
    const p = await prepared();
    for (const changed of [
      { mode: "connected" },
      { mode: "demo" },
      { gateway: "http://127.0.0.1:8788" },
      { account: "bb".repeat(32) },
      { wallet: "22".repeat(32) },
      { market: "1" },
      { syntheticSession: "other" },
    ])
      expect(() =>
        assertSyntheticDraft(
          { ...p, scope: { ...p.scope, ...changed } as DraftScope },
          info,
          info.walletHex,
        ),
      ).toThrow();
    for (const changed of [
      { kind: 1 },
      { kind: 2 },
      { side: 1 },
      { slE12: "1" },
      { tpE12: "1" },
      { priceE12: "1" },
    ])
      expect(() =>
        assertSyntheticDraft(
          {
            ...p,
            decoded: { ...p.decoded, ...changed } as PreparedDraft["decoded"],
          },
          info,
          info.walletHex,
        ),
      ).toThrow();
  });
});
describe("exact signed intent state machine", () => {
  it("signs inspected bytes once and retries the exact same immutable body", async () => {
    const f = await fixture();
    f.request.mockResolvedValue(receipt);
    await f.engine.sign();
    await f.engine.sign();
    expect(f.bridge.signOrder).toHaveBeenCalledTimes(1);
    expect(f.bridge.signOrder).toHaveBeenCalledWith(f.draft);
    await f.engine.submit();
    await f.engine.submit();
    expect(f.request).toHaveBeenCalledTimes(2);
    expect(f.request.mock.calls[0][1]!.body).toBe(
      f.request.mock.calls[1][1]!.body,
    );
    expect(f.request.mock.calls[0][1]).toMatchObject({
      protectedPost: true,
      body: { nonce: 1, order: f.draft.orderHex, signature: "ab".repeat(64) },
    });
    expect(f.engine.snapshot().phase).toBe("received");
  });
  it("coalesces concurrent submission and keeps receipt distinct from execution", async () => {
    const f = await fixture(),
      pending = gate<typeof receipt>();
    f.request.mockReturnValue(pending.promise);
    await f.engine.sign();
    const first = f.engine.submit();
    await f.engine.submit();
    expect(f.request).toHaveBeenCalledTimes(1);
    pending.resolve(receipt);
    await first;
    expect(f.engine.snapshot().status).toBeNull();
    expect(f.engine.snapshot().message).toContain("does not mean evaluated");
  });
  it("lost response -> nonce inspection does not acknowledge payload -> identical retry confirms", async () => {
    const f = await fixture();
    f.request
      .mockRejectedValueOnce(new TypeError("lost response"))
      .mockResolvedValueOnce({
        state: "received",
        nonce: "1",
        input_seq: "2",
        complete_outcomes_available: false,
        completion: null,
        chain_finality: "unavailable",
      })
      .mockResolvedValueOnce({ ...receipt, duplicate: true });
    await f.engine.sign();
    await f.engine.submit();
    expect(f.engine.snapshot().phase).toBe("uncertain");
    await f.engine.reconcile();
    expect(f.engine.snapshot().phase).toBe("uncertain");
    expect(f.engine.snapshot().message).toContain(
      "does not bind an uncertain payload",
    );
    await f.engine.submit();
    expect(f.request.mock.calls[0][1]!.body).toBe(
      f.request.mock.calls[2][1]!.body,
    );
    expect(f.engine.snapshot().message).toContain("identical retry confirmed");
  });
  it("conflict and expired session never allocate a nonce or auto-resign", async () => {
    const f = await fixture();
    f.request
      .mockRejectedValueOnce(new ApiError(409, "nonce_conflict", "conflict"))
      .mockRejectedValueOnce(new ApiError(401, "unauthenticated", "expired"));
    await f.engine.sign();
    await f.engine.submit();
    expect(f.engine.snapshot().phase).toBe("conflict");
    await f.engine.submit();
    expect(f.engine.snapshot().phase).toBe("error");
    await f.engine.submit();
    expect(f.request).toHaveBeenCalledTimes(2);
    expect(f.bridge.signOrder).toHaveBeenCalledTimes(1);
  });
  it("discarded signing completion cannot submit after scope disposal", async () => {
    const f = await fixture(),
      pending = gate<string>();
    vi.mocked(f.bridge.signOrder).mockReturnValue(pending.promise);
    const signing = f.engine.sign();
    f.engine.dispose();
    pending.resolve("ab".repeat(64));
    await signing;
    await f.engine.submit();
    expect(f.request).not.toHaveBeenCalled();
  });
  it("disposal aborts in-flight requests and ignores their late receipt", async () => {
    const f = await fixture(),
      pending = gate<typeof receipt>();
    f.request.mockReturnValue(pending.promise);
    await f.engine.sign();
    const post = f.engine.submit();
    f.engine.dispose();
    expect(f.request.mock.calls[0][1]?.signal?.aborted).toBe(true);
    expect(f.discard).toHaveBeenCalledWith("1");
    pending.resolve(receipt);
    await post;
    expect(f.engine.snapshot().receipt).toBeNull();
  });
  it("default/profile gate refuses even if a backend or bridge claims readiness", async () => {
    const f = await fixture(),
      engine = new SyntheticSubmission(
        f.draft,
        f.bridge,
        info.walletHex,
        vi.fn(),
        f.client,
        () => {},
        () => false,
      );
    await expect(engine.sign()).rejects.toThrow();
    expect(f.bridge.signOrder).not.toHaveBeenCalled();
    expect(f.request).not.toHaveBeenCalled();
  });
});
