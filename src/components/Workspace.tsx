import { prototypeEnabled } from "../prototype/profile";
import { createContext, useContext, type ReactNode } from "react";
import {
  NavLink,
  Link,
  Outlet,
  useLocation,
  useSearchParams,
} from "react-router-dom";
import {
  LayoutDashboard,
  Layers3,
  ChartCandlestick,
  ShieldCheck,
  LogOut,
  ArrowUpRight,
  Wallet,
  ArrowLeft,
  RefreshCw,
} from "lucide-react";
import { useAuth } from "../auth/context";
import { api } from "../api/client";
import { usePaged } from "../hooks/paged";
import { useResource } from "../hooks/resource";
import { useAccountBundle } from "../hooks/account";
import { demoAccounts, demoMarkets } from "../data/demo";
import type { AccountSummary, MarketCatalog, Page } from "../api/frontend-v1";
import { shortId } from "../data/exact";
import { Brand, Badge, Button, Empty, ErrorState, Skeleton } from "./ui";
import { WalletButton } from "./WalletDialog";
export type WorkspaceValue = {
  demo: boolean;
  base: string;
  account: string | null;
  setAccount: (account: string) => void;
  accounts: ReturnType<typeof usePaged<AccountSummary>>;
  markets: MarketCatalog["rows"];
  marketError: string | null;
  bundle: ReturnType<typeof useAccountBundle>;
};
const Context = createContext<WorkspaceValue | null>(null);
export const WorkspaceDataProvider = Context.Provider;
export function useWorkspace() {
  const ctx = useContext(Context);
  if (!ctx) throw new Error("Workspace required");
  return ctx;
}
export default function Workspace({ demo = false }: { demo?: boolean }) {
  const auth = useAuth();
  return <WorkspaceContent key={`${demo}:${auth.epoch}`} demo={demo} />;
}
function WorkspaceContent({ demo }: { demo: boolean }) {
  const auth = useAuth();
  const base = demo ? "/demo" : "/app";
  const location = useLocation();
  const terminal = location.pathname.endsWith("/terminal");
  const [params, setParams] = useSearchParams();
  const enabled = demo || !!auth.session;
  const accounts = usePaged<AccountSummary>(
    `accounts:${demo}:${auth.epoch}`,
    (after, signal) =>
      demo
        ? Promise.resolve({
            api_version: "1",
            rows: demoAccounts,
            next_after: null,
            has_more: false,
          })
        : api.request<Page<AccountSummary>>(
            "/v1/accounts?limit=25" +
              (after ? "&after=" + encodeURIComponent(after) : ""),
            { signal },
          ),
    enabled,
  );
  const catalog = useResource(
    `catalog:${demo}:${auth.epoch}`,
    (signal) =>
      demo
        ? Promise.resolve({
            api_version: "1",
            rows: demoMarkets,
            launch_sha256: "",
            live_admission: "disabled",
            production_reorder_window_ns: null,
          } as MarketCatalog)
        : api.get("/v1/markets", signal),
    enabled,
  );
  const requested = params.get("account");
  const account = enabled
    ? requested && /^[a-f0-9]{64}$/.test(requested)
      ? requested
      : (accounts.rows[0]?.account ?? null)
    : null;
  const bundle = useAccountBundle(account, demo, auth.epoch, () =>
    auth.manager.expire(),
  );
  const value: WorkspaceValue = {
    demo,
    base,
    account,
    setAccount: (account) => setParams({ account }),
    accounts,
    markets: catalog.data?.rows ?? [],
    marketError: catalog.error,
    bundle,
  };
  const suffix = account ? "?account=" + account : "";
  return (
    <Context.Provider value={value}>
      <div className={`workspace ${terminal ? "terminal-shell" : ""}`}>
        <aside className="app-sidebar">
          <Brand compact={terminal} />
          <div className="sidebar-main">
            <span className="sidebar-caption">Workspace</span>
            <nav aria-label="Workspace">
              <NavLink
                end
                aria-label="Overview"
                to={base + "/accounts" + suffix}
              >
                <LayoutDashboard size={19} />
                <span>Overview</span>
              </NavLink>
              <NavLink
                aria-label="Accounts"
                to={base + "/accounts/list" + suffix}
              >
                <Layers3 size={19} />
                <span>Accounts</span>
              </NavLink>
              <NavLink aria-label="Terminal" to={base + "/terminal" + suffix}>
                <ChartCandlestick size={19} />
                <span>Terminal</span>
              </NavLink>
              {!demo && auth.session?.admin_read && (
                <NavLink to={base + "/admin"}>
                  <ShieldCheck size={19} />
                  <span>Operations</span>
                </NavLink>
              )}
            </nav>
          </div>
          <div className="sidebar-bottom">
            <div className="sidebar-product">
              <span className="status-dot" />
              <span>
                Leveraged trading
                <br />
                <small>Development workspace</small>
              </span>
            </div>
            <Link to="/" aria-label="Back to Setl8" className="sidebar-link">
              <ArrowLeft size={16} />
              <span>Back to Setl8</span>
            </Link>
            {auth.session && !demo && (
              <button
                className="sidebar-link"
                aria-label="Log out"
                onClick={() => void auth.manager.logout()}
              >
                <LogOut size={16} />
                <span>Log out</span>
              </button>
            )}
          </div>
        </aside>
        <div className="app-body">
          <header className="app-header">
            <div className="app-breadcrumb">
              <span>Workspace</span>
              <span>/</span>
              <strong>
                {terminal
                  ? "Terminal"
                  : location.pathname.endsWith("admin")
                    ? "Operations"
                    : location.pathname.endsWith("/list")
                      ? "Accounts"
                      : "Overview"}
              </strong>
            </div>
            <div className="header-actions">
              {demo ? (
                <>
                  <Badge tone="amber">Demo workspace</Badge>
                  <Link
                    className="button secondary small"
                    to={prototypeEnabled() ? "/app/terminal" : "/app/accounts"}
                  >
                    {prototypeEnabled()
                      ? "Open synthetic workspace"
                      : "Connect your account"}
                    <ArrowUpRight size={14} />
                  </Link>
                </>
              ) : (
                <>
                  <Badge tone="blue">
                    {prototypeEnabled() ? "Synthetic account" : "Recorded data"}
                  </Badge>
                  <WalletButton />
                </>
              )}
            </div>
          </header>
          {demo && (
            <div className="demo-banner">
              <span>
                <span className="demo-mark" />
                Illustrative preview · Fixture prices and accounts. No orders
                are sent.
              </span>
              <Link to={prototypeEnabled() ? "/app/terminal" : "/app/accounts"}>
                Exit demo <ArrowUpRight size={13} />
              </Link>
            </div>
          )}
          {!enabled && !(terminal && prototypeEnabled()) ? (
            <div className="connect-gate">
              <div className="connect-art">
                <Wallet size={38} strokeWidth={1} />
              </div>
              <Badge tone="blue">Your performance. Your workspace.</Badge>
              <h1>Start with your wallet.</h1>
              <p>
                Sign in to see your challenge accounts, recorded positions and
                activity.
              </p>
              {auth.phase === "restoring" ? (
                <Skeleton rows={2} />
              ) : (
                <>
                  <WalletButton />
                  <Link className="text-link" to="/demo/accounts">
                    Take a look around the demo
                    <ArrowUpRight size={14} />
                  </Link>
                </>
              )}
              {auth.error && (
                <ErrorState
                  message={auth.error}
                  retry={() => void auth.manager.restore()}
                />
              )}
              <div className="gate-note">
                <ShieldCheck size={16} />
                Read access only. Login signs no orders or transactions.
              </div>
            </div>
          ) : (
            <Outlet />
          )}
        </div>
        <nav className="mobile-nav" aria-label="Mobile workspace">
          <NavLink end to={base + "/accounts" + suffix}>
            <LayoutDashboard size={18} />
            Overview
          </NavLink>
          <NavLink to={base + "/accounts/list" + suffix}>
            <Layers3 size={18} />
            Accounts
          </NavLink>
          <NavLink to={base + "/terminal" + suffix}>
            <ChartCandlestick size={18} />
            Terminal
          </NavLink>
          {!demo && auth.session?.admin_read && (
            <NavLink to={base + "/admin"}>
              <ShieldCheck size={18} />
              Operations
            </NavLink>
          )}
        </nav>
      </div>
    </Context.Provider>
  );
}
export function AccountSelect({ compact = false }: { compact?: boolean }) {
  const w = useWorkspace();
  return (
    <div className={"account-select " + (compact ? "small" : "")}>
      <label htmlFor={compact ? "terminal-account" : "dashboard-account"}>
        {compact ? "Account" : "Selected account"}
      </label>
      <select
        aria-label="Selected account"
        id={compact ? "terminal-account" : "dashboard-account"}
        value={w.account ?? ""}
        onChange={(e) => w.setAccount(e.target.value)}
        disabled={!w.accounts.rows.length}
      >
        <option value="" disabled>
          Select an account
        </option>
        {w.accounts.rows.map((a, i) => (
          <option value={a.account} key={a.account}>
            {w.demo
              ? i === 0
                ? "Demo · $100,000"
                : "Demo · State unavailable"
              : shortId(a.account, 8)}
          </option>
        ))}
        {w.account && !w.accounts.rows.some((a) => a.account === w.account) && (
          <option value={w.account}>{shortId(w.account)}</option>
        )}
      </select>
      {w.accounts.next && (
        <Button
          className="small"
          onClick={w.accounts.more}
          disabled={w.accounts.loading}
        >
          Load more accounts
        </Button>
      )}
    </div>
  );
}
export function AccountBoundary({ children }: { children: ReactNode }) {
  const w = useWorkspace();
  const auth = useAuth();
  if (prototypeEnabled() && !auth.session)
    return (
      <Empty title="Your synthetic account">
        <span>
          Sign in with the disposable wallet to load its positions and activity.
        </span>
      </Empty>
    );
  if (w.accounts.error)
    return <ErrorState message={w.accounts.error} retry={w.accounts.refresh} />;
  if (w.accounts.loading && !w.accounts.rows.length)
    return <Skeleton rows={4} />;
  if (!w.account)
    return (
      <Empty
        title="No accounts for this wallet"
        action={
          <Link className="button secondary" to="/purchase">
            Explore account availability
          </Link>
        }
      >
        Your authorized challenge accounts will appear here. Account purchases
        are not available in this development workspace.
      </Empty>
    );
  if (w.bundle.loading) return <Skeleton rows={5} />;
  if (w.bundle.error)
    return <ErrorState message={w.bundle.error} retry={w.bundle.refresh} />;
  return <>{children}</>;
}
