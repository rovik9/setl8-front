export const fromHex = (s: string) => {
  if (!/^(?:[a-f0-9]{2})*$/.test(s)) throw Error("Invalid exact bytes");
  return Uint8Array.from(s.match(/../g) ?? [], (x) => parseInt(x, 16));
};
export const hex = (b: Uint8Array) =>
  Array.from(b, (n) => n.toString(16).padStart(2, "0")).join("");
export const b64 = (b: Uint8Array) => {
  let s = "";
  for (let i = 0; i < b.length; i += 8192)
    s += String.fromCharCode(...b.subarray(i, i + 8192));
  return btoa(s);
};
export const un64 = (s: string) => {
  if (s.length > 4_000_000 || s.length % 4 || !/^[A-Za-z0-9+/]*={0,2}$/.test(s))
    throw Error("Invalid base64 account data");
  return Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
};
export const same = (a: Uint8Array, b: Uint8Array) =>
  a.length === b.length && a.every((v, i) => v === b[i]);
export const hash = async (b: Uint8Array | string) =>
  hex(
    new Uint8Array(
      await crypto.subtle.digest(
        "SHA-256",
        typeof b === "string" ? new TextEncoder().encode(b) : new Uint8Array(b),
      ),
    ),
  );
export function u64(v: unknown): string {
  if (
    typeof v !== "string" ||
    !/^(0|[1-9][0-9]*)$/.test(v) ||
    v.length > 20 ||
    BigInt(v) > 18446744073709551615n
  )
    throw Error("An exact unsigned integer is required");
  return v;
}
export function safeNumber(v: string) {
  const n = BigInt(u64(v));
  if (n > BigInt(Number.MAX_SAFE_INTEGER))
    throw Error("RPC context exceeds its safe request boundary");
  return Number(n);
}
/**
 * JSON text with object keys sorted at every depth; array order and every value are kept. Two providers
 * that return the same data but emit object keys in a different order compare equal; any differing
 * value, missing key, extra key or array reordering still compares different.
 */
export function canonicalJson(v: unknown): string {
  if (Array.isArray(v)) return "[" + v.map(canonicalJson).join(",") + "]";
  if (v !== null && typeof v === "object")
    return (
      "{" +
      Object.keys(v)
        .sort()
        .map((k) => JSON.stringify(k) + ":" + canonicalJson((v as any)[k]))
        .join(",") +
      "}"
    );
  return JSON.stringify(v) ?? "null";
}
/** Keep JSON number lexemes exact, including optional UI projections; decision fields subsequently require u64. */
export function exactJson(text: string) {
  let out = "",
    i = 0;
  while (i < text.length) {
    const c = text[i];
    if (c === '"') {
      let end = i + 1;
      for (; end < text.length; end++) {
        if (text[end] === "\\") {
          end++;
          continue;
        }
        if (text[end] === '"') {
          end++;
          break;
        }
      }
      out += text.slice(i, end);
      i = end;
    } else if (c === "-" || /[0-9]/.test(c)) {
      const m = /^-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?/.exec(
        text.slice(i),
      );
      if (!m) throw Error("Invalid RPC JSON number");
      out += JSON.stringify(m[0]);
      i += m[0].length;
    } else {
      out += c;
      i++;
    }
  }
  return JSON.parse(out);
}
