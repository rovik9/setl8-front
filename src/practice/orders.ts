import {
  scaledInteger,
  accountBytes,
  hex,
  type PreparedDraft,
  ORDER_PROFILE,
  ORDER_SDK_VERSION,
} from "../data/orderDraft";
import type { PracticeAccount } from "../api/practice-v1";
export type PracticeOrderFields = {
  kind: "Market" | "Limit" | "Stop" | "Close" | "Cancel" | "SetSlTp";
  side: "Buy" | "Sell";
  quantity: string;
  price: string;
  sl: string;
  tp: string;
  nonce: string;
  targetNonce: string;
  confirmed: boolean;
};
export const emptyPracticeOrder = (): PracticeOrderFields => ({
  kind: "Market",
  side: "Buy",
  quantity: "",
  price: "",
  sl: "",
  tp: "",
  nonce: "1",
  targetNonce: "",
  confirmed: false,
});
const u32 = (v: string) => {
  if (!/^[1-9]\d*$/.test(v) || BigInt(v) > 4294967295n)
    throw Error("Use an explicit order reference from 1 to 4294967295.");
  return Number(BigInt(v));
};
export async function preparePracticeOrder(
  a: PracticeAccount,
  walletHex: string,
  epoch: number,
  f: PracticeOrderFields,
): Promise<PreparedDraft> {
  if (!f.confirmed)
    throw Error("Confirm the selected synthetic replay account before review.");
  if (a.state !== "ready")
    throw Error(
      a.blocked_reason ??
        "The practice account is processing. Refresh before preparing.",
    );
  const sdk = await import("@setl8/order-codec");
  const qty = ["Cancel", "SetSlTp"].includes(f.kind)
    ? 0n
    : scaledInteger(f.quantity, 6, "Quantity");
  if (qty === 0n && ["Market", "Limit", "Stop"].includes(f.kind))
    throw Error("Quantity must be greater than zero.");
  const price = ["Limit", "Stop"].includes(f.kind)
    ? scaledInteger(f.price, 12, "Trigger price")
    : 0n;
  if (["Limit", "Stop"].includes(f.kind) && price === 0n)
    throw Error("Enter a nonzero limit/stop price.");
  const protective = ["Market", "Limit", "Stop", "SetSlTp"].includes(f.kind);
  const order = {
    kind: sdk.IntentKind[f.kind],
    market: 0,
    side: (f.side === "Buy" ? 0 : 1) as 0 | 1,
    qty,
    priceE12: price,
    slE12: protective && f.sl ? scaledInteger(f.sl, 12, "Stop loss") : 0n,
    tpE12: protective && f.tp ? scaledInteger(f.tp, 12, "Take profit") : 0n,
    targetNonce: f.kind === "Cancel" ? u32(f.targetNonce) : 0,
    clientTime: BigInt(a.clock_unix_s),
  };
  const nonce = u32(f.nonce),
    bytes = sdk.encodeOrder(order),
    message = sdk.signingMessage(accountBytes(a.account), nonce, bytes);
  return {
    scope: {
      account: a.account,
      market: a.market,
      wallet: walletHex,
      sessionEpoch: epoch,
      mode: "connected",
      gateway: "http://localhost:8792",
    },
    profile: ORDER_PROFILE,
    sdkVersion: ORDER_SDK_VERSION,
    nonce: String(nonce),
    decoded: sdk.orderToTransport(sdk.decodeOrder(bytes)),
    orderHex: hex(bytes),
    messageHex: hex(message),
    orderLength: bytes.length,
    messageLength: message.length,
  };
}
export async function decodePending(orderHex: string) {
  const sdk = await import("@setl8/order-codec");
  const bytes = Uint8Array.from(orderHex.match(/../g) ?? [], (p) =>
    parseInt(p, 16),
  );
  return sdk.orderToTransport(sdk.decodeOrder(bytes));
}
