import type { Wallet, WalletAccount } from "@wallet-standard/base";
import type { Challenge } from "../api/frontend-v1";
import { beginWork } from "../hooks/loading";
import type { IsolatedPurchaseAdapter } from "../purchase/isolated/adapter";
import { type LoginApi, LoginHttpError } from "./auth-http";
import { validateLoginChallenge } from "./login-message";
import {
  checkLoginAccount,
  loginAccounts,
  type LoginFeatures,
} from "./wallet-standard";
export type LoginPhase =
  | "guest"
  | "connecting"
  | "accounts"
  | "review"
  | "signing"
  | "authenticated"
  | "cleanup"
  | "error";
export interface CustomerLoginState {
  phase: LoginPhase;
  walletName: string | null;
  accounts: readonly WalletAccount[];
  selected: string | null;
  challenge: Readonly<Challenge> | null;
  error: string | null;
}
const initial = (): CustomerLoginState => ({
  phase: "guest",
  walletName: null,
  accounts: [],
  selected: null,
  challenge: null,
  error: null,
});
export class CustomerLoginController {
  private state = initial();
  private listeners = new Set<() => void>();
  private generation = 0;
  private abort = new AbortController();
  private wallet: Wallet | null = null;
  private account: WalletAccount | null = null;
  private off?: () => void;
  private walletWork: Promise<unknown> | null = null;
  private loginFlight: Promise<void> | null = null;
  private cleanupFlight: Promise<void> | null = null;
  private revokeRequired = false;
  private offRead: () => void;
  constructor(
    readonly reads: IsolatedPurchaseAdapter,
    private api: LoginApi,
    private now = () => Date.now(),
  ) {
    this.offRead = reads.subscribe(() => {
      if (this.state.phase === "authenticated" && !reads.getSnapshot().scope) {
        this.generation++;
        this.abort.abort();
        this.account = null;
        this.set({
          phase: "guest",
          selected: null,
          challenge: null,
          error: "Your session changed. Sign in again to continue.",
        });
      }
    });
  }
  subscribe = (f: () => void) => {
    this.listeners.add(f);
    return () => {
      this.listeners.delete(f);
    };
  };
  getSnapshot = () => this.state;
  private set(p: Partial<CustomerLoginState>) {
    this.state = Object.freeze({ ...this.state, ...p });
    for (const f of this.listeners) f();
  }
  private reset(reason: string | null = null) {
    this.generation++;
    this.abort.abort();
    this.abort = new AbortController();
    this.account = null;
    this.set({
      selected: null,
      challenge: null,
      phase: "cleanup",
      error: reason,
    });
    this.reads.walletChanged(null);
  }
  private async revokeObservedCookie() {
    // A sent login must settle before this runs; new login/connect remains blocked until cleanup succeeds.
    try {
      const session = await this.api.session();
      await this.api.revoke(session.csrf_token);
    } catch (e) {
      if (!(e instanceof LoginHttpError && e.status === 401)) throw e;
    }
    await this.reads.logout();
    this.revokeRequired = false;
  }
  private cleanup() {
    if (this.cleanupFlight) return this.cleanupFlight;
    this.cleanupFlight = (async () => {
      try {
        if (this.loginFlight) await this.loginFlight.catch(() => {});
        await this.revokeObservedCookie();
      } catch (e) {
        this.revokeRequired = true;
        throw e;
      }
    })().finally(() => {
      this.cleanupFlight = null;
    });
    return this.cleanupFlight;
  }
  async restore() {
    if (this.walletWork || this.loginFlight || this.revokeRequired) return;
    const g = this.generation,
      done = beginWork();
    try {
      const s = await this.reads.restore();
      if (g === this.generation)
        this.set({ phase: "authenticated", selected: s.wallet, error: null });
    } catch (e) {
      if (g === this.generation)
        this.set({
          phase: "guest",
          error:
            e instanceof Error && "status" in e && e.status === 401
              ? null
              : "Your read session is unavailable. Connect your wallet to sign in.",
        });
    } finally {
      done();
    }
  }
  async chooseWallet(wallet: Wallet) {
    if (this.walletWork) return;
    this.reset();
    const g = this.generation,
      done = beginWork();
    try {
      await this.cleanup();
      if (g !== this.generation) return;
      this.off?.();
      this.wallet = wallet;
      this.set({
        phase: "connecting",
        walletName: wallet.name,
        error: null,
        accounts: [],
      });
      const features = wallet.features as LoginFeatures;
      this.off = features["standard:events"].on("change", (change) => {
        if (this.wallet !== wallet) return;
        // Authorization can emit accounts while connect is pending; no signed-in scope exists yet.
        if (
          this.state.phase === "connecting" &&
          !this.account &&
          change.accounts &&
          !change.chains &&
          !change.features
        )
          return;
        if (change.accounts || change.chains || change.features) {
          this.reset(
            "Your wallet changed. Choose an account and sign in again.",
          );
          const changedGeneration = this.generation;
          this.set({
            accounts: change.accounts
              ? loginAccounts(wallet, change.accounts)
              : [],
            phase: "cleanup",
          });
          void this.cleanup()
            .then(async () => {
              await this.walletWork?.catch(() => {});
              if (changedGeneration === this.generation)
                this.set({ phase: "accounts" });
            })
            .catch(() =>
              this.set({
                phase: "cleanup",
                error:
                  "Sign-out could not be confirmed. Retry before connecting again.",
              }),
            );
        }
      });
      this.walletWork = features["standard:connect"].connect();
      const result = (await this.walletWork) as {
        accounts: readonly WalletAccount[];
      };
      if (g !== this.generation) return;
      const accounts = loginAccounts(wallet, result.accounts);
      if (!accounts.length)
        throw Error(
          "Choose an account that supports Solana devnet message signing.",
        );
      this.set({ phase: "accounts", accounts: Object.freeze([...accounts]) });
    } catch (e) {
      if (g === this.generation)
        this.set({
          phase: this.revokeRequired ? "cleanup" : "error",
          error:
            e instanceof Error ? e.message : "Wallet connection was cancelled.",
        });
    } finally {
      this.walletWork = null;
      done();
    }
  }
  async selectAccount(address: string) {
    if (
      !this.wallet ||
      this.walletWork ||
      this.loginFlight ||
      this.revokeRequired
    )
      return;
    const account = this.state.accounts.find((a) => a.address === address);
    if (!account) return;
    const wallet = this.wallet;
    this.reset();
    const g = this.generation,
      done = beginWork();
    try {
      await this.cleanup();
      if (g !== this.generation) return;
      checkLoginAccount(wallet, account);
      this.account = account;
      this.reads.walletChanged(account.address);
      this.set({ phase: "accounts", selected: account.address, error: null });
      const challenge = validateLoginChallenge(
        await this.api.challenge(account.address, this.abort.signal),
        account.address,
        this.now(),
      );
      if (g !== this.generation) return;
      this.set({ phase: "review", challenge });
    } catch (e) {
      if (g === this.generation)
        this.set({
          phase: this.revokeRequired ? "cleanup" : "error",
          challenge: null,
          error:
            e instanceof Error
              ? e.message
              : "Your sign-in message could not be loaded.",
        });
    } finally {
      done();
    }
  }
  async signIn() {
    if (
      this.state.phase !== "review" ||
      !this.wallet ||
      !this.account ||
      !this.state.challenge ||
      this.walletWork ||
      this.loginFlight ||
      this.revokeRequired
    )
      return;
    const wallet = this.wallet,
      account = this.account,
      g = this.generation,
      done = beginWork();
    this.set({ phase: "signing", error: null });
    try {
      checkLoginAccount(wallet, account);
      const c = validateLoginChallenge(
          this.state.challenge,
          account.address,
          this.now(),
        ),
        message = new TextEncoder().encode(c.message),
        features = wallet.features as LoginFeatures;
      this.walletWork = features["solana:signMessage"].signMessage({
        account,
        message: new Uint8Array(message),
      });
      const result = (await this.walletWork) as readonly {
        signedMessage: Uint8Array;
        signature: Uint8Array;
        signatureType?: string;
      }[];
      if (g !== this.generation || this.account !== account) return;
      if (
        result.length !== 1 ||
        result[0].signature.length !== 64 ||
        (result[0].signatureType !== undefined &&
          result[0].signatureType !== "ed25519") ||
        result[0].signedMessage.length !== message.length ||
        !result[0].signedMessage.every((b, i) => b === message[i])
      )
        throw Error(
          "Your wallet returned a different sign-in message. Review and try again.",
        );
      checkLoginAccount(wallet, account);
      validateLoginChallenge(c, account.address, this.now());
      const signature = new Uint8Array(result[0].signature);
      this.loginFlight = (async () => {
        this.revokeRequired = true;
        try {
          await this.api.login(c, signature);
          if (g !== this.generation) {
            await this.revokeObservedCookie();
            return;
          }
          const scope = await this.reads.restore();
          if (g !== this.generation || scope.wallet !== account.address) {
            await this.revokeObservedCookie();
            return;
          }
          this.revokeRequired = false;
          this.set({
            phase: "authenticated",
            challenge: null,
            selected: scope.wallet,
            error: null,
          });
        } catch (e) {
          try {
            await this.revokeObservedCookie();
          } catch {
            this.revokeRequired = true;
          }
          throw e;
        }
      })();
      await this.loginFlight;
    } catch (e) {
      if (g === this.generation)
        this.set({
          phase: this.revokeRequired ? "cleanup" : "error",
          challenge: null,
          error: this.revokeRequired
            ? "Sign-in outcome needs checking. Retry sign-out before continuing."
            : e instanceof Error
              ? e.message
              : "Sign-in was cancelled in your wallet.",
        });
    } finally {
      this.walletWork = null;
      this.loginFlight = null;
      done();
    }
  }
  async signOut() {
    this.reset();
    const g = this.generation,
      done = beginWork();
    try {
      await this.cleanup();
      if (this.walletWork) await this.walletWork.catch(() => {});
      this.off?.();
      this.off = undefined;
      await (this.wallet?.features as LoginFeatures | undefined)?.[
        "standard:disconnect"
      ]?.disconnect();
      this.wallet = null;
      if (g === this.generation) this.set(initial());
    } catch {
      if (g === this.generation)
        this.set({
          phase: "cleanup",
          error:
            "Sign-out could not be confirmed. Retry before connecting again.",
        });
    } finally {
      done();
    }
  }
  cancelReview() {
    this.reset();
    const g = this.generation;
    void this.cleanup()
      .then(async () => {
        await this.walletWork?.catch(() => {});
        if (g === this.generation) this.set({ phase: "accounts" });
      })
      .catch(() => {
        if (g === this.generation)
          this.set({
            phase: "cleanup",
            error: "Sign-out needs checking before continuing.",
          });
      });
  }
  walletRemoved(wallet: Wallet) {
    if (this.wallet === wallet) {
      this.off?.();
      this.reset("Your wallet disconnected. Connect again to continue.");
      this.wallet = null;
      void this.cleanup()
        .then(() =>
          this.set({ phase: "guest", accounts: [], walletName: null }),
        )
        .catch(() =>
          this.set({
            phase: "cleanup",
            error: "Retry sign-out before continuing.",
          }),
        );
    }
  }
  dispose() {
    this.generation++;
    this.abort.abort();
    this.off?.();
    this.offRead();
    this.listeners.clear();
  }
}
