import { Link } from "react-router-dom";
import { ArrowUpRight, Check } from "lucide-react";
import { Brand, Badge, JsonDetails } from "../components/ui";
import { WalletButton } from "../components/WalletDialog";
import { useAuth } from "../auth/context";
import { usd, shortId } from "../data/exact";
import { day2HistoryStatus } from "../devnet/history";
import "../devnet/devnet.css";
const explorer = (kind: "tx" | "address", value: string) =>
  `https://explorer.solana.com/${kind}/${encodeURIComponent(value)}?cluster=devnet`;
export default function DevnetHistory() {
  const auth = useAuth(),
    status = day2HistoryStatus(auth.session?.wallet ?? null),
    o = status.historySource;
  const settlement = o.transactions.find((t) => t.action === "settle_claims")!,
    queued = o.transactions.find((t) => t.action === "finalize_pass")!;
  return (
    <div className="devnet-history">
      <header className="site-header wrap">
        <Brand />
        <Link to="/my-account">My accounts</Link>
        <span className="wallet-chip">
          <WalletButton />
          {auth.session &&
            !auth.manager.isPurchaseWallet(auth.session.wallet) && (
              <small>Not connected for signing</small>
            )}
        </span>
      </header>
      <main className="wrap" id="main-content">
        <div className="devnet-history-heading">
          <Badge tone="amber">A1 · public rehearsal</Badge>
          <h1>Devnet payout history</h1>
          <p>
            This historical payout belongs to public rehearsal account A1,
            separate from your connected account and current wallet balance.
          </p>
        </div>
        <section
          className="panel payout-summary"
          aria-label="Historical payout"
        >
          <div className="section-top">
            <h2>Test USDC payout</h2>
            <Badge tone={status.receiptVerified ? "blue" : "amber"}>
              {status.receiptVerified
                ? "Paid · finalized"
                : "Verification unavailable"}
            </Badge>
          </div>
          <p className="payout-amount">
            {status.receiptVerified
              ? usd(o.reported.claim_amount_micro_usdc, 6, 6)
              : "—"}{" "}
            <span>test USDC</span>
          </p>
          <p>Recorded on 2 November 2026 · devnet</p>
          <dl className="definition-list">
            <div>
              <dt>Recipient</dt>
              <dd>
                <a
                  href={explorer("address", o.account.trader_token_account)}
                  target="_blank"
                  rel="noreferrer"
                  title={o.account.trader_token_account}
                >
                  {shortId(o.account.trader_token_account)}{" "}
                  <ArrowUpRight size={13} />
                </a>
              </dd>
            </div>
            <div>
              <dt>Recorded trader</dt>
              <dd>
                <a
                  href={explorer("address", o.account.trader)}
                  target="_blank"
                  rel="noreferrer"
                  title={o.account.trader}
                >
                  {shortId(o.account.trader)} <ArrowUpRight size={13} />
                </a>
              </dd>
            </div>
          </dl>
          <a
            className="button"
            href={explorer("tx", settlement.signature)}
            target="_blank"
            rel="noreferrer"
          >
            View settlement on Explorer <ArrowUpRight size={14} />
          </a>
        </section>
        <section className="panel">
          <h2>Payout timeline</h2>
          <ol className="payout-timeline">
            <li>
              <span className="payout-timeline-mark">
                <Check size={16} />
              </span>
              <div>
                <h3>Queued</h3>
                <p>
                  Finalize-pass transaction{" "}
                  {status.receiptVerified ? "finalized" : "recorded"}.
                </p>
                <a
                  href={explorer("tx", queued.signature)}
                  target="_blank"
                  rel="noreferrer"
                >
                  View transaction <ArrowUpRight size={13} />
                </a>
              </div>
            </li>
            <li>
              <span className="payout-timeline-mark">
                <Check size={16} />
              </span>
              <div>
                <h3>Settled</h3>
                <p>
                  {status.receiptVerified
                    ? "200.000000 test USDC transferred to the recorded recipient."
                    : "Settlement verification is unavailable."}
                </p>
                <a
                  href={explorer("tx", settlement.signature)}
                  target="_blank"
                  rel="noreferrer"
                >
                  View transaction <ArrowUpRight size={13} />
                </a>
              </div>
            </li>
          </ol>
        </section>
        <section className="panel">
          <h2>Recipient balance at settlement</h2>
          <div className="devnet-reported-metrics payout-balances">
            <div>
              <span>Before</span>
              <strong>{usd(o.reported.balance_before_micro_usdc, 6, 6)}</strong>
            </div>
            <div>
              <span>After</span>
              <strong>{usd(o.reported.balance_after_micro_usdc, 6, 6)}</strong>
            </div>
            <div>
              <span>Increase</span>
              <strong>{usd(o.reported.delta_micro_usdc, 6, 6)}</strong>
            </div>
          </div>
        </section>
        <details className="panel payout-verification">
          <summary>Verification and full history</summary>
          <div>
            <p>
              {status.label}. Archived finalized transactions were checked
              offline against two named RPC operators; their infrastructure
              independence is not established. Full typed claim fields, exact
              queue time and claim cycle remain unverified. This history is not
              evidence of a new connected-app execution.
            </p>
            <p>
              Generated {o.generated_at}. Program IDs and image hashes{" "}
              {status.samePrograms ? "match" : "differ from"} the preserved
              earlier snapshot. No chain requests or repeated
              finalize/settlement actions are performed by this page. Historical
              records do not grant signing authority.
            </p>
            <dl className="definition-list">
              {[
                ["Trading account", o.account.address],
                ["Trader wallet", o.account.trader],
                ["Destination token account", o.account.trader_token_account],
                ["Test USDC mint", o.account.mint],
                ["Claim", o.reported.claim],
              ].map(([label, value]) => (
                <div key={label}>
                  <dt>{label}</dt>
                  <dd>
                    <a
                      href={explorer("address", value)}
                      target="_blank"
                      rel="noreferrer"
                    >
                      <code>{value}</code>
                      <ArrowUpRight size={13} />
                    </a>
                  </dd>
                </div>
              ))}
            </dl>
            <h2>Finalized day-two transactions</h2>
            <div className="devnet-history-transactions">
              {o.transactions.map((t) => (
                <article key={t.signature}>
                  <div>
                    <strong>{t.action.replaceAll("_", " ")}</strong>
                    <Badge tone="blue">
                      {status.receiptVerified
                        ? "Finalized · successful"
                        : "Verification unavailable"}
                    </Badge>
                  </div>
                  <a
                    href={explorer("tx", t.signature)}
                    target="_blank"
                    rel="noreferrer"
                  >
                    <code>{t.signature}</code>
                    <ArrowUpRight size={14} />
                  </a>
                </article>
              ))}
            </div>
            <p>
              Exact increase: {o.reported.delta_micro_usdc} micro-USDC. Reported
              setup liquidity {usd(o.reported.setup_liquidity_micro_usdc)} test
              USDC; extra funding for this payout{" "}
              {usd(o.reported.added_for_payout_micro_usdc)}.
            </p>
            <JsonDetails
              title="Public source hashes and recorded data"
              value={o}
            />
            <JsonDetails
              title="Verified settlement DTO and receipt evidence"
              value={{
                history: status.settlementHistory,
                verification: status.verification,
              }}
            />
            <Link className="text-link" to="/devnet-proof">
              Preserved earlier proof snapshot <ArrowUpRight size={14} />
            </Link>
          </div>
        </details>
      </main>
    </div>
  );
}
