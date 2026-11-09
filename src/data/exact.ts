/** Integer-only formatting. Never round-trip a financial string through Number. */
export function fixed(
  value: string,
  scale: number,
  digits = 2,
  group = true,
): string {
  if (
    !/^-?\d+$/.test(value) ||
    digits < 0 ||
    digits > 18 ||
    scale < 0 ||
    scale > 18
  )
    return "—";
  const negative = value.startsWith("-");
  let n = BigInt(value);
  if (n < 0n) n = -n;
  const divisor = 10n ** BigInt(scale);
  const precision = 10n ** BigInt(digits);
  // Round half away from zero, including sub-cent values.
  const rounded = (n * precision * 2n + divisor) / (divisor * 2n);
  let whole = (rounded / precision).toString();
  if (group) whole = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  const tail = digits
    ? "." + (rounded % precision).toString().padStart(digits, "0")
    : "";
  return (negative && rounded !== 0n ? "−" : "") + whole + tail;
}
export function usd(value: string | null | undefined, scale = 6, digits = 2) {
  return value == null ? "—" : "$" + fixed(value, scale, digits);
}
export function quantity(value: string) {
  return fixed(value, 6, 6).replace(/\.?0+$/, "");
}
export const shortId = (value: string, end = 5) =>
  value.length > 16 ? value.slice(0, 6) + "…" + value.slice(-end) : value;
export function timestamp(value: string, scale: "ns" | "s" = "ns"): string {
  if (!/^-?\d+$/.test(value)) return "Unavailable";
  const ms = scale === "ns" ? BigInt(value) / 1000000n : BigInt(value) * 1000n;
  if (ms > 8640000000000000n || ms < -8640000000000000n) return "Out of range";
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "UTC",
    timeZoneName: "short",
  }).format(new Date(Number(ms)));
}
export function age(value: string) {
  return fixed(value, 9, 1) + " s";
}
/** Explicit presentation boundary, only used for deterministic demo chart coordinates. */
export function chartNumber(integer: string, scale: number) {
  const n = Number(integer) / 10 ** scale;
  if (!Number.isFinite(n)) throw new Error("Chart value out of range");
  return n;
}
