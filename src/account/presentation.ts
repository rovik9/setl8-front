import proof from "../data/devnet-proof.json";
export function exactAmount(value: bigint | string) {
  let n = BigInt(value),
    sign = n < 0n ? "−" : "";
  if (n < 0n) n = -n;
  const whole = (n / 1000000n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return (
    sign +
    whole +
    "." +
    (n % 1000000n).toString().padStart(6, "0").replace(/0+$/, "").padEnd(2, "0")
  );
}
export function chainTime(seconds: bigint) {
  if (seconds <= 0n) return "Not recorded";
  const ms = seconds * 1000n;
  if (ms > 8640000000000000n) return "Outside display range";
  return new Date(Number(ms)).toISOString().replace("T", " ");
}
export const stateName = (status: number) =>
  ["Active", "Failed", "Abandoned", "Graduated"][status] ??
  `Recorded status ${status}`;
export function proofSections() {
  return proof.sections.map((s) => ({
    ...s,
    pending: !!s.pending,
    transactions: s.items.filter((i) => i.kind === "tx" && i.value),
    items: s.items.map((i) => ({
      ...i,
      state: i.value === null ? "Pending" : "Recorded",
    })),
  }));
}
export const pendingValue = (v: unknown) =>
  v === null || v === undefined ? "Pending" : String(v);
