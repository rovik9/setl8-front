import { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowUpRight, Layers3, Search, RefreshCw } from "lucide-react";
import { useWorkspace } from "../components/Workspace";
import {
  Badge,
  Button,
  CopyValue,
  Empty,
  ErrorState,
  Skeleton,
} from "../components/ui";
import { shortId } from "../data/exact";
export default function Accounts() {
  const w = useWorkspace(),
    [search, setSearch] = useState(""),
    [filter, setFilter] = useState("all");
  const rows = w.accounts.rows.filter(
    (a) =>
      a.account.toLowerCase().includes(search.trim().toLowerCase()) &&
      (filter === "all" || a.state_available === (filter === "available")),
  );
  return (
    <main className="account-journey accounts-page" id="main-content">
      <header className="journey-title">
        <div>
          <p className="page-kicker">Your workspace</p>
          <h1>
            Your accounts<span>.</span>
          </h1>
          <p>A place for every phase of your process.</p>
        </div>
        <Link
          to={w.demo ? "/demo/purchase" : "/purchase"}
          className="button primary"
        >
          New account
          <ArrowUpRight size={16} />
        </Link>
      </header>
      <div className="directory-controls">
        <label className="directory-search">
          <Search size={17} />
          <span className="sr-only">Search loaded accounts</span>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search account ID"
          />
        </label>
        <label className="directory-filter">
          <span className="sr-only">Account state filter</span>
          <select value={filter} onChange={(e) => setFilter(e.target.value)}>
            <option value="all">All loaded accounts</option>
            <option value="available">View available</option>
            <option value="waiting">Awaiting state</option>
          </select>
        </label>
        <Button
          aria-label="Refresh accounts"
          variant="ghost"
          onClick={w.accounts.refresh}
        >
          <RefreshCw size={16} />
        </Button>
      </div>
      {w.accounts.error && (
        <ErrorState message={w.accounts.error} retry={w.accounts.refresh} />
      )}
      {w.accounts.loading && !w.accounts.rows.length ? (
        <Skeleton rows={4} />
      ) : !w.accounts.error && !w.accounts.rows.length ? (
        <Empty
          title="No accounts for this wallet"
          action={
            <Link
              className="button secondary"
              to={w.demo ? "/demo/purchase" : "/purchase"}
            >
              Explore account availability
            </Link>
          }
        >
          Your authorized accounts will appear here. Purchases are not open yet.
        </Empty>
      ) : (
        <>
          <p className="directory-count">
            {rows.length} of {w.accounts.rows.length} loaded accounts · Search
            and filters apply to loaded pages
          </p>
          <div className="account-card-grid">
            {rows.map((a) => (
              <article
                key={a.account}
                className={
                  "directory-card " +
                  (a.account === w.account ? "selected" : "")
                }
              >
                <div className="section-top">
                  <span className="account-emblem">
                    <Layers3 size={22} />
                  </span>
                  <Badge tone={a.state_available ? "blue" : "amber"}>
                    {a.state_available ? "View available" : "Awaiting state"}
                  </Badge>
                </div>
                <span className="eyebrow">
                  {w.demo ? "Demo account" : "Account ID"}
                </span>
                <h2>{shortId(a.account, 8)}</h2>
                <p>
                  {a.state_available
                    ? "A committed account view is available."
                    : "Account record found. Its first committed view is not available."}
                </p>
                <div className="directory-card-actions">
                  <Link
                    className="button secondary"
                    to={w.base + "/accounts?account=" + a.account}
                  >
                    Open overview
                    <ArrowUpRight size={15} />
                  </Link>
                  <CopyValue value={a.account} />
                </div>
              </article>
            ))}
          </div>
          {!rows.length && w.accounts.rows.length > 0 && (
            <Empty title="No matches in loaded accounts">
              Change the search or filter, or load another page.
            </Empty>
          )}
          {w.accounts.next && (
            <Button onClick={w.accounts.more} disabled={w.accounts.loading}>
              {w.accounts.loading ? "Loading…" : "Load more accounts"}
            </Button>
          )}
        </>
      )}
      <p className="journey-footnote">
        Ownership, current account state and trading availability are separate.
        Open an overview to inspect its current view.
      </p>
    </main>
  );
}
