import { checkRetainedSubmission } from "../devnet/submissionPreparation";
import { PurchasePipeline, SourcePipeline } from "../devnet/PipelinePanel";
import {
  fixedStageReference,
  fixedStageProblem,
  type StageEvidence,
} from "../devnet/fixedStage";
import type { DevnetExecutionContext } from "../api/devnet-execution-v1";
import {
  marketSizeProblem,
  armedMarketSizeProblem,
} from "../devnet/marketSize";
import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Brand, Badge, Button, Empty, JsonDetails } from "../components/ui";
import { WalletButton } from "../components/WalletDialog";
import { useAuth } from "../auth/context";
import { useResource } from "../hooks/resource";
import {
  DEVNET_EXECUTION_RELEASE,
  devnetExecutionHttp,
  prepareBoundedDevnetDraft,
  validateDevnetContext,
  devnetReviewProblem,
  priorPublicationProblem,
  type DevnetOrderFields,
  signedTimeStillCurrent,
  wallObservationAgeNs,
  reviewWallRemainingMs,
} from "../devnet/execution";
import {
  DevnetIntentStore,
  DevnetIntentRecovery,
  type DevnetSignedRecord,
  retainApprovedDevnetMessage,
} from "../devnet/intentRecovery";
import type { PreparedDraft } from "../data/orderDraft";
import { usd, shortId, fixed, timestamp } from "../data/exact";
import "../devnet/devnet.css";
export default function DevnetTerminal() {
  const auth = useAuth();
  return <DevnetTerminalScope key={auth.epoch} />;
}
function DevnetTerminalScope() {
  const auth = useAuth(),
    [fields, setFields] = useState<DevnetOrderFields>({
      kind: "Market",
      side: "Buy",
      quantity: "",
      nonce: "1",
      confirmed: false,
    }),
    [draft, setDraft] = useState<PreparedDraft | null>(null),
    [error, setError] = useState<string | null>(null),
    [busy, setBusy] = useState(false),
    [tracking, setTracking] = useState(false),
    [recoveryRevision, setRecoveryRevision] = useState(0),
    [wallNow, setWallNow] = useState(Date.now()),
    [reviewedAt, setReviewedAt] = useState<number | null>(null),
    [resultMessage, setResultMessage] = useState<string | null>(null);
  useEffect(() => {
    const timer = setInterval(() => setWallNow(Date.now()), 250);
    return () => clearInterval(timer);
  }, []);
  const sizeProblem = marketSizeProblem(fields.quantity, fields.kind);
  const remaining =
    reviewedAt === null ? 0 : reviewWallRemainingMs(reviewedAt, wallNow);
  const age = (ns: string | null | undefined) => {
    if (!ns) return "Unavailable";
    try {
      const n = wallObservationAgeNs(ns, wallNow);
      return n < 0n
        ? "Timestamp ahead of browser wall clock"
        : fixed(n.toString(), 9, 3) + " s";
    } catch {
      return "Invalid timestamp";
    }
  };
  const context = useResource(
    "genuine-devnet:" + auth.epoch,
    async (signal) =>
      validateDevnetContext(
        await devnetExecutionHttp.context(signal),
        auth.session!.wallet,
      ),
    !!auth.session && DEVNET_EXECUTION_RELEASE.contextRead,
    tracking ? 2500 : 0,
  );
  const account = context.data?.account;
  const ledger = useResource(
    "genuine-ledger:" + auth.epoch + ":" + account?.account,
    (signal) => devnetExecutionHttp.ledger(account!.account, signal),
    !!account && DEVNET_EXECUTION_RELEASE.contextRead,
    tracking ? 2500 : 0,
  );
  useEffect(() => {
    if (!tracking) return;
    const t = setTimeout(() => setTracking(false), 90000);
    return () => clearTimeout(t);
  }, [tracking]);
  useEffect(() => {
    if (
      account?.publication === "finalized" &&
      account.local_execution === "processed"
    )
      setTracking(false);
  }, [account?.publication, account?.local_execution]);
  const generation = useRef(0);
  const requests = useRef(new AbortController());
  useEffect(() => () => requests.current.abort(), []);
  const checkScope = () => {
    const now = auth.manager.getSnapshot();
    if (
      requests.current.signal.aborted ||
      now.phase !== "authenticated" ||
      now.epoch !== auth.epoch ||
      now.session?.wallet !== auth.session?.wallet
    )
      throw Error("Wallet/session changed. Old review cannot be applied.");
  };
  let reference: string | null = null;
  try {
    if (context.data)
      reference = fixedStageReference(context.data, fields.kind);
  } catch {
    /* unarmed stays unavailable */
  }
  const stageEvidence = async (
    c: DevnetExecutionContext,
    kind: "Market" | "Close",
    signal: AbortSignal,
  ): Promise<StageEvidence> => {
    if (!c.account) throw Error("Genuine account unavailable.");
    return {
      retained: new DevnetIntentStore(localStorage).read(
        auth.session!.wallet,
        c.account.account,
      ),
      market:
        kind === "Close"
          ? await devnetExecutionHttp.recorded(c.account.account, "1", signal)
          : null,
    };
  };
  const update = (patch: Partial<DevnetOrderFields>) => {
    generation.current++;
    setFields((f) => ({ ...f, ...patch }));
    setDraft(null);
    setReviewedAt(null);
    setResultMessage(null);
    setError(null);
  };
  const review = async () => {
    const version = ++generation.current;
    setBusy(true);
    setError(null);
    try {
      const c = validateDevnetContext(
        await devnetExecutionHttp.context(requests.current.signal),
        auth.session!.wallet,
      );
      const currentLedger = c.account
        ? await devnetExecutionHttp.ledger(
            c.account.account,
            requests.current.signal,
          )
        : null;
      const next = await prepareBoundedDevnetDraft(
        c,
        auth.session!.wallet,
        auth.session!.wallet_hex,
        auth.epoch,
        { ...fields, nonce: fixedStageReference(c, fields.kind) },
        currentLedger,
        await stageEvidence(c, fields.kind, requests.current.signal),
      );
      checkScope();
      if (generation.current !== version)
        throw Error(
          "Order fields changed while reading. Review the new fields explicitly.",
        );
      setDraft(next);
      setReviewedAt(Date.now());
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const sign = async () => {
    if (!draft) return;
    const version = generation.current;
    setBusy(true);
    setError(null);
    try {
      if (reviewedAt === null || reviewWallRemainingMs(reviewedAt) === 0)
        throw Error(
          "This exact review is older than the 5-second signing budget. Explicitly refresh and review again; bytes were not retimestamped.",
        );
      const current = validateDevnetContext(
        await devnetExecutionHttp.context(requests.current.signal),
        auth.session!.wallet,
      );
      const admission = devnetReviewProblem(current, auth.session!.wallet);
      if (admission) throw Error(admission);
      const currentLedger = current.account
        ? await devnetExecutionHttp.ledger(
            current.account.account,
            requests.current.signal,
          )
        : null;
      const armedSize = armedMarketSizeProblem(
        fields.quantity,
        fields.kind,
        current.market_quantity_policy,
      );
      if (armedSize) throw Error(armedSize);
      const prior = priorPublicationProblem(
        current,
        currentLedger,
        fields.kind,
      );
      if (prior) throw Error(prior);
      const stage = fixedStageProblem(
        current,
        currentLedger,
        fields.kind,
        draft.nonce,
        await stageEvidence(current, fields.kind, requests.current.signal),
      );
      if (stage) throw Error(stage);
      if (
        !current.clock_unix_s ||
        !signedTimeStillCurrent(draft, current.clock_unix_s)
      )
        throw Error(
          "The exact client timestamp is stale. Explicit review is required before wallet signing.",
        );
      checkScope();
      if (generation.current !== version)
        throw Error("Order review changed before wallet approval.");
      if (current.account?.account !== draft.scope.account)
        throw Error("Genuine account changed since review.");
      const result = await retainApprovedDevnetMessage(
        draft,
        auth.session!.wallet,
        auth.manager,
        new DevnetIntentStore(localStorage),
      );
      if (!result.current) {
        setResultMessage(
          "Exact returned signature retained for the original account. Session changed; no submission occurred.",
        );
        return;
      }
      const after = validateDevnetContext(
        await devnetExecutionHttp.context(requests.current.signal),
        auth.session!.wallet,
      );
      if (
        !after.clock_unix_s ||
        !signedTimeStillCurrent(draft, after.clock_unix_s) ||
        reviewWallRemainingMs(reviewedAt) === 0
      ) {
        setResultMessage(
          "Wallet approval exceeded the current signing window. Exact signature retained, no app submission. Explicitly refresh/review/re-sign; no hidden retimestamp.",
        );
        return;
      }
      const store = new DevnetIntentStore(localStorage);
      await checkRetainedSubmission(
        result.retained,
        auth.session!.wallet,
        requests.current.signal,
        devnetExecutionHttp,
        store,
        after,
      );
      checkScope();
      if (
        generation.current !== version ||
        reviewWallRemainingMs(reviewedAt) === 0
      )
        throw Error(
          "The reviewed action changed or expired after approval. Exact bytes retained; no app submission.",
        );
      const submitter = new DevnetIntentRecovery(
        auth.session!.wallet,
        result.retained.account,
        store,
        devnetExecutionHttp,
        () => {
          const s = auth.manager.getSnapshot();
          return (
            !requests.current.signal.aborted &&
            s.phase === "authenticated" &&
            s.epoch === auth.epoch &&
            s.session?.wallet === auth.session!.wallet
          );
        },
      );
      const stop = () => submitter.dispose();
      requests.current.signal.addEventListener("abort", stop, { once: true });
      try {
        await submitter.submit(result.retained);
      } finally {
        requests.current.signal.removeEventListener("abort", stop);
        submitter.dispose();
      }
      setResultMessage(
        "Exact intent received. Canonical execution and finalized publication are being checked separately.",
      );
      setTracking(true);
      context.refresh();
      ledger.refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setRecoveryRevision((n) => n + 1);
      setBusy(false);
    }
  };
  return (
    <div className="devnet-terminal">
      <header className="site-header wrap">
        <Brand />
        <Link to="/my-account">My accounts</Link>
        <WalletButton />
      </header>
      <main className="wrap" id="main-content">
        <div className="devnet-history-heading">
          <Badge tone="blue">Actual devnet · bounded execution</Badge>
          <h1>Your devnet execution desk.</h1>
          <p>
            Wallet message, accepted intent, canonical runtime execution,
            published journal and finalized chain head are separate evidence
            stages. No practice account is substituted.
          </p>
        </div>
        {!auth.session ? (
          <Empty title="Sign in with your actual trader wallet">
            <Button variant="primary" onClick={auth.open}>
              Connect wallet
            </Button>
          </Empty>
        ) : (
          <>
            <p className="fine-print">
              Signed-in wallet <code>{auth.session.wallet}</code>
            </p>
            {!DEVNET_EXECUTION_RELEASE.contextRead && (
              <div className="notice amber" role="status">
                The genuine devnet execution connection is awaiting reviewed
                adapter activation. Your actual wallet sign-in and devnet
                checkout remain separate. No source, balance or execution
                history is manufactured.
              </div>
            )}
            {context.error && (
              <p className="notice rose" role="alert">
                {context.error}
              </p>
            )}
            <PurchasePipeline />
            {account && (
              <SourcePipeline
                wallet={auth.session.wallet}
                account={account.account}
                accountAddress={account.account_address}
                stage={fields.kind}
                onReady={() => {
                  context.refresh();
                  ledger.refresh();
                }}
              />
            )}
            {context.data && (
              <section
                className="devnet-source-ages"
                aria-label="Source and chain wall age"
              >
                <h2>Actual source freshness</h2>
                <p className="fine-print">
                  BTC recorded source age: {age(context.data.source?.source_ns)}
                  . Maximum source age: 15 s. Approval reviews expire after 5 s;
                  slow wallet approval requires explicit review again.
                </p>
                <details>
                  <summary>Source and clock diagnostics</summary>
                  <dl className="definition-list">
                    <div>
                      <dt>Source timestamp</dt>
                      <dd>
                        {context.data.source
                          ? timestamp(context.data.source.source_ns)
                          : "Unavailable"}{" "}
                        · wall age {age(context.data.source?.source_ns)}
                      </dd>
                    </div>
                    <div>
                      <dt>Backend source receive timestamp</dt>
                      <dd>
                        {context.data.source
                          ? timestamp(context.data.source.receive_ns)
                          : "Unavailable"}{" "}
                        · wall age {age(context.data.source?.receive_ns)}
                      </dd>
                    </div>
                    <div>
                      <dt>Verifier source receive timestamp</dt>
                      <dd>
                        {context.data.source
                          ? timestamp(context.data.source.verifier_receive_ns)
                          : "Unavailable"}{" "}
                        · wall age{" "}
                        {age(context.data.source?.verifier_receive_ns)}
                      </dd>
                    </div>
                    <div>
                      <dt>Backend context wall time</dt>
                      <dd>
                        {timestamp(context.data.backend_now_unix_ns)} · wall age{" "}
                        {age(context.data.backend_now_unix_ns)}
                      </dd>
                    </div>
                    <div>
                      <dt>Backend-declared source / chain ages</dt>
                      <dd>
                        {context.data.source_age_ns === null
                          ? "Unavailable"
                          : fixed(context.data.source_age_ns, 9, 3) + " s"}{" "}
                        /{" "}
                        {context.data.chain_snapshot_age_ns === null
                          ? "Unavailable"
                          : fixed(context.data.chain_snapshot_age_ns, 9, 3) +
                            " s"}
                      </dd>
                    </div>
                    <div>
                      <dt>Chain snapshot wall age</dt>
                      <dd>
                        {age(context.data.chain_snapshot_received_unix_ns)}
                      </dd>
                    </div>
                    <div>
                      <dt>Signable backend wall second</dt>
                      <dd>{context.data.clock_unix_s ?? "Unavailable"}</dd>
                    </div>
                    <div>
                      <dt>Canonical actor clock second</dt>
                      <dd>
                        {context.data.actor_clock_unix_s ?? "Unavailable"}
                      </dd>
                    </div>
                    <div>
                      <dt>Publisher readiness</dt>
                      <dd>
                        {context.data.publication_compilation ===
                        "reviewed_ready"
                          ? "Reviewed adapter ready"
                          : "Awaiting reviewed adapter"}
                      </dd>
                    </div>
                  </dl>
                  <p className="fine-print">
                    Browser wall ages are advisory and continue aging while the
                    context is unchanged. The backend independently enforces
                    actual source/chain freshness and the canonical 5-second
                    signing skew. Neither source time nor an old context clock
                    is silently refreshed.
                  </p>
                </details>
                <Button
                  disabled={!DEVNET_EXECUTION_RELEASE.contextRead}
                  onClick={() => {
                    generation.current++;
                    setDraft(null);
                    setReviewedAt(null);
                    context.refresh();
                    ledger.refresh();
                  }}
                >
                  Refresh actual context and discard old review
                </Button>
              </section>
            )}
            {context.data && (
              <JsonDetails
                title="Actual account/source admission evidence"
                value={context.data}
              />
            )}
            {account && (
              <DevnetRecoveryPanel
                key={auth.epoch + ":" + account.account}
                account={account.account}
                revision={recoveryRevision}
                onReceipt={() => {
                  setTracking(true);
                  context.refresh();
                  ledger.refresh();
                }}
              />
            )}
            <div className="devnet-terminal-layout">
              <section className="panel">
                <h2>Account and chain evidence</h2>
                <dl className="definition-list">
                  <div>
                    <dt>Genuine account</dt>
                    <dd>
                      {account
                        ? shortId(account.account_address)
                        : "Not admitted"}
                    </dd>
                  </div>
                  <div>
                    <dt>Canonical balance</dt>
                    <dd>{usd(ledger.data?.evaluator_state?.balance_micro)}</dd>
                  </div>
                  <div>
                    <dt>Local execution</dt>
                    <dd>{account?.local_execution ?? "Unavailable"}</dd>
                  </div>
                  <div>
                    <dt>Journal publication</dt>
                    <dd>{account?.publication ?? "Not activated"}</dd>
                  </div>
                  <div>
                    <dt>Canonical worker</dt>
                    <dd>
                      {ledger.data?.worker?.state ?? "Unavailable"}
                      {ledger.data?.worker?.last_error
                        ? ": " + ledger.data.worker.last_error
                        : ""}
                    </dd>
                  </div>
                  <div>
                    <dt>Finalized chain head</dt>
                    <dd>
                      {ledger.data?.finalized_chain_head
                        ? ledger.data.finalized_chain_head.seq +
                          " / " +
                          shortId(ledger.data.finalized_chain_head.journal_hash)
                        : "Not attested"}
                    </dd>
                  </div>
                </dl>
                {ledger.error && <p className="notice rose">{ledger.error}</p>}
                {ledger.data && (
                  <JsonDetails
                    title="Durable execution and finalized-head ledger"
                    value={ledger.data}
                  />
                )}
                <p className="fine-print">
                  The finite reviewed scope is one BTC Market and one whole
                  Close. Limit/Stop, partial exits and lifecycle submission are
                  not enabled by this scope. A local fill is never labeled
                  finalized publication.
                </p>
                <Link className="text-link" to="/devnet-history">
                  Inspect separate verified A1 settlement history
                </Link>
              </section>
              <section className="panel order-draft-ticket">
                <h2>Exact order review</h2>
                <div className="side-picker">
                  {(["Buy", "Sell"] as const).map((side) => (
                    <button
                      key={side}
                      className={
                        (side === fields.side ? "selected " : "") +
                        side.toLowerCase()
                      }
                      aria-pressed={side === fields.side}
                      onClick={() => update({ side })}
                    >
                      {side}
                    </button>
                  ))}
                </div>
                <div className="order-type">
                  {(["Market", "Close"] as const).map((kind) => (
                    <button
                      key={kind}
                      aria-pressed={fields.kind === kind}
                      onClick={() => update({ kind })}
                    >
                      {kind === "Close" ? "Whole Close" : kind}
                    </button>
                  ))}
                </div>
                {fields.kind === "Market" && (
                  <label className="draft-label">
                    Quantity · BTC
                    <input
                      aria-label="Devnet quantity"
                      value={fields.quantity}
                      inputMode="decimal"
                      onChange={(e) => update({ quantity: e.target.value })}
                    />
                  </label>
                )}
                <p className="fine-print">
                  {context.data?.market_quantity_policy &&
                  armedMarketSizeProblem(
                    "0.0002",
                    "Market",
                    context.data.market_quantity_policy,
                  ) === null
                    ? `Armed Market maximum: ${fixed(context.data.market_quantity_policy.max_units, 6, 6, false)} BTC. Minimum and step: 0.000200 BTC. Canonical margin/notional checks remain required before admission.`
                    : "Awaiting armed Market size policy. Proposed ceiling: 0.010000 BTC; minimum and step: 0.000200 BTC. No new Market is ready until the server policy is verified."}{" "}
                  Whole Close uses exactly zero quantity.
                </p>

                {fields.kind === "Market" &&
                  fields.quantity !== "" &&
                  sizeProblem && (
                    <p className="notice rose" role="alert">
                      {sizeProblem}
                    </p>
                  )}
                <p className="fine-print">
                  {fields.kind === "Market" ? "Market" : "Whole Close"}{" "}
                  reference:{" "}
                  <strong>{reference ?? "Awaiting armed plan"}</strong>. Fixed
                  first-run stage; occupied or uncertain references require
                  exact recovery.
                </p>
                <label className="draft-toggle">
                  <input
                    type="checkbox"
                    checked={fields.confirmed}
                    onChange={(e) => update({ confirmed: e.target.checked })}
                  />
                  I confirm the genuine account and exact order scope.
                </label>
                <Button
                  variant="primary"
                  disabled={
                    busy ||
                    !!sizeProblem ||
                    reference === null ||
                    (fields.kind === "Market" &&
                      !!armedMarketSizeProblem(
                        fields.quantity,
                        fields.kind,
                        context.data?.market_quantity_policy ?? null,
                      )) ||
                    !context.data ||
                    !!devnetReviewProblem(context.data, auth.session.wallet)
                  }
                  onClick={() => void review()}
                >
                  Review exact devnet order
                </Button>
                {error && (
                  <p className="notice rose" role="alert">
                    {error}
                  </p>
                )}
                {draft && (
                  <>
                    <p className="notice amber" role="status">
                      {(remaining / 1000).toFixed(2)} s remaining in this
                      review's 5-second wall-time signing budget. No replay
                      pause. Backend acceptance is checked independently.
                    </p>
                    <JsonDetails
                      title="Immutable canonical order/signing bytes"
                      value={draft}
                    />
                    <p>
                      Exact signed client time {draft.decoded.clientTime}.
                      Devnet time is not paused; a slow wallet approval can
                      become stale and requires explicit new review.
                    </p>
                    <Button
                      disabled={
                        busy ||
                        !DEVNET_EXECUTION_RELEASE.intentSign ||
                        remaining === 0
                      }
                      onClick={() => void sign()}
                    >
                      Approve and submit reviewed order
                    </Button>
                  </>
                )}
                {resultMessage && (
                  <p className="notice" role="status">
                    {resultMessage}
                  </p>
                )}
                <p className="fine-print">
                  Signing and submission remain OFF pending a fresh exact
                  wallet/account action grant. No hidden retimestamping, nonce
                  allocation, delegated signer or automatic retry.
                </p>
              </section>
            </div>
          </>
        )}
      </main>
    </div>
  );
}

function DevnetRecoveryPanel({
  account,
  revision,
  onReceipt,
}: {
  account: string;
  revision: number;
  onReceipt: () => void;
}) {
  const auth = useAuth(),
    [record, setRecord] = useState<DevnetSignedRecord | null>(null),
    [error, setError] = useState<string | null>(null),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState<string | null>(null);
  const engine = useRef<DevnetIntentRecovery | null>(null),
    controller = useRef(new AbortController());
  const load = () => {
    try {
      setRecord(
        new DevnetIntentStore(localStorage).read(auth.session!.wallet, account),
      );
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  };
  useEffect(() => {
    load();
  }, [revision]);
  useEffect(() => {
    const abort = new AbortController();
    controller.current = abort;
    const current = () => {
      const s = auth.manager.getSnapshot();
      return (
        !abort.signal.aborted &&
        s.phase === "authenticated" &&
        s.epoch === auth.epoch &&
        s.session?.wallet === auth.session!.wallet
      );
    };
    const e = new DevnetIntentRecovery(
      auth.session!.wallet,
      account,
      new DevnetIntentStore(localStorage),
      devnetExecutionHttp,
      current,
    );
    engine.current = e;
    load();
    const changed = () => load();
    window.addEventListener("storage", changed);
    return () => {
      abort.abort();
      e.dispose();
      engine.current = null;
      window.removeEventListener("storage", changed);
    };
  }, [account, auth.epoch]);
  const act = async (action: "submit" | "reconcile" | "retire") => {
    if (!engine.current) return;
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      if (action === "submit" || action === "retire") {
        const c = validateDevnetContext(
          await devnetExecutionHttp.context(controller.current.signal),
          auth.session!.wallet,
        );
        if (c.account?.account !== account || !c.clock_unix_s)
          throw Error(
            "Refresh this genuine account's actual signable context first.",
          );
        if (action === "retire") {
          engine.current.retireUnsent(c.clock_unix_s);
          setMessage(
            "Stale signature retired locally because this app never forwarded it. Archived exact bytes remain; this does not revoke a public signature.",
          );
        } else {
          if (!record) throw Error("Reload exact retained intent first.");
          await checkRetainedSubmission(
            record,
            auth.session!.wallet,
            controller.current.signal,
            devnetExecutionHttp,
            new DevnetIntentStore(localStorage),
            c,
          );
          await engine.current.submit(record);
          setMessage(
            "Intent receipt received. Local execution and finalized publication must still be checked separately.",
          );
        }
      } else {
        await engine.current.reconcile();
        setMessage(
          "Exact original signed payload found in durable intake. This read-only receipt check did not forward an order or restart publication.",
        );
      }
      if (!controller.current.signal.aborted) {
        load();
        if (action !== "retire") onReceipt();
      }
    } catch (e) {
      if (!controller.current.signal.aborted) {
        setError((e as Error).message);
        load();
        setError((e as Error).message);
      }
    } finally {
      if (!controller.current.signal.aborted) setBusy(false);
    }
  };
  return (
    <section className="panel" aria-label="Exact signed-intent recovery">
      <h2>Retained signed intent</h2>
      <p>
        Only this signed-in wallet and genuine account's local public recovery
        bytes are shown. An uncertain send blocks a replacement; receipt
        acceptance does not mean execution or finalized publication.
      </p>
      <Button disabled={busy} onClick={load}>
        Reload retained signature
      </Button>
      {error && (
        <p className="notice rose" role="alert">
          {error} A missing receipt does not prove a request was never accepted.
        </p>
      )}
      {record ? (
        <>
          <p>
            Order reference <code>{record.nonce}</code> ·{" "}
            {record.submission.replaceAll("_", " ")}
          </p>
          <JsonDetails
            title="Exact retained signed intent and receipt"
            value={record}
          />
          <div className="devnet-recovery-actions">
            <Button
              disabled={
                busy ||
                !DEVNET_EXECUTION_RELEASE.intentSubmit ||
                record.submission !== "not_sent"
              }
              onClick={() => void act("submit")}
            >
              Submit this exact signed intent
            </Button>
            <Button
              disabled={
                busy ||
                !DEVNET_EXECUTION_RELEASE.contextRead ||
                record.submission === "retired_not_sent"
              }
              onClick={() => void act("reconcile")}
            >
              Check exact receipt · read only
            </Button>
            <Button
              disabled={
                busy ||
                !DEVNET_EXECUTION_RELEASE.contextRead ||
                record.submission !== "not_sent"
              }
              onClick={() => void act("retire")}
            >
              Retire stale unsent signature
            </Button>
          </div>
        </>
      ) : (
        <p>No retained signed intent for this wallet/account.</p>
      )}
      {message && (
        <p className="notice" role="status">
          {message}
        </p>
      )}
    </section>
  );
}
