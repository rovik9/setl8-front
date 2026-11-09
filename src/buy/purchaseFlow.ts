import type {
  CheckedPurchase,
  PublicAttempt,
  PurchasePort,
  Reconciliation,
  OwnerReview,
  SimulationEvidence,
} from "./direct-types";
import {
  PublicAttemptStore,
  assertVerifiedForRelease,
  type WithAttemptLock,
} from "./recovery";
import { SignedPurchaseMismatch } from "./signed";
import { verifyWalletReturn } from "./walletReturn";
import type { SignedMismatchDiagnostics } from "./signedDiagnostics";
import { fromHex } from "./bytes";
import identity from "../purchase/p30-artifact.json";
export interface PurchaseSigner {
  address: string;
  signTransaction(packet: Uint8Array): Promise<Uint8Array>;
}
export interface PurchaseState {
  phase:
    | "idle"
    | "checking"
    | "ready"
    | "blocked"
    | "simulating"
    | "awaiting_wallet"
    | "sending"
    | "uncertain"
    | "confirmed"
    | "finalized_observed"
    | "verified";
  wallet: string | null;
  tier: string;
  epoch: number;
  checked: CheckedPurchase | null;
  simulation: SimulationEvidence | null;
  attempt: Readonly<PublicAttempt> | null;
  result: Reconciliation | null;
  error: string | null;
  /** Public-only facts about a refused wallet response; in memory, never persisted. */
  diagnostics?: SignedMismatchDiagnostics | null;
}
export class PurchaseFlow {
  private value: PurchaseState = {
    phase: "idle",
    wallet: null,
    tier: "0",
    epoch: 0,
    checked: null,
    simulation: null,
    attempt: null,
    result: null,
    error: null,
  };
  private listeners = new Set<() => void>();
  private abort = new AbortController();
  private busy = false;
  constructor(
    readonly port: PurchasePort,
    private store: PublicAttemptStore,
    private lock: WithAttemptLock,
    private now = () => Date.now(),
  ) {}
  getSnapshot = () => this.value;
  subscribe = (f: () => void) => {
    this.listeners.add(f);
    return () => {
      this.listeners.delete(f);
    };
  };
  private set(p: Partial<PurchaseState>) {
    this.value = Object.freeze({ ...this.value, ...p });
    for (const f of this.listeners) f();
  }
  async restore() {
    try {
      const a = await this.store.read();
      if (a)
        this.set({
          attempt: a,
          phase: "uncertain",
          error:
            "An earlier public attempt is retained. Reconcile it before another payment; wallet switches and expiry do not clear it.",
        });
    } catch {
      this.set({
        phase: "blocked",
        error:
          "Recovery storage is unavailable or changed. Wallet approval is blocked.",
      });
    }
  }
  select(wallet: string | null, tier: string) {
    this.abort.abort();
    this.abort = new AbortController();
    this.set({
      wallet,
      tier,
      epoch: this.value.epoch + 1,
      checked: null,
      simulation: null,
      result: null,
      phase: this.value.attempt
        ? "uncertain"
        : this.value.phase === "blocked"
          ? "blocked"
          : "idle",
      error: this.value.attempt
        ? "The original attempt remains locked across wallet/account changes."
        : null,
    });
  }
  async check() {
    if (
      this.busy ||
      this.value.attempt ||
      this.value.phase === "blocked" ||
      !this.value.wallet
    )
      return;
    this.busy = true;
    const { wallet, tier, epoch } = this.value,
      signal = this.abort.signal;
    this.set({
      phase: "checking",
      error: null,
      checked: null,
      diagnostics: null,
    });
    try {
      if (await this.store.read())
        throw Error("An earlier attempt exists. Reload and reconcile it.");
      const c = await this.port.check(wallet, tier, epoch, signal);
      if (epoch !== this.value.epoch || signal.aborted) return;
      if (
        c.wallet !== wallet ||
        c.epoch !== epoch ||
        c.tier !== tier ||
        c.prepared.context.expectedAccount !== c.expectedAccount
      )
        throw Error("The checked purchase context changed.");
      this.set({ phase: "ready", checked: c });
    } catch (e) {
      if (epoch === this.value.epoch)
        this.set({
          phase: "idle",
          error:
            e instanceof Error
              ? e.message
              : "The public read could not be completed.",
        });
    } finally {
      this.busy = false;
    }
  }
  async approve(signer: PurchaseSigner, review?: OwnerReview) {
    if (this.port.mode !== "offline_mock" && !this.port.assertExecution) {
      this.set({
        error:
          "Real wallet approval/broadcast is disabled pending Origin review and explicit owner authorization.",
      });
      return;
    }
    if (this.busy || !this.value.checked || this.value.attempt) return;
    const c = this.value.checked,
      epoch = this.value.epoch,
      signal = this.abort.signal;
    try {
      this.port.assertExecution?.(c, review);
    } catch (e) {
      this.set({
        error: e instanceof Error ? e.message : "Checkout release is closed.",
      });
      return;
    }
    this.busy = true;
    try {
      await this.lock(async () => {
        if (await this.store.read())
          throw Error("Another public attempt is already retained.");
        if (
          epoch !== this.value.epoch ||
          c.wallet !== signer.address ||
          this.now() < Number(c.checkedAt) ||
          this.now() >= Number(c.expiresAt)
        )
          throw Error(
            "Refresh the wallet and expired review before any prompt.",
          );
        await this.port.revalidate(c, signal, "pre_wallet");
        if (
          epoch !== this.value.epoch ||
          signal.aborted ||
          this.now() < Number(c.checkedAt) ||
          this.now() >= Number(c.expiresAt)
        )
          throw Error(
            "Wallet/account selection changed or the original review expired.",
          );
        const a: PublicAttempt = {
          format: "setl8-direct-demo-attempt-v1",
          profile: identity.profile,
          source: identity.source_archive_sha256,
          npm: identity.npm_sha256,
          descriptor: identity.descriptor_sha256,
          wallet: c.wallet,
          tier: c.tier,
          size: c.size,
          price: c.price,
          fee: c.fee,
          total: c.total,
          expectedAccount: c.expectedAccount,
          nextChallengeId: c.nextChallengeId,
          blockhash: c.blockhash,
          lastValidBlockHeight: c.lastValidBlockHeight,
          messageHex: c.prepared.messageHex,
          messageSha256: c.prepared.messageSha256,
          fingerprint: c.fingerprint,
          minSlot: c.minSlot,
          createdAt: String(this.now()),
          signature: null,
          signedMessageHex: null,
          signedMessageSha256: null,
          computeUnitPriceMicroLamports: null,
          priorityFeeLamports: null,
          stage: "awaiting_wallet",
        };
        const retained = await this.store.write(a);
        this.set({
          attempt: retained,
          phase: "awaiting_wallet",
          checked: null,
        });
        if (
          epoch !== this.value.epoch ||
          signal.aborted ||
          this.now() < Number(c.checkedAt) ||
          this.now() >= Number(c.expiresAt)
        )
          throw Error(
            "The retained review expired or changed before prompting. Reconcile the attempt; no wallet request occurred.",
          );
        if (this.port.simulate) {
          this.set({ phase: "simulating" });
          const evidence = await this.port.simulate(
            c,
            fromHex(c.prepared.unsignedTransactionHex),
            false,
            signal,
            review,
          );
          if (
            evidence.messageSha256 !== c.prepared.messageSha256 ||
            evidence.sigVerify !== false ||
            evidence.advisory !== true
          )
            throw Error(
              "Unsigned simulation evidence differs from the reviewed message.",
            );
          this.set({ simulation: evidence });
        }
        this.port.assertExecution?.(c, review);
        if (
          epoch !== this.value.epoch ||
          signal.aborted ||
          this.now() < Number(c.checkedAt) ||
          this.now() >= Number(c.expiresAt)
        )
          throw Error(
            "Review expired or wallet changed before approval. The attempt remains retained.",
          );
        this.set({ phase: "awaiting_wallet" });
        const signed = new Uint8Array(
          await signer.signTransaction(
            fromHex(c.prepared.unsignedTransactionHex),
          ),
        );
        // The wallet may add one capped ComputeBudget price instruction; anything else is refused.
        // The returned message (not the prepared one) is what is retained, simulated, sent and reconciled.
        const returned = await verifyWalletReturn(signed, c, a.wallet),
          signature = returned.signature;
        const withSignature = await this.store.write({
          ...a,
          signature,
          signedMessageHex: returned.messageHex,
          signedMessageSha256: returned.messageSha256,
          computeUnitPriceMicroLamports: returned.priceMicroLamportsPerCu,
          priorityFeeLamports: returned.priorityFeeLamports,
          stage: "signed",
        });
        this.set({ attempt: withSignature });
        if (epoch !== this.value.epoch || signal.aborted)
          throw Error(
            "Wallet changed after approval. The signed signature is retained; no app broadcast occurred.",
          );
        await this.port.revalidate(c, signal, "pre_send");
        if (epoch !== this.value.epoch || signal.aborted)
          throw Error(
            "Purchase state changed after signing. Reconcile; no app broadcast occurred.",
          );
        if (this.port.simulate) {
          this.set({ phase: "simulating" });
          const evidence = await this.port.simulate(
            c,
            signed,
            true,
            signal,
            review,
          );
          if (
            evidence.messageSha256 !== returned.messageSha256 ||
            evidence.sigVerify !== true ||
            evidence.advisory !== true
          )
            throw Error(
              "Signed simulation evidence differs from the retained exact message.",
            );
          this.set({ simulation: evidence });
        }
        const retainedNow = await this.store.read();
        if (
          !retainedNow ||
          retainedNow.signature !== signature ||
          retainedNow.messageSha256 !== a.messageSha256 ||
          retainedNow.signedMessageSha256 !== returned.messageSha256 ||
          retainedNow.wallet !== a.wallet
        )
          throw Error(
            "The exact public signature/attempt is no longer durably retained. No app send permitted.",
          );
        this.port.assertExecution?.(c, review);
        if (
          epoch !== this.value.epoch ||
          signal.aborted ||
          this.now() < Number(c.checkedAt) ||
          this.now() >= Number(c.expiresAt)
        )
          throw Error(
            "Review expired or wallet changed before send. Reconcile the retained signature.",
          );
        this.set({ phase: "sending" });
        await this.port.broadcast(signed, signature, signal, c, review);
        this.set({
          phase: "uncertain",
          error:
            "A send response is not confirmation. Check finalized receipt/account evidence.",
        });
      });
    } catch (e) {
      this.set({
        phase: this.value.attempt ? "uncertain" : "blocked",
        error:
          e instanceof Error
            ? e.message
            : "The outcome is uncertain. Do not repay.",
        diagnostics: e instanceof SignedPurchaseMismatch ? e.diagnostics : null,
      });
    } finally {
      this.busy = false;
    }
  }
  async checkAgain() {
    if (this.busy || !this.value.attempt) return;
    this.busy = true;
    const a = this.value.attempt,
      epoch = this.value.epoch,
      signal = this.abort.signal;
    try {
      const r = await this.port.reconcile(a, signal);
      if (epoch !== this.value.epoch || signal.aborted) return;
      let retained = a;
      if (r.state === "verified" || r.state === "finalized_observed") {
        // Compare-and-swap under the attempt lock: another tab may have released this purchase (or begun a new
        // one) while the check ran. Only the record that was checked is ever updated; never a different one.
        const next = { ...a, stage: r.state };
        retained = await this.lock(async () => {
          const stored = await this.store.read();
          if (!stored || JSON.stringify(stored) !== JSON.stringify(a))
            throw Error(
              "This purchase changed in another tab. Reload before checking again.",
            );
          return this.store.write(next);
        });
      }
      this.set({ phase: r.state, attempt: retained, result: r, error: null });
    } catch (e) {
      if (epoch === this.value.epoch)
        this.set({
          phase: "uncertain",
          error:
            e instanceof Error
              ? e.message
              : "Evidence remains incomplete. Do not repay.",
        });
    } finally {
      this.busy = false;
    }
  }
  /**
   * Close a finished purchase so another can start. Only for an attempt that is signed, recorded as verified AND
   * that reconcilePurchase verifies again right now. The full record is appended to the verified-purchase archive
   * first; only then is the lock key removed. Any other attempt (unsigned, uncertain, confirmed, unverified,
   * mismatching evidence) throws and leaves the lock untouched.
   */
  async startAnother() {
    if (this.busy || !this.value.attempt) return;
    this.busy = true;
    const a = this.value.attempt,
      epoch = this.value.epoch,
      signal = this.abort.signal;
    try {
      await this.lock(async () => {
        assertVerifiedForRelease(a, {
          state: "verified",
          message: "",
          signature: a.signature ?? undefined,
          account: a.expectedAccount,
          actualDebit: a.total,
        });
        const r = await this.port.reconcile(a, signal);
        if (epoch !== this.value.epoch || signal.aborted)
          throw Error("Cancelled; the purchase lock stays.");
        if (r.state !== "verified") {
          this.set({ phase: r.state, result: r, error: null });
          throw Error(
            "The purchase is not verified right now, so it stays locked. " +
              r.message,
          );
        }
        await this.store.archiveVerifiedAndRelease(a, r, this.now());
      });
      this.set({
        attempt: null,
        result: null,
        checked: null,
        simulation: null,
        diagnostics: null,
        error: null,
        phase: "idle",
        epoch: this.value.epoch + 1,
      });
    } finally {
      this.busy = false;
    }
  }
  dispose() {
    this.abort.abort();
    this.listeners.clear();
  }
}
