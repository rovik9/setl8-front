import { marketSizeProblem } from "./marketSize";
import { fixed } from "../data/exact";
import { signingMessage, decodeOrder, IntentKind } from "@setl8/order-codec";
import type { DevnetRecordedIntent } from "../api/devnet-execution-v1";
import type { SignedIntent, IntentReceipt } from "../api/frontend-v1";
import type { PreparedDraft } from "../data/orderDraft";
import type { SessionManager } from "../auth/session";
import { fromHex, hex, same } from "../buy/bytes";
import { assertDevnetOrderRelease, nonceU32 } from "./execution";
export type DevnetSignedRecord = {
  format: "setl8-genuine-devnet-intent-v1";
  wallet: string;
  account: string;
  messageHex: string;
  nonce: string;
  body: SignedIntent;
  receipt: IntentReceipt | null;
  submission: "not_sent" | "uncertain" | "received" | "retired_not_sent";
  recorded?: DevnetRecordedIntent;
  createdAt: string;
};
export interface PublicIntentStorage {
  getItem(k: string): string | null;
  setItem(k: string, v: string): void;
}
export class DevnetIntentStore {
  constructor(private storage: PublicIntentStorage) {}
  key(wallet: string, account: string) {
    return "setl8.genuine-devnet.intent.v1:" + wallet + ":" + account;
  }
  read(wallet: string, account: string): DevnetSignedRecord | null {
    const raw = this.storage.getItem(this.key(wallet, account));
    if (!raw) return null;
    const r = JSON.parse(raw) as DevnetSignedRecord;
    if (
      r.format !== "setl8-genuine-devnet-intent-v1" ||
      r.wallet !== wallet ||
      r.account !== account ||
      !Number.isSafeInteger(r.body?.nonce) ||
      String(r.body?.nonce) !== r.nonce ||
      !/^[a-f0-9]{96}$/.test(r.body.order) ||
      !/^[a-f0-9]{128}$/.test(r.body.signature) ||
      !/^[a-f0-9]{186}$/.test(r.messageHex)
    )
      throw Error(
        "Devnet signed-intent recovery is changed or unavailable. No replacement order may be inferred.",
      );
    const message = signingMessage(
      fromHex(account),
      nonceU32(r.nonce),
      fromHex(r.body.order),
    );
    const order = decodeOrder(fromHex(r.body.order));
    if (
      hex(message) !== r.messageHex ||
      !["not_sent", "uncertain", "received", "retired_not_sent"].includes(
        r.submission,
      ) ||
      ![IntentKind.Market, IntentKind.Close].includes(order.kind) ||
      order.market !== 0 ||
      order.priceE12 !== 0n ||
      order.slE12 !== 0n ||
      order.tpE12 !== 0n ||
      order.targetNonce !== 0 ||
      (order.kind === IntentKind.Close && order.qty !== 0n)
    )
      throw Error(
        "Retained canonical message or finite order scope changed. Recovery is blocked.",
      );
    if (
      r.receipt &&
      (r.receipt.api_version !== "1" ||
        r.receipt.state !== "received" ||
        !/^[1-9]\d*$/.test(r.receipt.input_seq))
    )
      throw Error("Retained receipt is invalid.");
    if (r.recorded) assertRecordedIntent(r, r.recorded);
    return r;
  }
  update(r: DevnetSignedRecord) {
    const latest = this.read(r.wallet, r.account);
    if (
      latest?.body.signature === r.body.signature &&
      latest?.messageHex === r.messageHex
    )
      return this.write(r);
    // A late original response cannot replace a newer account-local recovery record.
    this.storage.setItem(
      this.key(r.wallet, r.account) + ":" + r.nonce + ":" + r.body.signature,
      JSON.stringify(r),
    );
    return r;
  }
  write(r: DevnetSignedRecord) {
    const payload = JSON.stringify(r),
      key = this.key(r.wallet, r.account);
    this.storage.setItem(key + ":" + r.nonce + ":" + r.body.signature, payload);
    this.storage.setItem(key, payload);
    if (JSON.stringify(this.read(r.wallet, r.account)) !== payload)
      throw Error(
        "Exact signed-intent recovery could not be retained. Submission is blocked.",
      );
    return r;
  }
}
const signing = new Set<string>();
/** Default actual authority gate is closed. Tests can inject an explicit offline gate. */
export async function retainApprovedDevnetMessage(
  d: PreparedDraft,
  wallet: string,
  manager: Pick<SessionManager, "getSnapshot" | "signSessionMessage">,
  store: DevnetIntentStore,
  gate: () => void = () => assertDevnetOrderRelease(d.scope.account!, wallet),
) {
  gate();
  const before = manager.getSnapshot();
  if (
    before.phase !== "authenticated" ||
    before.session?.wallet !== wallet ||
    before.epoch !== d.scope.sessionEpoch ||
    before.session.wallet_hex !== d.scope.wallet
  )
    throw Error("Reviewed devnet order/session identity changed.");
  const sdk = await import("@setl8/order-codec");
  const order = fromHex(d.orderHex),
    canonical = sdk.signingMessage(
      fromHex(d.scope.account!),
      nonceU32(d.nonce),
      order,
    ),
    decoded = sdk.decodeOrder(order);
  if (
    !same(canonical, fromHex(d.messageHex)) ||
    ![sdk.IntentKind.Market, sdk.IntentKind.Close].includes(decoded.kind) ||
    decoded.market !== 0 ||
    decoded.priceE12 !== 0n ||
    decoded.slE12 !== 0n ||
    decoded.tpE12 !== 0n ||
    decoded.targetNonce !== 0 ||
    (decoded.kind === sdk.IntentKind.Close && decoded.qty !== 0n)
  )
    throw Error(
      "Reviewed genuine-account canonical bytes or finite order scope differ.",
    );
  const sizeProblem = marketSizeProblem(
    fixed(decoded.qty.toString(), 6, 6, false),
    decoded.kind === sdk.IntentKind.Close ? "Close" : "Market",
  );
  if (sizeProblem) throw Error(sizeProblem);
  const prior = store.read(wallet, d.scope.account!);
  if (
    prior &&
    (prior.submission === "not_sent" ||
      prior.submission === "uncertain" ||
      (prior.nonce === d.nonce && prior.submission !== "retired_not_sent"))
  )
    throw Error(
      "Retained signed reference must be resolved or explicitly retired before a new signature. Never replace an uncertain submission.",
    );
  const lock = store.key(wallet, d.scope.account!);
  if (signing.has(lock))
    throw Error("A wallet approval for this account is already in progress.");
  signing.add(lock);
  let signed: Awaited<ReturnType<SessionManager["signSessionMessage"]>>;
  let retained: DevnetSignedRecord;
  try {
    signed = await manager.signSessionMessage(
      wallet,
      before.epoch,
      fromHex(d.messageHex),
    );
    retained = store.write({
      format: "setl8-genuine-devnet-intent-v1",
      wallet,
      account: d.scope.account!,
      messageHex: d.messageHex,
      nonce: d.nonce,
      body: {
        nonce: Number(BigInt(d.nonce)),
        order: d.orderHex,
        signature: hex(signed.signature),
      },
      receipt: null,
      submission: "not_sent",
      createdAt: new Date().toISOString(),
    });
  } finally {
    signing.delete(lock);
  }
  const now = manager.getSnapshot();
  return {
    retained,
    current:
      signed.current &&
      now.phase === "authenticated" &&
      now.epoch === before.epoch &&
      now.session?.wallet === wallet,
  };
}

