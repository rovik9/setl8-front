import { Link, useLocation, useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";
import { Wallet, ShieldCheck, LoaderCircle, LogOut } from "lucide-react";
import { useAuth, useOptionalAuth } from "../auth/context";
import { walletChoices, watchWallets } from "../auth/wallet";
import { Button, Badge, Modal } from "./ui";
import { shortId, timestamp } from "../data/exact";
export function WalletDialog() {
  const auth = useAuth();
  const location = useLocation(),
    navigate = useNavigate();
  const [choices, setChoices] = useState(walletChoices);
  const [missingWallet, setMissingWallet] = useState<string | null>(null);
  useEffect(() => watchWallets(() => setChoices(walletChoices())), []);
  useEffect(() => {
    if (auth.phase === "authenticated" && auth.isOpen) {
      auth.close();
      if (location.pathname === "/" && !location.search.includes("checkout="))
        navigate("/my-account");
    }
  }, [auth.phase]);
  if (!auth.isOpen) return null;
  const busy =
    auth.phase === "restoring" ||
    auth.phase === "connecting" ||
    auth.phase === "signing";
  if (auth.session)
    return (
      <Modal title="Your wallet" onClose={auth.close}>
        <p className="modal-intro">Signed in to Setl8 with your wallet.</p>
        <dl className="definition-list">
          <div>
            <dt>Wallet</dt>
            <dd title={auth.session.wallet}>
              {shortId(auth.session.wallet, 9)}
            </dd>
          </div>
          <div>
            <dt>Session expires</dt>
            <dd>{timestamp(auth.session.expires_unix_s, "s")}</dd>
          </div>
          <div>
            <dt>Admin read</dt>
            <dd>
              {auth.session.admin_read ? "Granted by server" : "Not granted"}
            </dd>
          </div>
          <div>
            <dt>Purchase approval</dt>
            <dd>Separate transaction in your wallet</dd>
          </div>
        </dl>
        <div className="session-actions">
          <Link
            className="button primary"
            to="/my-account"
            onClick={auth.close}
          >
            My accounts
          </Link>
          <Button onClick={() => void auth.manager.logout(false)}>
            {auth.manager.getPurchaseConnection()
              ? "Change wallet"
              : "Reconnect wallet"}
          </Button>
          <Button
            onClick={() => {
              auth.close();
              void auth.manager.logout();
            }}
          >
            <LogOut size={16} />
            Disconnect & log out
          </Button>
        </div>
        <p className="fine-print">
          Signing in does not approve a purchase or trade. Your private keys
          stay in your wallet.
        </p>
      </Modal>
    );
  return (
    <Modal
      title={auth.challenge ? "Review your sign-in" : "Connect your wallet"}
      onClose={auth.close}
    >
      <p className="modal-intro">
        Your wallet is your sign-in. Sign a message to get started or return to
        your account. This does not spend tokens or approve a transaction. Your
        private keys stay in your wallet.
      </p>
      {auth.error && (
        <p className="notice rose" role="alert">
          {auth.error}
        </p>
      )}
      {auth.challenge ? (
        <>
          <dl className="definition-list">
            <div>
              <dt>Wallet</dt>
              <dd className="mono" title={auth.challenge.wallet}>
                {shortId(auth.challenge.wallet, 8)}
              </dd>
            </div>
            <div>
              <dt>Service</dt>
              <dd>{auth.challenge.audience}</dd>
            </div>
            <div>
              <dt>Browser</dt>
              <dd>{auth.challenge.browser_origin}</dd>
            </div>
            <div>
              <dt>Valid until</dt>
              <dd>{timestamp(auth.challenge.expires_unix_s, "s")}</dd>
            </div>
          </dl>
          <details className="json-details">
            <summary>Exact message to sign</summary>
            <pre>{auth.challenge.message}</pre>
          </details>
          <Button
            variant="primary"
            className="full"
            disabled={busy}
            onClick={() => void auth.manager.sign()}
          >
            {busy ? (
              <LoaderCircle size={16} className="spin" />
            ) : (
              <ShieldCheck size={16} />
            )}{" "}
            {busy ? "Waiting for your wallet…" : "Sign in with wallet"}
          </Button>
        </>
      ) : (
        <div className="wallet-list">
          {choices.length ? (
            choices.map((choice) => (
              <Button
                className="wallet-choice"
                key={choice.name}
                disabled={busy || !!choice.unsupported}
                onClick={() => void auth.manager.choose(choice)}
              >
                <Wallet size={20} />
                <span>
                  {choice.name}
                  <small>
                    {choice.unsupported ?? "Detected · sign in with a message"}
                  </small>
                </span>
                {busy && <LoaderCircle size={16} className="spin" />}
              </Button>
            ))
          ) : (
            <div className="notice">
              <strong>No wallet detected in this browser.</strong>
              <p>
                Open this page in the browser where Phantom is installed, or use
                a supported Solana wallet browser. The in-app browser cannot
                access an extension installed in Chrome.
              </p>
              <p>
                Phantom and Solflare appear here when available. Nothing is
                installed or connected automatically.
              </p>
            </div>
          )}
        </div>
      )}
      {!auth.challenge && (
        <div className="wallet-availability">
          {["Phantom", "Solflare"]
            .filter(
              (name) =>
                !choices.some((c) =>
                  c.name.toLowerCase().includes(name.toLowerCase()),
                ),
            )
            .map((name) => (
              <Button
                key={name}
                className="wallet-choice"
                aria-pressed={missingWallet === name}
                onClick={() => setMissingWallet(name)}
              >
                <Wallet size={20} />
                <span>
                  {name}
                  <small>Not detected in this browser</small>
                </span>
              </Button>
            ))}
          {missingWallet && (
            <p role="status">
              Open this page in the browser where {missingWallet} is installed.
              This chooser cannot inject an extension into the in-app browser.
            </p>
          )}
        </div>
      )}
      {auth.error?.includes("logout") && (
        <Button onClick={() => void auth.manager.logout()}>
          <LogOut size={16} />
          Retry logout
        </Button>
      )}
      <div className="wallet-foot">
        <Badge tone="blue">Message signing only</Badge>
        <span>Sign-in message · no token spend</span>
      </div>
    </Modal>
  );
}
export function WalletButton() {
  const auth = useOptionalAuth();
  if (!auth) return null;
  return (
    <Button
      className="wallet-button"
      variant={auth.session ? "secondary" : "primary"}
      onClick={auth.open}
    >
      <Wallet size={16} />
      {auth.session ? shortId(auth.session.wallet) : "Connect wallet"}
    </Button>
  );
}
