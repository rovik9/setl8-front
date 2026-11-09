import { useEffect, useRef, useState } from "react";
import { Link, useLocation, useSearchParams } from "react-router-dom";
import {
  LayoutDashboard,
  ChartCandlestick,
  Wallet,
  RefreshCw,
  ArrowUpRight,
  Layers3,
} from "lucide-react";
import { useAuth } from "../auth/context";
import { WalletButton } from "../components/WalletDialog";
import {
  Brand,
  Badge,
  Button,
  Empty,
  JsonDetails,
  Skeleton,
  tabKeys,
} from "../components/ui";
import {
  WorkspaceDataProvider,
  type WorkspaceValue,
} from "../components/Workspace";
import { AccountPanels } from "../components/AccountPanels";

import { useResource } from "../hooks/resource";
import { usePaged } from "../hooks/paged";
import { useAccountBundle } from "../hooks/account";
import { api } from "../api/client";
import { quantity, shortId, usd, timestamp } from "../data/exact";
import { scaledInteger } from "../data/orderDraft";
import type {
  AccountSummary,
  MarketCatalog,
  Page,
  Position,
} from "../api/frontend-v1";
import type {
  PracticeAccount,
  PracticeContext,
  PracticePayoutPage,
} from "../api/practice-v1";
import { practiceHttp, requestId } from "./http";
import { PracticeChart } from "./Chart";
import { PracticeTicket, type TicketChoice } from "./Ticket";
import "./practice.css";
export default function PracticeWorkspace() {
  const auth = useAuth();
  return <PracticeSession key={auth.epoch} />;
}
function useVisible() {
  const [visible, set] = useState(!document.hidden);
  useEffect(() => {
    const f = () => set(!document.hidden);
    document.addEventListener("visibilitychange", f);
    return () => document.removeEventListener("visibilitychange", f);
  }, []);
  return visible;
}
function PracticeSession() {
  const auth = useAuth(),
    visible = useVisible(),
    location = useLocation(),
    [params, setParams] = useSearchParams();
  const enabled = !!auth.session && visible;
  const context = useResource(
    "practice:" + auth.epoch,
    (signal) => practiceHttp.context(auth.session!.wallet, signal),
    enabled,
    3000,
  );
  const accounts = usePaged<AccountSummary>(
    "practice-owned:" + auth.epoch,
    (after, signal) =>
      api.request<Page<AccountSummary>>(
        "/v1/accounts?limit=25" +
          (after ? "&after=" + encodeURIComponent(after) : ""),
        { signal },
      ),
    enabled,
  );
  const market = useResource<MarketCatalog>(
    "practice-market:" + auth.epoch,
    (signal) => api.get("/v1/markets", signal),
    enabled,
  );
  const query = params.get("account"),
    selected = query
      ? context.data?.accounts.find((a) => a.account === query)
      : context.data?.accounts[0];
  const bundle = useAccountBundle(
    selected?.account ?? null,
    false,
    auth.epoch,
    () => auth.manager.expire(),
  );
  const [busy, setBusy] = useState(false),
    [error, setError] = useState<string | null>(null),
    [message, setMessage] = useState<string | null>(null);
  const abort = useRef(new AbortController()),
    generation = useRef(0);
  useEffect(() => {
    const c = new AbortController();
    abort.current = c;
    generation.current++;
    return () => {
      generation.current++;
      c.abort();
    };
  }, [query, location.pathname]);
  const refresh = () => {
    context.refresh();
    bundle.refresh();
    accounts.refresh();
  };
  const enroll = async () => {
    if (!auth.session || busy) return;
    setBusy(true);
    setError(null);
    const epoch = generation.current;
    const key = "setl8.practice.enroll:" + auth.session.wallet;
    try {
      const prior = JSON.parse(localStorage.getItem(key) || "null") as {
        id: string;
        complete: boolean;
      } | null;
      const attempt =
        prior && !prior.complete ? prior : { id: requestId(), complete: false };
      localStorage.setItem(key, JSON.stringify(attempt));
      const r = await practiceHttp.enroll(
        auth.session.wallet,
        attempt.id,
        abort.current.signal,
      );
      localStorage.setItem(
        key,
        JSON.stringify({
          ...attempt,
          complete: true,
          account: r.account.account,
        }),
      );
      if (epoch !== generation.current) return;
      setMessage(
        r.duplicate
          ? "The original practice account was recovered."
          : "Practice account created by the backend. No purchase or funds moved.",
      );
      context.refresh();
      accounts.refresh();
      setParams({ account: r.account.account });
    } catch (e) {
      if (epoch === generation.current)
        setError(
          (e as Error).message +
            " A retry will reuse the same enrollment request.",
        );
    } finally {
      if (epoch === generation.current) setBusy(false);
    }
  };
  const view = location.pathname.endsWith("/terminal")
    ? "terminal"
    : location.pathname.endsWith("/payouts")
      ? "payouts"
      : "overview";
  const suffix = selected ? "?account=" + selected.account : "";
  const value: WorkspaceValue = {
    demo: false,
    base: "/practice",
    account: selected?.account ?? null,
    setAccount: (a) => setParams({ account: a }),
    accounts,
    markets: market.data?.rows ?? [],
    marketError: market.error,
    bundle,
  };
  return (
    <WorkspaceDataProvider value={value}>
      <div className="workspace practice-workspace">
        <aside className="app-sidebar">
          <Brand />
          <span className="sidebar-caption">Practice account</span>
          <nav aria-label="Practice navigation">
            {[
              ["overview", "/practice", "Overview", LayoutDashboard],
              ["terminal", "/practice/terminal", "Terminal", ChartCandlestick],
              ["payouts", "/practice/payouts", "Payout requests", Wallet],
            ].map(([id, path, label, Icon]) => {
              const I = Icon as typeof Wallet;
              return (
                <Link
                  key={String(id)}
                  className={view === id ? "active" : ""}
                  to={String(path) + suffix}
                >
                  <I size={19} />
                  <span>{String(label)}</span>
                </Link>
              );
            })}
          </nav>
          <div className="practice-sidebar-bottom">
            <Link to="/my-account">
              Paid devnet accounts <ArrowUpRight size={14} />
            </Link>
            <Link to="/buy">Choose a devnet tier</Link>
            <Link to="/devnet-proof">Recorded chain proof</Link>
            <p>
              Practice is a separate synthetic replay lane. It is not a paid or
              chain-owned account.
            </p>
          </div>
        </aside>
        <div className="workspace-body">
          <header className="workspace-header practice-header">
            <div>
              <span>Setl8 / Practice</span>
              <Badge tone="amber">Synthetic replay</Badge>
            </div>
            <WalletButton />
          </header>
          <main id="main-content" className={"practice-main practice-" + view}>
            <div className="practice-lane-notice">
              <Layers3 size={17} />
              <span>
                Backend execution · synthetic replay · no real funds or chain
                settlement
              </span>
            </div>
            {!auth.session ? (
              <Empty title="Connect your wallet to practice">
                <p>
                  Sign a login message, create a backend practice account, then
                  review each order before your wallet signs it. No tokens are
                  spent.
                </p>
                <Button variant="primary" onClick={auth.open}>
                  Connect wallet
                </Button>
                <Link className="text-link" to="/buy">
                  Review a separate devnet purchase
                </Link>
              </Empty>
            ) : (
              <>
                <div className="practice-heading">
                  <div>
                    <p className="page-kicker">Your practice workspace</p>
                    <h1>
                      {view === "terminal"
                        ? "Your execution desk."
                        : view === "payouts"
                          ? "A request you can trace."
                          : "Put your process to work."}
                    </h1>
                    <p>
                      Session wallet{" "}
                      <code title={auth.session.wallet}>
                        {shortId(auth.session.wallet, 8)}
                      </code>
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    onClick={refresh}
                    aria-label="Refresh practice account"
                  >
                    <RefreshCw size={16} />
                    Refresh
                  </Button>
                </div>
                {context.error && (
                  <p className="notice rose" role="alert">
                    {context.error}
                    <Button onClick={context.refresh}>
                      Retry practice connection
                    </Button>
                  </p>
                )}
                {error && (
                  <p className="notice rose" role="alert">
                    {error}
                  </p>
                )}
                {message && (
                  <p className="notice" role="status">
                    {message}
                  </p>
                )}
                {context.loading && !context.data ? (
                  <Skeleton rows={3} />
                ) : (
                  context.data && (
                    <>
                      <div className="practice-account-select">
                        <label htmlFor="practice-account">
                          Practice account
                          <select
                            id="practice-account"
                            aria-label="Practice account"
                            value={selected?.account ?? ""}
                            disabled={busy}
                            onChange={(e) =>
                              setParams({ account: e.target.value })
                            }
                          >
                            <option value="">Choose practice account</option>
                            {context.data.accounts.map((a) => (
                              <option key={a.account} value={a.account}>
                                Practice {shortId(a.account)} · $100K ·{" "}
                                {a.state}
                              </option>
                            ))}
                          </select>
                        </label>
                        <Button
                          disabled={busy || context.data.accounts.length >= 16}
                          onClick={() => void enroll()}
                        >
                          {busy
                            ? "Creating…"
                            : context.data.accounts.length
                              ? "Create another practice account"
                              : "Create practice account"}
                        </Button>
                        <span>
                          Fixed $100K synthetic account · Phase 2 fixture · no
                          fee
                        </span>
                      </div>
                      {!selected ? (
                        <Empty
                          title={
                            query
                              ? "Practice account not in this session"
                              : "Start your practice account"
                          }
                        >
                          Create a backend account for this wallet, or select
                          one from its registry. No paid account or filled
                          trading history is invented.
                        </Empty>
                      ) : (
                        <>
                          <div
                            className={
                              "practice-worker " +
                              (selected.quote_stale ||
                              selected.state === "blocked"
                                ? "notice rose"
                                : "")
                            }
                          >
                            <span className="status-dot" />
                            <strong>
                              {selected.state === "blocked"
                                ? "Practice blocked"
                                : selected.quote_stale
                                  ? "Replay quote is stale"
                                  : "Backend replay worker"}
                            </strong>
                            <span>
                              Step {selected.replay_step} · clock{" "}
                              {selected.clock_unix_s} ·{" "}
                              {selected.remaining_input_budget} input budget
                            </span>
                            {selected.blocked_reason && (
                              <p>{selected.blocked_reason}</p>
                            )}
                          </div>
                          {bundle.error && (
                            <p className="notice rose" role="alert">
                              {bundle.error}
                              <Button onClick={bundle.refresh}>
                                Reload account state
                              </Button>
                            </p>
                          )}
                          <PracticeDetails
                            key={selected.account}
                            account={selected}
                            context={context.data}
                            view={view}
                            bundle={bundle}
                            refresh={refresh}
                          />
                        </>
                      )}
                    </>
                  )
                )}
              </>
            )}
          </main>
          <footer className="practice-footer">
            Practice execution and payout audit only. No actual token debit,
            paid-account ownership, live market admission or vault transfer.{" "}
            <Link to="/buy">Devnet checkout is separate</Link>
          </footer>
        </div>
      </div>
    </WorkspaceDataProvider>
  );
}
function PracticeDetails({
  account,
  context,
  view,
  bundle,
  refresh,
}: {
  account: PracticeAccount;
  context: PracticeContext;
  view: string;
  bundle: ReturnType<typeof useAccountBundle>;
  refresh: () => void;
}) {
  const auth = useAuth(),
    [mobile, setMobile] = useState("chart"),
    [tab, setTab] = useState("Positions"),
    [choice, setChoice] = useState<TicketChoice | undefined>();
  const state = bundle.data?.overview.evaluator_state;
  const choose = (p: Partial<TicketChoice>) => {
    setChoice((old) => ({ ...p, revision: (old?.revision ?? 0) + 1 }));
    setMobile("ticket");
  };
  const pnl = state
    ? state.positions.reduce(
        (sum, p) =>
          sum +
          (BigInt(p.qty) *
            (BigInt(account.price_e18) -
              BigInt(p.avg_entry_e12) * 1_000_000n)) /
            1_000_000_000_000_000_000n,
        0n,
      )
    : null;
  const metrics = (
    <div className="practice-metrics">
      {[
        ["Canonical balance", usd(state?.balance_micro)],
        [
          "Balance change, incl. fees",
          state
            ? usd(
                (
                  BigInt(state.balance_micro) -
                  BigInt(account.starting_balance_micro_usd)
                ).toString(),
              )
            : "—",
        ],
        ["Indicative open P/L", pnl === null ? "—" : usd(pnl.toString())],
        [
          "Positions / pending",
          state ? `${state.positions.length} / ${state.pending.length}` : "—",
        ],
        ["Closed trades", state?.trades_closed ?? "—"],
      ].map(([label, value]) => (
        <div key={label}>
          <span>{label}</span>
          <strong>{value}</strong>
        </div>
      ))}
    </div>
  );
  const ledger = useResource(
    "practice-ledger:" + auth.epoch + ":" + account.account,
    (signal) => practiceHttp.ledger(account, signal),
    view !== "terminal",
    6000,
  );
  if (view === "payouts")
    return (
      <>
        {metrics}
        <PracticePayouts
          key={account.account}
          account={account}
          refresh={refresh}
        />
      </>
    );
  const positions = (
    <PracticePositions
      positions={state?.positions ?? null}
      choose={choose}
      price={account.price_e18}
    />
  );
  const history = (
    <div className="practice-history">
      <h2>Canonical account history</h2>
      <p>
        Balances, positions and order state come from the backend evaluator. A
        durable order receipt is not an execution. Complete outcomes and chain
        finality remain unavailable.
      </p>
      <AccountPanels initial="Activity" compact />
      {ledger.error && (
        <p className="notice amber">
          Ledger diagnostics unavailable: {ledger.error}
        </p>
      )}
      {ledger.data && (
        <JsonDetails
          title="Practice ledger and used order references"
          value={ledger.data}
        />
      )}
    </div>
  );
  if (view === "overview")
    return (
      <>
        <div className="practice-account-title">
          <h2>Practice {shortId(account.account)}</h2>
          <Badge tone="amber">Not chain-owned</Badge>
        </div>
        {metrics}
        <div className="practice-overview-grid">
          <section className="practice-overview-chart">
            <PracticeChart account={account} http={practiceHttp} />
          </section>
          <section className="practice-next">
            <h2>Your next move.</h2>
            <p>
              Start with a reviewed, wallet-signed synthetic order. The real
              backend worker evaluates it and persists the result.
            </p>
            <Link
              className="button primary"
              to={"/practice/terminal?account=" + account.account}
            >
              Open practice terminal <ArrowUpRight size={16} />
            </Link>
            <Link
              className="button secondary"
              to={"/practice/payouts?account=" + account.account}
            >
              Inspect payout request history
            </Link>
            <p className="fine-print">
              Practice opens a fixed historical Phase 2 fixture. It does not
              evaluate real payout eligibility, complete phases, or establish a
              paid account.
            </p>
          </section>
        </div>
        {positions}
        {history}
      </>
    );
  return (
    <>
      {metrics}
      <p className="practice-mark-basis">
        Indicative open P/L uses exact quantities/entries and a separate backend
        replay mark; it is not an atomic executable quote or withdrawable
        amount.
      </p>
      <div
        className="mobile-workspace-tabs"
        role="tablist"
        aria-label="Practice terminal panels"
        onKeyDown={tabKeys}
      >
        {[
          ["chart", "Chart"],
          ["ticket", "Ticket"],
          ["account", "Account"],
        ].map(([id, label]) => (
          <button
            key={id}
            role="tab"
            aria-selected={mobile === id}
            tabIndex={mobile === id ? 0 : -1}
            onClick={() => setMobile(id)}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="practice-terminal-grid" data-mobile-tab={mobile}>
        <section className="practice-terminal-chart">
          <PracticeChart account={account} http={practiceHttp} />
        </section>
        <aside className="order-panel practice-terminal-ticket">
          <PracticeTicket
            account={account}
            capabilities={context.capabilities}
            http={practiceHttp}
            choice={choice}
            refresh={refresh}
          />
        </aside>
        <section className="practice-terminal-lower">
          <div
            className="panel-tabs"
            role="tablist"
            aria-label="Practice account panels"
            onKeyDown={tabKeys}
          >
            {["Positions", "Pending orders", "History"].map((t) => (
              <button
                role="tab"
                key={t}
                aria-selected={tab === t}
                tabIndex={tab === t ? 0 : -1}
                onClick={() => setTab(t)}
              >
                {t}
              </button>
            ))}
          </div>
          {tab === "Positions" ? (
            positions
          ) : tab === "Pending orders" ? (
            <div className="practice-pending">
              {!state?.pending.length ? (
                <Empty title="No canonical pending orders">
                  Accepted Limit/Stop orders appear here after the backend
                  evaluates them.
                </Empty>
              ) : (
                state.pending.map((p) => (
                  <div className="practice-pending-row" key={p.nonce}>
                    <span>Pending reference {p.nonce}</span>
                    <Button
                      onClick={() =>
                        choose({
                          kind: "Cancel",
                          targetNonce: p.nonce,
                          quantity: "0",
                          price: "",
                          sl: "",
                          tp: "",
                        })
                      }
                    >
                      Review cancel
                    </Button>
                    <JsonDetails title="Exact pending order bytes" value={p} />
                  </div>
                ))
              )}
            </div>
          ) : (
            history
          )}
        </section>
      </div>
    </>
  );
}
function PracticePositions({
  positions,
  choose,
  price,
}: {
  positions: Position[] | null;
  choose: (p: Partial<TicketChoice>) => void;
  price: string;
}) {
  if (positions === null) return <Skeleton rows={2} />;
  if (!positions.length)
    return (
      <Empty title="No canonical open positions">
        Positions appear after a wallet-signed order is received and executed by
        the backend.
      </Empty>
    );
  return (
    <div
      className="table-scroll"
      tabIndex={0}
      role="region"
      aria-label="Practice positions"
    >
      <table>
        <thead>
          <tr>
            <th>Market / side</th>
            <th>Quantity</th>
            <th>Average entry</th>
            <th>Replay mark</th>
            <th>Protection</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {positions.map((p) => (
            <tr key={p.market}>
              <td>BTC / {p.qty.startsWith("-") ? "Short" : "Long"}</td>
              <td>{quantity(p.qty)}</td>
              <td title={p.avg_entry_e12}>{usd(p.avg_entry_e12, 12, 12)}</td>
              <td title={price}>{usd(price, 18, 2)}</td>
              <td>
                SL {p.sl === "0" ? "—" : usd(p.sl, 12)} / TP{" "}
                {p.tp === "0" ? "—" : usd(p.tp, 12)}
              </td>
              <td>
                <Button
                  onClick={() =>
                    choose({
                      kind: "Close",
                      quantity: "0",
                      side: p.qty.startsWith("-") ? "Sell" : "Buy",
                      price: "",
                      sl: "",
                      tp: "",
                    })
                  }
                >
                  Review close / reduce
                </Button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="fine-print">
        Close with zero quantity closes the whole current position; enter an
        exact positive quantity for a reduction. There is no percent/dust
        automation or position-generation guarantee.
      </p>
    </div>
  );
}
function PracticePayouts({
  account,
  refresh,
}: {
  account: PracticeAccount;
  refresh: () => void;
}) {
  const auth = useAuth(),
    [amount, setAmount] = useState("100"),
    [busy, setBusy] = useState(false),
    [error, setError] = useState<string | null>(null),
    [message, setMessage] = useState<string | null>(null),
    controller = useRef(new AbortController());
  const page = usePaged(
    "practice-payouts:" + auth.epoch,
    (after, signal) => practiceHttp.payouts(after, signal),
    true,
  );
  useEffect(() => () => controller.current.abort(), []);
  const request = async () => {
    setBusy(true);
    setError(null);
    const key =
      "setl8.practice.payout:" + account.wallet + ":" + account.account;
    try {
      const prior = JSON.parse(localStorage.getItem(key) || "null") as {
        id: string;
        amount: string;
        complete: boolean;
      } | null;
      const attempt =
        prior && !prior.complete
          ? prior
          : {
              id: requestId(),
              amount: scaledInteger(amount, 6, "Requested amount").toString(),
              complete: false,
            };
      if (BigInt(attempt.amount) === 0n)
        throw Error("Enter a positive simulated request amount.");
      localStorage.setItem(key, JSON.stringify(attempt));
      const r = await practiceHttp.payout(
        account,
        attempt.amount,
        attempt.id,
        controller.current.signal,
      );
      localStorage.setItem(
        key,
        JSON.stringify({ ...attempt, complete: true, payout: r.payout.id }),
      );
      setMessage(
        "Simulated request queued. Eligibility not evaluated; no balance debit or transfer.",
      );
      page.refresh();
      refresh();
    } catch (e) {
      if (!controller.current.signal.aborted)
        setError(
          (e as Error).message +
            " Retry retains the exact pending request amount and identifier.",
        );
    } finally {
      if (!controller.current.signal.aborted) setBusy(false);
    }
  };
  const cancel = async (id: string) => {
    setBusy(true);
    setError(null);
    try {
      const key =
        "setl8.practice.payout.cancel:" + auth.session!.wallet + ":" + id;
      const attempt = localStorage.getItem(key) || requestId();
      localStorage.setItem(key, attempt);
      await practiceHttp.cancelPayout(id, attempt, controller.current.signal);
      page.refresh();
      setMessage(
        "Practice request cancelled in its durable audit history. No payment was made.",
      );
    } catch (e) {
      if (!controller.current.signal.aborted) setError((e as Error).message);
    } finally {
      if (!controller.current.signal.aborted) setBusy(false);
    }
  };
  const rows = (page.rows as PracticePayoutPage["rows"]).filter(
    (p) => p.account === account.account,
  );
  return (
    <section className="practice-payouts">
      <div className="notice amber">
        <strong>Simulation queue only.</strong> Requests can be queued or
        cancelled. Eligibility is not evaluated, balances are not debited and
        settlement is not sent. These are not real vault withdrawals or paid
        history.
      </div>
      <div className="practice-payout-form">
        <label htmlFor="practice-payout-amount">
          Simulated requested USD
          <input
            id="practice-payout-amount"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            inputMode="decimal"
          />
        </label>
        <Button
          variant="primary"
          disabled={busy}
          onClick={() => void request()}
        >
          {busy ? "Recording…" : "Queue simulated payout request"}
        </Button>
      </div>
      {error && (
        <p className="notice rose" role="alert">
          {error}
        </p>
      )}
      {message && (
        <p className="notice" role="status">
          {message}
        </p>
      )}
      {page.error && (
        <p role="alert" className="notice rose">
          {page.error}
          <Button onClick={page.refresh}>Retry queue read</Button>
        </p>
      )}
      {page.loading && !rows.length ? (
        <Skeleton rows={3} />
      ) : !rows.length ? (
        <Empty title="No simulated payout requests">
          Create a request to inspect its persistent queued/cancelled audit
          trail.
        </Empty>
      ) : (
        <div className="practice-payout-list">
          {rows.map((p) => (
            <article key={p.id}>
              <div className="section-top">
                <h3>{usd(p.amount_micro_usd)}</h3>
                <Badge tone={p.state === "queued" ? "amber" : "blue"}>
                  {p.state}
                </Badge>
              </div>
              <p>
                {timestamp(p.created_unix_ns)} · {shortId(p.id)}
              </p>
              <dl className="definition-list">
                <div>
                  <dt>Eligibility</dt>
                  <dd>Not evaluated</dd>
                </div>
                <div>
                  <dt>Funds sent</dt>
                  <dd>No</dd>
                </div>
                <div>
                  <dt>Balance effect</dt>
                  <dd>None</dd>
                </div>
                <div>
                  <dt>Withdrawable amount</dt>
                  <dd>Unavailable</dd>
                </div>
              </dl>
              {p.state === "queued" && (
                <Button disabled={busy} onClick={() => void cancel(p.id)}>
                  Cancel simulated request
                </Button>
              )}
              <JsonDetails
                title="Immutable request events and preview basis"
                value={p}
              />
            </article>
          ))}
        </div>
      )}
      {page.next && (
        <Button disabled={page.loading} onClick={page.more}>
          Load more request history
        </Button>
      )}
      <p className="fine-print">
        Pages are independent database reads. Actual devnet payout evidence is
        separate on the recorded proof page and does not become paid through
        elapsed time or these simulated requests.
      </p>
      <Link className="text-link" to="/devnet-proof">
        Inspect recorded chain payout evidence <ArrowUpRight size={14} />
      </Link>
    </section>
  );
}