export function assertRecordedIntent(
  r: DevnetSignedRecord,
  v: DevnetRecordedIntent,
) {
  if (
    v.api_version !== "1" ||
    v.devnet_execution_version !== "1" ||
    v.account !== r.account ||
    v.signed_intent.nonce !== r.body.nonce ||
    v.signed_intent.order !== r.body.order ||
    v.signed_intent.signature !== r.body.signature ||
    !/^[a-f0-9]{64}$/.test(v.recorded_input_sha256) ||
    !/^[1-9]\d*$/.test(v.input_seq) ||
    (r.receipt && r.receipt.input_seq !== v.input_seq)
  )
    throw Error(
      "Recorded account/reference/payload does not match the retained signature. No replacement or retry is permitted.",
    );
}
export interface DevnetIntentTransport {
  submit(
    wallet: string,
    account: string,
    body: SignedIntent,
    signal?: AbortSignal,
  ): Promise<IntentReceipt>;
  recoverReceipt(
    account: string,
    body: SignedIntent,
    signal?: AbortSignal,
  ): Promise<DevnetRecordedIntent>;
}
/** One explicit operation per instance. Persist uncertainty before forwarding any bytes. */
export class DevnetIntentRecovery {
  private abort = new AbortController();
  private busy = false;
  constructor(
    private wallet: string,
    private account: string,
    private store: DevnetIntentStore,
    private transport: DevnetIntentTransport,
    private current: () => boolean,
  ) {}
  dispose() {
    this.abort.abort();
  }
  private scope() {
    if (this.abort.signal.aborted || !this.current())
      throw Error(
        "Wallet/account session changed. Original signed bytes remain retained.",
      );
  }
  private record() {
    this.scope();
    const r = this.store.read(this.wallet, this.account);
    if (!r)
      throw Error(
        "No exact signed intent is retained for this wallet/account.",
      );
    return r;
  }
  async submit(expected?: DevnetSignedRecord) {
    if (this.busy) throw Error("A receipt operation is already in progress.");
    let r = this.record();
    if (
      expected &&
      (r.nonce !== expected.nonce ||
        r.messageHex !== expected.messageHex ||
        r.body.order !== expected.body.order ||
        r.body.signature !== expected.body.signature)
    )
      throw Error(
        "Retained candidate changed after review. No replacement was forwarded.",
      );
    if (r.submission !== "not_sent")
      throw Error(
        "This signature was already forwarded or retired. Check its exact receipt; no repeat POST is issued.",
      );
    this.busy = true;
    try {
      // Local storage failure prevents POST. Once dispatched, even cancellation or 401 leaves uncertainty.
      r = this.store.write({ ...r, submission: "uncertain" });
      this.scope();
      const receipt = await this.transport.submit(
        this.wallet,
        this.account,
        { ...r.body },
        this.abort.signal,
      );
      if (
        receipt.api_version !== "1" ||
        receipt.state !== "received" ||
        !/^[1-9]\d*$/.test(receipt.input_seq)
      )
        throw Error(
          "Receipt response is invalid. Check the exact retained reference.",
        );
      // Public evidence belongs to the original identity even if its response arrived after switching.
      const saved = this.store.update({
        ...r,
        submission: "received",
        receipt,
      });
      this.scope();
      return saved;
    } finally {
      this.busy = false;
    }
  }
  async reconcile() {
    if (this.busy) throw Error("A receipt operation is already in progress.");
    const r = this.record();
    if (r.submission === "retired_not_sent")
      throw Error("This unsent signature was retired locally.");
    this.busy = true;
    try {
      const recorded = await this.transport.recoverReceipt(
        this.account,
        { ...r.body },
        this.abort.signal,
      );
      assertRecordedIntent(r, recorded);
      const saved = this.store.update({
        ...r,
        submission: "received",
        recorded,
      });
      this.scope();
      return saved;
    } finally {
      this.busy = false;
    }
  }
  retireUnsent(currentClock: string) {
    const r = this.record();
    if (this.busy || r.submission !== "not_sent" || r.receipt || r.recorded)
      throw Error(
        "Only a signature never forwarded by this app can be retired. Uncertain submission remains blocked.",
      );
    const order = decodeOrder(fromHex(r.body.order));
    const delta = BigInt(currentClock) - order.clientTime;
    if (delta <= 5n)
      throw Error(
        "Refresh actual context until this exact signature is stale before explicitly retiring it.",
      );
    return this.store.write({ ...r, submission: "retired_not_sent" });
  }
}
