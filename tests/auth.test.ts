import { describe, it, expect, vi, afterEach } from "vitest";
import { ApiClient, ApiError } from "../src/api/client";
import { SessionManager } from "../src/auth/session";
import type { Session, Challenge } from "../src/api/frontend-v1";
import type { WalletChoice } from "../src/auth/wallet";
const origin = "http://127.0.0.1:5173",
  base = "http://127.0.0.1:8788";
const session: Session = {
  api_version: "1",
  wallet: "WalletA",
  wallet_hex: "aa".repeat(32),
  admin_read: false,
  expires_unix_s: "2000003600",
  csrf_token: "c".repeat(64),
  trading_authority: "actual_trader_signature_per_intent",
  lifecycle_application: "operator_only",
};
const challenge: Challenge = {
  api_version: "1",
  wallet: "WalletA",
  challenge_id: "a".repeat(64),
  audience: base,
  browser_origin: origin,
  issued_unix_s: "2000000000",
  expires_unix_s: "2000000120",
  message: "Exact server message\nwith spaces. ",
  encoding: "utf8",
  signature_encoding: "hex_ed25519_64_bytes",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
const managers: SessionManager[] = [];
afterEach(() => {
  managers.forEach((m) => m.dispose());
  managers.length = 0;
  vi.useRealTimers();
});
function setup(
  handler?: (url: string, init?: RequestInit) => Response | Promise<Response>,
) {
  const calls: { url: string; init?: RequestInit }[] = [];
  const fetcher = vi.fn(
    async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      calls.push({ url, init });
      return handler
        ? handler(url, init)
        : json(
            url.endsWith("/challenge")
              ? challenge
              : url.endsWith("/login")
                ? session
                : url.endsWith("/logout")
                  ? { api_version: "1", logged_out: true }
                  : session,
          );
    },
  );
  const client = new ApiClient(base, fetcher as typeof fetch);
  const manager = new SessionManager(client, origin, () => 2000000000000);
  managers.push(manager);
  return { client, manager, calls, fetcher };
}
function wallet(sign = vi.fn(async () => new Uint8Array(64).fill(15))) {
  let changed: ((value: string | null) => void) | undefined;
  const off = vi.fn();
  const choice: WalletChoice = {
    name: "Mock wallet",
    connect: vi.fn(async () => ({
      address: "WalletA",
      signMessage: sign,
      onChange: (fn: (value: string | null) => void) => {
        changed = fn;
        return off;
      },
      disconnect: vi.fn(async () => {}),
    })),
  };
  return { choice, sign, change: (v: string | null) => changed?.(v), off };
}
describe("credentialed requests and authentication", () => {
  it("signs exact returned UTF8 bytes; sends only the declared login fields and hex", async () => {
    const s = setup();
    const w = wallet();
    await s.manager.choose(w.choice);
    expect(s.manager.getSnapshot().phase).toBe("review");
    await s.manager.sign();
    expect(w.sign).toHaveBeenCalledWith(
      new TextEncoder().encode(challenge.message),
    );
    const call = s.calls.find((c) => c.url.endsWith("/login"))!;
    expect(JSON.parse(call.init!.body as string)).toEqual({
      wallet: "WalletA",
      message: challenge.message,
      challenge_id: challenge.challenge_id,
      signature_hex: "0f".repeat(64),
    });
    expect(s.calls.every((c) => c.init?.credentials === "include")).toBe(true);
    expect(call.init!.headers).toEqual({ "Content-Type": "application/json" });
    expect(s.manager.getSnapshot().session?.admin_read).toBe(false);
  });
  it("protects logout with the memory CSRF token and empties private scope immediately", async () => {
    const s = setup();
    await s.manager.restore();
    const epoch = s.manager.getSnapshot().epoch;
    const result = s.manager.logout();
    expect(s.manager.getSnapshot().session).toBeNull();
    expect(s.manager.getSnapshot().epoch).toBeGreaterThan(epoch);
    await result;
    const call = s.calls.find((c) => c.url.endsWith("/logout"))!;
    expect(call.init!.headers).toEqual({
      "Content-Type": "application/json",
      "X-Setl8-Csrf": session.csrf_token,
    });
    expect(call.init!.body).toBe("{}");
    expect(s.client.csrf).toBeNull();
  });
  it("blocks challenge audience/origin/wallet mismatch before message signing", async () => {
    const s = setup(() =>
      json({ ...challenge, browser_origin: "https://foreign.example" }),
    );
    const w = wallet();
    await s.manager.choose(w.choice);
    expect(s.manager.getSnapshot().phase).toBe("error");
    expect(w.sign).not.toHaveBeenCalled();
  });
  it("handles wallet rejection without sending login", async () => {
    const s = setup();
    const w = wallet(
      vi.fn(async () => {
        throw new Error("User rejected signing");
      }),
    );
    await s.manager.choose(w.choice);
    await s.manager.sign();
    expect(s.manager.getSnapshot().error).toContain("rejected");
    expect(s.calls.some((c) => c.url.endsWith("/login"))).toBe(false);
  });
  it("rejects a forged login response and does not keep session secrets", async () => {
    const s = setup((url) =>
      url.endsWith("/challenge")
        ? json(challenge)
        : json(
            {
              api_version: "1",
              error: { code: "unauthenticated", message: "Invalid signature" },
            },
            401,
          ),
    );
    await s.manager.choose(wallet().choice);
    await s.manager.sign();
    expect(s.manager.getSnapshot().session).toBeNull();
    expect(s.client.csrf).toBeNull();
    expect(s.manager.getSnapshot().error).toContain("Invalid signature");
  });
  it("ends a fixed-duration session and discards CSRF", async () => {
    vi.useFakeTimers();
    const s = setup();
    await s.manager.restore();
    vi.advanceTimersByTime(3600000);
    expect(s.manager.getSnapshot().phase).toBe("guest");
    expect(s.client.csrf).toBeNull();
  });
  it("clears account identity and listeners on wallet switch/disconnect", async () => {
    const s = setup();
    const w = wallet();
    await s.manager.choose(w.choice);
    await s.manager.sign();
    const old = s.manager.getSnapshot().epoch;
    w.change("WalletB");
    expect(s.manager.getSnapshot().session).toBeNull();
    expect(s.manager.getSnapshot().epoch).toBeGreaterThan(old);
    expect(w.off).toHaveBeenCalled();
    await vi.waitFor(() =>
      expect(s.calls.some((c) => c.url.endsWith("/logout"))).toBe(true),
    );
  });
  it("ignores an obsolete challenge after cancellation", async () => {
    let resolve!: (v: Response) => void;
    const s = setup(() => new Promise((r) => (resolve = r)));
    const choosing = s.manager.choose(wallet().choice);
    await vi.waitFor(() => expect(s.fetcher).toHaveBeenCalled());
    s.manager.cancel();
    resolve(json(challenge));
    await choosing;
    expect(s.manager.getSnapshot().challenge).toBeNull();
    expect(s.manager.getSnapshot().session).toBeNull();
    expect(s.calls[0].init!.signal!.aborted).toBe(true);
  });
  it("revokes a late login after the user cancels", async () => {
    let release!: (r: Response) => void;
    const s = setup((url) =>
      url.endsWith("/login")
        ? new Promise((r) => (release = r))
        : json(
            url.endsWith("/challenge")
              ? challenge
              : url.endsWith("/logout")
                ? { api_version: "1", logged_out: true }
                : session,
          ),
    );
    await s.manager.choose(wallet().choice);
    const signing = s.manager.sign();
    await vi.waitFor(() => expect(release).toBeDefined());
    s.manager.cancel();
    release(json(session));
    await signing;
    expect(s.manager.getSnapshot().session).toBeNull();
    expect(s.calls.some((c) => c.url.endsWith("/logout"))).toBe(true);
  });
  it("fails closed on logout failure and blocks identity replacement until retry succeeds", async () => {
    const s = setup((url) =>
      url.endsWith("/logout")
        ? json(
            {
              api_version: "1",
              error: { code: "dependency_unavailable", message: "Try later" },
            },
            503,
          )
        : json(session),
    );
    await s.manager.restore();
    expect(await s.manager.logout()).toBe(false);
    const w = wallet();
    await s.manager.choose(w.choice);
    expect(w.choice.connect).not.toHaveBeenCalled();
    expect(s.manager.getSnapshot().session).toBeNull();
    expect(s.manager.getSnapshot().error).toContain(
      "Server logout was not confirmed",
    );
  });
  it("does not fall back to cached authentication on 401", async () => {
    const s = setup(() =>
      json(
        {
          api_version: "1",
          error: { code: "unauthenticated", message: "Expired" },
        },
        401,
      ),
    );
    await s.manager.restore();
    expect(s.manager.getSnapshot().phase).toBe("guest");
    await expect(s.client.get("/v1/accounts")).rejects.toBeInstanceOf(ApiError);
  });
});
