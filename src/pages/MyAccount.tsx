import { DevnetJourney } from "../devnet/Journey";
import { useOptionalAuth } from "../auth/context";
import { WalletStatusButton as WalletButton } from "../components/WalletStatusButton";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Link } from "react-router-dom";
import {
  ArrowUpRight,
  ArrowRight,
  RefreshCw,
  Wallet,
  Layers3,
  Clock3,
  ExternalLink,
  ShieldCheck,
} from "lucide-react";
import { Brand } from "../components/ui";
import { fixed } from "../data/exact";
import {
  AccountReader,
  A1_ACCOUNT,
  publicAddress,
  PAGE_SIZE,
  type AccountPage,
  type AccountRow,
} from "../account/data";
import { AccountResource, pollAllowed, pollDelay } from "../account/resource";
import {
  readWallets,
  watchReadWallets,
  type ReadWallet,
} from "../account/wallets";
import {
  exactAmount,
  chainTime,
  stateName,
  proofSections,
  pendingValue,
} from "../account/presentation";
import { PublicAttemptStore } from "../buy/recovery";
import proof from "../data/devnet-proof.json";
import { beginWork } from "../hooks/loading";
import "../account/Account.css";
const link = (kind: string, value: string) =>
  `https://explorer.solana.com/${kind}/${encodeURIComponent(value)}?cluster=devnet`;
