import type { OrderIntentTransport } from "@setl8/order-codec";
export const ORDER_PROFILE = "setl8-sdk-dev-v1";
export const ORDER_SDK_VERSION = "0.1.0-dev.4";
export const U64_MAX = (1n << 64n) - 1n;
export interface DraftScope {
  account: string | null;
  market: string;
  wallet: string;
  sessionEpoch: number;
  mode: "demo" | "connected" | "prototype";
  syntheticSession?: string;
  gateway: string;
}
export interface DraftFields {
  profile: string;
  accountConfirmed: boolean;
  kind: "Market" | "Limit" | "Stop" | "Close";
  side: "Buy" | "Sell";
  quantity: string;
  price: string;
  slEnabled: boolean;
  sl: string;
  tpEnabled: boolean;
  tp: string;
  nonce: string;
  clientTime: string;
}
export const emptyDraft = (): DraftFields => ({
  profile: ORDER_PROFILE,
  accountConfirmed: false,
  kind: "Market",
  side: "Buy",
  quantity: "",
  price: "",
  slEnabled: false,
  sl: "",
  tpEnabled: false,
  tp: "",
  nonce: "",
  clientTime: "",
});
export type DraftErrors = Partial<Record<keyof DraftFields | "scope", string>>;
/** Decimal form values -> exact integer units. Rejects precision loss, whitespace, exponents and rounding. */
export function scaledInteger(value: string, scale: number, name: string) {
  if (value.length > 48 || !/^(0|[1-9]\d*)(\.\d+)?$/.test(value))
    throw new Error(
      `${name}: enter a plain non-negative decimal without spaces or exponents.`,
    );
  const [whole, tail = ""] = value.split(".");
  if (tail.length > scale)
    throw new Error(
      `${name}: use at most ${scale} decimal places; values are never rounded.`,
    );
  const exact =
    BigInt(whole) * 10n ** BigInt(scale) +
    BigInt(tail.padEnd(scale, "0") || "0");
  if (exact > U64_MAX)
    throw new Error(`${name}: exceeds the SDK u64 field bound.`);
  return exact;
}
function integer(value: string, min: bigint, max: bigint, name: string) {
  if (value.length > 21 || !/^(0|[1-9]\d*|-[1-9]\d*)$/.test(value))
    throw new Error(`${name}: enter an exact integer.`);
  const n = BigInt(value);
  if (n < min || n > max)
    throw new Error(`${name}: must be between ${min} and ${max}.`);
  return n;
}
export function draftErrors(
  scope: DraftScope,
  fields: DraftFields,
): DraftErrors {
  const errors: DraftErrors = {};
  if (fields.profile !== ORDER_PROFILE)
    errors.profile = "Choose the accepted historical development profile.";
  if (
    !scope.account ||
    !/^[a-f0-9]{64}$/.test(scope.account) ||
    !fields.accountConfirmed
  )
    errors.accountConfirmed =
      "Explicitly confirm the selected account for this draft.";
  if (scope.mode !== "demo" && !scope.wallet)
    errors.scope =
      "A connected wallet session is required for this preview scope.";
  const check = (field: keyof DraftFields | "scope", read: () => unknown) => {
    try {
      read();
    } catch (e) {
      errors[field] = (e as Error).message;
    }
  };
  check("scope", () => integer(scope.market, 0n, 65535n, "Market"));
  if (
    !(
      scope.mode === "prototype"
        ? ["Market", "Limit", "Stop", "Close"]
        : ["Market", "Limit", "Stop"]
    ).includes(fields.kind)
  )
    errors.kind = "Choose Market, Limit or Stop.";
  if (!["Buy", "Sell"].includes(fields.side))
    errors.side = "Choose Buy or Sell.";
  check("quantity", () => {
    if (
      scaledInteger(fields.quantity, 6, "Quantity") === 0n &&
      fields.kind !== "Close"
    )
      throw new Error(
        "Quantity must be greater than zero for an opening draft.",
      );
  });
  if (!["Market", "Close"].includes(fields.kind))
    check("price", () => {
      if (scaledInteger(fields.price, 12, fields.kind + " price") === 0n)
        throw new Error("Limit/stop price must be greater than zero.");
    });
  if (fields.slEnabled)
    check("sl", () => {
      if (scaledInteger(fields.sl, 12, "Stop loss") === 0n)
        throw new Error(
          "Enter a nonzero stop loss, or turn it off to encode zero.",
        );
    });
  if (fields.tpEnabled)
    check("tp", () => {
      if (scaledInteger(fields.tp, 12, "Take profit") === 0n)
        throw new Error(
          "Enter a nonzero take profit, or turn it off to encode zero.",
        );
    });
  check("nonce", () =>
    integer(fields.nonce, 1n, 4294967295n, "Development nonce"),
  );
  check("clientTime", () =>
    integer(fields.clientTime, -(1n << 63n), (1n << 63n) - 1n, "Client time"),
  );
  return errors;
}
/** Hex transport only. Canonical order layout and signing-message construction belong solely to the SDK. */
export function hex(bytes: Uint8Array) {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}
export function accountBytes(account: string) {
  if (!/^[a-f0-9]{64}$/.test(account))
    throw new Error("Account must be 32 bytes of lowercase hex.");
  return Uint8Array.from(account.match(/../g)!, (pair) => parseInt(pair, 16));
}
export interface PreparedDraft {
  scope: DraftScope;
  profile: string;
  sdkVersion: string;
  nonce: string;
  decoded: OrderIntentTransport;
  orderHex: string;
  messageHex: string;
  orderLength: number;
  messageLength: number;
}
export async function prepareOrderDraft(
  scope: DraftScope,
  fields: DraftFields,
): Promise<PreparedDraft> {
  const errors = draftErrors(scope, fields);
  if (Object.keys(errors).length)
    throw new Error("Correct the draft fields before preparing bytes.");
  const sdk = await import("@setl8/order-codec");
  const order = {
    kind: sdk.IntentKind[fields.kind],
    market: Number(BigInt(scope.market)),
    side: fields.side === "Buy" ? (0 as const) : (1 as const),
    qty: scaledInteger(fields.quantity, 6, "Quantity"),
    priceE12: ["Market", "Close"].includes(fields.kind)
      ? 0n
      : scaledInteger(fields.price, 12, "Price"),
    slE12: fields.slEnabled ? scaledInteger(fields.sl, 12, "Stop loss") : 0n,
    tpE12: fields.tpEnabled ? scaledInteger(fields.tp, 12, "Take profit") : 0n,
    targetNonce: 0,
    clientTime: BigInt(fields.clientTime),
  };
  const bytes = sdk.encodeOrder(order);
  const message = sdk.signingMessage(
    accountBytes(scope.account!),
    Number(BigInt(fields.nonce)),
    bytes,
  );
  return {
    scope: { ...scope },
    profile: fields.profile,
    sdkVersion: ORDER_SDK_VERSION,
    nonce: fields.nonce,
    decoded: sdk.orderToTransport(sdk.decodeOrder(bytes)),
    orderHex: hex(bytes),
    messageHex: hex(message),
    orderLength: bytes.length,
    messageLength: message.length,
  };
}
