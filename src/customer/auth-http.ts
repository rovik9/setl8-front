import type { Challenge, Session } from "../api/frontend-v1";
import { P30_PROFILE } from "../purchase/isolated/profile";
import { parseP30Session } from "../purchase/isolated/adapter";
import { validateLoginChallenge } from "./login-message";
export class LoginHttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
  ) {
    super(
      "Your sign-in could not be completed. Check your wallet and try again.",
    );
  }
}
export interface LoginApi {
  challenge(wallet: string, signal: AbortSignal): Promise<Readonly<Challenge>>;
  login(challenge: Challenge, signature: Uint8Array): Promise<void>;
  session(): Promise<Session>;
  revoke(csrf: string): Promise<void>;
}
export class CustomerLoginHttp implements LoginApi {
  constructor(
    private readonly fetcher: typeof fetch,
    private readonly origin: () => string,
    private readonly now = () => Date.now(),
  ) {}
  private async request(
    path: "challenge" | "login" | "session" | "logout",
    body?: unknown,
    csrf?: string,
    outer?: AbortSignal,
  ) {
    if (this.origin() !== P30_PROFILE.browserOrigin)
      throw new LoginHttpError(0, "origin_changed");
    const c = new AbortController(),
      cancel = () => c.abort();
    outer?.addEventListener("abort", cancel, { once: true });
    if (outer?.aborted) c.abort();
    const timer = setTimeout(() => c.abort(), path === "login" ? 10000 : 5000);
    let onAbort = () => {};
    const stopped = new Promise<never>((_, reject) => {
      onAbort = () => reject(new LoginHttpError(0, "connection_uncertain"));
      c.signal.addEventListener("abort", onAbort, { once: true });
      if (c.signal.aborted) onAbort();
    });
    try {
      const work = (async () => {
        const r = await this.fetcher(`${P30_PROFILE.api}/v1/auth/${path}`, {
          method: body === undefined ? "GET" : "POST",
          credentials: "include",
          redirect: "error",
          cache: "no-store",
          mode: "cors",
          signal: c.signal,
          headers: {
            Accept: "application/json",
            ...(body === undefined
              ? {}
              : { "Content-Type": "application/json" }),
            ...(csrf ? { "X-Setl8-Csrf": csrf } : {}),
          },
          ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        });
        if (c.signal.aborted) throw new LoginHttpError(0, "cancelled");
        if (
          r.redirected ||
          (r.url && r.url !== `${P30_PROFILE.api}/v1/auth/${path}`)
        )
          throw new LoginHttpError(502, "redirect");
        if (r.status === 401) throw new LoginHttpError(401, "unauthenticated");
        const length = r.headers.get("content-length");
        if (
          length &&
          (length.length > 20 ||
            !/^[0-9]+$/.test(length) ||
            BigInt(length) > 16384n)
        )
          throw new LoginHttpError(502, "response_limit");
        if (!r.headers.get("content-type")?.startsWith("application/json"))
          throw new LoginHttpError(502, "response_type");
        const reader = r.body?.getReader();
        if (!reader) throw new LoginHttpError(502, "response_missing");
        let text = "",
          size = 0;
        const decoder = new TextDecoder("utf-8", { fatal: true }),
          stop = () => {
            void reader.cancel().catch(() => {});
          };
        c.signal.addEventListener("abort", stop, { once: true });
        try {
          while (true) {
            const q = await reader.read();
            if (c.signal.aborted) throw new LoginHttpError(0, "cancelled");
            if (q.done) break;
            size += q.value.byteLength;
            if (size > 16384) {
              await reader.cancel();
              throw new LoginHttpError(502, "response_limit");
            }
            text += decoder.decode(q.value, { stream: true });
          }
          text += decoder.decode();
        } finally {
          c.signal.removeEventListener("abort", stop);
          reader.releaseLock();
        }
        if (!r.ok) throw new LoginHttpError(r.status, "request_failed");
        const value = JSON.parse(text);
        if (value?.api_version !== "1")
          throw new LoginHttpError(502, "version");
        return value;
      })();
      return await Promise.race([work, stopped]);
    } catch (e) {
      throw e instanceof LoginHttpError
        ? e
        : new LoginHttpError(0, "connection_uncertain");
    } finally {
      clearTimeout(timer);
      c.signal.removeEventListener("abort", onAbort);
      outer?.removeEventListener("abort", cancel);
      c.abort();
    }
  }
  async challenge(wallet: string, signal: AbortSignal) {
    return validateLoginChallenge(
      await this.request("challenge", { wallet }, undefined, signal),
      wallet,
      this.now(),
    );
  }
  async login(challenge: Challenge, signature: Uint8Array) {
    const c = validateLoginChallenge(challenge, challenge.wallet, this.now());
    if (signature.length !== 64)
      throw new LoginHttpError(400, "signature_shape");
    // Intentionally no caller abort: let a sent login settle, then reconcile/revoke late cookies before another login.
    const r = await this.request("login", {
      wallet: c.wallet,
      challenge_id: c.challenge_id,
      message: c.message,
      signature_hex: Array.from(signature, (n) =>
        n.toString(16).padStart(2, "0"),
      ).join(""),
    });
    if (
      Object.keys(r).sort().join(",") !==
        "api_version,csrf_token,expires_unix_s,wallet" ||
      r.wallet !== c.wallet ||
      typeof r.csrf_token !== "string" ||
      !/^[a-f0-9]{64}$/.test(r.csrf_token) ||
      !/^\d{1,20}$/.test(r.expires_unix_s) ||
      BigInt(r.expires_unix_s) * 1000n <= BigInt(this.now())
    )
      throw new LoginHttpError(502, "login_ack");
  }
  async session() {
    return parseP30Session(await this.request("session"), this.now());
  }
  async revoke(csrf: string) {
    if (!/^[a-f0-9]{64}$/.test(csrf)) throw new LoginHttpError(400, "csrf");
    const r = await this.request("logout", {}, csrf);
    if (
      Object.keys(r).sort().join(",") !== "api_version,logged_out" ||
      r.logged_out !== true
    )
      throw new LoginHttpError(502, "logout_ack");
  }
}
export function createCustomerLoginHttp() {
  if (
    typeof window === "undefined" ||
    window.location.origin !== P30_PROFILE.browserOrigin ||
    window.location.pathname !== "/p30-app.html"
  )
    throw new LoginHttpError(0, "customer_profile");
  return new CustomerLoginHttp(
    window.fetch.bind(window),
    () => window.location.origin,
  );
}
