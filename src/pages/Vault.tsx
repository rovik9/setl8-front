import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Clock3, ExternalLink, ShieldCheck } from "lucide-react";
import { Brand } from "../components/ui";
import { WalletStatusButton as WalletButton } from "../components/WalletStatusButton";
import { day2HistoryStatus } from "../devnet/history";
import { fixed, usd } from "../data/exact";
import "../vault.css";
import {
  readVaultStatus,
  vaultTime,
  vaultElapsed,
  VaultUnavailable,
  type VaultStatus,
} from "../data/vault";
import proof from "../data/devnet-proof.json";
import { beginWork } from "../hooks/loading";

export default function Vault() {
  useEffect(() => {
    document.title = "Setl8 — Payout vault";
  }, []);
  const [status, setStatus] = useState<VaultStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Why a live reading is missing (expected in a demo); shown as a calm note, never as an alert.
  const [unavailable, setUnavailable] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refresh, setRefresh] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    let live = true;
    const timer = setTimeout(() => controller.abort(), 9000);
    const done = beginWork();
    setLoading(true);
    setError(null);
    setUnavailable(null);
    void readVaultStatus(controller.signal)
      .then((value) => {
        if (!controller.signal.aborted) setStatus(value);
      })
      .catch((error) => {
        if (!live) return;
        setStatus((previous) =>
          previous
            ? {
                ...previous,
                status: "stale",
                refresh_error: "provider_evidence_unavailable",
              }
            : null,
        );
        if (error instanceof VaultUnavailable) setUnavailable(error.reason);
        else
          setError(
            error instanceof Error
              ? error.message
              : "Vault observation unavailable.",
          );
      })
      .finally(() => {
        if (live) setLoading(false);
        clearTimeout(timer);
        done();
      });
    return () => {
      live = false;
      controller.abort();
      clearTimeout(timer);
      done();
    };
  }, [refresh]);
  const history = day2HistoryStatus(null);
  const recorded = history.settlementHistory;
  const receipt = history.verification.transactions.find(
    (t) => t.action === "settle_claims",
  );
  return (
    <div className="vault-page">
      <header className="site-header wrap">
        <Brand />
        <nav aria-label="Vault navigation">
          <Link to="/#pricing">Challenges</Link>
          <Link to="/my-account">Dashboard</Link>
        </nav>
        <WalletButton />
      </header>
      <main className="vault-main wrap" id="main-content">
        <div className="vault-heading">
          <span>
            <ShieldCheck size={17} />
            Solana devnet
          </span>
          <h1>The payout vault</h1>
          <p>Follow the pool balance, payout cycle and recorded settlements.</p>
        </div>
        <section className="vault-address" aria-label="Payout vault address">
          <div>
            <span>Vault authority</span>
            <code>{recorded.transfer.vault_authority}</code>
          </div>
          <a
            className="button secondary"
            href={
              "https://explorer.solana.com/address/" +
              recorded.transfer.vault_authority +
              "?cluster=devnet"
            }
            target="_blank"
            rel="noreferrer"
          >
            View on Explorer <ExternalLink size={15} />
          </a>
        </section>
        <section
          className="vault-balance"
          aria-labelledby="vault-balance-title"
        >
          <div className="vault-section-top">
            <h2 id="vault-balance-title">Pool balances</h2>
            <button
              className="button secondary"
              disabled={loading}
              onClick={() => setRefresh((v) => v + 1)}
            >
              {loading ? "Checking vault…" : "Refresh observation"}
            </button>
          </div>
          {error && <p role="alert">{error}</p>}
          {unavailable && status && (
            <p role="status" className="vault-note">
              Latest refresh unavailable. The balances below are the earlier
              observation, not current.
            </p>
          )}
          {status ? (
            <>
              <p>
                {status.status === "stale"
                  ? "Earlier observation · latest refresh unavailable"
                  : "Corroborated finalized observation"}{" "}
                ·{" "}
                {vaultTime(
                  String(BigInt(status.last_observed_at_unix_ms) / 1000n),
                )}
              </p>
              <div className="vault-pools">
                {status.pools.map((pool) => (
                  <div key={pool.mint}>
                    <span>
                      test {pool.symbol}
                      {pool.frozen ? " · frozen" : ""}
                    </span>
                    <strong>{fixed(pool.balance_atoms, 6, 6)}</strong>
                  </div>
                ))}
              </div>
              <p>
                Balances are token amounts observed on devnet. The service
                caches evidence for 60 seconds.
              </p>
            </>
          ) : (
            <>
              <p role="status">
                {loading
                  ? "Reading finalized vault evidence…"
                  : "Live pool balances are not read in this view"}
              </p>
              {!loading && !error && (
                <aside
                  className="vault-snapshot"
                  aria-labelledby="vault-snapshot-title"
                >
                  <h3 id="vault-snapshot-title">
                    Recorded snapshot · live read unavailable
                  </h3>
                  <p>
                    Recorded values from the archived A1 example. They are not
                    current balances, and no current pool balance is implied.
                  </p>
                  <dl>
                    <dt>Paid out in the recorded settlement</dt>
                    <dd>
                      {history.receiptVerified
                        ? fixed(recorded.transfer.amount_atoms, 6, 6)
                        : "—"}{" "}
                      test USDC, from the USDC payout pool
                    </dd>
                    <dt>Trader balance in that transaction</dt>
                    <dd>
                      {fixed(
                        proof.payout.trader_balance_before_micro_usdc,
                        6,
                        6,
                      )}{" "}
                      →{" "}
                      {fixed(
                        proof.payout.trader_balance_after_micro_usdc,
                        6,
                        6,
                      )}{" "}
                      test USDC (at that settlement, not today)
                    </dd>
                    <dt>USDC payout pool account</dt>
                    <dd>
                      <code>{proof.accounts.usdc_pool}</code>
                    </dd>
                    <dt>USDT payout pool account</dt>
                    <dd>
                      <code>{proof.accounts.usdt_pool}</code>
                    </dd>
                  </dl>
                </aside>
              )}
            </>
          )}
        </section>
        <div className="vault-grid">
          <section className="vault-cycle" aria-labelledby="vault-cycle-title">
            <h2 id="vault-cycle-title">Payout cadence</h2>
            <div className="vault-cycle-ring">
              <Clock3 size={23} />
              <strong>5 days</strong>
              <span>Minimum cycle interval</span>
            </div>
            {status ? (
              <>
                <p>
                  Cycle {status.cycle.id} ·{" "}
                  {status.cycle.status.replace("_", " ")}
                </p>
                {status.cycle.next_cycle_eligible_at_unix_s ? (
                  <p>
                    Earliest next cycle
                    <br />
                    <strong>
                      {vaultTime(status.cycle.next_cycle_eligible_at_unix_s)}
                    </strong>
                  </p>
                ) : (
                  <p>No cycle start recorded</p>
                )}
                {vaultElapsed(status) !== null && (
                  <progress
                    aria-label="Five-day interval elapsed at chain observation"
                    max={432000}
                    value={vaultElapsed(status)!}
                  />
                )}
                <p>
                  {status.cycle.processed_count} of{" "}
                  {status.cycle.eligible_count} cycle claims processed
                  <br />
                  {status.open_claims_count} open claims
                </p>
              </>
            ) : (
              <p>
                Next cycle eligibility appears when the live read is available
              </p>
            )}
            <small>
              A cycle’s earliest eligibility and its settlement time are
              separate. The chain observation sets the interval progress. A
              payout time has not been promised.
            </small>
          </section>
          <section
            className="vault-settlement"
            aria-labelledby="vault-settlement-title"
          >
            <h2 id="vault-settlement-title">Recorded settlement</h2>
            <p className="vault-recorded-label">Archived A1 example</p>
            <strong>
              {history.receiptVerified
                ? usd(recorded.transfer.amount_atoms, 6, 6)
                : "—"}{" "}
              <small>test USDC</small>
            </strong>
            <p>
              {history.receiptVerified
                ? "Finalized transfer verified"
                : "Receipt verification unavailable"}
            </p>
            <p>
              Recorded{" "}
              {receipt?.observed_at_utc
                ? new Date(receipt.observed_at_utc).toLocaleString("en-GB", {
                    timeZone: "UTC",
                  }) + " UTC"
                : "2 November 2026"}
            </p>
            <Link to="/devnet-history" className="button secondary">
              View payout receipt <ExternalLink size={15} />
            </Link>
          </section>
        </div>
        <details className="vault-provenance">
          <summary>Sources & verification details</summary>
          <p>
            The archived settlement is corroborated by recorded finalized
            transaction responses from the Solana public devnet and OnFinality
            operators. It establishes one 200.000000 test USDC transfer. The
            source pool’s current balance, aggregate payouts and next cycle
            schedule require a fresh vault observation.
          </p>
          {unavailable && (
            <p>Live read: {unavailable}. Nothing on this page is estimated.</p>
          )}
          {status && (
            <>
              <p>
                Observed chain time {vaultTime(status.observed_chain_unix_s)}.
                Product {status.product.active ? "active" : "inactive"}; product
                pause reason {status.product.pause_reason}; trading pause code{" "}
                {status.trading_config.paused}.
              </p>
              <pre>
                {JSON.stringify(
                  {
                    observed_at_unix_ms: status.last_observed_at_unix_ms,
                    served_at_unix_ms: status.served_at_unix_ms,
                    provenance: status.provenance,
                    pools: status.pools,
                    cycle: status.cycle,
                  },
                  null,
                  2,
                )}
              </pre>
            </>
          )}
          <dl>
            <dt>Source pool in recorded settlement</dt>
            <dd>
              <code>{recorded.transfer.source_pool}</code>
            </dd>
            <dt>Token mint</dt>
            <dd>
              <code>{recorded.transfer.mint}</code>
            </dd>
            <dt>Evidence manifest</dt>
            <dd>
              <code>{recorded.provenance.raw_evidence_manifest_sha256}</code>
            </dd>
            <dt>Recorded observation time</dt>
            <dd>{receipt?.observed_at_utc ?? "Unavailable"}</dd>
          </dl>
        </details>
      </main>
      <footer className="site-footer wrap">
        <Brand />
        <Link to="/#pricing">Choose a challenge</Link>
        <Link to="/my-account">Dashboard</Link>
        <span>Devnet · test tokens</span>
      </footer>
    </div>
  );
}
