import { useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  Check,
  ShieldCheck,
  Clock3,
  Layers3,
} from "lucide-react";
import { Brand, Badge, Button } from "../components/ui";
import { fixed, usd } from "../data/exact";
import { purchaseExamples, confirmationExamples } from "../data/purchaseDemo";
import { sitePresentation } from "../data/sitePresentation";
import TierGrid from "../components/TierGrid";
import { tierByIndex, formatMicro, sizeLabel } from "../buy/tiers";
export default function Purchase({ demo = false }: { demo?: boolean }) {
  const [selected, setSelected] = useState("medium"),
    [step, setStep] = useState<1 | 2 | 3>(1),
    [example, setExample] =
      useState<keyof typeof confirmationExamples>("confirming");
  const [tier, setTier] = useState(0);
  const picked = tierByIndex(tier)!;
  const presentation = sitePresentation();
  const product = purchaseExamples.find((p) => p.id === selected)!;
  return (
    <div className={"purchase-shell " + (demo ? "purchase-fixture" : "")}>
      <header className="purchase-header">
        <Brand />
        <Link
          className="text-link"
          to={demo ? "/demo/accounts" : presentation.accountPath}
        >
          Account overview
          <ArrowUpRight size={15} />
        </Link>
      </header>
      <main className="purchase-main" id="main-content">
        <Link className="purchase-back" to="/">
          <ArrowLeft size={14} />
          Back to Setl8
        </Link>
        <div className="purchase-heading">
          <p className="page-kicker">A clear path to your workspace</p>
          <h1>
            Make room for
            <br />
            your next chapter<span>.</span>
          </h1>
          <p>
            Choose your account. Review the details. Keep every step in view.
          </p>
        </div>
        {demo && (
          <div role="status" className="purchase-demo-notice">
            <Badge tone="amber">Purchase demonstration</Badge>
            <span>
              Non-live catalog fixtures · Demo credits have no monetary value ·
              No payment or account creation
            </span>
            <Link to="/purchase">Return to account availability</Link>
          </div>
        )}
        <ol className="purchase-steps" aria-label="Purchase steps">
          {["Select account", "Review details", "Confirmation"].map(
            (label, i) => (
              <li
                key={label}
                aria-current={demo && step === i + 1 ? "step" : undefined}
              >
                <span>
                  {demo && step > i + 1 ? (
                    <Check size={14} />
                  ) : (
                    String(i + 1).padStart(2, "0")
                  )}
                </span>
                {label}
              </li>
            ),
          )}
        </ol>
        <div className="purchase-grid">
          <section className="purchase-selection">
            {!demo ? (
              <>
                <span className="account-emblem">
                  <Layers3 size={24} />
                </span>
                <h2>A new challenge starts here.</h2>
                <p>
                  Account purchases aren't open yet. Available sizes, current
                  rules and exact pricing will appear here when purchasing
                  becomes available.
                </p>
                <div className="purchase-availability">
                  <ShieldCheck size={18} />
                  <div>
                    <strong>Review before you authorize</strong>
                    <p>
                      Your account price, payment asset, network and
                      confirmation status will be shown before any payment is
                      requested.
                    </p>
                  </div>
                </div>
                <div className="cx-purchase-tiers">
                  <TierGrid selected={tier} onSelect={setTier} />
                  <div className="cx-pricing-bar">
                    <p>
                      <strong>{sizeLabel(picked.accountSizeUsd)}</strong>{" "}
                      account · total{" "}
                      <strong>{formatMicro(picked.totalMicro)}</strong> test
                      tokens
                    </p>
                    <Link
                      className="button primary"
                      to={`/buy?tier=${picked.index}`}
                    >
                      Buy on devnet
                      <ArrowRight size={16} />
                    </Link>
                  </div>
                </div>
                <Link className="button secondary" to="/demo/purchase">
                  Explore purchase preview
                  <ArrowRight size={16} />
                </Link>
                <p className="purchase-muted">
                  The preview uses a non-live catalog. Your wallet is not asked
                  to authorize a purchase.
                </p>
              </>
            ) : step === 1 ? (
              <>
                <span className="eyebrow">Non-live catalog</span>
                <h2>Choose an illustrative account.</h2>
                <p>
                  These account sizes and demo-credit prices are layout
                  examples, not offers.
                </p>
                <fieldset className="purchase-sizes">
                  <legend>Example account size</legend>
                  {purchaseExamples.map((p) => (
                    <button
                      type="button"
                      key={p.id}
                      aria-pressed={selected === p.id}
                      onClick={() => setSelected(p.id)}
                    >
                      <span>{usd(p.size, 6, 0)}</span>
                      <small>Illustrative capital</small>
                      <strong>{fixed(p.price, 6, 2)} demo credits</strong>
                      {selected === p.id && <Check size={17} />}
                    </button>
                  ))}
                </fieldset>
                <Button variant="primary" onClick={() => setStep(2)}>
                  Preview review
                  <ArrowRight size={16} />
                </Button>
              </>
            ) : step === 2 ? (
              <>
                <span className="eyebrow">Example review</span>
                <h2>Know what comes next.</h2>
                <p>
                  In an available purchase flow, you would review the current
                  account rules and an exact quote, then authorize payment in
                  your wallet.
                </p>
                <ul className="purchase-checklist">
                  <li>
                    <Check size={17} />
                    Selected example: {usd(product.size, 6, 0)} illustrative
                    capital
                  </li>
                  <li>
                    <Check size={17} />
                    Login and purchase authorization are separate
                  </li>
                  <li>
                    <Check size={17} />
                    Confirmation is checked before account activation
                  </li>
                </ul>
                <div className="purchase-availability">
                  <ShieldCheck size={18} />
                  <p>
                    This preview has no payment asset, network, quote, live
                    rules or transaction. Its demo credits cannot be paid.
                  </p>
                </div>
                <div className="purchase-actions">
                  <Button onClick={() => setStep(1)}>Change example</Button>
                  <Button variant="primary" onClick={() => setStep(3)}>
                    View example status
                    <ArrowRight size={16} />
                  </Button>
                </div>
              </>
            ) : (
              <>
                <span className="eyebrow">Confirmation examples</span>
                <h2>Every outcome, clearly explained.</h2>
                <label className="purchase-status-select">
                  Example state
                  <select
                    aria-label="Example state"
                    value={example}
                    onChange={(e) =>
                      setExample(
                        e.target.value as keyof typeof confirmationExamples,
                      )
                    }
                  >
                    {Object.entries(confirmationExamples).map(([id, value]) => (
                      <option key={id} value={id}>
                        {value.title}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="purchase-example-state" role="status">
                  <Clock3 size={24} />
                  <h3>{confirmationExamples[example].title}</h3>
                  <p>{confirmationExamples[example].text}</p>
                </div>
                <div className="purchase-actions">
                  <Button onClick={() => setStep(2)}>
                    Back to example review
                  </Button>
                  <Link className="text-link" to="/demo/accounts">
                    Explore an account demo
                    <ArrowUpRight size={15} />
                  </Link>
                </div>
                <p className="purchase-muted">
                  The account demo is a separate $100K fixture. It is not
                  created or changed by this example.
                </p>
              </>
            )}
          </section>
          <aside className="purchase-review">
            <div className="section-top">
              <h2>{demo ? "Example summary" : "Your account review"}</h2>
              <Badge tone={demo ? "amber" : "muted"}>
                {demo ? "Fixture" : "Not available"}
              </Badge>
            </div>
            <div className="purchase-review-size">
              {demo ? usd(product.size, 6, 0) : "Your next account"}
              <span>
                {demo
                  ? "Illustrative capital"
                  : "Choose from the catalog when available"}
              </span>
            </div>
            <dl>
              <div>
                <dt>Account price</dt>
                <dd>
                  {demo
                    ? fixed(product.price, 6, 2) + " demo credits"
                    : "Not quoted"}
                </dd>
              </div>
              <div>
                <dt>Payment asset</dt>
                <dd>{demo ? "No asset · Demo only" : "Not available"}</dd>
              </div>
              <div>
                <dt>Network</dt>
                <dd>{demo ? "No network" : "Not configured"}</dd>
              </div>
              <div className="purchase-total">
                <dt>{demo ? "Example total" : "Exact total"}</dt>
                <dd>
                  {demo
                    ? fixed(product.price, 6, 2) + " demo credits"
                    : "Not quoted"}
                </dd>
              </div>
            </dl>
            <p>
              {demo
                ? "Non-live demonstration. No wallet authorization, payment or account is produced."
                : "A reviewed catalog and purchase confirmation service are required before purchases can open."}
            </p>
          </aside>
        </div>
        <footer className="purchase-footer">
          <ShieldCheck size={15} />
          {demo
            ? "You are exploring a fixture-only purchase journey."
            : "Your wallet is never charged by this availability page."}
          <Link to={demo ? "/demo/accounts" : presentation.accountPath}>
            Browse your accounts
            <ArrowUpRight size={14} />
          </Link>
        </footer>
      </main>
    </div>
  );
}
