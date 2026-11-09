import { PurchasePipeline } from "../devnet/PipelinePanel";
import { useOptionalAuth, useAuth } from "../auth/context";
import type { SessionManager } from "../auth/session";
import { WalletStatusButton as WalletButton } from "../components/WalletStatusButton";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Link, Navigate } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { Brand } from "../components/ui";
import { formatMicro, tierByIndex, TIERS } from "../buy/tiers";
import { PurchaseFlow, type PurchaseSigner } from "../buy/purchaseFlow";
import { sessionPurchaseSigner } from "../buy/sessionSigner";
import {
  PublicAttemptStore,
  browserAttemptLock,
  ATTEMPT_KEY,
} from "../buy/recovery";
import { createGatedPort } from "../buy/livePort";
import { REVIEWED_OWNER_SCOPE } from "../buy/executionGate";
import {
  directWalletChoices,
  watchDirectWallets,
  type DirectWalletChoice,
  type DirectWalletConnection,
} from "../buy/wallets";
import { beginWork } from "../hooks/loading";
import "../buy/Buy.css";
const units = (v: string) => formatMicro(BigInt(v));
const explorer = (kind: "tx" | "address", value: string) =>
  `https://explorer.solana.com/${kind}/${encodeURIComponent(value)}?cluster=devnet`;
