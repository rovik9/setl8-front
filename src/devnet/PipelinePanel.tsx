import { checkSourcePreparation } from "./sourcePreparation";
import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import bs58 from "bs58";
import { useAuth } from "../auth/context";
import { Button, JsonDetails } from "../components/ui";
import {
  PublicAttemptStore,
  ATTEMPT_KEY,
  ARCHIVE_KEY,
  type ArchivedPurchase,
} from "../buy/recovery";
import type { PublicAttempt } from "../buy/direct-types";
import { hex } from "../buy/bytes";
import {
  DEVNET_JOB_RELEASE,
  PipelineHttp,
  PipelineStore,
  PipelineSession,
  retainPipelineOperation,
  type PipelineAttempt,
} from "./pipeline";
import { DEVNET_EXECUTION_RELEASE } from "./execution";
import "./devnet.css";
const labels: Record<string, string> = {
  queued: "Waiting to be checked",
  observing: "Checking recorded evidence",
  waiting_for_finality: "Waiting for chain finalization",
  waiting_for_finalized_clock: "Waiting for the finalized chain clock",
  genesis_registered: "Account origin registered",
  source_ready: "Source preparation completed",
  prepared_unsigned: "Transaction prepared · signing disabled",
  blocked: "Preparation blocked",
  unknown: "Outcome unknown · recovery required",
};
export type PipelinePanelProps = {
  wallet: string;
  account: string;
  accountAddress: string;
  operation: PipelineAttempt["operation"];
  signature?: string | null;
  autoStart?: boolean;
  beforeTrigger?: (signal: AbortSignal) => Promise<void>;
  onReady?: () => void;
  enabled?: boolean;
};
export function PipelinePanel(props: PipelinePanelProps) {
  const auth = useAuth();
  if (auth.session?.wallet !== props.wallet) return null;
  return (
    <PipelineScope
      key={[
        auth.epoch,
        props.wallet,
        props.account,
        props.operation,
        props.signature,
      ].join(":")}
      {...props}
    />
  );
}
function PipelineScope({
  wallet,
  account,
  accountAddress,
  operation,
  signature = null,
  autoStart = false,
  beforeTrigger,
  onReady,
  enabled = true,
}: PipelinePanelProps) {
  const auth = useAuth(),
    [attempt, setAttempt] = useState<PipelineAttempt | null>(null),
    [error, setError] = useState<string | null>(null),
    [busy, setBusy] = useState(false);
  const engine = useRef<PipelineSession | null>(null),
    abort = useRef(new AbortController()),
    callbacks = useRef({ beforeTrigger, onReady }),
    notified = useRef<string | null>(null);
  callbacks.current = { beforeTrigger, onReady };
  const apply = (a: PipelineAttempt, notify = true) => {
    if (abort.current.signal.aborted) return;
    setAttempt(a);
    const j = a.job;
    if (!notify) {
      notified.current = j ? j.job_id + ":" + j.state : null;
      return;
    }
    if (
      j &&
      ["genesis_registered", "source_ready", "prepared_unsigned"].includes(
        j.state,
      ) &&
      notified.current !== j.job_id + ":" + j.state
    ) {
      notified.current = j.job_id + ":" + j.state;
      callbacks.current.onReady?.();
    }
  };
  const run = async (action: "trigger" | "poll", a: PipelineAttempt) => {
    const e = engine.current;
    if (!e) return;
    setBusy(true);
    setError(null);
    try {
      if (action === "trigger") {
        if (a.dispatch === "retained")
          await callbacks.current.beforeTrigger?.(abort.current.signal);
        if (abort.current.signal.aborted) return;
        const bound = await e.trigger();
        apply(bound);
        if (
          bound.job &&
          !bound.job.terminal &&
          [
            "queued",
            "observing",
            "waiting_for_finality",
            "waiting_for_finalized_clock",
          ].includes(bound.job.state)
        )
          await e.poll();
      } else await e.poll();
    } catch (err) {
      if (!abort.current.signal.aborted) {
        setError((err as Error).message);
        try {
          const saved = await new PipelineStore(localStorage).read(
            wallet,
            a.requestId,
          );
          if (saved) apply(saved, false);
        } catch {
          /* preserve original visible error */
        }
      }
    } finally {
      if (!abort.current.signal.aborted) setBusy(false);
    }
  };
  useEffect(() => {
    const controller = new AbortController();
    abort.current = controller;
    const current = () => {
      const s = auth.manager.getSnapshot();
      return (
        !controller.signal.aborted &&
        s.phase === "authenticated" &&
        s.epoch === auth.epoch &&
        s.session?.wallet === wallet
      );
    };
    let owned: PipelineSession | null = null;
    void (async () => {
      try {
        const store = new PipelineStore(localStorage);
        const a = await retainPipelineOperation(
          store,
          wallet,
          account,
          accountAddress,
          operation,
          signature,
        );
        if (!current()) return;
        owned = new PipelineSession(
          wallet,
          a.requestId,
          store,
          new PipelineHttp(),
          current,
          apply,
        );
        engine.current = owned;
        apply(a, false);
        if (a.jobId && DEVNET_JOB_RELEASE.read) void run("poll", a);
        else if (
          autoStart &&
          enabled &&
          a.dispatch === "retained" &&
          DEVNET_JOB_RELEASE.read &&
          DEVNET_JOB_RELEASE.trigger
        )
          void run("trigger", a);
      } catch (err) {
        if (current()) setError((err as Error).message);
      }
    })();
    return () => {
      controller.abort();
      owned?.dispose();
      engine.current = null;
    };
  }, [
    wallet,
    account,
    accountAddress,
    operation,
    signature,
    autoStart,
    enabled,
    auth.epoch,
  ]);
  const title =
    operation === "purchase"
      ? "Purchase verification"
      : operation === "Market"
        ? "Prepare Market source"
        : "Prepare Whole Close source";
  return (
    <section className="panel devnet-pipeline" aria-label={title}>
      <h2>{title}</h2>
      <p role="status">
        {busy
          ? "Checking original request…"
          : attempt?.job
            ? labels[attempt.job.state]
            : "Preparation has not started."}
      </p>
      {!DEVNET_JOB_RELEASE.read && (
        <p>
          Connection awaiting reviewed activation. Your original purchase or
          stage request is retained; no acquisition is requested.
        </p>
      )}
      <p className="fine-print">
        {operation === "purchase"
          ? "Purchase progress is separate from verified account ownership. The matching account origin must still be confirmed."
          : "One bounded source preparation is available for this stage. Completed preparation does not keep a source fresh; signing checks its age again. An expired source or unknown outcome does not create another attempt."}
      </p>
      {error && (
        <p className="notice rose" role="alert">
          {error}
        </p>
      )}
      {attempt?.job?.blocked_reason && (
        <p className="notice amber">{attempt.job.blocked_reason}</p>
      )}
      <div className="devnet-recovery-actions">
        {attempt && !attempt.jobId && (
          <Button
            disabled={
              busy ||
              !enabled ||
              !DEVNET_JOB_RELEASE.read ||
              !DEVNET_JOB_RELEASE.trigger
            }
            onClick={() => void run("trigger", attempt)}
          >
            {attempt.dispatch === "uncertain"
              ? "Recover original request"
              : operation === "purchase"
                ? "Verify original purchase"
                : "Prepare this stage"}
          </Button>
        )}
        {attempt?.jobId && (
          <Button
            disabled={busy || !DEVNET_JOB_RELEASE.read}
            onClick={() => void run("poll", attempt)}
          >
            Check original job · read only
          </Button>
        )}
        {operation === "purchase" &&
          attempt?.job?.state === "genesis_registered" && (
            <Link className="button secondary" to="/devnet-terminal">
              Open execution desk
            </Link>
          )}
      </div>
      {attempt && (
        <JsonDetails
          title="Original request and bound progress evidence"
          value={attempt}
        />
      )}
    </section>
  );
}
/** Consumes only an already retained, exact purchase attempt; never asks for keys or a new payment. */
export function PurchasePipeline({
  attempt: provided,
}: {
  attempt?: Readonly<PublicAttempt> | null;
}) {
  const auth = useAuth(),
    [retained, setRetained] = useState<Readonly<PublicAttempt> | null>(
      provided ?? null,
    ),
    [archived, setArchived] = useState<readonly Readonly<ArchivedPurchase>[]>(
      [],
    ),
    [archiveError, setArchiveError] = useState<string | null>(null),
    [error, setError] = useState<string | null>(null);
  // Verified purchases whose lock was released stay readable here. A storage view with no removeItem: this
  // component can never release a lock. An archive problem is reported beside, never instead of, a live purchase.
  useEffect(() => {
    let live = true;
    const load = () =>
      void new PublicAttemptStore({
        getItem: (k) => localStorage.getItem(k),
        setItem: () => {
          throw Error("Read-only");
        },
      })
        .readArchive()
        .then((list) => {
          if (live) {
            setArchived(list);
            setArchiveError(null);
          }
        })
        .catch((e) => {
          if (live) {
            setArchived([]);
            setArchiveError((e as Error).message);
          }
        });
    load();
    const changed = (e: StorageEvent) => {
      if (e.key === ARCHIVE_KEY) load();
    };
    window.addEventListener("storage", changed);
    return () => {
      live = false;
      window.removeEventListener("storage", changed);
    };
  }, [auth.epoch]);
  useEffect(() => {
    if (provided) {
      setRetained(provided);
      return;
    }
    let live = true;
    const load = () =>
      void new PublicAttemptStore(localStorage)
        .read()
        .then((a) => {
          if (live) {
            setRetained(a);
            setError(null);
          }
        })
        .catch((e) => {
          if (live) setError((e as Error).message);
        });
    load();
    const changed = (e: StorageEvent) => {
      if (e.key === ATTEMPT_KEY) load();
    };
    window.addEventListener("storage", changed);
    return () => {
      live = false;
      window.removeEventListener("storage", changed);
    };
  }, [provided, auth.epoch]);
  if (!auth.session) return null;
  if (error)
    return (
      <p className="notice rose" role="alert">
        {error}
      </p>
    );
  const mine = archived.filter((x) => x.record.wallet === auth.session!.wallet),
    // An archive that failed its integrity check is never used as a fallback source.
    a = provided ?? retained ?? mine[mine.length - 1]?.record ?? null;
  const panel =
    a?.signature && a.wallet === auth.session.wallet ? (
      <PipelinePanel
        wallet={a.wallet}
        account={hex(bs58.decode(a.expectedAccount))}
        accountAddress={a.expectedAccount}
        operation="purchase"
        signature={a.signature}
        autoStart={["uncertain", "finalized_observed", "verified"].includes(
          a.stage,
        )}
      />
    ) : null;
  if (!panel && mine.length === 0 && !archiveError) return null;
  return (
    <>
      {archiveError && (
        <p className="notice rose" role="alert">
          {archiveError}
        </p>
      )}
      {panel}
      {mine.length > 0 && (
        <details className="buy-details">
          <summary>Verified purchases ({mine.length})</summary>
          <ul>
            {[...mine].reverse().map((x) => (
              <li key={x.record.signature}>
                Account <code>{x.record.expectedAccount}</code> · debit{" "}
                {x.evidence.actualDebit} micro test USDC · signature{" "}
                <code>{x.record.signature}</code>
              </li>
            ))}
          </ul>
        </details>
      )}
    </>
  );
}
export function SourcePipeline({
  wallet,
  account,
  accountAddress,
  stage,
  onReady,
}: {
  wallet: string;
  account: string;
  accountAddress: string;
  stage: "Market" | "Close";
  onReady: () => void;
}) {
  const before = (signal: AbortSignal) =>
    checkSourcePreparation(wallet, account, stage, signal);
  return (
    <PipelinePanel
      wallet={wallet}
      account={account}
      accountAddress={accountAddress}
      operation={stage}
      enabled={DEVNET_EXECUTION_RELEASE.contextRead}
      beforeTrigger={before}
      onReady={onReady}
    />
  );
}
