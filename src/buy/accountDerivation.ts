import bs58 from "bs58";
import { u64 } from "./bytes";
import descriptor from "../../dependencies/p30/3e33090cf9193fd909f57ed75e10f9e59b9409e3c8a8f6c186272d8ee185f86d/p30-descriptor.json";

/**
 * Independent derivation of the trading-account address for (wallet, challenge counter), straight from the
 * pinned SDK. The owner gate compares it with the address the preflight/prepared message carry, so approval
 * never rests on a pinned counter or on an address another module computed.
 *
 * The SDK is loaded lazily (it is large); until it is loaded the derivation throws, so a gate that needs it
 * fails closed.
 */
interface Loaded {
  ctx: {
    tradingAccount(
      trader: unknown,
      id: bigint,
    ): readonly [{ toBase58(): string }, number];
  };
  PublicKey: new (value: string) => unknown;
}
let loaded: Loaded | null = null;
export async function loadAccountDerivation(): Promise<void> {
  if (loaded) return;
  const sdk = await import("@setl8/p30-sdk");
  loaded = {
    ctx: new sdk.p30Devnet.Context(descriptor),
    PublicKey: sdk.PublicKey as unknown as Loaded["PublicKey"],
  };
}
export function deriveTradingAccount(wallet: string, counter: string): string {
  if (!loaded)
    throw Error(
      "Account derivation is not loaded; the purchase scope cannot be checked.",
    );
  // u64() refuses empty, signed, hex, padded or non-string values instead of coercing them.
  const id = BigInt(u64(counter));
  return loaded.ctx
    .tradingAccount(new loaded.PublicKey(wallet), id)[0]
    .toBase58();
}

/** Account keys of a legacy message (header 3 + one count byte + 32-byte keys), in the message's own order. */
export function staticKeys(m: Uint8Array): string[] {
  const n = m[3];
  if (m[0] & 0x80 || n === undefined || n > 127 || m.length < 4 + n * 32)
    throw Error("Message account keys are unreadable");
  return Array.from({ length: n }, (_, i) =>
    bs58.encode(m.subarray(4 + i * 32, 4 + (i + 1) * 32)),
  );
}