const labels = {
  idle: "Review a purchase",
  checking: "Checking your purchase…",
  ready: "Ready for wallet approval",
  blocked: "Purchase unavailable",
  simulating: "Checking the transaction…",
  awaiting_wallet: "Approve in your wallet",
  sending: "Sending your purchase…",
  uncertain: "Check your purchase status",
  confirmed: "Waiting for final confirmation",
  finalized_observed: "Verifying your account",
  verified: "Your purchase is verified",
};
function defaultFlow(auth: SessionManager) {
  return new PurchaseFlow(
    createGatedPort(auth),
    new PublicAttemptStore({
      getItem: (k) => window.localStorage.getItem(k),
      setItem: (k, v) => window.localStorage.setItem(k, v),
      removeItem: (k) => window.localStorage.removeItem(k),
    }),
    browserAttemptLock,
  );
}
export default function Buy({ embedded = false }: { embedded?: boolean }) {
  const auth = useAuth();
  const [flow] = useState(() => defaultFlow(auth.manager));
  const tier = new URLSearchParams(location.search).get("tier");
  if (!embedded && (tier === null || !/^[0-9]$/.test(tier)))
    return <Navigate to="/#pricing" replace />;
  return <BuyView flow={flow} embedded={embedded} />;
}
/** Dependency injection is used by the offline browser harness. The public route always constructs the gated port above. */
export function BuyView({
  flow,
  embedded = false,
  choices = directWalletChoices,
  watch = watchDirectWallets,
  reload = () => window.location.reload(),
}: {
  flow: PurchaseFlow;
  embedded?: boolean;
  choices?: () => DirectWalletChoice[];
  watch?: (fn: () => void) => () => void;
  /** Called after a verified purchase was archived and its lock released. */
  reload?: () => void;
}) {
  const auth = useOptionalAuth();
  const state = useSyncExternalStore(flow.subscribe, flow.getSnapshot),
    mock = flow.port.mode === "offline_mock";
  const [ownerReviewKey, setOwnerReviewKey] = useState<string | null>(null);
  const [wallets, setWallets] = useState(choices),
    [connection, setConnection] = useState<DirectWalletConnection | null>(null),
    [signer, setSigner] = useState<PurchaseSigner | null>(null),
    [error, setError] = useState<string | null>(null),
    [busy, setBusy] = useState(false),
    [restored, setRestored] = useState(false);
  const generation = useRef(0),
    cleanup = useRef(() => {}),
    activeConnection = useRef<DirectWalletConnection | null>(null);
  async function work(fn: () => Promise<unknown>) {
    if (busy) return;
    setBusy(true);
    setError(null);
    const done = beginWork();
    try {
      await fn();
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "This check could not be completed.",
      );
    } finally {
      done();
      setBusy(false);
    }
  }
  useEffect(() => {
    if (!embedded) document.title = "Setl8 — Make a purchase";
    const params = new URLSearchParams(location.search);
    const tier = params.get("tier") ?? params.get("checkout");
    flow.select(null, tier && /^[0-9]$/.test(tier) ? tier : "0");
    let live = true;
    void flow.restore().finally(() => {
      if (live) setRestored(true);
    });
    const off = watch(() => setWallets(choices()));
    const storage = (event: StorageEvent) => {
      if (event.key === ATTEMPT_KEY) void flow.restore();
    };
    window.addEventListener("storage", storage);
    return () => {
      live = false;
      generation.current++;
      off();
      cleanup.current();
      activeConnection.current?.dispose();
      window.removeEventListener("storage", storage);
      flow.dispose();
    };
  }, [flow, choices, watch]);
  async function connect(choice: DirectWalletChoice) {
    const g = ++generation.current;
    cleanup.current();
    activeConnection.current?.dispose();
    setConnection(null);
    setSigner(null);
    flow.select(null, flow.getSnapshot().tier);
    await work(async () => {
      const c = await choice.connect();
      if (g !== generation.current) {
        c.dispose();
        return;
      }
      activeConnection.current = c;
      setConnection(c);
      const choose = (address: string) => {
        const account = c.accounts.find((a) => a.address === address);
        if (!account) return;
        const s = c.signer(account);
        setSigner(s);
        flow.select(s.address, flow.getSnapshot().tier);
      };
      if (c.accounts.length === 1) choose(c.accounts[0].address);
      cleanup.current = c.onChange(() => {
        generation.current++;
        setSigner(null);
        setConnection(null);
        c.dispose();
        flow.select(null, flow.getSnapshot().tier);
        setError(
          "Wallet account or network changed. Reconnect and review; any earlier attempt is retained.",
        );
      });
    });
  }
  useEffect(() => {
    if (mock) return;
    generation.current++;
    cleanup.current();
    activeConnection.current?.dispose();
    activeConnection.current = null;
    const session = auth?.session,
      manager = auth?.manager,
      c = manager?.getPurchaseConnection();
    const account = c?.accounts.find((a) => a.address === session?.wallet);
    setConnection(c ?? null);
    setSigner(null);
    setOwnerReviewKey(null);
    if (
      session &&
      manager &&
      c &&
      account &&
      manager.isPurchaseWallet(session.wallet)
    ) {
      const epoch = manager.getSnapshot().epoch,
        raw = c.signer(account);
      const valid = () =>
        manager.getSnapshot().epoch === epoch &&
        manager.isPurchaseWallet(session.wallet) &&
        manager.getPurchaseConnection() === c;
      setSigner(
        sessionPurchaseSigner(raw, valid, () => {
          flow.select(null, flow.getSnapshot().tier);
        }),
      );
      flow.select(session.wallet, flow.getSnapshot().tier);
    } else flow.select(null, flow.getSnapshot().tier);
  }, [
    mock,
    flow,
    auth?.manager,
    auth?.epoch,
    auth?.phase,
    auth?.session?.wallet,
  ]);
  const checked = state.checked,
    attempt = state.attempt,
    picked = tierByIndex(Number(state.tier))!;
  const restriction = state.wallet
    ? (flow.port.purchaseRestriction?.(state.wallet, state.tier, checked) ??
      null)
    : null;
  const canCheck =
    !restriction &&
    restored &&
    !!state.wallet &&
    (mock ||
      (!!auth?.session &&
        auth.session.wallet === state.wallet &&
        auth.manager.isPurchaseWallet(state.wallet))) &&
    !attempt &&
    state.phase !== "blocked" &&
    !busy &&
    state.phase !== "checking";
  const reviewKey = checked
    ? `${checked.epoch}:${checked.checkedAt}:${checked.prepared.messageSha256}`
    : null;
  const ownerReview =
    checked && ownerReviewKey === reviewKey
      ? {
          wallet: checked.wallet,
          epoch: checked.epoch,
          expectedAccount: checked.expectedAccount,
          messageSha256: checked.prepared.messageSha256,
          fingerprint: checked.fingerprint,
          checkedAt: checked.checkedAt,
          total: checked.total,
          devnetTestTokens: true as const,
          noDebitCapAcknowledged: true as const,
        }
      : undefined;
  const requestApproval =
    mock || flow.port.canRequestApproval?.(state.wallet ?? "") === true;
  const progress = [
    "checking",
    "simulating",
    "awaiting_wallet",
    "sending",
  ].includes(state.phase);
  const changeTier = (value: string) => {
    if (attempt || busy || progress) return;
    flow.select(state.wallet, value);
    const url = new URL(window.location.href);
    url.searchParams.set(embedded ? "checkout" : "tier", value);
    window.history.replaceState(window.history.state, "", url);
  };
  return (
    <div
      className={
        "buy-page checkout-simple" + (embedded ? " checkout-embedded" : "")
      }
    >
      {mock && (
        <div className="buy-mock-mark">
          MOCKED WALLET - NOT A REAL TRANSACTION
        </div>
      )}
      {!embedded && (
        <header className="site-header wrap buy-header">
          <Brand />
          <nav aria-label="Purchase navigation">
            <Link to="/#pricing">
              <ArrowLeft size={14} /> Account sizes
            </Link>
          </nav>
          {auth?.session && <WalletButton />}
        </header>
      )}
      <div className="checkout-body">
        {!embedded && <h1>Make a purchase</h1>}
        <p className="checkout-network">Solana devnet · test tokens</p>
        <ol className="checkout-steps" aria-label="Purchase progress">
          {["Connect", "Review", "Approve", "Account"].map((step, i) => (
            <li
              key={step}
              aria-current={
                (attempt ? 3 : checked ? 2 : state.wallet ? 1 : 0) === i
                  ? "step"
                  : undefined
              }
            >
              {step}
            </li>
          ))}
        </ol>
        {mock && connection && connection.accounts.length > 1 && (
          <label>
            Connected account
            <select
              aria-label="Connected account"
              value={state.wallet ?? ""}
              onChange={(e) => {
                const account = connection.accounts.find(
                  (a) => a.address === e.target.value,
                );
                if (account) {
                  const next = connection.signer(account);
                  setSigner(next);
                  flow.select(next.address, state.tier);
                }
              }}
            >
              <option value="" disabled>
                Choose account
              </option>
              {connection.accounts.map((a) => (
                <option key={a.address} value={a.address}>
                  {a.address}
                </option>
              ))}
            </select>
          </label>
        )}
        <section aria-label="Purchase review" className="checkout-summary">
          {!attempt && (
            <label className="checkout-size">
              Account size
              <select
                aria-label="Choose an account size"
                value={state.tier}
                disabled={busy || progress || !restored}
                onChange={(e) => changeTier(e.target.value)}
              >
                {TIERS.map((t) => (
                  <option key={t.index} value={t.index}>
                    {"$" + t.accountSizeUsd.toLocaleString("en-US")}
                  </option>
                ))}
              </select>
            </label>
          )}
          <dl className="checkout-cost">
            <dt>Challenge price</dt>
            <dd>
              {attempt
                ? units(attempt.price)
                : checked
                  ? units(checked.price)
                  : formatMicro(picked.priceMicro)}{" "}
              test USDC
            </dd>
            <dt>Fee · 0.4%</dt>
            <dd>
              {attempt
                ? units(attempt.fee)
                : checked
                  ? units(checked.fee)
                  : formatMicro(picked.feeMicro)}{" "}
              test USDC
            </dd>
            <dt className="checkout-total">Total</dt>
            <dd className="checkout-total">
              {attempt
                ? units(attempt.total)
                : checked
                  ? units(checked.total)
                  : formatMicro(picked.totalMicro)}{" "}
              test USDC
            </dd>
          </dl>
          {!checked && !attempt && (
            <p className="buy-fine">
              Current terms are checked before wallet approval. Network fees are
              paid in SOL.
            </p>
          )}
          <h2 role="status" aria-live="polite">
            {labels[state.phase]}
          </h2>
          {!mock && !attempt && !auth?.session ? (
            <>
              <p className="buy-fine">
                Connect your wallet to continue. Signing in does not spend
                tokens.
              </p>
              <button
                className="button primary buy-primary"
                onClick={() => auth?.open()}
              >
                Connect wallet
              </button>
            </>
          ) : !mock && !attempt && !signer ? (
            <>
              <p className="buy-fine">
                {auth?.manager.getPurchaseUnavailableReason()}
              </p>
              <button
                className="button primary buy-primary"
                onClick={() => auth?.open()}
              >
                Wallet options
              </button>
            </>
          ) : mock && !connection && !attempt ? (
            <div className="buy-wallet-list">
              {wallets.map((w) => (
                <button
                  key={w.name}
                  className="button primary"
                  disabled={!!w.unsupported || busy || !restored}
                  onClick={() => void connect(w)}
                >
                  Connect {w.name}
                </button>
              ))}
            </div>
          ) : attempt ? (
            <>
              <p className="buy-fine">
                {state.phase === "verified"
                  ? "Your purchase has been verified. Make another purchase or open your dashboard."
                  : "Your earlier purchase is saved. Check its status before starting another payment."}
              </p>
              {state.result && state.phase !== "verified" && (
                // The outcome of the last status check, in the reconciliation's own words. Without it an
                // "uncertain" answer looked identical to never having checked.
                <p className="buy-fine" role="status">
                  {state.result.message}
                </p>
              )}
              {state.phase !== "verified" && (
                <button
                  className="button primary buy-primary"
                  disabled={busy || !restored}
                  onClick={() => void work(() => flow.checkAgain())}
                >
                  {busy ? "Checking…" : "Check purchase status"}
                </button>
              )}
              <Link to="/my-account" className="button secondary">
                Go to dashboard
              </Link>
              {state.phase === "verified" && attempt.stage === "verified" && (
                <>
                  <button
                    className="button primary buy-primary"
                    disabled={busy || !restored}
                    onClick={() =>
                      void work(async () => {
                        await flow.startAnother();
                        // A fresh page gives a fresh checkout port: its one-send-per-load guard is not reused.
                        reload();
                      })
                    }
                  >
                    {busy ? "Checking…" : "Start another purchase"}
                  </button>
                  <p className="buy-fine">
                    This purchase is checked once more, saved in your verified
                    purchases, and only then is the lock released. The page then
                    reloads for a fresh start.
                  </p>
                </>
              )}
            </>
          ) : restriction ? (
            <>
              <p className="buy-fine" role="status">
                {restriction}
              </p>
              {requestApproval &&
              !REVIEWED_OWNER_SCOPE.tiers.includes(state.tier) ? (
                <button
                  className="button primary buy-primary"
                  onClick={() => changeTier("0")}
                >
                  Use $2.5K test account
                </button>
              ) : (
                <Link to="/my-account" className="button secondary">
                  Go to dashboard
                </Link>
              )}
            </>
          ) : checked && requestApproval ? (
            <>
              {flow.port.requiresOwnerReview && (
                <label className="buy-owner-review">
                  <input
                    type="checkbox"
                    checked={!!ownerReview}
                    onChange={(e) =>
                      setOwnerReviewKey(e.target.checked ? reviewKey : null)
                    }
                  />
                  I reviewed this account and total for devnet test tokens. The
                  instruction has no signed maximum debit or expiry.
                </label>
              )}
              <button
                className="button primary buy-primary"
                disabled={
                  !signer ||
                  busy ||
                  (flow.port.requiresOwnerReview && !ownerReview)
                }
                onClick={() =>
                  signer && void work(() => flow.approve(signer, ownerReview))
                }
              >
                {progress
                  ? labels[state.phase]
                  : mock
                    ? "Approve in mocked wallet"
                    : "Approve purchase in wallet"}
              </button>
            </>
          ) : (
            <>
              <button
                className="button primary buy-primary"
                disabled={!canCheck}
                onClick={() => void work(() => flow.check())}
              >
                {!restored
                  ? "Restoring saved purchase…"
                  : busy || state.phase === "checking"
                    ? "Checking purchase…"
                    : checked
                      ? "Refresh purchase review"
                      : "Review total"}
              </button>
              {(restriction || !requestApproval) && (
                <p className="buy-fine" role="status">
                  {restriction ??
                    "Purchase approval is currently unavailable for this wallet."}
                </p>
              )}
            </>
          )}
          {(error || state.error) && (
            <p className="buy-error" role="alert">
              {error ?? state.error}
            </p>
          )}
          {checked && (
            <p className="buy-fine">
              Your wallet asks for a separate approval to pay. Review its
              transaction before signing.
            </p>
          )}
          <details className="buy-details">
            <summary>Purchase details & recovery</summary>
            <p>
              Wallet login and payment are separate approvals. A fresh review
              checks current terms. The open-account instruction has no signed
              maximum debit or expiry, so configuration changes before execution
              can affect the debit.
            </p>
            {(state.wallet || auth?.session?.wallet) && (
              <p>
                Wallet <code>{state.wallet ?? auth?.session?.wallet}</code>
              </p>
            )}
            {checked && (
              <>
                <dl>
                  <dt>Network fee</dt>
                  <dd>{checked.networkFee} lamports</dd>
                  <dt>Account rent</dt>
                  <dd>{checked.rent} lamports</dd>
                  <dt>SOL required</dt>
                  <dd>{checked.solRequired} lamports</dd>
                  <dt>Expected account</dt>
                  <dd>
                    <code>{checked.expectedAccount}</code>
                  </dd>
                  <dt>Message SHA-256</dt>
                  <dd>
                    <code>{checked.prepared.messageSha256}</code>
                  </dd>
                  <dt>Review expires</dt>
                  <dd>{new Date(Number(checked.expiresAt)).toISOString()}</dd>
                </dl>
                <ul>
                  {checked.checks.map((c) => (
                    <li key={c}>{c}</li>
                  ))}
                </ul>
                <p>
                  Exact SDK message with 400,000 compute units. One wallet-added
                  compute-unit price instruction is accepted up to 0.001 SOL.
                  The signed packet is checked before forwarding.
                </p>
              </>
            )}
            {attempt && (
              <dl>
                <dt>Original wallet</dt>
                <dd>
                  <code>{attempt.wallet}</code>
                </dd>
                <dt>Expected account</dt>
                <dd>
                  <code>{attempt.expectedAccount}</code>
                </dd>
                <dt>Reviewed total</dt>
                <dd>{units(attempt.total)} test USDC</dd>
                {attempt.signature && (
                  <>
                    <dt>Transaction</dt>
                    <dd>
                      <a
                        href={explorer("tx", attempt.signature)}
                        target="_blank"
                        rel="noreferrer"
                      >
                        {attempt.signature}
                      </a>
                    </dd>
                  </>
                )}
                {attempt.signedMessageSha256 && (
                  <>
                    <dt>Signed message SHA-256</dt>
                    <dd>
                      <code>{attempt.signedMessageSha256}</code>
                    </dd>
                    <dt>Wallet priority fee</dt>
                    <dd data-testid="priority-fee">
                      {attempt.priorityFeeLamports ?? "0"} lamports
                    </dd>
                  </>
                )}
                {state.result?.actualDebit && (
                  <>
                    <dt>Observed debit</dt>
                    <dd>{units(state.result.actualDebit)} test USDC</dd>
                  </>
                )}
              </dl>
            )}
            {state.simulation && (
              <p>
                Advisory simulation consumed {state.simulation.unitsConsumed}{" "}
                compute units at slot {state.simulation.slot}.
              </p>
            )}
            {state.diagnostics && (
              <pre data-testid="wallet-diagnostics">
                {JSON.stringify(state.diagnostics, null, 2)}
              </pre>
            )}
            <p>
              Public attempt details and the original signature are retained for
              recovery. A timeout does not start a replacement payment.
            </p>
            {checked && (
              <button
                className="button secondary"
                disabled={!canCheck}
                onClick={() => void work(() => flow.check())}
              >
                Refresh purchase review
              </button>
            )}
          </details>
        </section>
        {!mock && auth?.session && attempt?.signature && (
          <details className="buy-details">
            <summary>Account verification progress</summary>
            <PurchasePipeline attempt={attempt} />
          </details>
        )}
      </div>
    </div>
  );
}
