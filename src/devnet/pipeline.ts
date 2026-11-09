import bs58 from "bs58";
import { ApiClient, api } from "../api/client";
import { DEV_API_URL, DEV_ORIGIN } from "../api/profile";
import { hash, hex } from "../buy/bytes";
import type {
  DevnetPipelineJob,
  ObservePurchaseRequest,
  PrepareSourceRequest,
} from "../api/devnet-chain-evidence-v1";
import type { PublicIntentStorage } from "./intentRecovery";
export const DEVNET_JOB_RELEASE = Object.freeze({
  read: false,
  trigger: false,
});
export type PipelineAttempt = {
  format: "setl8-devnet-job-v1";
  wallet: string;
  account: string;
  accountAddress: string;
  requestId: string;
  operation: "purchase" | "Market" | "Close";
  signature: string | null;
  signatureSha256: string | null;
  runId: string | null;
  jobId: string | null;
  dispatch: "retained" | "uncertain" | "bound";
  job: DevnetPipelineJob | null;
};
const id = (s: string) => {
  if (!/^[a-f0-9]{64}$/.test(s)) throw Error("Invalid immutable job identity.");
  return s;
};
export async function signatureDigest(signature: string) {
  const bytes = bs58.decode(signature);
  if (bytes.length !== 64 || bs58.encode(bytes) !== signature)
    throw Error("A canonical 64-byte purchase signature hint is required.");
  return hash(bytes);
}
export async function preparePipelineAttempt(
  wallet: string,
  account: string,
  accountAddress: string,
  requestId: string,
  operation: PipelineAttempt["operation"],
  signature: string | null = null,
): Promise<PipelineAttempt> {
  id(account);
  id(requestId);
  if (
    bs58.decode(wallet).length !== 32 ||
    hex(bs58.decode(accountAddress)) !== account
  )
    throw Error("Wallet/account identity differs.");
  if (!["purchase", "Market", "Close"].includes(operation))
    throw Error("Unsupported bounded job stage.");
  if (operation === "purchase" && !signature)
    throw Error("Retain the original purchase signature first.");
  return {
    format: "setl8-devnet-job-v1",
    wallet,
    account,
    accountAddress,
    requestId,
    operation,
    signature,
    signatureSha256: signature ? await signatureDigest(signature) : null,
    runId: null,
    jobId: null,
    dispatch: "retained",
    job: null,
  };
}
export async function bindPipelineJob(
  a: PipelineAttempt,
  j: DevnetPipelineJob,
): Promise<PipelineAttempt> {
  const s = j.subject,
    kind =
      a.operation === "purchase"
        ? "purchase_origin"
        : a.operation === "Market"
          ? "market_source"
          : "whole_close_source";
  if (
    j.api_version !== "1" ||
    j.devnet_execution_version !== "1" ||
    j.request_id !== a.requestId ||
    j.wallet !== a.wallet ||
    j.kind !== kind ||
    j.polling !== "read_only_no_acquisition" ||
    j.signing !== "disabled" ||
    j.submission !== "not_performed" ||
    s?.basis !== "armed_plan_not_origin_proof" ||
    s.run_id !== j.run_id ||
    s.account !== a.account ||
    s.account_address !== a.accountAddress ||
    s.owner_wallet !== a.wallet ||
    s.stage !== (a.operation === "purchase" ? null : a.operation) ||
    (a.runId !== null && j.run_id !== a.runId) ||
    (a.jobId !== null && j.job_id !== a.jobId)
  )
    throw Error(
      "Job response does not match the original wallet/request/account/stage. No progress applied.",
    );
  id(j.run_id);
  id(j.job_id);
  for (const e of j.evidence_ids) id(e);
  if (
    ![
      "queued",
      "observing",
      "waiting_for_finality",
      "waiting_for_finalized_clock",
      "genesis_registered",
      "source_ready",
      "prepared_unsigned",
      "blocked",
      "unknown",
    ].includes(j.state) ||
    typeof j.terminal !== "boolean"
  )
    throw Error("Unknown job state. Automatic polling stopped.");
  if (
    a.signature !== null &&
    (s.purchase_signature !== a.signature ||
      s.purchase_signature_sha256 !== a.signatureSha256)
  )
    throw Error("Original purchase signature binding changed.");
  if (
    s.purchase_signature !== null &&
    (await signatureDigest(s.purchase_signature)) !==
      s.purchase_signature_sha256
  )
    throw Error("Job purchase signature hash differs from its decoded bytes.");
  if (s.purchase_signature === null && s.purchase_signature_sha256 !== null)
    throw Error("Missing job signature for its hash.");
  if (
    a.job &&
    (s.purchase_signature !== a.job.subject.purchase_signature ||
      s.purchase_signature_sha256 !== a.job.subject.purchase_signature_sha256)
  )
    throw Error("Bound job subject changed.");
  return { ...a, runId: j.run_id, jobId: j.job_id, dispatch: "bound", job: j };
}
export class PipelineStore {
  constructor(private storage: PublicIntentStorage) {}
  key(wallet: string, requestId: string) {
    id(requestId);
    return "setl8.devnet.job.v1:" + wallet + ":" + requestId;
  }
  async read(wallet: string, requestId: string) {
    const raw = this.storage.getItem(this.key(wallet, requestId));
    if (!raw) return null;
    if (raw.length > 300000)
      throw Error("Retained job exceeds its recovery bound.");
    const a = JSON.parse(raw) as PipelineAttempt;
    if (
      a.format !== "setl8-devnet-job-v1" ||
      a.wallet !== wallet ||
      a.requestId !== requestId ||
      !["retained", "uncertain", "bound"].includes(a.dispatch)
    )
      throw Error("Retained job identity changed.");
    await preparePipelineAttempt(
      a.wallet,
      a.account,
      a.accountAddress,
      a.requestId,
      a.operation,
      a.signature,
    );
    if (
      a.signatureSha256 !==
      (a.signature ? await signatureDigest(a.signature) : null)
    )
      throw Error("Retained purchase signature changed.");
    if (a.job) await bindPipelineJob(a, a.job);
    else if (a.jobId !== null || a.runId !== null || a.dispatch === "bound")
      throw Error("Retained job binding is incomplete.");
    return a;
  }
  async write(a: PipelineAttempt) {
    const key = this.key(a.wallet, a.requestId),
      old = await this.read(a.wallet, a.requestId);
    if (
      old &&
      (old.account !== a.account ||
        old.accountAddress !== a.accountAddress ||
        old.operation !== a.operation ||
        old.signature !== a.signature ||
        (old.jobId && old.jobId !== a.jobId) ||
        (old.runId && old.runId !== a.runId))
    )
      throw Error("Original job request cannot be replaced.");
    if (old && old.dispatch !== "retained" && a.dispatch === "retained")
      throw Error(
        "Original request was already dispatched. Recover it without restarting acquisition.",
      );
    const raw = JSON.stringify(a);
    this.storage.setItem(key, raw);
    if (JSON.stringify(await this.read(a.wallet, a.requestId)) !== raw)
      throw Error(
        "Could not retain exact pipeline request. No trigger is permitted.",
      );
    return a;
  }
}
/** Stable operation identity: reload/retry never creates another acquisition namespace. */
export async function retainPipelineOperation(
  store: PipelineStore,
  wallet: string,
  account: string,
  address: string,
  operation: PipelineAttempt["operation"],
  signature: string | null = null,
) {
  const requestId = await hash(
    JSON.stringify([
      "setl8-fixed-first-run-job-v1",
      wallet,
      account,
      operation,
      signature,
    ]),
  );
  const old = await store.read(wallet, requestId);
  if (old) {
    if (
      old.account !== account ||
      old.accountAddress !== address ||
      old.operation !== operation ||
      old.signature !== signature
    )
      throw Error(
        "Original pipeline operation differs. Recover its retained request.",
      );
    return old;
  }
  return store.write(
    await preparePipelineAttempt(
      wallet,
      account,
      address,
      requestId,
      operation,
      signature,
    ),
  );
}
export interface PipelineTransport {
  trigger(a: PipelineAttempt, signal: AbortSignal): Promise<DevnetPipelineJob>;
  job(jobId: string, signal: AbortSignal): Promise<DevnetPipelineJob>;
}
export class PipelineHttp implements PipelineTransport {
  constructor(
    private client: ApiClient = api,
    private origin = globalThis.location?.origin ?? "",
  ) {}
  private guard(trigger = false) {
    if (
      !DEVNET_JOB_RELEASE.read ||
      (trigger && !DEVNET_JOB_RELEASE.trigger) ||
      this.origin !== DEV_ORIGIN ||
      this.client.base !== DEV_API_URL
    )
      throw Error(
        "Devnet job connection is not activated. No acquisition requested.",
      );
  }
  trigger(a: PipelineAttempt, signal: AbortSignal) {
    this.guard(true);
    id(a.requestId);
    id(a.account);
    const purchase = a.operation === "purchase";
    const body: ObservePurchaseRequest | PrepareSourceRequest = purchase
      ? { request_id: a.requestId, signature: a.signature! }
      : { request_id: a.requestId, stage: a.operation as "Market" | "Close" };
    return this.client.request<DevnetPipelineJob>(
      purchase
        ? "/v1/devnet/execution/purchase-observations"
        : `/v1/devnet/execution/accounts/${a.account}/source-contexts`,
      {
        body,
        signal: AbortSignal.any([signal, AbortSignal.timeout(8000)]),
        protectedPost: true,
        maxBytes: 262144,
      },
    );
  }
  job(jobId: string, signal: AbortSignal) {
    this.guard();
    id(jobId);
    return this.client.request<DevnetPipelineJob>(
      `/v1/devnet/execution/jobs/${jobId}`,
      {
        signal: AbortSignal.any([signal, AbortSignal.timeout(8000)]),
        maxBytes: 262144,
      },
    );
  }
}
const progress = new Set([
  "queued",
  "observing",
  "waiting_for_finality",
  "waiting_for_finalized_clock",
]);
const pause = (ms: number, signal: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    if (signal.aborted) {
      reject(Error("Job polling canceled."));
      return;
    }
    const stop = () => {
      clearTimeout(timer);
      reject(Error("Job polling canceled."));
    };
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", stop);
      resolve();
    }, ms);
    signal.addEventListener("abort", stop, { once: true });
  });
