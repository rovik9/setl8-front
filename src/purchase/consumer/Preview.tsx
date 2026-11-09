import { useEffect, useState, useSyncExternalStore } from "react";
import { ArrowUpRight, ArrowRight, RefreshCw, ShieldCheck } from "lucide-react";
import { Badge, Button, JsonDetails } from "../../components/ui";
import { usd, shortId } from "../../data/exact";
import { usePending } from "../../hooks/loading";
import type { PurchaseClient } from "./client";
import type { Scenario } from "./fixtures";
import { exactTokenAmount } from "./display";
import descriptor from "../../../dependencies/p30/3e33090cf9193fd909f57ed75e10f9e59b9409e3c8a8f6c186272d8ee185f86d/p30-descriptor.json";
const token = (v: string, mint: string) =>
  exactTokenAmount(v) +
  (mint === descriptor.usdcMint ? " Test USDC" : " Test USDT");
export function PurchasePreview({
  client,
  nextId,
  wallets,
  onScenario,
}: {
  client: PurchaseClient;
  nextId: () => string;
  wallets: readonly string[];
  onScenario: (s: Scenario) => void;
}) {
  const s = useSyncExternalStore(client.subscribe, client.getSnapshot),
    busy = usePending();
  const [tier, setTier] = useState("0"),
    [, tick] = useState(0);
  useEffect(() => {
    void client.initialize();
    void client.loadOwned();
    const clock = setInterval(() => tick((n) => n + 1), 1000);
    return () => {
      clearInterval(clock);
      client.dispose();
    };
  }, [client]);
  const offer = s.catalog?.offers.find((o) => o.tier_index === tier),
    q = s.quote,
    canPrepare =
      !!q &&
      client.quoteCurrent() &&
      !s.reconcileRequired &&
      !s.historyIncomplete &&
      !s.pending.includes("prepare");
  return (
    <div className="purchase-shell api-preview">
      <div
        className={"top-progress " + (busy ? "busy" : "")}
        role={busy ? "progressbar" : undefined}
        aria-label={busy ? "Loading purchase records" : undefined}
      >
        {busy && <span />}
      </div>
      <header className="purchase-header">
        <a href="/" className="brand" aria-label="Setl8 home">
          <img src="/setl8-logo.png" alt="" width="43" height="43" />
          <span>
            SETL8<span className="brand-dot">®</span>
          </span>
        </a>
        <a href="/purchase" className="text-link">
          Account availability
          <ArrowUpRight size={15} />
        </a>
      </header>
      <main className="purchase-main" id="main-content">
        <div className="purchase-demo-notice">
          <Badge tone="amber">Simulated purchase preview</Badge>
          <span>
            Historical example prices. No payment, wallet prompt or account
            creation.
          </span>
        </div>
        <header className="consumer-heading">
          <div>
            <p className="page-kicker">Your challenge</p>
            <h1>
              Start your SETL8 challenge<span>.</span>
            </h1>
            <p>
              Choose an account, review the cost and preview purchase progress.
            </p>
          </div>
        </header>
        <details className="consumer-controls">
          <summary>Example settings</summary>
          <div>
            <label>
              Example wallet
              <select
                aria-label="Example wallet"
                value={s.scope.wallet}
                onChange={(e) => {
                  client.setScope({
                    ...s.scope,
                    wallet: e.target.value,
                    sessionEpoch: s.scope.sessionEpoch + 1,
                  });
                  void client.initialize();
                  void client.loadOwned();
                }}
              >
                {wallets.map((w, i) => (
                  <option key={w} value={w}>
                    Example wallet {i + 1} · {shortId(w)}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Example scenario
              <select
                aria-label="Example scenario"
                onChange={(e) => {
                  onScenario(e.target.value as Scenario);
                  client.invalidateQuote();
                  void client.initialize();
                  void client.loadOwned();
                }}
              >
                <option value="progress">Purchase progresses normally</option>
                <option value="unknown">Purchase outcome unknown</option>
                <option value="lost_ack">Progress response interrupted</option>
                <option value="mismatch">Account found, price differs</option>
                <option value="partial">Account search incomplete</option>
                <option value="expired">Review expired</option>
              </select>
            </label>
            <p>
              Reload starts these examples over. Nothing is saved or purchased.
            </p>
          </div>
        </details>
        {s.error && (
          <div className="journey-notice" role="alert">
            <ShieldCheck size={18} />
            <p>
              {s.reconcileRequired
                ? "The latest update could not be confirmed. Check this purchase before continuing."
                : "We couldn’t load the latest information. Try again."}
            </p>
          </div>
        )}
        <div className="purchase-grid">
          <section className="purchase-selection">
            <h2>Choose an account.</h2>
            {!s.catalog ? (
              <p>
                {s.pending.includes("catalog")
                  ? "Loading catalogue…"
                  : "Accounts are unavailable. Try again later."}
              </p>
            ) : (
              <>
                <p>
                  Illustrative historical prices, recorded 1 Nov 2026. Current
                  offers may differ.
                </p>
                <fieldset className="purchase-sizes">
                  <legend>Account size</legend>
                  {s.catalog.offers.map((o) => (
                    <button
                      key={o.tier_index}
                      type="button"
                      aria-pressed={tier === o.tier_index}
                      onClick={() => {
                        client.invalidateQuote();
                        setTier(o.tier_index);
                      }}
                    >
                      <span>{usd(o.account_size_micro_usd, 6, 0)}</span>
                      <small>Account size</small>
                      <strong>
                        {token(
                          o.charge.total_token_debit_atoms,
                          o.charge.mint.address,
                        )}
                      </strong>
                    </button>
                  ))}
                </fieldset>
                <Button
                  variant="primary"
                  disabled={
                    !offer || s.reconcileRequired || s.pending.includes("quote")
                  }
                  onClick={() =>
                    void client.requestQuote(
                      tier,
                      offer!.charge.mint.address,
                      nextId(),
                    )
                  }
                >
                  {s.pending.includes("quote")
                    ? "Loading price…"
                    : "Review this account"}
                  <ArrowRight size={15} />
                </Button>
              </>
            )}
            {s.historyIncomplete && (
              <p className="purchase-muted">
                The purchase search is incomplete. Check progress before
                continuing.
              </p>
            )}
            {(s.reconcileRequired || s.historyIncomplete) && (
              <div className="consumer-recovery" role="status">
                <strong>
                  {s.reconcileRequired
                    ? "Check your purchase before continuing."
                    : "Finish checking purchase progress."}
                </strong>
                <p>
                  {s.reconcileRequired
                    ? "The earlier purchase may still be in progress. Check it before starting again."
                    : "The search is incomplete. Check the remaining results or start a fresh search."}
                </p>
                <Button
                  onClick={() => void client.reconcile()}
                  disabled={s.pending.includes("recovery")}
                >
                  Check purchase progress
                </Button>
                {s.history?.has_more && (
                  <Button
                    onClick={() => void client.reconcile(true)}
                    disabled={s.pending.includes("recovery")}
                  >
                    Show more purchases
                  </Button>
                )}
              </div>
            )}
          </section>
          <aside className="purchase-review">
            <div className="section-top">
              <h2>Review your challenge</h2>
            </div>
            {q ? (
              <>
                <div className="purchase-review-size">
                  {usd(q.offer.account_size_micro_usd, 6, 0)}
                  <span>Account availability still needs to be confirmed</span>
                </div>
                <dl>
                  <div>
                    <dt>Base price</dt>
                    <dd>
                      {token(
                        q.offer.charge.tier_price_atoms,
                        q.offer.charge.mint.address,
                      )}
                    </dd>
                  </div>
                  <div>
                    <dt>Purchase fee</dt>
                    <dd>
                      {token(
                        q.offer.charge.purchase_fee_atoms,
                        q.offer.charge.mint.address,
                      )}
                    </dd>
                  </div>
                  <div className="purchase-total">
                    <dt>Exact total</dt>
                    <dd>
                      {token(
                        q.offer.charge.total_token_debit_atoms,
                        q.offer.charge.mint.address,
                      )}
                    </dd>
                  </div>
                  <div>
                    <dt>SOL costs</dt>
                    <dd>Not estimated</dd>
                  </div>
                </dl>
                <p>
                  {client.quoteCurrent()
                    ? "This example price is ready to review. A real purchase would need a new price and availability check."
                    : "This review has expired. Review the account again to continue."}
                </p>
                <Button
                  className="full"
                  variant="primary"
                  disabled={!canPrepare}
                  onClick={() =>
                    void client.recordAttempt(
                      nextId(),
                      {
                        recentBlockhash: "11111111111111111111111111111111",
                        lastValidBlockHeight: "999",
                      },
                      { kind: "omitted" },
                    )
                  }
                >
                  {s.pending.includes("prepare")
                    ? "Preparing preview…"
                    : "Preview purchase progress"}
                </Button>
                <p>See how a purchase would progress without paying.</p>
              </>
            ) : (
              <>
                <div className="purchase-review-size">
                  Your account review
                  <span>Choose an account to review the price and fee.</span>
                </div>
                <p>Your review will appear here.</p>
              </>
            )}
          </aside>
        </div>
        {(s.status || s.pendingAttempt) && (
          <section className="consumer-confirmation">
            <div className="section-top">
              <div>
                <h2>Track your purchase</h2>
              </div>
              <Button
                disabled={
                  s.pending.includes("status") || s.pending.includes("recovery")
                }
                onClick={() => {
                  void client.refreshStatus().then(() => client.loadOwned());
                }}
              >
                <RefreshCw size={14} />
                Show next update
              </Button>
            </div>
            <div className="consumer-stages">
              {[
                [
                  "Purchase request",
                  s.status?.submission.state === "prepared"
                    ? "Ready"
                    : s.status?.submission.state === "submitted"
                      ? "Reported"
                      : "Outcome unknown",
                ],
                [
                  "Network confirmation",
                  s.status?.chain.state === "finalized"
                    ? "Confirmed"
                    : s.status?.chain.state === "failed"
                      ? "Unsuccessful"
                      : "Pending",
                ],
                [
                  "Purchase checks",
                  s.status?.verification.state === "verified"
                    ? "Complete"
                    : s.status?.verification.state === "blocked"
                      ? "Needs attention"
                      : "Pending",
                ],
                [
                  "Account",
                  s.status?.indexing.state === "indexed" ? "Found" : "Pending",
                ],
              ].map(([name, value]) => (
                <div key={name}>
                  <span>{name}</span>
                  <strong>{value}</strong>
                </div>
              ))}
            </div>
            {s.status?.verification.quote_match === "different" && (
              <p className="consumer-recovery">
                The recorded price differs from the review. Purchase checks need
                attention; the account can still appear below.
              </p>
            )}
            {s.status?.verification.actual_charge && (
              <p className="consumer-actual">
                Recorded cost:{" "}
                {token(
                  s.status.verification.actual_charge.total_token_debit_atoms,
                  s.status.verification.actual_charge.mint.address,
                )}
              </p>
            )}
            <p className="purchase-muted">
              A purchase can be confirmed while account checks and trading setup
              are still pending.
            </p>
          </section>
        )}
        <section className="consumer-owned">
          <div className="section-top">
            <div>
              <h2>Your accounts</h2>
            </div>
            <Button
              variant="ghost"
              aria-label="Refresh accounts"
              onClick={() => void client.loadOwned()}
            >
              <RefreshCw size={16} />
            </Button>
          </div>
          {s.pending.includes("owned") ? (
            <p>Loading account records…</p>
          ) : !s.owned ? (
            <p>Accounts are unavailable. Try again later.</p>
          ) : s.owned.coverage.discovery !== "complete_through_checkpoint" ||
            s.owned.coverage.missing_history ? (
            <p className="consumer-recovery">
              The account search is incomplete. More accounts may still be
              found.
            </p>
          ) : !s.owned.rows.length ? (
            <p>No accounts found in this example.</p>
          ) : null}
          <div className="consumer-account-grid">
            {s.owned?.rows.map((row) => (
              <article key={row.account}>
                <h3>{usd(row.account_size_micro_usd)}</h3>
                <p>Account {shortId(row.account)}</p>
                <dl>
                  <div>
                    <dt>Account phase</dt>
                    <dd>{row.current_chain_state?.phase ?? "Unavailable"}</dd>
                  </div>
                  <div>
                    <dt>Trading setup</dt>
                    <dd>Pending</dd>
                  </div>
                  <div>
                    <dt>Trading access</dt>
                    <dd>Unavailable</dd>
                  </div>
                </dl>
                <Button onClick={() => void client.openAccount(row.account)}>
                  View account details
                  <ArrowUpRight size={14} />
                </Button>
              </article>
            ))}
          </div>
          {s.owned?.has_more && (
            <Button onClick={() => void client.loadOwned(true)}>
              Show more accounts
            </Button>
          )}
          {s.account && (
            <div
              className="consumer-account-detail"
              role="region"
              aria-label="Selected example account"
            >
              <h3>Selected account {shortId(s.account.row.account)}</h3>
              <p>
                Account phase{" "}
                {s.account.row.current_chain_state?.phase ?? "unavailable"}.
                Trading setup is pending. Trading access is unavailable.
              </p>
              <p>
                Your account can appear here while its trading setup is still
                pending.
              </p>
            </div>
          )}
        </section>
        <details className="consumer-diagnostics">
          <summary>Public context &amp; diagnostic records</summary>
          <JsonDetails
            title="Scope and DTO evidence"
            value={{
              scope: s.scope,
              error: s.error,
              quote: s.quote,
              status: s.status,
              coverage: s.owned?.coverage,
            }}
          />
          {s.prepared && (
            <JsonDetails
              title="Exact unsigned preparation"
              value={s.prepared}
            />
          )}
        </details>
        <footer className="purchase-footer">
          <ShieldCheck size={15} />
          Need to check a price? Choose an account to start a new review.
        </footer>
      </main>
    </div>
  );
}
