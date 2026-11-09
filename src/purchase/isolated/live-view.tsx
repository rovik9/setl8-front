import { useEffect, useState, useSyncExternalStore } from "react";
import type { IsolatedPurchaseAdapter } from "./adapter";
import type { OwnedAccount } from "../../api/purchase-foundation-v1";
import { usd, shortId, timestamp } from "../../data/exact";
import { JsonDetails, Button } from "../../components/ui";
export function observedAge(ns: string, now: number) {
  if (!/^[0-9]+$/.test(ns)) return "Age unavailable";
  const elapsed = BigInt(Math.trunc(now)) * 1000000n - BigInt(ns);
  if (elapsed < 0n) return "Recorded time is ahead of this device";
  const seconds = elapsed / 1000000000n;
  return seconds < 60n
    ? `${seconds}s ago`
    : seconds < 3600n
      ? `${seconds / 60n}m ago`
      : seconds < 86400n
        ? `${seconds / 3600n}h ago`
        : `${seconds / 86400n}d ago`;
}
export function ReadOnlyAccounts({
  connection,
}: {
  connection: IsolatedPurchaseAdapter;
}) {
  const state = useSyncExternalStore(
      connection.subscribe,
      connection.getSnapshot,
    ),
    [busy, setBusy] = useState(false),
    [notice, setNotice] = useState<string | null>(null),
    [checked, setChecked] = useState<number | null>(null),
    [clock, setClock] = useState(Date.now());
  const [pages, setPages] = useState<OwnedAccount[]>([]),
    [selected, setSelected] = useState<string | null>(null);
  useEffect(() => {
    setPages([]);
    setSelected(null);
    setChecked(null);
    setNotice(null);
    if (state.phase !== "restoring") setBusy(false);
  }, [state.epoch]);
  useEffect(() => {
    const id = setInterval(() => setClock(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  async function read(more = false) {
    if (!state.scope) return;
    const scope = state.scope,
      epoch = state.epoch;
    setBusy(true);
    setNotice(null);
    try {
      const page = (await connection.transport.owned(
        scope,
        more ? (state.data.owned?.next_cursor ?? null) : null,
        new AbortController().signal,
      )) as NonNullable<typeof state.data.owned>;
      if (connection.getSnapshot().epoch !== epoch) return;
      setPages((old) => (more ? [...old, ...page.rows] : page.rows));
      setChecked(Date.now());
    } catch {
      if (connection.getSnapshot().epoch === epoch)
        setNotice(
          "Account records could not be refreshed. Any earlier records below are the last observed result.",
        );
    } finally {
      if (connection.getSnapshot().epoch === epoch) setBusy(false);
    }
  }
  async function restore() {
    setBusy(true);
    setNotice(null);
    try {
      await connection.restore();
    } catch {
      setNotice(
        "A reviewed read-only sign-in is required. No wallet prompt is opened here.",
      );
    } finally {
      setBusy(false);
    }
  }
  const owned = state.data.owned,
    incomplete =
      !!owned &&
      (owned.coverage.discovery !== "complete_through_checkpoint" ||
        owned.coverage.missing_history);
  return (
    <div className="purchase-shell">
      <header className="purchase-header">
        <a
          href="/p30-live.html"
          className="brand"
          aria-label="Setl8 recorded accounts"
        >
          <img src="/setl8-logo.png" alt="" width="43" height="43" />
          <span>
            SETL8<span className="brand-dot">®</span>
          </span>
        </a>
        <span className="p30-read-status">Read-only rehearsal</span>
      </header>
      <main className="purchase-main p30-read-main" id="main-content">
        <h1>Your recorded accounts</h1>
        <p>
          Review recorded account information. These observations do not
          guarantee continuing ownership, a current account state or trading
          readiness.
        </p>
        <div className="p30-read-actions">
          {state.scope ? (
            <>
              <span className="p30-read-status">
                Signed in · {shortId(state.scope.wallet)}
              </span>
              <Button disabled={busy} onClick={() => void read()}>
                Refresh account records
              </Button>
              <Button
                onClick={() => {
                  setPages([]);
                  setSelected(null);
                  void connection
                    .logout()
                    .catch(() =>
                      setNotice(
                        "Sign-out could not be confirmed. Retry before checking sign-in.",
                      ),
                    );
                }}
              >
                Sign out
              </Button>
            </>
          ) : state.phase !== "revocation_pending" ? (
            <Button disabled={busy} onClick={() => void restore()}>
              Check sign-in
            </Button>
          ) : null}
        </div>
        {state.phase === "revocation_pending" && !state.scope && (
          <Button
            onClick={() =>
              void connection
                .logout()
                .catch(() =>
                  setNotice("Sign-out is still unconfirmed. Try again later."),
                )
            }
          >
            Retry sign-out
          </Button>
        )}
        {notice && (
          <p role="alert" className="p30-read-notice">
            {notice}
          </p>
        )}
        {!state.scope ? (
          <section className="p30-read-panel">
            <h2>
              {state.phase === "expired"
                ? "Your session has expired"
                : state.phase === "unavailable"
                  ? "Account connection is unavailable"
                  : "Sign in to view recorded accounts"}
            </h2>
            <p>
              This separate connection reads account records only. Purchasing,
              trading and transaction signing are unavailable.
            </p>
          </section>
        ) : (
          <section
            className="p30-read-panel"
            aria-label="Recorded account list"
          >
            <h2>Account records</h2>
            <p>
              {checked
                ? `Last checked ${new Date(checked).toLocaleTimeString("en-GB", { timeZone: "UTC" })} UTC. Separate reads may observe different checkpoints.`
                : "Refresh to read the available account records."}
            </p>
            {owned && (
              <p>
                Recorded checkpoint{" "}
                {timestamp(owned.read_cutoff.observed_unix_ns)} ·{" "}
                {observedAge(owned.read_cutoff.observed_unix_ns, clock)}. This
                is not a complete chain-history scan.
              </p>
            )}
            {busy && <p role="status">Reading account records…</p>}
            {incomplete && (
              <p className="p30-read-notice">
                The account search is incomplete. Missing history or an empty
                page does not establish that this wallet has no accounts.
              </p>
            )}
            {owned && !incomplete && !pages.length && !busy && (
              <p>No accounts were found through this recorded checkpoint.</p>
            )}
            {!owned && !busy && <p>Account records have not been loaded.</p>}
            <div className="p30-read-rows">
              {pages.map((row) => (
                <article className="p30-read-row" key={row.account}>
                  <h2>{usd(row.account_size_micro_usd)}</h2>
                  <p>Account {shortId(row.account)}</p>
                  <dl>
                    <div>
                      <dt>Observed account phase</dt>
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
                  {row.current_chain_state ? (
                    <small>
                      Observed{" "}
                      {timestamp(
                        row.current_chain_state.snapshot.received_unix_ns,
                      )}{" "}
                      ·{" "}
                      {observedAge(
                        row.current_chain_state.snapshot.received_unix_ns,
                        clock,
                      )}
                    </small>
                  ) : (
                    <small>
                      Current account observation is unavailable. The opening
                      record is not a current phase.
                    </small>
                  )}
                  <div className="p30-read-actions">
                    <Button
                      disabled={busy}
                      onClick={() => {
                        const epoch = state.epoch;
                        setSelected(row.account);
                        if (state.scope)
                          void connection.transport
                            .account(
                              state.scope,
                              row.account,
                              new AbortController().signal,
                            )
                            .catch(() => {
                              if (connection.getSnapshot().epoch === epoch)
                                setNotice(
                                  "The account detail is unavailable. The list remains a separate observed result.",
                                );
                            });
                      }}
                    >
                      View recorded details
                    </Button>
                  </div>
                </article>
              ))}
            </div>
            {owned?.has_more && (
              <Button disabled={busy} onClick={() => void read(true)}>
                Read more records
              </Button>
            )}
            {selected && state.data.account?.row.account === selected && (
              <div role="region" aria-label="Recorded account detail">
                <h2>Recorded account details</h2>
                <p>
                  The opening record and the last account observation are
                  separate. Trading setup remains pending.
                </p>
                <JsonDetails
                  title="Observed account evidence"
                  value={state.data.account}
                />
              </div>
            )}
          </section>
        )}
        <details>
          <summary>Observation details</summary>
          <p>
            Each record retains its recorded time, finalized origin and coverage
            status. History can remain partial. This page does not enable
            trading or account lifecycle actions.
          </p>
          <JsonDetails
            title="Read status and coverage"
            value={{
              phase: state.phase,
              epoch: state.epoch,
              error: state.error,
              coverage: owned?.coverage,
              cutoff: owned?.read_cutoff,
            }}
          />
        </details>
      </main>
    </div>
  );
}