/** Explicit trigger/recovery only; polling never triggers or replaces a job. */
export class PipelineSession {
  private abort = new AbortController();
  private busy = false;
  constructor(
    private wallet: string,
    private requestId: string,
    private store: PipelineStore,
    private http: PipelineTransport,
    private current: () => boolean,
    private changed: (a: PipelineAttempt) => void = () => {},
  ) {}
  dispose() {
    this.abort.abort();
  }
  private scope() {
    if (this.abort.signal.aborted || !this.current())
      throw Error("Wallet/session changed. Original job remains retained.");
  }
  private async attempt() {
    this.scope();
    const a = await this.store.read(this.wallet, this.requestId);
    this.scope();
    if (!a) throw Error("Original retained request is unavailable.");
    return a;
  }
  async trigger() {
    if (this.busy) throw Error("Job operation already in progress.");
    this.busy = true;
    try {
      let a = await this.attempt();
      if (a.jobId)
        throw Error(
          "Poll the bound job instead of triggering another operation.",
        );
      a = await this.store.write({ ...a, dispatch: "uncertain" });
      this.scope();
      const j = await this.http.trigger(a, this.abort.signal);
      const saved = await this.store.write(await bindPipelineJob(a, j));
      this.scope();
      this.changed(saved);
      return saved;
    } finally {
      this.busy = false;
    }
  }
  async poll(wait = pause) {
    if (this.busy) throw Error("Job operation already in progress.");
    this.busy = true;
    try {
      let a = await this.attempt();
      if (!a.jobId)
        throw Error(
          "Reconcile the exact original POST request explicitly before polling; no new request ID is allocated.",
        );
      const start = Date.now();
      for (let i = 0; i < 12 && Date.now() - start < 90000; i++) {
        this.scope();
        const j = await this.http.job(a.jobId!, this.abort.signal);
        a = await this.store.write(await bindPipelineJob(a, j));
        this.scope();
        this.changed(a);
        if (j.terminal || !progress.has(j.state)) return a;
        await wait(
          Math.min(10000, 2000 * 2 ** Math.min(i, 3)),
          this.abort.signal,
        );
      }
      return a;
    } finally {
      this.busy = false;
    }
  }
}
