import { Link } from "react-router-dom";
import {
  ArrowUpRight,
  RefreshCw,
  Activity,
  ShieldCheck,
  ArrowRight,
  Layers3,
  Clock3,
} from "lucide-react";
import {
  useWorkspace,
  AccountSelect,
  AccountBoundary,
} from "../components/Workspace";
import {
  Badge,
  Button,
  CopyValue,
  Empty,
  ErrorState,
  JsonDetails,
  Skeleton,
} from "../components/ui";
import { AccountPanels } from "../components/AccountPanels";
import { usd, shortId, timestamp } from "../data/exact";
import {
  accountContext,
  isAgedRead,
  recordedStatus,
} from "../data/accountPresentation";
import { usePaged } from "../hooks/paged";
import { api } from "../api/client";
import type { Activity as AccountActivity, Page } from "../api/frontend-v1";
import { demoAccount } from "../data/demo";
export default function Dashboard() {
  const w = useWorkspace(),
    bundle = w.bundle.data,
    state = bundle?.overview.evaluator_state;
  const info = bundle ? accountContext(bundle.overview) : null;
  const interrupted =
    !w.demo &&
    (w.bundle.status === "reconnecting" || w.bundle.status === "paused");
  const aged = !w.demo && bundle && isAgedRead(bundle.overview.read_at_unix_ns);
  return (
    <main className="account-journey overview-page" id="main-content">
      <header className="journey-title">
        <div>
          <p className="page-kicker">Your workspace</p>
          <h1>
            Account overview<span>.</span>
          </h1>
          <p>Your account. Your next step.</p>
        </div>
        <Link
          className="button secondary"
          to={w.demo ? "/demo/purchase" : "/purchase"}
        >
          New account
          <ArrowUpRight size={16} />
        </Link>
      </header>
      <div className="journey-context">
        <AccountSelect />
        <div className="journey-update">
          <span className={"status-dot " + (w.demo ? "demo" : "")} />
          {w.demo
            ? "Demo account · Fixture data"
            : w.bundle.status === "connected"
              ? "Account updates connected"
              : interrupted
                ? "Account updates interrupted"
                : "Recorded account reads"}
          <Button
            variant="ghost"
            aria-label="Refresh account"
            onClick={() => {
              w.bundle.refresh();
              w.accounts.refresh();
            }}
          >
            <RefreshCw size={15} />
          </Button>
        </div>
      </div>
      <AccountBoundary>
        {bundle && (
          <>
            <div className="journey-account-heading">
              <div className="journey-account-name">
                <span className="account-emblem">
                  <Layers3 size={21} />
                </span>
                <div>
                  <span className="eyebrow">
                    {w.demo ? "Illustrative account" : "Selected account"}
                  </span>
                  <strong>{shortId(bundle.overview.account, 8)}</strong>
                </div>
                <Badge tone={state ? "blue" : "amber"}>
                  {recordedStatus(state)}
                </Badge>
              </div>
              <div className="account-heading-actions">
                <Link
                  className="button secondary"
                  aria-label="Open terminal for selected account"
                  to={w.base + "/terminal?account=" + bundle.overview.account}
                >
                  Trade
                  <ArrowUpRight size={15} />
                </Link>
                <CopyValue value={bundle.overview.account} />
              </div>
            </div>
            {(interrupted || aged) && (
              <div role="status" className="journey-notice">
                <Clock3 size={17} />
                <div>
                  <strong>
                    {interrupted
                      ? "Updates interrupted"
                      : "This read is over a minute old"}
                  </strong>
                  <p>
                    Showing the last committed account view. Refresh to check
                    for a newer view.
                  </p>
                </div>
              </div>
            )}
            {bundle.overview.worker_error && (
              <div className="notice rose" role="alert">
                Account processing needs attention:{" "}
                {bundle.overview.worker_error}
              </div>
            )}
            <div className="overview-primary">
              <section className="capital-panel">
                <div className="section-top">
                  <span className="eyebrow">
                    {state ? "Closed balance" : "Account initialization"}
                  </span>
                  <Badge tone={w.demo ? "amber" : "blue"}>
                    {w.demo ? "Fixture account" : "Recorded state"}
                  </Badge>
                </div>
                {state ? (
                  <>
                    <h2 className="capital-value">
                      {usd(state.balance_micro)}
                    </h2>
                    <p className="capital-exact">
                      Exact balance {usd(state.balance_micro, 6, 6)}
                    </p>
                    <p className="capital-note">
                      Last committed balance. Open-position P&amp;L is not
                      included.
                    </p>
                  </>
                ) : (
                  <>
                    <h2 className="waiting-heading">
                      Your account is here.
                      <br />A current view isn’t available yet.
                    </h2>
                    <p className="capital-note">
                      Ownership and initialization are separate. Balance and
                      position values appear after a view is committed.
                    </p>
                  </>
                )}
                <dl className="capital-context">
                  {info?.size && (
                    <div>
                      <dt>
                        {info.initial ? "Initial account size" : "Account size"}
                      </dt>
                      <dd>{usd(info.size)}</dd>
                    </div>
                  )}
                  {state &&
                    info?.size &&
                    /^\d+$/.test(state.balance_micro) &&
                    /^\d+$/.test(info.size) && (
                      <div>
                        <dt>Closed result vs account size</dt>
                        <dd className="closed-result">
                          {BigInt(state.balance_micro) > BigInt(info.size)
                            ? "+"
                            : ""}
                          {usd(
                            (
                              BigInt(state.balance_micro) - BigInt(info.size)
                            ).toString(),
                          )}
                        </dd>
                      </div>
                    )}
                  {info?.phase && (
                    <div>
                      <dt>
                        {info.initial ? "Initial phase" : "Current phase"}
                      </dt>
                      <dd>{info.phase}</dd>
                    </div>
                  )}
                  <div>
                    <dt>Balance history</dt>
                    <dd>Not available</dd>
                  </div>
                </dl>
                <div className="capital-baseline">
                  <span />
                  Current snapshot
                  <span className="muted">No historical curve is inferred</span>
                </div>
              </section>
              <aside className="next-step-panel">
                <div className="section-top">
                  <h2>Your next step</h2>
                  <ArrowUpRight size={19} />
                </div>
                <h3>
                  {state
                    ? "Keep your trading in view."
                    : "Explore your trading workspace."}
                </h3>
                <p>
                  View recorded charts, positions and orders for this account.
                  Trading availability is separate from account ownership.
                </p>
                <Link
                  className="button primary full"
                  to={w.base + "/terminal?account=" + bundle.overview.account}
                >
                  Open terminal
                  <ArrowRight size={17} />
                </Link>
                <ul className="readiness-list">
                  <li>
                    <ShieldCheck size={15} />
                    <span>Account record available</span>
                  </li>
                  <li>
                    <Activity size={15} />
                    <span>
                      {state
                        ? "Committed account view available"
                        : "Waiting for the first committed view"}
                    </span>
                  </li>
                  <li>
                    <Clock3 size={15} />
                    <span>
                      {w.demo
                        ? "Illustrative preview only"
                        : "Recorded workspace · Live admission disabled"}
                    </span>
                  </li>
                </ul>
              </aside>
            </div>
            {state && (
              <section
                className="overview-metrics"
                aria-label="Recorded account metrics"
              >
                {[
                  [
                    "Open positions",
                    String(state.positions.length),
                    "Current committed list",
                  ],
                  [
                    "Pending orders",
                    String(state.pending.length),
                    "Current committed list",
                  ],
                  [
                    "Closed trades",
                    state.trades_closed,
                    "Recorded count; not a win rate",
                  ],
                ].map(([label, value, note]) => (
                  <div key={label}>
                    <span>{label}</span>
                    <strong>{value}</strong>
                    <small>{note}</small>
                  </div>
                ))}
              </section>
            )}
            <div className="overview-secondary">
              <RecentActivity />
              <aside className="account-context-panel">
                <span className="eyebrow">Account context</span>
                <h2>Clarity before the next phase.</h2>
                <dl className="definition-list">
                  <div>
                    <dt>{info?.initial ? "Initial phase" : "Current phase"}</dt>
                    <dd>{info?.phase ?? "Unavailable"}</dd>
                  </div>
                  <div>
                    <dt>Recorded status</dt>
                    <dd>{recordedStatus(state)}</dd>
                  </div>
                  <div>
                    <dt>Position state</dt>
                    <dd>
                      {state
                        ? state.flat
                          ? "Recorded flat"
                          : "Recorded non-flat"
                        : "Unavailable"}
                    </dd>
                  </div>
                </dl>
                <p>
                  Targets, remaining risk and payout eligibility need a reviewed
                  rule view. A phase number does not confirm eligibility.
                </p>
                {state?.lock_until && state.lock_until !== "0" && (
                  <p>
                    Recorded lock-until time: {timestamp(state.lock_until, "s")}
                    . This is a recorded value, not a live countdown.
                  </p>
                )}
                <Link
                  className="text-link"
                  to={
                    w.base + "/accounts/list?account=" + bundle.overview.account
                  }
                >
                  Browse your accounts
                  <ArrowUpRight size={14} />
                </Link>
              </aside>
            </div>
            <details className="journey-evidence">
              <summary>
                Positions, orders &amp; evidence
                <span>Inspect account records</span>
              </summary>
              <AccountPanels />
            </details>
            <JsonDetails
              title="Account state and update diagnostics"
              value={bundle.overview}
            />
            <footer className="journey-footnote">
              Read at {timestamp(bundle.overview.read_at_unix_ns)} · Account
              summary and activity pages are independent reads.
            </footer>
          </>
        )}
      </AccountBoundary>
    </main>
  );
}
function RecentActivity() {
  const w = useWorkspace();
  const history = usePaged<AccountActivity>(
    `${w.bundle.key}:overview-activity:${w.bundle.evidenceRevision}`,
    async (after, signal) =>
      w.demo
        ? demoAccount(w.account!).activity
        : api.request<Page<AccountActivity>>(
            `/v1/accounts/${w.account}/activity?limit=6` +
              (after ? "&after=" + encodeURIComponent(after) : ""),
            { signal },
          ),
    !!w.account && !!w.bundle.data,
  );
  return (
    <section className="recent-activity">
      <div className="section-top">
        <div>
          <span className="eyebrow">Account records</span>
          <h2>Account activity</h2>
        </div>
        <Activity size={18} />
      </div>
      {history.error ? (
        <ErrorState message={history.error} retry={history.refresh} />
      ) : history.loading && !history.rows.length ? (
        <Skeleton rows={3} />
      ) : !history.rows.length ? (
        <Empty title="No recorded activity yet">
          Account events will appear here when received.
        </Empty>
      ) : (
        <>
          <ol className="journey-activity-list">
            {history.rows.map((row) => (
              <li key={row.input_seq}>
                <span className="record-dot" />
                <div>
                  <strong>Account input #{row.input_seq}</strong>
                  <small>{timestamp(row.received_unix_ns)}</small>
                </div>
                <Badge>
                  {row.state === "processed" ? "Processed" : "Received"}
                </Badge>
                <details>
                  <summary aria-label={"Inspect input " + row.input_seq}>
                    Details
                  </summary>
                  <JsonDetails title="Recorded activity details" value={row} />
                </details>
              </li>
            ))}
          </ol>
          {history.next && (
            <Button onClick={history.more} disabled={history.loading}>
              {history.loading ? "Loading…" : "Load more activity"}
            </Button>
          )}
          <p className="journey-footnote">
            {history.rows.length} records loaded. Processed inputs do not
            establish execution or payment.
          </p>
        </>
      )}
    </section>
  );
}
