import { ApiError } from "../api/client";
import type { PracticeAccount } from "../api/practice-v1";
import type {
  IntentReceipt,
  IntentStatus,
  SignedIntent,
} from "../api/frontend-v1";
import type { PreparedDraft } from "../data/orderDraft";
import { accountBytes } from "../data/orderDraft";
import { fromHex, hex, same } from "../buy/bytes";
import type { SessionManager } from "../auth/session";
import { PracticeHttp, assertPracticeAccount } from "./http";
export type StoredIntent = {
  wallet: string;
  account: string;
  nonce: string;
  messageHex: string;
  body: SignedIntent;
  receipt: IntentReceipt | null;
  createdAt: string;
};
export type IntentView = {
  phase:
    | "review"
    | "signing"
    | "signed"
    | "submitting"
    | "received"
    | "uncertain"
    | "conflict"
    | "error";
  busy: boolean;
  message: string;
  retained: StoredIntent | null;
  status: IntentStatus | null;
};
export interface IntentStorage {
  getItem(k: string): string | null;
  setItem(k: string, v: string): void;
}
export class PracticeOutbox {
  constructor(private storage: IntentStorage) {}
  private key(wallet: string, account: string) {
    return `setl8.practice.signed.v1:${wallet}:${account}`;
  }
  read(wallet: string, account: string): StoredIntent | null {
    const raw = this.storage.getItem(this.key(wallet, account));
    if (!raw) return null;
    const v = JSON.parse(raw) as StoredIntent;
    if (
      v.wallet !== wallet ||
      v.account !== account ||
      !Number.isInteger(v.body?.nonce) ||
      String(v.body.nonce) !== v.nonce ||
      !/^[a-f0-9]{96}$/.test(v.body.order) ||
      !/^[a-f0-9]{128}$/.test(v.body.signature) ||
      !/^[a-f0-9]{186}$/.test(v.messageHex)
    )
      throw Error(
        "Retained practice order is unavailable or changed. Do not submit a replacement until its reference is checked.",
      );
    return v;
  }
  write(value: StoredIntent) {
    this.storage.setItem(
      this.key(value.wallet, value.account),
      JSON.stringify(value),
    );
    const read = this.read(value.wallet, value.account);
    if (JSON.stringify(read) !== JSON.stringify(value))
      throw Error(
        "Signed order recovery could not be retained. No submission was made.",
      );
    return value;
  }
}
export class PracticeSubmission {
  private state: IntentView = {
    phase: "review",
    busy: false,
    message:
      "Inspect the exact synthetic replay order before asking your wallet to sign.",
    retained: null,
    status: null,
  };
  private stopped = false;
  private abort = new AbortController();
  private off: () => void;
  constructor(
    private account: PracticeAccount,
    private draft: PreparedDraft | null,
    private manager: SessionManager,
    private http: PracticeHttp,
    private store: PracticeOutbox,
    private changed: (s: IntentView) => void,
  ) {
    this.state.retained = store.read(account.wallet, account.account);
    if (this.state.retained) {
      this.state.phase = this.state.retained.receipt ? "received" : "uncertain";
      this.state.message =
        "An exact signed order is retained. Check or retry this reference before creating a replacement.";
    }
    const epoch = manager.getSnapshot().epoch;
    this.off = manager.subscribe(() => {
      if (manager.getSnapshot().epoch !== epoch) {
        this.abort.abort();
        this.stopped = true;
      }
    });
  }
  snapshot() {
    return this.state;
  }
  private set(p: Partial<IntentView>) {
    if (!this.stopped) {
      this.state = { ...this.state, ...p };
      this.changed(this.state);
    }
  }
  private session() {
    const s = this.manager.getSnapshot();
    if (
      this.stopped ||
      s.phase !== "authenticated" ||
      s.session?.wallet !== this.account.wallet
    )
      throw Error(
        "Sign in with this account's wallet. No order was submitted.",
      );
    return s;
  }
  private async current() {
    this.session();
    const c = await this.http.context(this.account.wallet, this.abort.signal);
    const a = c.accounts.find((a) => a.account === this.account.account);
    if (!a) throw Error("This account is no longer in the practice registry.");
    assertPracticeAccount(a, this.account.wallet);
    if (a.state === "blocked")
      throw Error(a.blocked_reason ?? "Practice account blocked.");
    this.session();
    return a;
  }
  async sign() {
    if (this.state.busy || !this.draft) return;
    if (this.state.retained && !this.state.retained.receipt)
      throw Error("Reconcile the retained signed order first.");
    const session = this.session(),
      d = this.draft;
    if (
      d.scope.account !== this.account.account ||
      d.scope.wallet !== session.session!.wallet_hex ||
      d.scope.sessionEpoch !== session.epoch ||
      d.profile !== "setl8-sdk-dev-v1"
    )
      throw Error("The reviewed order scope changed.");
    this.set({ busy: true, phase: "signing" });
    try {
      const a = await this.current();
      const sdk = await import("@setl8/order-codec");
      const encoded = fromHex(d.orderHex),
        message = sdk.signingMessage(
          accountBytes(a.account),
          Number(BigInt(d.nonce)),
          encoded,
        );
      if (
        !same(message, fromHex(d.messageHex)) ||
        encoded.length !== 48 ||
        message.length !== 93
      )
        throw Error("Canonical SDK signing bytes changed.");
      if (this.state.retained?.nonce === d.nonce)
        throw Error(
          "This order reference is already retained. Retry its exact signed body or choose a different explicit reference.",
        );
      const signed = await this.manager.signSessionMessage(
        a.wallet,
        session.epoch,
        message,
      );
      // Public canonical intent material is retained even if the wallet/session changed
      // while approval was open. Auth cookies, CSRF and login messages never enter it.
      const retained = this.store.write({
        wallet: a.wallet,
        account: a.account,
        nonce: d.nonce,
        messageHex: d.messageHex,
        body: {
          nonce: Number(BigInt(d.nonce)),
          order: d.orderHex,
          signature: hex(signed.signature),
        },
        receipt: null,
        createdAt: new Date().toISOString(),
      });
      if (!signed.current || this.stopped)
        throw Error(
          "Wallet/session changed after signing. Exact original order retained; no app submission occurred.",
        );
      this.set({
        retained,
        phase: "signed",
        message:
          "Exact synthetic replay bytes signed and retained. Submit separately; this is not a token debit.",
      });
    } catch (e) {
      this.set({ phase: "error", message: (e as Error).message });
    } finally {
      this.set({ busy: false });
    }
  }
  async submit() {
    if (this.state.busy) return;
    this.session();
    const retained = this.store.read(this.account.wallet, this.account.account);
    if (!retained) return;
    this.set({ busy: true, phase: "submitting" });
    const timer = setTimeout(() => this.abort.abort(), 12000);
    try {
      await this.current();
      const receipt = await this.http.intent(
        this.account,
        retained.body,
        this.abort.signal,
      );
      const persisted = this.store.write({ ...retained, receipt });
      this.set({
        retained: persisted,
        phase: "received",
        message: `Receipt ${receipt.input_seq}${receipt.duplicate ? " · identical retry" : ""}. Received is not a fill. Positions and canonical journal history update after the backend worker executes.`,
      });
    } catch (e) {
      this.set({
        phase:
          e instanceof ApiError && e.status === 409 ? "conflict" : "uncertain",
        message:
          e instanceof ApiError && e.status === 409
            ? "Order reference conflicts with another payload. No new reference was allocated."
            : "Submission was not confirmed. Retain this exact signed body, check its reference, and explicitly retry identical bytes. " +
              (e as Error).message,
      });
    } finally {
      clearTimeout(timer);
      if (!this.stopped && this.abort.signal.aborted)
        this.abort = new AbortController();
      this.set({ busy: false });
    }
  }
  async reconcile() {
    if (this.state.busy) return;
    const retained = this.store.read(this.account.wallet, this.account.account);
    if (!retained) return;
    this.set({ busy: true });
    try {
      this.session();
      const status = await this.http.status(
        this.account,
        retained.nonce,
        this.abort.signal,
      );
      this.set({
        status,
        retained,
        message: `Intent status: ${status.state}. Completion/finality remain unavailable; inspect the actual positions and journal evidence.`,
        phase: retained.receipt ? "received" : "uncertain",
      });
    } catch (e) {
      this.set({ phase: "uncertain", message: (e as Error).message });
    } finally {
      this.set({ busy: false });
    }
  }
  dispose() {
    this.stopped = true;
    this.abort.abort();
    this.off();
  }
}
