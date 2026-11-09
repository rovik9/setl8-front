import { Link } from "react-router-dom";
import { Badge, JsonDetails } from "../components/ui";
import { devnetJourney, type JourneyScope } from "./history";
import { recordedPurchaseUrl } from "./recordedPurchase";
import "./devnet.css";
const statusLabels: Record<string, string> = {
  "No purchase receipt verified here": "Purchase receipt not recorded yet",
  "Account verification unavailable": "Account observation not recorded yet",
  "No claim queue attested for this account": "Claim queue not recorded yet",
  "No verified settlement bound to this account": "Settlement not recorded yet",
};
export function DevnetJourney({ scope }: { scope: JourneyScope }) {
  const journey = devnetJourney(scope);
  return (
    <section
      className="devnet-journey"
      aria-label="Actual devnet journey status"
    >
      <div className="section-top">
        <div>
          <p className="account-kicker">Actual devnet journey</p>
          <h2>From your wallet to a settled receipt.</h2>
        </div>
        <Badge tone="blue">Devnet · test tokens</Badge>
      </div>
      <p className="devnet-journey-intro">
        Your account and actual transaction evidence stay separate from public
        rehearsal history. No simulation substitutes for chain execution or
        token settlement.
      </p>
      <div className="devnet-step-grid">
        {journey.steps.map((s, i) => (
          <article key={s.id}>
            <span className="devnet-step-number">{i + 1}</span>
            <h3>{s.title}</h3>
            <strong>{statusLabels[s.state] ?? s.state}</strong>
            <p>{s.description}</p>
            {"recorded" in s && s.recorded && (
              <div className="devnet-step-evidence">
                <dl>
                  <dt>Wallet</dt>
                  <dd>{s.recorded.wallet}</dd>
                  <dt>Account</dt>
                  <dd>
                    Challenge #{s.recorded.challenge} · {s.recorded.account}
                  </dd>
                  <dt>Transaction</dt>
                  <dd>{s.recorded.signature}</dd>
                  <dt>Slot</dt>
                  <dd>{s.recorded.slot}</dd>
                  <dt>Status</dt>
                  <dd>{s.recorded.status}</dd>
                  <dt>Debit</dt>
                  <dd>{s.recorded.debit}</dd>
                </dl>
                <a
                  className="text-link"
                  href={recordedPurchaseUrl(s.recorded)}
                  target="_blank"
                  rel="noreferrer"
                >
                  View transaction on Explorer (devnet)
                </a>
                {"localCopy" in s && s.localCopy && (
                  <p>
                    This browser also keeps a local record of this purchase.
                    Open checkout to reconcile it.
                  </p>
                )}
              </div>
            )}
          </article>
        ))}
      </div>
      <div className="devnet-journey-actions">
        <Link className="button secondary" to="/buy">
          Review devnet checkout
        </Link>
        <Link className="button secondary" to="/devnet-terminal">
          Devnet execution desk
        </Link>
        <Link className="text-link" to="/devnet-history">
          Separate public rehearsal history
        </Link>
      </div>
      {scope.account && (
        <JsonDetails
          title="Account observation basis"
          value={{
            account: scope.account,
            trader: scope.trader,
            signed_in_wallet: scope.sessionWallet,
            belongs_to_session: journey.owned,
            observed_slots: scope.slots,
            pass_pending: scope.passPending,
            pass_requested_at: scope.passRequestedAt,
            pass_proposed_at: scope.passProposedAt,
            executable_adapter_admission: false,
          }}
        />
      )}
    </section>
  );
}
