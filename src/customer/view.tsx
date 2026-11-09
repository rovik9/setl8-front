import { useEffect, useState, useSyncExternalStore } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import {
  Wallet as WalletIcon,
  ArrowUpRight,
  ArrowRight,
  RefreshCw,
  ShieldCheck,
  Layers,
  Clock3,
  CheckCircle2,
  ChevronLeft,
} from "lucide-react";
import type { Wallet } from "@wallet-standard/base";
import { Button, Modal, JsonDetails, Badge } from "../components/ui";
import { beginWork, usePending } from "../hooks/loading";
import { shortId, usd, timestamp } from "../data/exact";
import { exactTokenAmount } from "../purchase/consumer/display";
import { observedAge } from "../purchase/isolated/live-view";
import type { TierOffer, OwnedAccount } from "../api/purchase-foundation-v1";
import type { CustomerRuntime } from "./runtime";
import { discoverLoginWallets, walletRegistry } from "./wallet-standard";
type Tab = "start" | "accounts" | "progress" | "detail";
export function CustomerApp({ runtime }: { runtime: CustomerRuntime }) {
  const { reads, login } = runtime,
    state = useSyncExternalStore(reads.subscribe, reads.getSnapshot),
    auth = useSyncExternalStore(login.subscribe, login.getSnapshot),
    pending = usePending(),
    reduced = useReducedMotion();
  const [tab, setTab] = useState<Tab>("start"),
    [walletOpen, setWalletOpen] = useState(false),
    [wallets, setWallets] = useState<readonly Wallet[]>(discoverLoginWallets),
    [offer, setOffer] = useState<TierOffer | null>(null),
    [rows, setRows] = useState<OwnedAccount[]>([]),
    [catalogPhase, setCatalogPhase] = useState("idle"),
    [readError, setReadError] = useState<string | null>(null),
    [clock, setClock] = useState(Date.now());
  useEffect(() => {
    const r = walletRegistry(),
      update = () => setWallets(discoverLoginWallets()),
      a = r.on("register", update),
      b = r.on("unregister", (...removed) => {
        removed.forEach((w) => login.walletRemoved(w));
        update();
      });
    void login.restore();
    return () => {
      a();
      b();
      login.dispose();
      reads.dispose();
    };
  }, [runtime]);
  useEffect(() => {
    const id = setInterval(() => setClock(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  useEffect(() => {
    setOffer(null);
    setRows([]);
    setReadError(null);
    setCatalogPhase("idle");
    if (!state.scope) setTab("start");
  }, [state.epoch]);
  useEffect(() => {
    if (auth.phase === "authenticated") setWalletOpen(false);
  }, [auth.phase]);
  async function refreshCatalog() {
    if (!state.scope) {
      setWalletOpen(true);
      return;
    }
    const s = state.scope,
      g = state.epoch,
      done = beginWork();
    setCatalogPhase("loading");
    setOffer(null);
    try {
      await reads.transport.catalog(s, new AbortController().signal);
      if (reads.getSnapshot().epoch === g) setCatalogPhase("ready");
    } catch {
      if (reads.getSnapshot().epoch === g) setCatalogPhase("unavailable");
    } finally {
      done();
    }
  }
  async function refreshAccounts(more = false) {
    if (!state.scope) {
      setWalletOpen(true);
      return;
    }
    const s = state.scope,
      g = state.epoch,
      done = beginWork();
    setReadError(null);
    try {
      const p = (await reads.transport.owned(
        s,
        more ? (state.data.owned?.next_cursor ?? null) : null,
        new AbortController().signal,
      )) as NonNullable<typeof state.data.owned>;
      if (reads.getSnapshot().epoch === g)
        setRows((old) => (more ? [...old, ...p.rows] : p.rows));
    } catch {
      if (reads.getSnapshot().epoch === g)
        setReadError(
          "Your account records could not be refreshed. Earlier records remain the last observed view.",
        );
    } finally {
      done();
    }
  }
  async function refreshProgress() {
    if (!state.scope) {
      setWalletOpen(true);
      return;
    }
    const s = state.scope,
      g = state.epoch,
      done = beginWork();
    try {
      await reads.transport.purchases(s, null, new AbortController().signal);
    } catch {
      if (reads.getSnapshot().epoch === g)
        setReadError("Purchase progress is unavailable. Check again later.");
    } finally {
      done();
    }
  }
  useEffect(() => {
    if (state.scope) {
      void refreshCatalog();
      void refreshAccounts();
      void refreshProgress();
    }
  }, [state.epoch, !!state.scope]);
  function navigate(next: Tab) {
    setTab(next);
    setReadError(null);
  }
  const coverage = state.data.owned?.coverage,
    incomplete =
      !!coverage &&
      (coverage.discovery !== "complete_through_checkpoint" ||
        coverage.missing_history),
    catalog = state.data.catalog,
    detail = state.data.account;
  const deadline =
    auth.challenge &&
    BigInt(auth.challenge.expires_unix_s) * 1000n > BigInt(clock);
  return (
    <div className="customer-shell">
      <div
        className={"top-progress " + (pending ? "busy" : "")}
        role={pending ? "progressbar" : undefined}
        aria-label={pending ? "Loading your Setl8 workspace" : undefined}
      >
        {pending && <span />}
      </div>
      <header className="customer-header">
        <a
          className="brand"
          href="/p30-app.html"
          aria-label="Setl8 challenge home"
        >
          <img src="/setl8-logo.png" alt="" width="43" height="43" />
          <span>
            SETL8<span className="brand-dot">®</span>
          </span>
        </a>
        <nav aria-label="Your workspace">
          {[
            ["start", "Start challenge"],
            ["accounts", "My accounts"],
            ["progress", "Purchase progress"],
          ].map(([id, label]) => (
            <button
              type="button"
              key={id}
              aria-current={tab === id ? "page" : undefined}
              onClick={() => navigate(id as Tab)}
            >
              {label}
            </button>
          ))}
        </nav>
        <Button className="customer-wallet" onClick={() => setWalletOpen(true)}>
          <WalletIcon size={16} />
          {state.scope ? shortId(state.scope.wallet) : "Connect wallet"}
        </Button>
      </header>
      <main className="customer-main">
        <div className="customer-environment">
          <span />
          Devnet rehearsal · Test tokens only
        </div>
        <AnimatePresence mode="sync" initial={false}>
          <motion.div
            key={tab}
            initial={{ opacity: reduced ? 1 : 0, y: reduced ? 0 : 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, transition: { duration: 0 } }}
            transition={{ duration: reduced ? 0 : 0.16 }}
          >
            {tab === "start" && (
              <>
                <div className="customer-title">
                  <div>
                    <h1>Start your SETL8 challenge.</h1>
                    <p>
                      Choose your account. Review the cost. Keep your progress
                      in view.
                    </p>
                  </div>
                  <span className="customer-title-note">
                    <ShieldCheck size={17} />
                    Your wallet. Your account.
                  </span>
                </div>
                <div className="customer-purchase-grid">
                  <section className="customer-offers">
                    <div className="customer-section-head">
                      <h2>Choose an account</h2>
                      <span>1 / 2</span>
                    </div>
                    <p>
                      Account choices and prices appear when a fresh catalogue
                      is available.
                    </p>
                    {!state.scope ? (
                      <div className="customer-action-empty">
                        <Layers size={30} />
                        <h3>Your next challenge starts here.</h3>
                        <p>
                          Connect your wallet to check account availability and
                          view your Setl8 accounts.
                        </p>
                        <Button
                          variant="primary"
                          onClick={() => setWalletOpen(true)}
                        >
                          Connect to continue
                          <ArrowRight size={16} />
                        </Button>
                      </div>
                    ) : catalogPhase === "loading" ? (
                      <div className="customer-loading" role="status">
                        <span />
                        <span />
                        <span />
                        <p>Checking account availability…</p>
                      </div>
                    ) : catalogPhase !== "ready" ? (
                      <div className="customer-action-empty">
                        <Clock3 size={30} />
                        <h3>New challenges are unavailable right now.</h3>
                        <p>
                          Your account records remain available. Check back for
                          fresh account choices.
                        </p>
                        <div className="customer-actions">
                          <Button onClick={() => void refreshCatalog()}>
                            <RefreshCw size={15} />
                            Check availability
                          </Button>
                          <Button
                            variant="ghost"
                            onClick={() => navigate("accounts")}
                          >
                            View my accounts
                            <ArrowUpRight size={15} />
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <div className="customer-offer-grid">
                        {catalog?.offers.map((o) => (
                          <button
                            type="button"
                            aria-pressed={offer === o}
                            key={o.tier_index + o.charge.mint.address}
                            onClick={() => setOffer(o)}
                          >
                            <span>{usd(o.account_size_micro_usd, 6, 0)}</span>
                            <small>Account size</small>
                            <strong>
                              {exactTokenAmount(
                                o.charge.total_token_debit_atoms,
                              )}{" "}
                              Test {o.charge.mint.display_symbol}
                            </strong>
                          </button>
                        ))}
                      </div>
                    )}
                  </section>
                  <aside className="customer-review">
                    <div className="customer-section-head">
                      <h2>Your review</h2>
                      <span>2 / 2</span>
                    </div>
                    {offer ? (
                      <>
                        <div className="customer-review-size">
                          {usd(offer.account_size_micro_usd, 6, 0)}
                        </div>
                        <dl>
                          {[
                            ["Account price", offer.charge.tier_price_atoms],
                            ["Purchase fee", offer.charge.purchase_fee_atoms],
                            [
                              "Recorded total",
                              offer.charge.total_token_debit_atoms,
                            ],
                          ].map(([label, v]) => (
                            <div key={label}>
                              <dt>{label}</dt>
                              <dd>
                                {exactTokenAmount(v)} Test{" "}
                                {offer.charge.mint.display_symbol}
                              </dd>
                            </div>
                          ))}
                        </dl>
                        <p>
                          This recorded offer still requires a fresh purchase
                          review. Availability and costs can change.
                        </p>
                      </>
                    ) : (
                      <div className="customer-review-placeholder">
                        <span>
                          <WalletIcon size={25} />
                        </span>
                        <h3>Your challenge, ready to review.</h3>
                        <p>
                          Select an available account to review its price and
                          fee here.
                        </p>
                      </div>
                    )}
                    <Button className="full" variant="primary" disabled>
                      Preparation unavailable
                    </Button>
                    <p className="customer-fine">
                      Purchase preparation is awaiting review. No payment is
                      requested.
                    </p>
                  </aside>
                </div>
                <div className="customer-bottom-note">
                  <CheckCircle2 size={17} />
                  <p>
                    Already have a Setl8 account?{" "}
                    <button type="button" onClick={() => navigate("accounts")}>
                      Open your accounts
                    </button>
                  </p>
                </div>
              </>
            )}
            {tab === "accounts" && (
              <>
                <div className="customer-title">
                  <div>
                    <h1>Your accounts.</h1>
                    <p>Your last observed account records, in one place.</p>
                  </div>
                  <Button
                    onClick={() => void refreshAccounts()}
                    disabled={pending}
                  >
                    <RefreshCw size={16} />
                    Refresh accounts
                  </Button>
                </div>
                {!state.scope ? (
                  <section className="customer-action-empty customer-panel">
                    <WalletIcon size={30} />
                    <h2>Sign in to see your accounts.</h2>
                    <p>Use your wallet to open a secure read session.</p>
                    <Button
                      variant="primary"
                      onClick={() => setWalletOpen(true)}
                    >
                      Connect wallet
                    </Button>
                  </section>
                ) : (
                  <section className="customer-panel">
                    {incomplete && (
                      <p className="customer-notice">
                        Account history is incomplete. An empty recorded view
                        does not establish that this wallet has no accounts.
                      </p>
                    )}
                    {state.data.owned && (
                      <p className="customer-fine">
                        Recorded checkpoint{" "}
                        {timestamp(
                          state.data.owned.read_cutoff.observed_unix_ns,
                        )}{" "}
                        ·{" "}
                        {observedAge(
                          state.data.owned.read_cutoff.observed_unix_ns,
                          clock,
                        )}
                      </p>
                    )}
                    {!rows.length ? (
                      <div className="customer-action-empty">
                        <Layers size={30} />
                        <h2>No account records in this view.</h2>
                        <p>
                          {pending
                            ? "Loading your recorded accounts…"
                            : "Check again later, or return to challenge availability."}
                        </p>
                        <Button onClick={() => navigate("start")}>
                          Explore challenges
                          <ArrowRight size={16} />
                        </Button>
                      </div>
                    ) : (
                      <div className="customer-accounts">
                        {rows.map((r) => (
                          <article key={r.account}>
                            <Badge tone="blue">Recorded account</Badge>
                            <h2>{usd(r.account_size_micro_usd, 6, 0)}</h2>
                            <p>{shortId(r.account)}</p>
                            <dl>
                              <div>
                                <dt>Last observed phase</dt>
                                <dd>
                                  {r.current_chain_state?.phase ??
                                    "Unavailable"}
                                </dd>
                              </div>
                              <div>
                                <dt>Trading setup</dt>
                                <dd>Pending</dd>
                              </div>
                            </dl>
                            <small>
                              {r.current_chain_state
                                ? `Observed ${timestamp(r.current_chain_state.snapshot.received_unix_ns)} · ${observedAge(r.current_chain_state.snapshot.received_unix_ns, clock)}`
                                : "Current account observation unavailable"}
                            </small>
                            <Button
                              onClick={() => {
                                if (!state.scope) return;
                                const s = state.scope,
                                  g = state.epoch,
                                  done = beginWork();
                                void reads.transport
                                  .account(
                                    s,
                                    r.account,
                                    new AbortController().signal,
                                  )
                                  .then(() => {
                                    if (reads.getSnapshot().epoch === g)
                                      navigate("detail");
                                  })
                                  .catch(() =>
                                    setReadError(
                                      "This account detail is unavailable. Refresh your account records.",
                                    ),
                                  )
                                  .finally(done);
                              }}
                            >
                              View account
                              <ArrowUpRight size={15} />
                            </Button>
                          </article>
                        ))}
                      </div>
                    )}
                    {state.data.owned?.has_more && (
                      <Button
                        disabled={pending}
                        onClick={() => void refreshAccounts(true)}
                      >
                        Load more accounts
                      </Button>
                    )}
                  </section>
                )}
              </>
            )}
            {tab === "progress" && (
              <>
                <div className="customer-title">
                  <div>
                    <h1>Purchase progress.</h1>
                    <p>Follow confirmation and account checks separately.</p>
                  </div>
                  <Button
                    disabled={pending}
                    onClick={() => void refreshProgress()}
                  >
                    <RefreshCw size={16} />
                    Refresh progress
                  </Button>
                </div>
                <section className="customer-panel">
                  {!state.scope ? (
                    <div className="customer-action-empty">
                      <WalletIcon size={30} />
                      <h2>Sign in to view your progress.</h2>
                      <Button
                        variant="primary"
                        onClick={() => setWalletOpen(true)}
                      >
                        Connect wallet
                      </Button>
                    </div>
                  ) : !state.data.purchases?.rows.length ? (
                    <div className="customer-action-empty">
                      <Clock3 size={30} />
                      <h2>No purchases returned in this view.</h2>
                      <p>
                        Once an account purchase is available, its recorded
                        progress appears here. History may still be incomplete.
                      </p>
                      <Button onClick={() => navigate("start")}>
                        Back to challenges
                      </Button>
                    </div>
                  ) : (
                    state.data.purchases.rows.map((p) => (
                      <article
                        className="customer-progress"
                        key={p.purchase_id}
                      >
                        <h2>Purchase {shortId(p.purchase_id)}</h2>
                        <div>
                          {[
                            ["Wallet report", p.submission.state],
                            ["Network confirmation", p.chain.state],
                            ["Purchase checks", p.verification.state],
                            ["Account", p.indexing.state],
                          ].map(([k, v]) => (
                            <section key={k}>
                              <span>{k}</span>
                              <strong>{v.replaceAll("_", " ")}</strong>
                            </section>
                          ))}
                        </div>
                        <p>
                          Confirmation and account ownership do not grant
                          trading access.
                        </p>
                      </article>
                    ))
                  )}
                </section>
              </>
            )}
            {tab === "detail" && detail && (
              <>
                <Button variant="ghost" onClick={() => navigate("accounts")}>
                  <ChevronLeft size={16} />
                  Back to accounts
                </Button>
                <div className="customer-title">
                  <div>
                    <h1>
                      Your {usd(detail.row.account_size_micro_usd, 6, 0)}{" "}
                      account.
                    </h1>
                    <p>Account {shortId(detail.row.account)}</p>
                  </div>
                  <Badge tone="amber">Trading setup pending</Badge>
                </div>
                <section className="customer-detail customer-panel">
                  <div>
                    <span>Last observed phase</span>
                    <strong>
                      {detail.row.current_chain_state?.phase ?? "Unavailable"}
                    </strong>
                  </div>
                  <div>
                    <span>Opening phase</span>
                    <strong>{detail.row.opened_phase}</strong>
                  </div>
                  <div>
                    <span>Trading access</span>
                    <strong>Unavailable</strong>
                  </div>
                </section>
                <p className="customer-fine">
                  {detail.row.current_chain_state
                    ? `Observed ${timestamp(detail.row.current_chain_state.snapshot.received_unix_ns)} · ${observedAge(detail.row.current_chain_state.snapshot.received_unix_ns, clock)}`
                    : "No current account observation is available."}{" "}
                  Recorded information does not guarantee continuing ownership
                  or current state.
                </p>
                <details>
                  <summary>Account evidence</summary>
                  <JsonDetails
                    title="Recorded account provenance"
                    value={detail}
                  />
                </details>
              </>
            )}
          </motion.div>
        </AnimatePresence>
        {readError && (
          <p className="customer-notice" role="alert">
            {readError}
          </p>
        )}
        <footer className="customer-footer">
          <span>SETL8</span>
          <p>
            Account reads and wallet sign-in only. Trading access remains
            unavailable.
          </p>
          <details>
            <summary>Connection details</summary>
            <JsonDetails
              title="Recorded read status"
              value={{
                phase: state.phase,
                epoch: state.epoch,
                error: state.error,
                coverage: state.data.owned?.coverage,
                preparation: runtime.preparation,
              }}
            />
          </details>
        </footer>
      </main>
      {walletOpen && (
        <Modal
          title={
            auth.phase === "review" || auth.phase === "signing"
              ? "Sign in to SETL8"
              : auth.accounts.length
                ? "Choose your wallet account"
                : "Connect your wallet"
          }
          onClose={() => {
            setWalletOpen(false);
            login.cancelReview();
          }}
        >
          <p className="modal-intro">
            Sign a message to access your Setl8 account reads. It does not
            authorize a payment or transaction.
          </p>
          {auth.error && (
            <p role="alert" className="customer-notice">
              {auth.error}
            </p>
          )}
          {state.scope ? (
            <>
              <p>Signed in as {shortId(state.scope.wallet, 9)}.</p>
              <Button onClick={() => void login.signOut()}>
                Sign out / change wallet
              </Button>
            </>
          ) : auth.phase === "review" || auth.phase === "signing" ? (
            <>
              <dl className="definition-list">
                <div>
                  <dt>Account</dt>
                  <dd>{shortId(auth.selected ?? "", 9)}</dd>
                </div>
                <div>
                  <dt>Purpose</dt>
                  <dd>Sign in to account reads</dd>
                </div>
              </dl>
              <details>
                <summary>Exact sign-in message</summary>
                <pre>{auth.challenge?.message}</pre>
              </details>
              <Button
                variant="primary"
                className="full"
                disabled={auth.phase === "signing" || !deadline}
                onClick={() => void login.signIn()}
              >
                {auth.phase === "signing"
                  ? "Waiting for your wallet…"
                  : deadline
                    ? "Sign in with wallet"
                    : "Sign-in message expired"}
              </Button>
              {!deadline && auth.phase !== "signing" && (
                <Button
                  onClick={() =>
                    auth.selected && void login.selectAccount(auth.selected)
                  }
                >
                  Get a new sign-in message
                </Button>
              )}
            </>
          ) : auth.phase === "cleanup" ? (
            <>
              <p>
                Finishing the previous wallet session. Close any pending request
                in your wallet.
              </p>
              <Button onClick={() => void login.signOut()}>
                Retry sign-out
              </Button>
            </>
          ) : auth.accounts.length ? (
            <div className="customer-wallet-list">
              {auth.accounts.map((a, i) => (
                <Button
                  key={a.address}
                  onClick={() => void login.selectAccount(a.address)}
                >
                  <WalletIcon size={18} />
                  <span>
                    {a.label?.slice(0, 60) ?? `Account ${i + 1}`}
                    <small>{shortId(a.address, 9)}</small>
                  </span>
                  <ArrowRight size={15} />
                </Button>
              ))}
            </div>
          ) : (
            <div className="customer-wallet-list">
              {wallets.length ? (
                wallets.map((w, i) => (
                  <Button
                    key={i}
                    disabled={auth.phase === "connecting"}
                    onClick={() => void login.chooseWallet(w)}
                  >
                    <WalletIcon size={18} />
                    {w.name}
                    <ArrowRight size={15} />
                  </Button>
                ))
              ) : (
                <p>
                  No Wallet Standard wallet is available. Open this page in a
                  browser with a compatible Solana wallet.
                </p>
              )}
            </div>
          )}
        </Modal>
      )}
    </div>
  );
}
