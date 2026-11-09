import { api, ApiError, type ApiClient } from "../api/client";
import type {
  IntentReceipt,
  IntentStatus,
  SignedIntent,
} from "../api/frontend-v1";
import type { PreparedDraft } from "../data/orderDraft";
import {
  assertSyntheticDraft,
  prototypeBridge,
  prototypeEnabled,
  type PrototypeBridge,
} from "./profile";
export interface SubmissionState {
  phase:
    | "unsigned"
    | "signing"
    | "signed"
    | "submitting"
    | "received"
    | "uncertain"
    | "conflict"
    | "error";
  busy: boolean;
  message: string;
  receipt: IntentReceipt | null;
  status: IntentStatus | null;
}
/** One inspected payload per owner. Retries always reuse the immutable signed body; no auto nonce allocation. */
export class SyntheticSubmission {
  private body: Readonly<SignedIntent> | null = null;
  private stopped = false;
  private request: AbortController | null = null;
  private state: SubmissionState = {
    phase: "unsigned",
    busy: false,
    message: "Inspect the exact bytes before signing.",
    receipt: null,
    status: null,
  };
  constructor(
    private draft: PreparedDraft,
    private bridge: PrototypeBridge,
    private walletHex: string,
    private changed: (s: SubmissionState) => void,
    private client: ApiClient = api,
    private onDiscard: (nonce: string) => void = () => {},
    private gate: () => boolean = () =>
      prototypeEnabled() && prototypeBridge() === bridge,
  ) {}
  private set(patch: Partial<SubmissionState>) {
    if (!this.stopped) {
      this.state = { ...this.state, ...patch };
      this.changed(this.state);
    }
  }
  snapshot() {
    return this.state;
  }
  private guard() {
    if (
      this.stopped ||
      !this.gate() ||
      this.client.base !== "http://127.0.0.1:8790"
    )
      throw new Error(
        "Synthetic submission is disabled for this frontend profile.",
      );
    assertSyntheticDraft(this.draft, this.bridge.info, this.walletHex);
  }
  async sign() {
    if (this.state.busy || this.body) return;
    this.guard();
    this.set({
      busy: true,
      phase: "signing",
      message: "Signing the inspected bytes with the disposable session key…",
    });
    try {
      const signature = await this.bridge.signOrder(this.draft);
      if (this.stopped) return;
      this.guard();
      if (!/^[a-f0-9]{128}$/.test(signature))
        throw new Error("Invalid disposable signature.");
      this.body = Object.freeze({
        nonce: Number(BigInt(this.draft.nonce)),
        order: this.draft.orderHex,
        signature,
      });
      this.set({
        phase: "signed",
        message: "Exact inspected bytes signed locally. No intent sent yet.",
      });
    } catch (e) {
      if (!this.stopped)
        this.set({ phase: "error", message: (e as Error).message });
    } finally {
      this.set({ busy: false });
    }
  }
  async submit() {
    if (this.state.busy || !this.body) return;
    this.guard();
    const body = this.body;
    const request = new AbortController();
    this.request = request;
    const timer = setTimeout(() => request.abort(), 12000);
    this.set({
      busy: true,
      phase: "submitting",
      message:
        "Sending the same signed payload. A lost response may follow a committed receipt.",
    });
    try {
      const receipt = await this.client.request<IntentReceipt>(
        `/v1/accounts/${this.draft.scope.account}/intents`,
        { body, protectedPost: true, signal: request.signal },
      );
      if (this.stopped) return;
      this.guard();
      if (receipt.state !== "received" || !/^\d+$/.test(receipt.input_seq))
        throw new Error("Unexpected receipt shape; reconcile this nonce.");
      this.set({
        phase: "received",
        receipt,
        message: `Durable receipt ${receipt.input_seq}${receipt.duplicate ? " · identical retry confirmed" : ""}. Received does not mean evaluated or finalized.`,
      });
    } catch (e) {
      if (this.stopped) return;
      if (e instanceof ApiError && e.status === 409) {
        this.set({
          phase: "conflict",
          message:
            "Nonce conflict: another payload already occupies this nonce. No new nonce was allocated.",
        });
      } else if (
        e instanceof ApiError &&
        [400, 401, 403, 404, 422].includes(e.status)
      ) {
        this.body = null;
        this.set({
          phase: "error",
          message:
            e.status === 401
              ? "Session expired; signed material cleared."
              : e.message,
        });
      } else
        this.set({
          phase: "uncertain",
          message:
            "Receipt uncertain. Keep these exact signed bytes; inspect the nonce, then retry the identical payload to confirm it. Do not guess a new nonce.",
        });
    } finally {
      clearTimeout(timer);
      this.request = null;
      this.set({ busy: false });
    }
  }
  async reconcile() {
    if (this.state.busy) return;
    this.guard();
    const request = new AbortController();
    this.request = request;
    const timer = setTimeout(() => request.abort(), 12000);
    this.set({ busy: true });
    try {
      const status = await this.client.request<IntentStatus>(
        `/v1/accounts/${this.draft.scope.account}/intents/${this.draft.nonce}`,
        { signal: request.signal },
      );
      if (this.stopped) return;
      this.guard();
      this.set({
        status,
        message: `Recorded intent state: ${status.state}. A status read alone does not bind an uncertain payload; identical POST retry confirms its exact bytes. Complete outcomes and chain finality remain unavailable.`,
      });
    } catch (e) {
      if (!this.stopped)
        this.set({
          message:
            e instanceof ApiError && e.status === 404
              ? "No receipt is visible for this nonce. This is not proof a timed-out request cannot commit; retry the same payload."
              : (e as Error).message,
        });
    } finally {
      clearTimeout(timer);
      this.request = null;
      this.set({ busy: false });
    }
  }
  dispose() {
    if (this.state.phase === "submitting" || this.state.phase === "uncertain")
      this.onDiscard(this.draft.nonce);
    this.stopped = true;
    this.request?.abort();
    this.body = null;
  }
}
