import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import { createPublicKey, verify } from "node:crypto";
import * as sdk from "@setl8/order-codec";
import {
  prepareOrderDraft,
  draftErrors,
  scaledInteger,
  hex,
  emptyDraft,
  ORDER_PROFILE,
  type DraftScope,
  type DraftFields,
  type PreparedDraft,
} from "../src/data/orderDraft";
import { useOrderDraft } from "../src/hooks/orderDraft";
import { usePending } from "../src/hooks/loading";
const scope: DraftScope = {
  account: "a7".repeat(32),
  market: "0",
  wallet: "11".repeat(32),
  sessionEpoch: 1,
  mode: "connected",
  gateway: "http://127.0.0.1:8788",
};
const fields = (): DraftFields => ({
  ...emptyDraft(),
  accountConfirmed: true,
  quantity: "1.000001",
  nonce: "1",
  clientTime: "1792960000",
});
describe("accepted order SDK and exact adapters", () => {
  it("matches all 17 source orders and their signed-message vectors", () => {
    const fixture = JSON.parse(
      readFileSync("dependencies/sdk-orders.json", "utf8"),
    );
    expect(fixture.cases).toHaveLength(17);
    for (const f of fixture.cases) {
      const raw = Uint8Array.from(Buffer.from(f.order, "hex"));
      expect(hex(sdk.encodeOrder(sdk.decodeOrder(raw)))).toBe(f.order);
      const message = sdk.signingMessage(
        Uint8Array.from(Buffer.from(f.account, "hex")),
        Number(BigInt(f.nonce)),
        raw,
      );
      const publicKey = createPublicKey({
        format: "der",
        type: "spki",
        key: Buffer.concat([
          Buffer.from("302a300506032b6570032100", "hex"),
          Buffer.from(f.trader, "hex"),
        ]),
      });
      expect(
        verify(null, message, publicKey, Buffer.from(f.sig, "hex")),
        f.name,
      ).toBe(true);
      expect(message).toHaveLength(93);
    }
  });
  it.each(["Market", "Limit", "Stop"] as const)(
    "prepares %s, side and optional levels through SDK exactly",
    async (kind) => {
      const f = {
        ...fields(),
        kind,
        side: "Sell" as const,
        price: "18446744.073709551615",
        slEnabled: true,
        sl: "1.000000000001",
        tpEnabled: true,
        tp: "2.000000000002",
      };
      const preview = await prepareOrderDraft(scope, f);
      expect(preview.decoded).toEqual({
        kind: sdk.IntentKind[kind],
        market: 0,
        side: 1,
        qty: "1000001",
        priceE12: kind === "Market" ? "0" : "18446744073709551615",
        slE12: "1000000000001",
        tpE12: "2000000000002",
        targetNonce: 0,
        clientTime: f.clientTime,
      });
      expect(preview.orderHex).toHaveLength(96);
      expect(preview.messageHex).toHaveLength(186);
      expect(preview.orderHex).toBe(
        hex(sdk.encodeOrder(sdk.orderFromTransport(preview.decoded))),
      );
      expect(preview.messageHex).toBe(
        hex(
          sdk.signingMessage(
            Uint8Array.from(Buffer.from(scope.account!, "hex")),
            1,
            Uint8Array.from(Buffer.from(preview.orderHex, "hex")),
          ),
        ),
      );
    },
  );
  it("retains u64/u32/i64 boundary values with no Number amount conversion", async () => {
    const f = {
      ...fields(),
      quantity: "18446744073709.551615",
      nonce: "4294967295",
      clientTime: "-9223372036854775808",
    };
    const p = await prepareOrderDraft({ ...scope, market: "65535" }, f);
    expect(p.decoded.qty).toBe("18446744073709551615");
    expect(p.decoded.clientTime).toBe(f.clientTime);
    expect(p.nonce).toBe(f.nonce);
    expect(p.decoded.market).toBe(65535);
    const max = await prepareOrderDraft(scope, {
      ...f,
      clientTime: "9223372036854775807",
    });
    expect(max.decoded.clientTime).toBe("9223372036854775807");
    expect(scaledInteger("9007199254.740993", 6, "Quantity")).toBe(
      9007199254740993n,
    );
  });
  it.each([
    "1e3",
    " 1",
    "1 ",
    "+1",
    "-1",
    "NaN",
    "1,000",
    "01",
    ".5",
    "1.",
    "0.0000001",
    "18446744073709.551616",
  ])("rejects lossy/invalid quantity %s", (quantity) => {
    expect(draftErrors(scope, { ...fields(), quantity }).quantity).toBeTruthy();
  });
  it.each([
    { nonce: "0" },
    { nonce: "4294967296" },
    { nonce: "1.5" },
    { nonce: "01" },
    { clientTime: "9223372036854775808" },
    { clientTime: "-9223372036854775809" },
    { quantity: "0" },
    { profile: "unreviewed" },
    { accountConfirmed: false },
    { kind: "Limit", price: "0" },
    { kind: "Stop", price: "1.0000000000001" },
    { kind: "Limit", price: "18446744.073709551616" },
    { slEnabled: true, sl: "" },
    { slEnabled: true, sl: "0" },
    { tpEnabled: true, tp: "-1" },
  ])("blocks invalid fields %j", async (patch) => {
    const f = { ...fields(), ...patch } as DraftFields;
    expect(Object.keys(draftErrors(scope, f)).length).toBeGreaterThan(0);
    await expect(prepareOrderDraft(scope, f)).rejects.toThrow();
  });
  it("rejects absent account/wallet/market and unsupported kind/side", () => {
    for (const s of [
      { ...scope, account: null },
      { ...scope, account: "A7".repeat(32) },
      { ...scope, wallet: "" },
      { ...scope, market: "" },
      { ...scope, market: "65536" },
    ])
      expect(Object.keys(draftErrors(s, fields())).length).toBeGreaterThan(0);
    for (const f of [
      { ...fields(), kind: "Close" },
      { ...fields(), side: "Other" },
    ])
      expect(
        Object.keys(draftErrors(scope, f as DraftFields)).length,
      ).toBeGreaterThan(0);
  });
  it("does not copy ignored price/disabled SL/TP text into a market order", async () => {
    const p = await prepareOrderDraft(scope, {
      ...fields(),
      price: "not a quote",
      sl: "bad",
      tp: "bad",
    });
    expect(p.decoded.priceE12).toBe("0");
    expect(p.decoded.slE12).toBe("0");
    expect(p.decoded.tpE12).toBe("0");
  });
});
function gate() {
  let resolve!: (v: PreparedDraft) => void;
  const promise = new Promise<PreparedDraft>((r) => (resolve = r));
  return { resolve, promise };
}
describe("draft scope and preparation races", () => {
  it.each([
    "account",
    "wallet",
    "market",
    "sessionEpoch",
    "gateway",
    "mode",
    "profile",
    "quantity",
    "kind",
    "side",
    "price",
    "slEnabled",
    "sl",
    "tpEnabled",
    "tp",
    "nonce",
    "clientTime",
    "accountConfirmed",
  ])("invalidates on %s and discards late prepared bytes", async (field) => {
    const delayed = gate(),
      f = fields();
    const prepared = await prepareOrderDraft(scope, f);
    const prepare = vi.fn(() => delayed.promise);
    const { result, rerender } = renderHook(
      ({ s, f }) => useOrderDraft(s, f, prepare),
      { initialProps: { s: scope, f } },
    );
    act(() => void result.current.prepare());
    expect(result.current.busy).toBe(true);
    const scopes: Partial<DraftScope> = {
      account: "b8".repeat(32),
      wallet: "22".repeat(32),
      market: "1",
      sessionEpoch: 2,
      gateway: "http://127.0.0.1:8790",
      mode: "demo",
    };
    const edits: Partial<DraftFields> = {
      profile: "",
      quantity: "2",
      kind: "Limit",
      side: "Sell",
      price: "2",
      slEnabled: true,
      sl: "1",
      tpEnabled: true,
      tp: "3",
      nonce: "2",
      clientTime: "1792960001",
      accountConfirmed: false,
    };
    const s =
      field in scopes
        ? { ...scope, [field]: scopes[field as keyof DraftScope] }
        : scope;
    const next =
      field in edits ? { ...f, [field]: edits[field as keyof DraftFields] } : f;
    rerender({ s: s as DraftScope, f: next as DraftFields });
    expect(result.current.prepared).toBeNull();
    expect(result.current.busy).toBe(false);
    await act(async () => delayed.resolve(prepared));
    expect(result.current.prepared).toBeNull();
  });
  it("hides completed bytes immediately and prevents ABA revival", async () => {
    const f = fields();
    const { result, rerender } = renderHook(
      ({ f }) => useOrderDraft(scope, f),
      { initialProps: { f } },
    );
    await act(async () => result.current.prepare());
    await waitFor(() => expect(result.current.prepared).not.toBeNull());
    rerender({ f: { ...f, quantity: "2" } });
    expect(result.current.prepared).toBeNull();
    rerender({ f });
    expect(result.current.prepared).toBeNull();
  });
  it("tracks real preparation work and clears progress on invalidation", async () => {
    const delayed = gate(),
      f = fields();
    const p = await prepareOrderDraft(scope, f);
    const { result, rerender } = renderHook(
      ({ f }) => ({
        draft: useOrderDraft(scope, f, () => delayed.promise),
        pending: usePending(),
      }),
      { initialProps: { f } },
    );
    expect(result.current.pending).toBe(false);
    act(() => void result.current.draft.prepare());
    expect(result.current.pending).toBe(true);
    rerender({ f: { ...f, quantity: "2" } });
    expect(result.current.pending).toBe(false);
    await act(async () => delayed.resolve(p));
    expect(result.current.draft.prepared).toBeNull();
    expect(result.current.pending).toBe(false);
  });
  it("unmounts pending work without publishing obsolete bytes", async () => {
    const delayed = gate();
    const p = await prepareOrderDraft(scope, fields());
    const { result, unmount } = renderHook(() =>
      useOrderDraft(scope, fields(), () => delayed.promise),
    );
    act(() => void result.current.prepare());
    unmount();
    await act(async () => delayed.resolve(p));
    expect(result.current.prepared).toBeNull();
  });
});
