import proof from "../data/devnet-proof.json";
import { Badge, CopyValue } from "../components/ui";

const EXPLORER = "https://explorer.solana.com";
export const explorerUrl = (kind: "tx" | "address", value: string) =>
  `${EXPLORER}/${kind}/${value}?cluster=devnet`;

function Link({ kind, value }: { kind: "tx" | "address"; value: string }) {
  return (
    <span className="proof-ref">
      <a
        href={explorerUrl(kind, value)}
        target="_blank"
        rel="noopener noreferrer"
        title={value}
      >
        <code>{value}</code>
      </a>
      <CopyValue value={value} label="Copy" />
    </span>
  );
}

const shown = (value: unknown) =>
  typeof value === "string" ? value : JSON.stringify(value);

export default function DevnetProof() {
  const { programs, accounts, test_mints: mints, challenge, payout } = proof;
  const money = (n: number) => `$${n.toLocaleString("en-US")}`;
  return (
    <main id="main-content" className="dashboard proof">
      <div className="page-title">
        <div>
          <Badge tone="amber">Solana devnet · rehearsal · test tokens</Badge>
          <h1>
            Devnet proof<span>.</span>
          </h1>
          <p>
            A leveraged challenge, from purchase to payout, as devnet
            transactions. Every link opens Solana Explorer.
          </p>
        </div>
      </div>
      <section className="panel" aria-label="Scope and trust">
        <div className="panel-heading">
          <div>
            <h2>What this page is</h2>
            <p>
              A static page generated from the public deployment manifest
              (sha256 <code>{proof.source.manifest.sha256}</code>) and demo list
              (sha256 <code>{proof.source.demo.sha256}</code>). It makes no
              network calls, requests no wallet and holds no keys. The test
              stablecoins have no value and the admin keys of this rehearsal are
              throwaway keys.
            </p>
          </div>
        </div>
      </section>
      <section className="panel" aria-label="Deployment">
        <div className="panel-heading">
          <div>
            <h2>Deployment</h2>
            <p>Cluster devnet · genesis {proof.genesis_hash}</p>
          </div>
        </div>
        <dl className="proof-facts">
          <div>
            <dt>Leveraged challenge program</dt>
            <dd>
              <Link kind="address" value={programs.lev.id} />
              <span className="muted">
                {programs.lev.size_bytes.toLocaleString("en-US")} bytes · sha256{" "}
                {programs.lev.sha256}
              </span>
            </dd>
          </div>
          <div>
            <dt>Vault program</dt>
            <dd>
              <Link kind="address" value={programs.vault.id} />
              <span className="muted">
                {programs.vault.size_bytes.toLocaleString("en-US")} bytes ·
                sha256 {programs.vault.sha256}
              </span>
            </dd>
          </div>
          <div>
            <dt>Vault state</dt>
            <dd>
              <Link kind="address" value={accounts.vault_state} />
            </dd>
          </div>
          <div>
            <dt>Payout pools (USDC · USDT)</dt>
            <dd>
              <Link kind="address" value={accounts.usdc_pool} />
              <Link kind="address" value={accounts.usdt_pool} />
            </dd>
          </div>
          <div>
            <dt>Test stablecoins (USDC · USDT, {mints.decimals} decimals)</dt>
            <dd>
              <Link kind="address" value={mints.usdc} />
              <Link kind="address" value={mints.usdt} />
            </dd>
          </div>
          <div>
            <dt>Challenge</dt>
            <dd>
              <span>
                {challenge.tiers.length} account sizes, from{" "}
                {money(challenge.tiers[0]?.account_size_usd ?? 0)} for{" "}
                {money(challenge.tiers[0]?.price_usd ?? 0)} · fee{" "}
                {(challenge.challenge_fee_bps / 100).toFixed(2)}% ·{" "}
                {challenge.market_count} markets · pass delay{" "}
                {challenge.pass_delay_secs / 3600} h
              </span>
            </dd>
          </div>
        </dl>
      </section>
      {proof.sections.map((section) => (
        <section
          key={section.n}
          className="panel"
          aria-label={`Step ${section.n}`}
        >
          <div className="panel-heading">
            <div>
              <h2>
                {section.n}. {section.title}
              </h2>
              <p>{section.summary}</p>
            </div>
            {section.pending && <Badge tone="amber">Pending</Badge>}
          </div>
          {section.pending && (
            <p className="muted proof-pending" role="status">
              Not yet on chain: {section.pending}
            </p>
          )}
          <ul className="proof-items">
            {section.items.map((item) => (
              <li key={item.label + item.value}>
                <span>{item.label}</span>
                <Link kind={item.kind as "tx" | "address"} value={item.value} />
              </li>
            ))}
          </ul>
        </section>
      ))}
      <section className="panel" aria-label="Payout record">
        <div className="panel-heading">
          <div>
            <h2>Payout record</h2>
            <p>
              Filled from the manifest after the payout step; empty values mean
              the step has not happened yet.
            </p>
          </div>
        </div>
        <dl className="proof-facts">
          {(
            [
              ["Queued claim", payout.claim],
              ["Pool funding", payout.pool_funding],
              [
                "Trader balance before (micro-USDC)",
                payout.trader_balance_before_micro_usdc,
              ],
              [
                "Trader balance after (micro-USDC)",
                payout.trader_balance_after_micro_usdc,
              ],
            ] as [string, unknown][]
          ).map(([label, value]) => (
            <div key={label}>
              <dt>{label}</dt>
              <dd>
                {value === null || value === undefined ? (
                  <span className="muted">Pending</span>
                ) : (
                  <code>{shown(value)}</code>
                )}
              </dd>
            </div>
          ))}
        </dl>
      </section>
    </main>
  );
}
