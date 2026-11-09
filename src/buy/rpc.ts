import { exactJson, b64, safeNumber } from "./bytes";
import type { CheckedPurchase } from "./direct-types";
import { verifyWalletReturn } from "./walletReturn";
const PUBLIC_SOLANA = "https://api.devnet.solana.com";
const PUBLIC_ONFINALITY = "https://solana-devnet.api.onfinality.io/public";
/**
 * Optional private devnet operator, supplied only through VITE_DEVNET_RPC_URL. It is accepted
 * only as an https URL (no credentials in the authority) that names devnet and never mainnet,
 * and that is not one of the public endpoints. Anything else falls back to the two public
 * operators. The value is never logged, thrown, or put in a measurement or message.
 */
function privateDevnetUrl(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const v = raw.trim();
  if (v.length < 12 || v.length > 512) return null;
  const lower = v.toLowerCase();
  if (!lower.includes("devnet") || lower.includes("mainnet")) return null;
  let u: URL;
  try {
    u = new URL(v);
  } catch {
    return null;
  }
  if (u.protocol !== "https:" || u.username || u.password || u.hash)
    return null;
  if (
    [PUBLIC_SOLANA, PUBLIC_ONFINALITY].some(
      (p) => new URL(p).origin === u.origin,
    )
  )
    return null;
  return v;
}
/** Operator list: private first and one public second when a valid private URL is given, else the two public ones. */
export function resolveDevnetEndpoints(raw: unknown) {
  const own = privateDevnetUrl(raw);
  return Object.freeze(
    own
      ? ([own, PUBLIC_SOLANA] as const)
      : ([PUBLIC_SOLANA, PUBLIC_ONFINALITY] as const),
  ) as readonly [string, string];
}
export const DEVNET_ENDPOINTS = resolveDevnetEndpoints(
  import.meta.env?.VITE_DEVNET_RPC_URL,
);
/** True when the first operator is the private one (a boolean only, never the URL). */
export const PRIVATE_DEVNET_ACTIVE = DEVNET_ENDPOINTS[1] === PUBLIC_SOLANA;
const reads = new Set([
  "getGenesisHash",
  "getMultipleAccounts",
  "getAccountInfo",
  "getLatestBlockhash",
  "getBlockHeight",
  "isBlockhashValid",
  "getFeeForMessage",
  "getMinimumBalanceForRentExemption",
  "getSignatureStatuses",
  "getTransaction",
  "getSignaturesForAddress",
  "simulateTransaction",
]);
export class DirectRpcError extends Error {
  constructor(
    readonly code: string,
    readonly retryAt: number | null = null,
  ) {
    super(
      code === "cooldown"
        ? "The public RPC asked us to wait. Check again after its retry time."
        : code === "permission"
          ? "This public RPC refused the request. Review access before continuing."
          : "The public read could not be completed. No account absence or payment failure is inferred.",
    );
  }
}
export interface RpcMeasurement {
  phase: string;
  provider: 0 | 1;
  method: string;
  requestBytes: number;
  responseBytesRead: number;
  startedAt: number;
  completedAt?: number;
  status?: number;
  completedBody: boolean;
}
export class DirectRpc {
  private phase = "read";
  private observations: RpcMeasurement[] = [];
  mark(phase: string) {
    this.phase = phase.slice(0, 64);
  }
  measurements(): readonly Readonly<RpcMeasurement>[] {
    return this.observations.map((o) => Object.freeze({ ...o }));
  }
  private id = 0;
  private calls = 0;
  private bytes = 0;
  private blockedUntil = 0;
  private permissionBlocked = false;
  constructor(
    private fetcher: typeof fetch = (...args) => fetch(...args),
    private now = () => Date.now(),
  ) {}
  begin(phase = "read") {
    this.mark(phase);
    if (this.permissionBlocked) throw new DirectRpcError("permission");
    if (this.now() < this.blockedUntil)
      throw new DirectRpcError("cooldown", this.blockedUntil);
    this.calls = 0;
    this.bytes = 0;
  }
  async read(
    provider: 0 | 1,
    method: string,
    params: unknown[],
    signal: AbortSignal,
  ): Promise<any> {
    if (!reads.has(method)) throw new DirectRpcError("method_not_allowed");
    return this.request(provider, method, params, signal);
  }
  private async request(
    provider: 0 | 1,
    method: string,
    params: unknown[],
    signal: AbortSignal,
    beforeFetch?: () => void,
  ): Promise<any> {
    if (this.permissionBlocked) throw new DirectRpcError("permission");
    if (this.now() < this.blockedUntil)
      throw new DirectRpcError("cooldown", this.blockedUntil);
    if (++this.calls > 32) throw new DirectRpcError("work_limit");
    const c = new AbortController(),
      cancel = () => c.abort();
    signal.addEventListener("abort", cancel, { once: true });
    if (signal.aborted) c.abort();
    let abort = () => {};
    const stopped = new Promise<never>((_, reject) => {
      abort = () => reject(new DirectRpcError("read_interrupted"));
      c.signal.addEventListener("abort", abort, { once: true });
      if (c.signal.aborted) abort();
    });
    const timer = setTimeout(() => c.abort(), 12000),
      id = "direct-" + ++this.id;
    let measurement: RpcMeasurement | undefined;
    try {
      const work = (async () => {
        if (c.signal.aborted) throw new DirectRpcError("read_interrupted");
        beforeFetch?.();
        const body = JSON.stringify({ jsonrpc: "2.0", id, method, params });
        measurement = {
          phase: this.phase,
          provider,
          method,
          requestBytes: new TextEncoder().encode(body).byteLength,
          responseBytesRead: 0,
          startedAt: this.now(),
          completedBody: false,
        };
        if (this.observations.length === 256) this.observations.shift();
        this.observations.push(measurement);
        const r = await this.fetcher(DEVNET_ENDPOINTS[provider], {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "omit",
          redirect: "error",
          cache: "no-store",
          body,
          signal: c.signal,
        });
        measurement.status = r.status;
        if (r.status === 403) {
          this.permissionBlocked = true;
          throw new DirectRpcError("permission");
        }
        const retry = r.headers.get("retry-after");
        if (r.status === 429 || retry) {
          const seconds =
            retry && /^[0-9]{1,8}$/.test(retry)
              ? Number(retry) * 1000
              : retry
                ? Math.max(0, Date.parse(retry) - this.now())
                : 60000;
          this.blockedUntil = Math.max(
            this.blockedUntil,
            this.now() + (Number.isFinite(seconds) ? seconds : 60000),
          );
          throw new DirectRpcError("cooldown", this.blockedUntil);
        }
        if (
          !r.ok ||
          r.redirected ||
          (r.url &&
            new URL(r.url).href !== new URL(DEVNET_ENDPOINTS[provider]).href)
        )
          throw new DirectRpcError("rpc_unavailable");
        const length = r.headers.get("content-length");
        if (
          length &&
          (length.length > 10 ||
            !/^[0-9]+$/.test(length) ||
            BigInt(length) > 2_500_000n)
        )
          throw new DirectRpcError("response_limit");
        const reader = r.body?.getReader();
        if (!reader) throw new DirectRpcError("response_missing");
        const decoder = new TextDecoder("utf-8", { fatal: true });
        let text = "",
          size = 0;
        const stop = () => {
          void reader.cancel().catch(() => {});
        };
        c.signal.addEventListener("abort", stop, { once: true });
        try {
          while (true) {
            const q = await reader.read();
            if (c.signal.aborted) throw new DirectRpcError("read_interrupted");
            if (q.done) break;
            size += q.value.byteLength;
            this.bytes += q.value.byteLength;
            measurement.responseBytesRead += q.value.byteLength;
            if (size > 2_500_000 || this.bytes > 12_000_000) {
              await reader.cancel();
              throw new DirectRpcError("response_limit");
            }
            text += decoder.decode(q.value, { stream: true });
          }
          text += decoder.decode();
          measurement.completedBody = true;
        } finally {
          c.signal.removeEventListener("abort", stop);
          reader.releaseLock();
        }
        const v = exactJson(text);
        if (
          v.jsonrpc !== "2.0" ||
          v.id !== id ||
          v.error ||
          !Object.hasOwn(v, "result")
        )
          throw new DirectRpcError("rpc_error");
        return v.result;
      })();
      return await Promise.race([work, stopped]);
    } finally {
      if (measurement) measurement.completedAt = this.now();
      clearTimeout(timer);
      signal.removeEventListener("abort", cancel);
      c.signal.removeEventListener("abort", abort);
      c.abort();
    }
  }
  /** Called only by checkout's scoped authority; the public default factory never releases it. */
  async sendExact(
    packet: Uint8Array,
    signature: string,
    c: CheckedPurchase,
    signal: AbortSignal,
    authorize: () => void,
  ) {
    authorize();
    if ((await verifyWalletReturn(packet, c, c.wallet)).signature !== signature)
      throw Error("Signed packet differs from retained signature.");
    if (signal.aborted) throw new DirectRpcError("read_interrupted");
    const value = await this.request(
      0,
      "sendTransaction",
      [
        b64(packet),
        {
          encoding: "base64",
          skipPreflight: false,
          preflightCommitment: "confirmed",
          maxRetries: 0,
          minContextSlot: safeNumber(c.minSlot),
        },
      ],
      signal,
      authorize,
    );
    if (value !== signature)
      throw Error(
        "Send response did not match the retained exact signature. Outcome uncertain; do not repay.",
      );
  }
  /** Legacy parameterless entry remains closed. */
  async sendTransaction(): Promise<never> {
    throw new DirectRpcError("broadcast_gate_off");
  }
}
