import { fixed } from "../../data/exact";
/** Exact six-decimal atoms: trim zeroes only, retain every nonzero atom and at least two decimals. */
export function exactTokenAmount(atoms: string): string {
  if (
    !/^(0|[1-9][0-9]*)$/.test(atoms) ||
    atoms.length > 20 ||
    BigInt(atoms) > 18446744073709551615n
  )
    return "—";
  const [whole, fraction] = fixed(atoms, 6, 6).split(".");
  return whole + "." + fraction.replace(/0+$/, "").padEnd(2, "0");
}
