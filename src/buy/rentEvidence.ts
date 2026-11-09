import type { RpcAccount } from "./preflight";
import { un64, u64 } from "./bytes";
export const RENT_SYSVAR = "SysvarRent111111111111111111111111111111111";
export const SYSVAR_OWNER = "Sysvar1111111111111111111111111111111111111";
/** solana-rent2.2.1 minimum_balance: (128+size)*lamports_per_byte_year*threshold.
 * Only exact f64 thresholds 1.0 and 2.0, and integer products <=2^53-1, are supported.
 * Initial purchase quotes MUST corroborate this result. Reuse needs fresh whole sysvar equality.
 */
function rentForKnownAllocation(a: RpcAccount | null, size: number): string {
  if (
    !a ||
    a.owner !== SYSVAR_OWNER ||
    a.executable ||
    a.data[1] !== "base64" ||
    ![56, 115, 165, 207].includes(size)
  )
    throw Error("Rent evidence could not be verified.");
  const b = un64(a.data[0]);
  if (b.length !== 17) throw Error("Unsupported Rent sysvar layout.");
  const view = new DataView(b.buffer, b.byteOffset),
    rate = view.getBigUint64(0, true),
    thresholdBits = view.getBigUint64(8, true),
    multiplier =
      thresholdBits === 0x3ff0000000000000n
        ? 1n
        : thresholdBits === 0x4000000000000000n
          ? 2n
          : null;
  if (multiplier === null || b[16] > 100 || rate === 0n)
    throw Error(
      "Unsupported Rent parameters; obtain a newly reviewed rent policy.",
    );
  const total = (128n + BigInt(size)) * rate * multiplier;
  if (total > BigInt(Number.MAX_SAFE_INTEGER))
    throw Error("Rent exceeds the supported exact-integer boundary.");
  return u64(total.toString());
}
/** Purchase allocations only: wallet profile, trader state, trading account. */
export function exactRent(a: RpcAccount | null, size: number): string {
  if (![56, 115, 207].includes(size))
    throw Error("Rent evidence could not be verified.");
  return rentForKnownAllocation(a, size);
}
/** Separate funding estimate for a classic 165-byte token ATA; never a purchase allocation or RPC quote. */
export function estimateClassicTokenAtaRent(a: RpcAccount | null): string {
  return rentForKnownAllocation(a, 165);
}
