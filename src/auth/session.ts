import type { DirectWalletConnection } from "../buy/wallets";
import { ApiClient, ApiError, errorMessage } from "../api/client";
import type { Challenge, Session } from "../api/frontend-v1";
import {
  connectedSessionWallet,
  type WalletChoice,
  type WalletConnection,
} from "./wallet";
import { beginWork } from "../hooks/loading";
export type AuthState = {
  phase:
    | "restoring"
    | "guest"
    | "connecting"
    | "review"
    | "signing"
    | "authenticated"
    | "error";
  session: Session | null;
  challenge: Challenge | null;
  error: string | null;
  epoch: number;
};
export class SessionManager {
  private state: AuthState = {
    phase: "restoring",
    session: null,
    challenge: null,
    error: null,
    epoch: 0,
  };
  private listeners = new Set<() => void>();
  private abort = new AbortController();
  private wallet: WalletConnection | null = null;
  private offWallet?: () => void;
  private timer?: ReturnType<typeof setTimeout>;
  private pendingRevoke: string | null = null;
  private loginInFlight: Promise<void> | null = null;
  constructor(
    readonly client: ApiClient,
    private origin = window.location.origin,
    private now = () => Date.now(),
  ) {
    client.onExpired = () => this.expire();
  }
  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  };
  getSnapshot = () => this.state;
  private set(patch: Partial<AuthState>) {
    this.state = { ...this.state, ...patch };
    this.listeners.forEach((fn) => fn());
  }
  private reset(phase: AuthState["phase"], error: string | null = null) {
    this.abort.abort();
    this.abort = new AbortController();
    clearTimeout(this.timer);
    this.offWallet?.();
    this.offWallet = undefined;
    this.client.csrf = null;
    this.wallet?.purchaseConnection?.dispose();
    this.wallet = null;
    this.set({
      phase,
      error,
      session: null,
      challenge: null,
      epoch: this.state.epoch + 1,
    });
  }
  getPurchaseConnection(): DirectWalletConnection | null {
    return this.state.phase === "authenticated" &&
      this.state.session?.wallet === this.wallet?.address
      ? (this.wallet?.purchaseConnection ?? null)
      : null;
  }
  getPurchaseUnavailableReason() {
    return (
      this.wallet?.purchaseUnavailable ??
      "Connect your signed-in wallet to continue."
    );
  }
  isPurchaseWallet(wallet: string) {
    return (
      this.state.phase === "authenticated" &&
      this.state.session?.wallet === wallet &&
      this.wallet?.address === wallet &&
      !!this.getPurchaseConnection()?.accounts.some((a) => a.address === wallet)
    );
  }
  /** Explicit reviewed message signing; no transaction or delegated authority. */
  async signSessionMessage(wallet: string, epoch: number, message: Uint8Array) {
    const connection = this.wallet;
    const current = () =>
      this.state.phase === "authenticated" &&
      this.state.epoch === epoch &&
      this.state.session?.wallet === wallet &&
      this.wallet === connection &&
      connection?.address === wallet;
    if (!connection || !current())
      throw Error(
        "Connect the signed-in wallet before approving this message.",
      );
    const signature = new Uint8Array(
      await connection.signMessage(new Uint8Array(message)),
    );
    if (signature.length !== 64)
      throw Error("Wallet returned an invalid message signature.");
    // The caller must retain the public signed intent before its post-sign scope
    // guard; a wallet/account change never makes a returned signature disappear.
    return { signature, current: current() };
  }
  private observeWallet(connection: WalletConnection) {
    this.offWallet?.();
    this.wallet = connection;
    this.offWallet = connection.onChange((address) => {
      if (address !== connection.address)
        void this.logout(
          false,
          "Wallet or network changed. Sign in with the selected wallet.",
        );
    });
  }
  restoreConnectedWallet() {
    if (
      this.state.phase !== "authenticated" ||
      !this.state.session ||
      this.wallet?.purchaseConnection
    )
      return;
    const connection = connectedSessionWallet(this.state.session.wallet);
    if (connection && (!this.wallet || connection.purchaseConnection)) {
      this.wallet?.purchaseConnection?.dispose();
      this.observeWallet(connection);
      this.set({ epoch: this.state.epoch + 1 });
    }
  }
  private accept(session: Session) {
    if (
      !/^\d+$/.test(session.expires_unix_s) ||
      BigInt(session.expires_unix_s) * 1000n <= BigInt(this.now())
    ) {
      this.expire();
      return;
    }
    this.client.csrf = session.csrf_token;
    if (!this.wallet) {
      const connection = connectedSessionWallet(session.wallet);
      if (connection) this.observeWallet(connection);
    }
    this.set({ phase: "authenticated", session, challenge: null, error: null });
    const delay = BigInt(session.expires_unix_s) * 1000n - BigInt(this.now());
    clearTimeout(this.timer);
    this.timer = setTimeout(
      () => this.expire(),
      Number(delay > 3600000n ? 3600000n : delay),
    );
  }
  async restore() {
    if (this.pendingRevoke) return;
    const done = beginWork();
    this.reset("restoring");
    const signal = this.abort.signal;
    try {
      const session = await this.client.request<Session>("/v1/auth/session", {
        signal,
        authFailure: false,
      });
      if (!signal.aborted) this.accept(session);
    } catch (e) {
      if (!signal.aborted)
        this.set({
          phase: e instanceof ApiError && e.status === 401 ? "guest" : "error",
          error:
            e instanceof ApiError && e.status === 401 ? null : errorMessage(e),
        });
    } finally {
      done();
    }
  }
  async check() {
    if (this.state.phase !== "authenticated") return;
    const signal = this.abort.signal;
    try {
      const session = await this.client.request<Session>("/v1/auth/session", {
        signal,
        authFailure: false,
      });
      if (signal.aborted) return;
      const previous = this.state.session;
      if (
        !previous ||
        session.wallet !== previous.wallet ||
        session.csrf_token !== previous.csrf_token ||
        session.expires_unix_s !== previous.expires_unix_s ||
        session.admin_read !== previous.admin_read
      ) {
        this.client.csrf = session.csrf_token;
        await this.logout(
          false,
          "Your sign-in changed. Connect your wallet to sign in again.",
        );
      } else this.accept(session);
    } catch (e) {
      if (!signal.aborted) {
        if (e instanceof ApiError && e.status === 401) this.expire();
        else this.reset("error", errorMessage(e));
      }
    }
  }
  async choose(choice: WalletChoice) {
    if (["connecting", "signing", "review"].includes(this.state.phase)) return;
    if (this.loginInFlight) await this.loginInFlight.catch(() => {});
    if (this.state.session || this.pendingRevoke) {
      if (!(await this.logout())) return;
    }
    this.reset("connecting");
    const signal = this.abort.signal;
    const done = beginWork();
    try {
      const connection = await choice.connect();
      if (signal.aborted) {
        connection.purchaseConnection?.dispose();
        return;
      }
      this.observeWallet(connection);
      const challenge = await this.client.post(
        "/v1/auth/challenge",
        { wallet: connection.address },
        signal,
      );
      if (signal.aborted) return;
      if (
        challenge.wallet !== connection.address ||
        challenge.audience !== this.client.base ||
        challenge.browser_origin !== this.origin ||
        challenge.encoding !== "utf8" ||
        challenge.signature_encoding !== "hex_ed25519_64_bytes" ||
        !/^\d+$/.test(challenge.expires_unix_s) ||
        BigInt(challenge.expires_unix_s) * 1000n <= BigInt(this.now())
      )
        throw new Error(
          "The login challenge does not match this wallet, service, origin or validity period. Request a new challenge.",
        );
      this.set({ phase: "review", challenge });
    } catch (e) {
      if (!signal.aborted) this.reset("error", errorMessage(e));
    } finally {
      done();
    }
  }
  async sign() {
    if (this.state.phase !== "review" || !this.wallet || !this.state.challenge)
      return;
    const wallet = this.wallet,
      challenge = this.state.challenge,
      signal = this.abort.signal;
    this.set({ phase: "signing" });
    const done = beginWork();
    try {
      if (BigInt(challenge.expires_unix_s) * 1000n <= BigInt(this.now()))
        throw new Error(
          "The login challenge expired. Connect again for a new challenge.",
        );
      const signature = await wallet.signMessage(
        new TextEncoder().encode(challenge.message),
      );
      if (signal.aborted) return;
      if (signature.length !== 64)
        throw new Error("The wallet returned an invalid signature.");
      // Let a sent login settle before another login can change the browser binding.
      // A cancelled operation must revoke a late successful cookie before a new choice.
      const operation = (async () => {
        await this.client.post("/v1/auth/login", {
          challenge_id: challenge.challenge_id,
          wallet: challenge.wallet,
          message: challenge.message,
          signature_hex: Array.from(signature, (b) =>
            b.toString(16).padStart(2, "0"),
          ).join(""),
        });
        const session = await this.client.request<Session>("/v1/auth/session", {
          authFailure: false,
        });
        if (signal.aborted || session.wallet !== wallet.address) {
          this.pendingRevoke = session.csrf_token;
          this.client.csrf = session.csrf_token;
          const cleanup = this.client.post("/v1/auth/logout", {});
          this.client.csrf = null;
          try {
            await cleanup;
            this.pendingRevoke = null;
          } catch (e) {
            this.set({
              phase: "error",
              error:
                "Private views cleared. Server logout was not confirmed. Retry logout before connecting another wallet. " +
                errorMessage(e),
            });
            throw e;
          }
          return;
        }
        this.accept(session);
      })();
      this.loginInFlight = operation;
      try {
        await operation;
      } finally {
        if (this.loginInFlight === operation) this.loginInFlight = null;
      }
    } catch (e) {
      if (!signal.aborted) this.reset("error", errorMessage(e));
    } finally {
      done();
    }
  }
  async logout(
    disconnect = true,
    message: string | null = null,
  ): Promise<boolean> {
    const token = this.client.csrf || this.pendingRevoke,
      connection = this.wallet;
    this.pendingRevoke = token;
    this.reset("guest", message);
    if (disconnect) void connection?.disconnect().catch(() => {});
    if (!token) return true;
    const done = beginWork();
    // Use the configured transport in tests and keep revocation independent of abandoned UI requests.
    const previous = this.client.csrf;
    this.client.csrf = token;
    const operation = this.client.post("/v1/auth/logout", {});
    this.client.csrf = previous;
    try {
      await operation;
      this.pendingRevoke = null;
      return true;
    } catch (e) {
      this.set({
        phase: "error",
        error:
          "Private views cleared. Server logout was not confirmed. Retry logout before connecting another wallet. " +
          errorMessage(e),
      });
      return false;
    } finally {
      done();
    }
  }
  cancel() {
    if (["connecting", "review", "signing"].includes(this.state.phase))
      this.reset("guest");
  }
  expire() {
    this.reset(
      "guest",
      "Your sign-in ended. Connect your wallet to sign in again.",
    );
  }
  dispose() {
    this.abort.abort();
    clearTimeout(this.timer);
    this.offWallet?.();
    this.wallet?.purchaseConnection?.dispose();
    this.listeners.clear();
  }
}
