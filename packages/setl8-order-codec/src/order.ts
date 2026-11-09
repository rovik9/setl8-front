import { protocol } from "./generated.js";

export enum IntentKind {
  Market = 0,
  Limit = 1,
  Stop = 2,
  Close = 3,
  Cancel = 4,
  SetSlTp = 5,
}

export interface OrderIntent {
  kind: IntentKind;
  market: number;
  side: 0 | 1;
  qty: bigint;
  priceE12: bigint;
  slE12: bigint;
  tpE12: bigint;
  targetNonce: number;
  clientTime: bigint;
}

export interface OrderIntentTransport extends Omit<OrderIntent, "qty" | "priceE12" | "slE12" | "tpE12" | "clientTime"> {
  qty: string;
  priceE12: string;
  slE12: string;
  tpE12: string;
  clientTime: string;
}

export const ORDER_LEN = protocol.orderLen;
export const SIGNING_MESSAGE_LEN = protocol.messageLen;

export function checkedNumber(value: number, max: number, name: string): number {
  if (!Number.isSafeInteger(value) || value < 0 || value > max) {
    throw new RangeError(`${name} must be an integer in [0, ${max}]`);
  }
  return value;
}

function checkedBigInt(value: bigint, min: bigint, max: bigint, name: string): bigint {
  if (typeof value !== "bigint" || value < min || value > max) {
    throw new RangeError(`${name} must be a bigint in [${min}, ${max}]`);
  }
  return value;
}

export function checkedBytes(value: Uint8Array, length: number, name: string): Uint8Array {
  if (!(value instanceof Uint8Array) || value.length !== length) {
    throw new RangeError(`${name} must contain exactly ${length} bytes`);
  }
  return value;
}

export function encodeOrder(order: OrderIntent): Uint8Array {
  const bytes = new Uint8Array(ORDER_LEN);
  const view = new DataView(bytes.buffer);
  view.setUint8(0, checkedNumber(order.kind, 5, "kind"));
  view.setUint16(1, checkedNumber(order.market, 65535, "market"), true);
  view.setUint8(3, checkedNumber(order.side, 1, "side"));
  for (const [offset, value, name] of [[4, order.qty, "qty"], [12, order.priceE12, "priceE12"], [20, order.slE12, "slE12"], [28, order.tpE12, "tpE12"]] as const) {
    view.setBigUint64(offset, checkedBigInt(value, 0n, (1n << 64n) - 1n, name), true);
  }
  view.setUint32(36, checkedNumber(order.targetNonce, 4294967295, "targetNonce"), true);
  view.setBigInt64(40, checkedBigInt(order.clientTime, -(1n << 63n), (1n << 63n) - 1n, "clientTime"), true);
  return bytes;
}

export function decodeOrder(bytes: Uint8Array): OrderIntent {
  checkedBytes(bytes, ORDER_LEN, "order");
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const kind = checkedNumber(view.getUint8(0), 5, "kind");
  const side = checkedNumber(view.getUint8(3), 1, "side") as 0 | 1;
  return {
    kind, market: view.getUint16(1, true), side, qty: view.getBigUint64(4, true),
    priceE12: view.getBigUint64(12, true), slE12: view.getBigUint64(20, true), tpE12: view.getBigUint64(28, true),
    targetNonce: view.getUint32(36, true), clientTime: view.getBigInt64(40, true),
  };
}

export function signingMessage(account: Uint8Array, nonce: number, order: Uint8Array): Uint8Array {
  checkedBytes(account, 32, "account");
  checkedNumber(nonce, 4294967295, "nonce");
  if (nonce === 0) throw new RangeError("nonce zero is reserved");
  decodeOrder(order);
  const bytes = new Uint8Array(SIGNING_MESSAGE_LEN);
  bytes.set(new TextEncoder().encode("SL8LEV|"));
  bytes.set(account, 7);
  bytes[39] = 124;
  new DataView(bytes.buffer).setUint32(40, nonce, true);
  bytes[44] = 124;
  bytes.set(order, 45);
  return bytes;
}

function decimal(value: string, name: string): bigint {
  if (typeof value !== "string" || value.length > 20 || !/^(0|[1-9][0-9]*|-[1-9][0-9]*)$/.test(value)) {
    throw new TypeError(`${name} must be a canonical decimal string`);
  }
  return BigInt(value);
}

export function orderFromTransport(value: OrderIntentTransport): OrderIntent {
  const order = {
    ...value, qty: decimal(value.qty, "qty"), priceE12: decimal(value.priceE12, "priceE12"),
    slE12: decimal(value.slE12, "slE12"), tpE12: decimal(value.tpE12, "tpE12"), clientTime: decimal(value.clientTime, "clientTime"),
  };
  encodeOrder(order);
  return order;
}

export function orderToTransport(order: OrderIntent): OrderIntentTransport {
  encodeOrder(order);
  return {
    kind: order.kind, market: order.market, side: order.side,
    qty: order.qty.toString(), priceE12: order.priceE12.toString(), slE12: order.slE12.toString(), tpE12: order.tpE12.toString(),
    targetNonce: order.targetNonce, clientTime: order.clientTime.toString(),
  };
}