export default function MyAccount() {
  const [resource] = useState(() => new AccountResource(new AccountReader()));
  return <MyAccountView resource={resource} />;
}
export function MyAccountView({
  resource,
  walletChoices = readWallets,
  watch = watchReadWallets,
}: {
  resource: AccountResource;
  walletChoices?: () => ReadWallet[];
  watch?: (fn: () => void) => () => void;
}) {
  const auth = useOptionalAuth();
  const [publicMode, setPublicMode] = useState(
    () =>
      !!new URLSearchParams(location.search).get("wallet") ||
      (resource.port.mode === "offline_mock" && !auth),
  );
  const signedWallet =
    auth?.phase === "authenticated" ? (auth.session?.wallet ?? null) : null;
  const state = useSyncExternalStore(resource.subscribe, resource.getSnapshot),
    [address, setAddress] = useState(""),
    [wallets, setWallets] = useState(walletChoices),
    [connection, setConnection] = useState<Awaited<
      ReturnType<ReadWallet["connect"]>
    > | null>(null),
    [walletBusy, setWalletBusy] = useState(false),
    [localError, setLocalError] = useState<string | null>(null),
    [selected, setSelected] = useState<string | null>(null),
    [auto, setAuto] = useState(false),
    [now, setNow] = useState(Date.now()),
    [demo, setDemo] = useState<AccountPage | null>(null),
    [demoBusy, setDemoBusy] = useState(false),
    [demoError, setDemoError] = useState<string | null>(null),
    [attempt, setAttempt] = useState<{
      wallet: string;
      expectedAccount: string;
    } | null>(null),
    // Verified purchases whose lock was released (read from the append-only archive).
    [archivedAccounts, setArchivedAccounts] = useState<
      { wallet: string; expectedAccount: string }[]
    >([]);
  const offWallet = useRef(() => {}),
    connectEpoch = useRef(0),
    demoAbort = useRef(new AbortController()),
    failures = useRef(0),
    mock = resource.port.mode === "offline_mock";
  const refresh = async () => {
    const done = beginWork();
    try {
      await resource.refresh();
    } finally {
      done();
    }
  };
  async function select(value: string) {
    try {
      const wallet = publicAddress(value.trim());
      connectEpoch.current++;
      setAddress(wallet);
      setSelected(null);
      setLocalError(null);
      failures.current = 0;
      resource.select(wallet);
      await refresh();
    } catch (e) {
      setLocalError(e instanceof Error ? e.message : "Enter a public address.");
    }
  }
  useEffect(() => {
    document.title = "Setl8 — My account";
    const query = new URLSearchParams(location.search).get("wallet");
    if (query) void select(query);
    const off = watch(() => setWallets(walletChoices()));
    void new PublicAttemptStore({
      getItem: (k) => localStorage.getItem(k),
      setItem: () => {
        throw Error("Read-only");
      },
    })
      .read()
      .then((a) => {
        if (a)
          setAttempt({ wallet: a.wallet, expectedAccount: a.expectedAccount });
      })
      .catch(() => {});
    void new PublicAttemptStore({
      getItem: (k) => localStorage.getItem(k),
      setItem: () => {
        throw Error("Read-only");
      },
    })
      .readArchive()
      .then((list) => {
        const mapped = list.map((x) => ({
          wallet: x.record.wallet,
          expectedAccount: x.record.expectedAccount,
        }));
        setArchivedAccounts(mapped);
      })
      .catch(() => {});
    const visibility = () => {
      if (document.hidden) {
        resource.cancel();
        demoAbort.current.abort();
        setDemoBusy(false);
      }
    };
    document.addEventListener("visibilitychange", visibility);
    const clock = setInterval(() => {
      if (!document.hidden) setNow(Date.now());
    }, 5000);
    return () => {
      connectEpoch.current++;
      off();
      offWallet.current();
      resource.dispose();
      demoAbort.current.abort();
      clearInterval(clock);
      document.removeEventListener("visibilitychange", visibility);
    };
  }, [resource, walletChoices, watch]);
  useEffect(() => {
    if (!auto || !state.wallet || demoBusy) return;
    let active = true;
    let timer: ReturnType<typeof setTimeout>;
    const arm = () => {
      clearTimeout(timer);
      if (!active || document.hidden) return;
      timer = setTimeout(async () => {
        if (
          pollAllowed(
            !document.hidden,
            auto,
            state.wallet,
            resource.getSnapshot().loading,
          )
        ) {
          await refresh();
          if (active)
            failures.current = resource.getSnapshot().error
              ? failures.current + 1
              : 0;
        }
        if (active) arm();
      }, pollDelay(failures.current));
    };
    arm();
    document.addEventListener("visibilitychange", arm);
    return () => {
      active = false;
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", arm);
    };
  }, [auto, state.wallet, state.page, demoBusy, resource]);
  useEffect(() => {
    if (mock && !auth) return;
    if (publicMode) return;
    offWallet.current();
    setConnection(null);
    setSelected(null);
    setAuto(false);
    setLocalError(null);
    resource.select(null);
    if (signedWallet) void select(signedWallet);
    else setAddress("");
  }, [resource, signedWallet, auth?.epoch, publicMode]);
  async function connect(w: ReadWallet) {
    if (walletBusy) return;
    const epoch = ++connectEpoch.current;
    setWalletBusy(true);
    setLocalError(null);
    const done = beginWork();
    try {
      const c = await w.connect();
      if (epoch !== connectEpoch.current) return;
      offWallet.current();
      setConnection(c);
      offWallet.current = c.onChange(() => {
        connectEpoch.current++;
        setConnection(null);
        setAddress("");
        setSelected(null);
        setAuto(false);
        resource.select(null);
        setLocalError(
          "Wallet account or network changed. Select the public address again.",
        );
      });
      if (c.accounts.length === 1) await select(c.accounts[0].address);
    } catch (e) {
      setLocalError(
        e instanceof Error ? e.message : "Could not connect wallet.",
      );
    } finally {
      done();
      setWalletBusy(false);
    }
  }
  async function checkDemo() {
    if (demoBusy || state.loading) return;
    demoAbort.current.abort();
    const c = new AbortController();
    demoAbort.current = c;
    setDemoBusy(true);
    setDemoError(null);
    const done = beginWork();
    try {
      const result = await resource.port.demo(c.signal);
      if (!c.signal.aborted) setDemo(result);
    } catch (e) {
      if (!c.signal.aborted)
        setDemoError(e instanceof Error ? e.message : "Could not check A1.");
    } finally {
      if (demoAbort.current === c) setDemoBusy(false);
      done();
    }
  }
  const data =
      mock || publicMode || (!!signedWallet && state.wallet === signedWallet)
        ? state.data
        : null,
    rows = data?.rows ?? [],
    checked = rows.filter((r) => r.state === "checked"),
    picked = rows.find((r) => r.address === selected) ?? checked[0] ?? rows[0],
    old = data && !!state.error;
  return (
    <div className="account-page">
      {mock && (
        <div className="account-mock">
          MOCKED WALLET - NOT A REAL TRANSACTION
        </div>
      )}
      <header className="account-top">
        <Brand />
        <nav aria-label="Account navigation">
          <Link to="/my-account">My accounts</Link>
          <Link to="/purchase">
            Buy a challenge <ArrowUpRight size={14} />
          </Link>
        </nav>
        <WalletButton />
        <span className="account-network">
          <i />
          DEVNET · TEST TOKENS
        </span>
      </header>
      <div className="account-workspace">
        <aside className="account-sidebar">
          <p className="account-kicker">YOUR WORKSPACE</p>
          <a href="#my-accounts" className="active">
            <Layers3 size={17} />
            My accounts <ArrowRight size={14} />
          </a>
          <Link to="/devnet-terminal">
            <ArrowRight size={17} />
            Trading terminal
          </Link>
          <Link to="/vault">
            <ShieldCheck size={17} />
            Payout vault
          </Link>
          <Link to="/devnet-history">
            <Clock3 size={17} />
            Payout history
          </Link>
        </aside>
        <main id="main-content" className="account-content">
          <section id="my-accounts">
            <div className="account-heading">
              <div>
                <p className="account-kicker">YOUR ACCOUNTS</p>
                <h1>
                  My accounts<span>.</span>
                </h1>
                <p>
                  {publicMode
                    ? "Explore public devnet state — read only."
                    : signedWallet
                      ? "Your challenges, progress and account history."
                      : "Sign in with your wallet to see your accounts."}
                </p>
              </div>
              <Link className="button primary" to="/purchase">
                New challenge <ArrowUpRight size={15} />
              </Link>
            </div>
            <div className="account-read-notice">
              <ShieldCheck size={16} />
              <p>
                {publicMode || mock
                  ? "Public explorer · devnet test tokens. This read-only view is not a signed-in identity or trading authorization."
                  : "Wallet sign-in verifies control of your wallet. Account reads remain bounded devnet observations; purchases and trading require separate approval."}
              </p>
            </div>
            {!mock && !publicMode && !signedWallet && (
              <div className="wallet-signin-state">
                <h2>Your wallet is your sign-in.</h2>
                <p>
                  Connect your wallet and sign a message to get started. No
                  tokens are spent and your private keys stay in your wallet.
                </p>
                <button className="button primary" onClick={() => auth?.open()}>
                  Connect wallet
                </button>
                <button
                  className="button ghost"
                  onClick={() => setPublicMode(true)}
                >
                  Explore a public address — read only
                </button>
              </div>
            )}
            {!mock && signedWallet && !publicMode && (
              <div className="account-signed-wallet">
                <span>Signed in wallet</span>
                <code>{signedWallet}</code>
                <button
                  className="button ghost"
                  onClick={() => setPublicMode(true)}
                >
                  Public explorer
                </button>
              </div>
            )}
            {!mock && publicMode && (
              <div className="account-explorer-mode">
                <strong>Public explorer · read only</strong>
                <button
                  className="button ghost"
                  onClick={() => {
                    resource.select(null);
                    setPublicMode(false);
                  }}
                >
                  Back to my accounts
                </button>
              </div>
            )}
            {(mock || publicMode) && (
              <>
                <div className="account-address-panel">
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      offWallet.current();
                      setConnection(null);
                      void select(address);
                    }}
                  >
                    <label htmlFor="public-wallet">Public wallet address</label>
                    <div>
                      <input
                        id="public-wallet"
                        value={address}
                        onChange={(e) => setAddress(e.target.value)}
                        spellCheck={false}
                        placeholder="Paste a Solana public address"
                      />
                      <button
                        className="button secondary"
                        disabled={walletBusy || demoBusy}
                        type="submit"
                      >
                        View address <ArrowRight size={14} />
                      </button>
                    </div>
                  </form>
                  {mock && (
                    <div className="account-connect">
                      {wallets.map((w, i) => (
                        <button
                          key={w.name + i}
                          className="button secondary"
                          disabled={walletBusy || state.loading || demoBusy}
                          onClick={() => void connect(w)}
                        >
                          <Wallet size={14} />
                          {walletBusy ? "Connecting…" : `Connect ${w.name}`}
                        </button>
                      ))}
                      {!wallets.length && (
                        <span>
                          Or open a Wallet Standard devnet wallet. No signing is
                          requested.
                        </span>
                      )}
                      {connection && connection.accounts.length > 1 && (
                        <select
                          aria-label="Connected public account"
                          defaultValue=""
                          onChange={(e) => void select(e.target.value)}
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
                      )}
                    </div>
                  )}
                </div>
              </>
            )}
            {(mock || publicMode || signedWallet) && (
              <>
                {(localError || state.error) && (
                  <div className="account-error" role="alert">
                    {localError ?? state.error}
                    {old && (
                      <p>
                        The earlier observation remains below and is stale. No
                        new state was applied.
                      </p>
                    )}
                  </div>
                )}
                <div className="account-toolbar">
                  <span>
                    {state.wallet ? (
                      <>
                        {publicMode || mock
                          ? "Public view"
                          : "Signed-in wallet"}{" "}
                        · <code>{state.wallet}</code>
                      </>
                    ) : (
                      "No public address selected"
                    )}
                  </span>
                  <div>
                    <label>
                      <input
                        type="checkbox"
                        checked={auto}
                        disabled={!state.wallet}
                        onChange={(e) => setAuto(e.target.checked)}
                      />
                      Refresh while visible · 60s minimum
                    </label>
                    <button
                      className="button secondary"
                      disabled={!state.wallet || state.loading || demoBusy}
                      onClick={() => void refresh()}
                    >
                      <RefreshCw size={14} />
                      {state.loading ? "Checking…" : "Refresh"}
                    </button>
                  </div>
                </div>
                {state.loading && (
                  <div className="account-loading" role="status">
                    Checking bounded account page with two public providers…
                  </div>
                )}
                <div className="account-metrics">
                  <div>
                    <span>Checked on this page</span>
                    <strong>
                      {data ? String(checked.length) : "—"}
                      <small> / {rows.length || "—"}</small>
                    </strong>
                  </div>
                  <div>
                    <span>Observed finalized slots</span>
                    <strong className="account-slot">
                      {data ? data.slots.join(" / ") : "Unavailable"}
                    </strong>
                  </div>
                  <div>
                    <span>History coverage</span>
                    <strong className="account-partial">
                      Partial <i />
                    </strong>
                  </div>
                </div>
                {data && (
                  <p className="account-observed">
                    {old ? "Stale observation" : "Last observed"}:{" "}
                    {new Date(Number(data.observedAt)).toISOString()} ·{" "}
                    {Math.max(
                      0,
                      Math.floor((now - Number(data.observedAt)) / 1000),
                    )}
                    s ago. Separate reads/pages are not an atomic snapshot.
                    Program images and execution readiness are not attested
                    here.
                  </p>
                )}
                {!data && !state.loading ? (
                  <div className="account-empty">
                    <Layers3 size={30} />
                    <h2>Your accounts, in view.</h2>
                    <p>
                      {publicMode || mock
                        ? "Enter a public address to inspect a bounded read-only page. This explorer does not sign you in or create a challenge."
                        : "Your account read starts automatically. If the latest observation is delayed, use Refresh to check again."}
                    </p>
                    <Link to="/purchase" className="text-link">
                      Explore challenge sizes <ArrowUpRight size={14} />
                    </Link>
                  </div>
                ) : data && rows.length === 0 ? (
                  <div className="account-empty">
                    <Layers3 size={28} />
                    <h2>
                      {publicMode || mock
                        ? "No accounts recorded on this page yet."
                        : "Your first challenge starts here."}
                    </h2>
                    <p>
                      {data.profileFound
                        ? "This page is outside the observed challenge counter."
                        : publicMode || mock
                          ? "No profile was found at the checked slots. This is a public observation, not proof of complete history."
                          : "You are signed in. No challenge profile was found at these checked slots. Creating your first challenge is a separate wallet-approved purchase; history coverage remains bounded."}
                    </p>
                    <Link to="/purchase">View challenges →</Link>
                  </div>
                ) : null}
                {!!rows.length && (
                  <div className="account-detail-layout">
                    <div className="account-cards" aria-label="Account list">
                      {rows.map((row) => (
                        <button
                          key={row.address}
                          className={
                            "account-card " +
                            (picked?.address === row.address ? "selected" : "")
                          }
                          onClick={() => setSelected(row.address)}
                        >
                          <span>
                            CHALLENGE #{row.id}
                            <ArrowUpRight size={14} />
                          </span>
                          <strong>
                            {row.account
                              ? exactAmount(row.account.sizeS)
                              : "Could not verify"}
                          </strong>
                          <small>
                            {row.account
                              ? `Phase ${row.account.phase} · ${stateName(row.account.status)}`
                              : row.reason}
                          </small>
                          {row.state === "checked" &&
                            attempt &&
                            attempt.wallet === data?.wallet &&
                            attempt.expectedAccount === row.address && (
                              <em>
                                Matches retained attempt address · payment not
                                inferred
                              </em>
                            )}
                          {row.state === "checked" &&
                            archivedAccounts.some(
                              (x) =>
                                x.wallet === data?.wallet &&
                                x.expectedAccount === row.address,
                            ) && <em>Matches a verified purchase you made</em>}
                        </button>
                      ))}
                    </div>
                    {picked && (
                      <AccountDetail row={picked} data={data!} now={now} />
                    )}
                  </div>
                )}
                {data && (
                  <div className="account-pagination">
                    <span>
                      Page {(BigInt(state.page) + 1n).toString()} · at most 10
                      accounts per read · observed counter {data.counter}
                    </span>
                    <div>
                      <button
                        disabled={
                          state.page === "0" || state.loading || demoBusy
                        }
                        onClick={() => {
                          resource.select(
                            state.wallet,
                            (BigInt(state.page) - 1n).toString(),
                          );
                          void refresh();
                        }}
                      >
                        ← Newer
                      </button>
                      <button
                        disabled={
                          (BigInt(state.page) + 1n) * PAGE_SIZE >=
                            BigInt(data.counter) ||
                          state.loading ||
                          demoBusy
                        }
                        onClick={() => {
                          resource.select(
                            state.wallet,
                            (BigInt(state.page) + 1n).toString(),
                          );
                          void refresh();
                        }}
                      >
                        Older →
                      </button>
                    </div>
                  </div>
                )}
              </>
            )}
          </section>
          {!mock && (
            <DevnetJourney
              scope={{
                sessionWallet: signedWallet,
                observedWallet: data?.wallet ?? null,
                account: picked?.address ?? null,
                trader: picked?.account?.trader.toBase58() ?? null,
                checked: picked?.state === "checked",
                slots: data?.slots ?? [],
                passPending: picked?.account?.passPending.toString(),
                passRequestedAt: picked?.account?.passRequestedAt.toString(),
                passProposedAt: picked?.account?.passProposedAt.toString(),
                localRecords: [
                  ...(attempt ? [attempt] : []),
                  ...archivedAccounts,
                ],
                // With no retained attempt, the latest archived verified purchase is the one the history scope may show.
                retainedAttempt:
                  attempt ??
                  archivedAccounts[archivedAccounts.length - 1] ??
                  null,
              }}
            />
          )}
          <details id="recorded-a1" className="account-proof account-archive">
            <summary>Archived account example & verification details</summary>
            <div className="account-heading">
              <div>
                <p className="account-kicker">RECORDED REHEARSAL · A1</p>
                <h2>A trail you can inspect.</h2>
                <p>
                  Preserved earlier source snapshot, with an optional
                  independent public state check.
                  <Link to="/devnet-history">
                    {" "}
                    New separate day-two public history
                  </Link>{" "}
                  is available for receipt review.
                </p>
              </div>
              <Link to="/devnet-proof" className="text-link">
                Full proof <ArrowUpRight size={14} />
              </Link>
            </div>
            <div className="account-demo-read">
              <div>
                <span className="account-kicker">A1 CURRENT STATE</span>
                <p>
                  {demo
                    ? `${demo.rows[0].account ? `Phase ${demo.rows[0].account.phase} · ${stateName(demo.rows[0].account.status)}` : "Could not verify A1"} · observed ${new Date(Number(demo.observedAt)).toISOString()} · slots ${demo.slots.join(" / ")}`
                    : "Not checked. Recorded transactions below do not attest current account state."}
                </p>
                <a
                  href={link("address", A1_ACCOUNT)}
                  target="_blank"
                  rel="noreferrer"
                >
                  A1 on Explorer <ExternalLink size={12} />
                </a>
                {demoError && (
                  <p role="alert" className="account-error">
                    {demoError}
                  </p>
                )}
              </div>
              <button
                className="button secondary"
                disabled={demoBusy || state.loading}
                onClick={() => void checkDemo()}
              >
                {demoBusy ? "Checking A1…" : "Check A1 — read only"}
              </button>
            </div>
            <ol className="account-timeline">
              {proofSections().map((s) => (
                <li key={s.n} className={s.pending ? "pending" : "recorded"}>
                  <span className="account-timeline-dot">
                    {String(s.n).padStart(2, "0")}
                  </span>
                  <div>
                    <div className="account-timeline-title">
                      <h3>{s.title}</h3>
                      <span>{s.pending ? "Pending" : "Recorded evidence"}</span>
                    </div>
                    <p>
                      {s.pending
                        ? "No completed transaction or balance evidence is recorded for this step. A queued claim does not establish payment."
                        : s.summary}
                    </p>
                    <div className="account-proof-links">
                      {s.transactions.map((i, n) => (
                        <a
                          key={i.value + n}
                          href={link("tx", i.value)}
                          target="_blank"
                          rel="noreferrer"
                        >
                          {i.label} <ArrowUpRight size={12} />
                        </a>
                      ))}
                    </div>
                    {s.pending && (
                      <small>
                        Pending in the unchanged proof snapshot. Time passing
                        does not complete this step.
                      </small>
                    )}
                  </div>
                </li>
              ))}
            </ol>
            <div className="account-payout-facts">
              <div>
                <span>Payout claim</span>
                <strong>{pendingValue(proof.payout.claim)}</strong>
              </div>
              <div>
                <span>Balance before (test USDC)</span>
                <strong>
                  {fixed(proof.payout.trader_balance_before_micro_usdc, 6, 2)}
                </strong>
              </div>
              <div>
                <span>Balance after (test USDC)</span>
                <strong>
                  {fixed(proof.payout.trader_balance_after_micro_usdc, 6, 2)}
                </strong>
              </div>
            </div>
            <details className="account-provenance">
              <summary>Snapshot provenance and limits</summary>
              <p>
                Manifest SHA-256 <code>{proof.source.manifest.sha256}</code>.
                Demo source SHA-256 <code>{proof.source.demo.sha256}</code>. The
                immutable SDK day-1 descriptor stays independent of this proof
                snapshot. Source values are recorded evidence, not an
                independently reverified execution or paid-payout guarantee.
                Only the owner regenerates this snapshot after the actual
                payout.
              </p>
            </details>
          </details>
          <footer className="account-footer">
            Solana devnet · test tokens{" "}
            <Link to="/#pricing">Choose a challenge</Link>
          </footer>
        </main>
      </div>
    </div>
  );
}
function AccountDetail({
  row,
  data,
  now,
}: {
  row: AccountRow;
  data: AccountPage;
  now: number;
}) {
  const a = row.account;
  if (!a)
    return (
      <div className="account-detail">
        <h2>Could not verify this record.</h2>
        <p>{row.reason}</p>
        <a href={link("address", row.address)} target="_blank" rel="noreferrer">
          Inspect public address ↗
        </a>
      </div>
    );
  const pending =
      a.status === 0 && a.passPending === 2 && a.passProposedAt > 0n,
    deadline =
      pending && data.config
        ? a.passProposedAt + BigInt(data.config.passDelaySecs)
        : null,
    remaining = deadline ? deadline - BigInt(Math.floor(now / 1000)) : null;
  return (
    <div className="account-detail" key={row.address}>
      <div className="account-detail-head">
        <span>CHALLENGE #{row.id}</span>
        <span className="account-status">{stateName(a.status)}</span>
      </div>
      <h2>
        {exactAmount(a.sizeS)}
        <small> account units</small>
      </h2>
      <div className="account-phase">
        {[1, 2, 3, 4, 5].map((n) => (
          <span
            key={n}
            className={
              n === a.phase ? "current" : n < a.phase ? "observed-before" : ""
            }
          >
            Phase {n}
          </span>
        ))}
      </div>
      <div className="account-balance">
        <div>
          <span>Recorded closed balance B</span>
          <strong>{exactAmount(a.b)}</strong>
        </div>
        <div>
          <span>Current equity / P&amp;L</span>
          <strong className="account-unavailable">Not recorded yet</strong>
          <small>Equity appears when a current valuation is recorded.</small>
        </div>
      </div>
      <dl>
        <dt>Journal sequence</dt>
        <dd>{a.seq.toString()}</dd>
        <dt>Closed trades</dt>
        <dd>{a.tradesClosed}</dd>
        <dt>Created (UTC)</dt>
        <dd>{chainTime(a.createdAt)}</dd>
        <dt>Last batch (UTC)</dt>
        <dd>{chainTime(a.lastBatchTime)}</dd>
        <dt>Pass state</dt>
        <dd>
          {
            ["None recorded", "Requested", "Confirmed", "Violation recorded"][
              a.passPending
            ]
          }
        </dd>
        <dt>
          {a.status === 0 ? "Pass request timestamp" : "Reset timestamp field"}
        </dt>
        <dd>{chainTime(a.passRequestedAt)}</dd>
        <dt>
          {a.status === 0 ? "Pass proposed timestamp" : "Terminal timestamp"}
        </dt>
        <dd>{chainTime(a.passProposedAt)}</dd>
        {pending && (
          <>
            <dt>Pass delay observation</dt>
            <dd>
              {remaining === null
                ? "Unavailable — current delay not checked"
                : remaining > 0n
                  ? `${remaining.toString()} seconds remaining by browser clock`
                  : "Delay elapsed; finalization not observed"}
            </dd>
          </>
        )}
        <dt>Ruleset version in account</dt>
        <dd>{a.rulesetVersion}</dd>
        <dt>Observed current fee</dt>
        <dd>
          {data.rules ? `${data.rules.feeBps} basis points` : "Unavailable"}
        </dd>
      </dl>
      {data.rulesError && <p className="account-error">{data.rulesError}</p>}
      <a
        className="account-explorer"
        href={link("address", row.address)}
        target="_blank"
        rel="noreferrer"
      >
        <code>{row.address}</code>
        <ExternalLink size={14} />
      </a>
      <p className="account-fine">
        Owner, trader, layout and derived address checked against the pinned
        decoder. Separate public reads; journal coverage and executable-image
        admission are unavailable. Phase markers indicate the observed phase,
        not proof that earlier phases passed.
      </p>
    </div>
  );
}
