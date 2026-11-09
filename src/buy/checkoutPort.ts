import type { SessionManager } from "../auth/session";
import type {
  PurchasePort,
  CheckedPurchase,
  OwnerReview,
  SimulationEvidence,
} from "./direct-types";
import { DirectRpc } from "./rpc";
import { PurchasePreflight } from "./preflight";
import { reconcilePurchase } from "./receipt";
import {
  assertLiveRelease,
  assertOwnerReview,
  assertReviewedOwnerCheckoutScope,
  OWNER_RELEASE,
  ownerCheckoutRestriction,
} from "./executionGate";
import { b64, fromHex, same, u64, safeNumber } from "./bytes";
import { verifyWalletReturn } from "./walletReturn";
import { loadAccountDerivation } from "./accountDerivation";
type Preflight = Pick<PurchasePreflight, "check" | "revalidate"> & {
  contextFloor?(c: CheckedPurchase): string;
};
class CheckoutPort implements PurchasePort {
  readonly requiresOwnerReview = true;
  private sendEntered = false;
  private simulations = new WeakMap<
    CheckedPurchase,
    {
      unsigned?: SimulationEvidence;
      signed?: { evidence: SimulationEvidence; signature: string };
    }
  >();
  constructor(
    readonly mode: "gated_live" | "offline_mock",
    private rpc: DirectRpc,
    private preflight: Preflight,
    private now = () => Date.now(),
    private auth?: Pick<SessionManager, "isPurchaseWallet">,
  ) {}
  purchaseRestriction(
    wallet: string,
    tier: string,
    checked?: CheckedPurchase | null,
  ) {
    return this.mode === "offline_mock"
      ? null
      : ownerCheckoutRestriction(wallet, tier, checked, this.now());
  }
  canRequestApproval(wallet: string) {
    if (this.mode === "offline_mock") return true;
    try {
      assertLiveRelease(wallet, this.now());
      return this.auth?.isPurchaseWallet(wallet) === true;
    } catch {
      return false;
    }
  }
  assertExecution(c: CheckedPurchase, review: OwnerReview | undefined) {
    if (this.mode === "gated_live") {
      assertLiveRelease(c.wallet, this.now());
      if (!this.auth?.isPurchaseWallet(c.wallet))
        throw Error(
          "Sign in and connect the same wallet with devnet transaction support before approving a purchase.",
        );
      assertReviewedOwnerCheckoutScope(c, review, OWNER_RELEASE, this.now());
    } else assertOwnerReview(c, review, this.now());
  }
  check = async (
    wallet: string,
    tier: string,
    epoch: number,
    signal: AbortSignal,
  ) => {
    if (this.mode === "gated_live" && !this.auth?.isPurchaseWallet(wallet))
      throw Error(
        "Sign in and connect the same devnet wallet before reviewing a purchase.",
      );
    // The owner gate derives the account address itself at approval time; it needs the SDK loaded by then.
    await loadAccountDerivation();
    return this.preflight.check(wallet, tier, epoch, signal);
  };
  revalidate = (c: CheckedPurchase, signal: AbortSignal, phase?: string) =>
    this.preflight.revalidate(c, signal, phase);
  async simulate(
    c: CheckedPurchase,
    packet: Uint8Array,
    sigVerify: boolean,
    signal: AbortSignal,
    review?: OwnerReview,
  ): Promise<SimulationEvidence> {
    if (this.mode === "gated_live") this.assertExecution(c, review);
    if (
      this.now() < Number(c.checkedAt) ||
      this.now() >= Number(c.expiresAt) ||
      signal.aborted
    )
      throw Error(
        "Exact-message simulation needs a fresh uninterrupted review.",
      );
    let signature: string | undefined,
      evidenceHash = c.prepared.messageSha256;
    if (sigVerify) {
      // The signed simulation runs the returned packet exactly; its hash is the returned message's.
      const returned = await verifyWalletReturn(packet, c, c.wallet);
      signature = returned.signature;
      evidenceHash = returned.messageSha256;
    } else if (!same(packet, fromHex(c.prepared.unsignedTransactionHex)))
      throw Error(
        "Unsigned simulation packet differs from the exact compiled transaction.",
      );
    const floor = this.preflight.contextFloor?.(c) ?? c.minSlot;
    this.rpc.mark(sigVerify ? "signed_simulation" : "unsigned_simulation");
    const r = await this.rpc.read(
        0,
        "simulateTransaction",
        [
          b64(packet),
          {
            encoding: "base64",
            sigVerify,
            replaceRecentBlockhash: false,
            commitment: "confirmed",
            minContextSlot: safeNumber(floor),
          },
        ],
        signal,
      ),
      v = r?.value,
      slot = u64(r?.context?.slot),
      units = u64(v?.unitsConsumed);
    if (
      !v ||
      v.err !== null ||
      v.replacementBlockhash != null ||
      BigInt(slot) < BigInt(floor) ||
      BigInt(units) > BigInt(c.prepared.computeUnitLimit) ||
      !Array.isArray(v.logs) ||
      v.logs.length > 512 ||
      v.logs.some(
        (s: unknown) =>
          typeof s !== "string" || s.length > 2048 || /truncat/i.test(s),
      )
    )
      throw Error(
        "Exact-message simulation failed or its context/diagnostics are incomplete. No wallet prompt/send is permitted.",
      );
    if (
      signal.aborted ||
      this.now() < Number(c.checkedAt) ||
      this.now() >= Number(c.expiresAt)
    )
      throw Error("Review expired or changed during simulation.");
    if (this.mode === "gated_live") this.assertExecution(c, review);
    const evidence = Object.freeze({
        messageSha256: evidenceHash,
        sigVerify,
        slot,
        unitsConsumed: units,
        observedAt: String(this.now()),
        advisory: true as const,
      }),
      state = this.simulations.get(c) ?? {};
    if (sigVerify) state.signed = { evidence, signature: signature! };
    else state.unsigned = evidence;
    this.simulations.set(c, state);
    return evidence;
  }
  async broadcast(
    packet: Uint8Array,
    signature: string,
    signal: AbortSignal,
    c?: CheckedPurchase,
    review?: OwnerReview,
  ) {
    if (!c) throw Error("Exact checked context is required before send.");
    this.assertExecution(c, review);
    const simulations = this.simulations.get(c);
    if (
      !simulations?.unsigned ||
      !simulations.signed ||
      simulations.signed.signature !== signature
    )
      throw Error(
        "Successful original unsigned and exact signed-packet simulations are required.",
      );
    if (this.sendEntered)
      throw Error(
        "An app send was already entered. Reconcile the retained signature; never resend.",
      );
    if (signal.aborted)
      throw Error("Send cancelled; reconcile the retained signature.");
    this.sendEntered = true;
    this.rpc.mark("send");
    await this.rpc.sendExact(
      packet,
      signature,
      { ...c, minSlot: this.preflight.contextFloor?.(c) ?? c.minSlot },
      signal,
      () => this.assertExecution(c, review),
    );
  }
  measurements = () => this.rpc.measurements();
  reconcile = (a: Parameters<PurchasePort["reconcile"]>[0], s: AbortSignal) =>
    reconcilePurchase(this.rpc, a, s);
}
export function createGatedCheckoutPort(
  auth?: Pick<SessionManager, "isPurchaseWallet">,
): PurchasePort {
  const rpc = new DirectRpc();
  return new CheckoutPort(
    "gated_live",
    rpc,
    new PurchasePreflight(rpc),
    () => Date.now(),
    auth,
  );
}
/** Explicit offline dependency injection for the separate test harness. Never selected by URL/env/storage. */
export function createOfflineCheckoutPort(
  fetcher: typeof fetch,
  preflight: Preflight | undefined,
  now = () => Date.now(),
): PurchasePort {
  const rpc = new DirectRpc(fetcher, now);
  return new CheckoutPort(
    "offline_mock",
    rpc,
    preflight ?? new PurchasePreflight(rpc, now),
    now,
  );
}
