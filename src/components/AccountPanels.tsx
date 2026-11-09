import { useState } from "react";
import {
  Activity as ActivityIcon,
  ListOrdered,
  FileCode2,
  ShieldCheck,
  Clock3,
} from "lucide-react";
import { useWorkspace } from "./Workspace";
import {
  Badge,
  Empty,
  JsonDetails,
  Button,
  Modal,
  Skeleton,
  tabKeys,
} from "./ui";
import { fixed, quantity, shortId, timestamp, usd } from "../data/exact";
import { marketName } from "../data/account";
import { api } from "../api/client";
import { usePaged } from "../hooks/paged";
import { demoAccount } from "../data/demo";
import type {
  Activity,
  Journal,
  Page,
  PublicationAttempt,
} from "../api/frontend-v1";
export type PanelTab = "Positions" | "Pending orders" | "Activity" | "Evidence";
export function AccountPanels({
  initial = "Positions",
  compact = false,
}: {
  initial?: PanelTab;
  compact?: boolean;
}) {
  const w = useWorkspace();
  const [tab, setTab] = useState<PanelTab>(initial);
  const [detail, setDetail] = useState<{
    title: string;
    value: unknown;
    scope: string;
  } | null>(null);
  const bundle = w.bundle.data;
  if (!bundle) return null;
  const scope = `${w.bundle.key}:${w.bundle.evidenceRevision}`;
  const showDetail = (value: { title: string; value: unknown }) =>
    setDetail({ ...value, scope });
  const positions = bundle.positions,
    pending = bundle.pending;
  return (
    <section className={"account-panels " + (compact ? "dense" : "")}>
      <div
        className="panel-tabs"
        role="tablist"
        onKeyDown={tabKeys}
        aria-label="Account details"
      >
        {(
          ["Positions", "Pending orders", "Activity", "Evidence"] as PanelTab[]
        ).map((label) => (
          <button
            key={label}
            role="tab"
            tabIndex={tab === label ? 0 : -1}
            id={"tab-" + label.replaceAll(" ", "-")}
            aria-controls="account-panel-content"
            aria-selected={tab === label}
            onClick={() => setTab(label)}
          >
            {label}
            {label === "Positions" && positions.available && (
              <span>{positions.rows?.length}</span>
            )}
            {label === "Pending orders" && pending.available && (
              <span>{pending.rows?.length}</span>
            )}
          </button>
        ))}
      </div>
      <div
        id="account-panel-content"
        role="tabpanel"
        aria-labelledby={"tab-" + tab.replaceAll(" ", "-")}
        tabIndex={0}
      >
        {tab === "Positions" &&
          (!positions.available ? (
            <Empty title="Position state unavailable">
              No committed evaluator view exists for this account yet.
            </Empty>
          ) : !positions.rows?.length ? (
            <Empty title="No recorded open positions">
              The last committed account view has an empty position list.
            </Empty>
          ) : (
            <div
              className="table-scroll"
              tabIndex={0}
              role="region"
              aria-label="Scrollable account table"
            >
              <table>
                <thead>
                  <tr>
                    <th>Market</th>
                    <th>Side</th>
                    <th>Quantity</th>
                    <th>Average entry</th>
                    <th>Stop loss</th>
                    <th>Take profit</th>
                    <th>Opened</th>
                  </tr>
                </thead>
                <tbody>
                  {positions.rows.map((p, i) => (
                    <tr key={p.market + ":" + i}>
                      <td>
                        <strong>{marketName(w.markets, p.market)}</strong>
                      </td>
                      <td>
                        <Badge tone={p.qty.startsWith("-") ? "rose" : "blue"}>
                          {p.qty.startsWith("-") ? "Short" : "Long"}
                        </Badge>
                      </td>
                      <td>{quantity(p.qty)}</td>
                      <td>{usd(p.avg_entry_e12, 12, 2)}</td>
                      <td>{p.sl === "0" ? "Not set" : usd(p.sl, 12)}</td>
                      <td>{p.tp === "0" ? "Not set" : usd(p.tp, 12)}</td>
                      <td className="muted">{timestamp(p.opened_at, "s")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
        {tab === "Pending orders" &&
          (!pending.available ? (
            <Empty title="Pending state unavailable">
              No committed evaluator view exists for this account yet.
            </Empty>
          ) : !pending.rows?.length ? (
            <Empty title="No recorded pending orders">
              The last committed pending list is empty. Complete cancellation
              and SL/TP outcomes are unavailable.
            </Empty>
          ) : (
            <div
              className="table-scroll"
              tabIndex={0}
              role="region"
              aria-label="Scrollable account table"
            >
              <table>
                <thead>
                  <tr>
                    <th>Nonce</th>
                    <th>Canonical order</th>
                    <th>Evidence</th>
                  </tr>
                </thead>
                <tbody>
                  {pending.rows.map((p) => (
                    <tr key={p.nonce}>
                      <td>{p.nonce}</td>
                      <td className="mono">{shortId(p.order_hex, 12)}</td>
                      <td>
                        <Button
                          className="small"
                          onClick={() =>
                            showDetail({
                              title: "Recorded pending order",
                              value: p,
                            })
                          }
                        >
                          View bytes
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
        {tab === "Activity" && (
          <EvidenceList
            key={w.account + "activity"}
            kind="activity"
            onDetail={showDetail}
          />
        )}
        {tab === "Evidence" && (
          <div className="evidence-grid">
            <div className="evidence-status">
              <ShieldCheck size={22} />
              <h3>Recorded evidence</h3>
              <dl className="definition-list">
                <div>
                  <dt>Chain finality</dt>
                  <dd>Unavailable</dd>
                </div>
                <div>
                  <dt>Independent verdict</dt>
                  <dd>Unavailable</dd>
                </div>
                <div>
                  <dt>Lifecycle application</dt>
                  <dd>Operator-only</dd>
                </div>
                <div>
                  <dt>Complete outcomes</dt>
                  <dd>Unavailable</dd>
                </div>
              </dl>
            </div>
            <div>
              <EvidenceList
                key={w.account + "journals"}
                kind="journals"
                onDetail={showDetail}
              />
              <JsonDetails
                title="Account config and origin evidence"
                value={{
                  initial_config: bundle.overview.initial_config,
                  chain_origins: bundle.overview.chain_origins,
                  chain_finality: bundle.overview.chain_finality,
                  features: bundle.overview.features,
                }}
              />
              <PublicationAttempts />
            </div>
          </div>
        )}
      </div>
      {detail?.scope === scope && (
        <Modal title={detail.title} onClose={() => setDetail(null)}>
          <JsonDetails title="Recorded fields" value={detail.value} />
          <p className="fine-print">
            Persisted evidence does not establish independent verification or
            deployed compatibility.
          </p>
        </Modal>
      )}
    </section>
  );
}
function EvidenceList({
  kind,
  onDetail,
}: {
  kind: "activity" | "journals";
  onDetail: (value: { title: string; value: unknown }) => void;
}) {
  const w = useWorkspace();
  const page = usePaged<Activity | Journal>(
    `${w.bundle.key}:${kind}:${w.bundle.evidenceRevision}`,
    async (after, signal) =>
      w.demo
        ? kind === "activity"
          ? demoAccount(w.account!).activity
          : demoAccount(w.account!).journals
        : api.request<Page<Activity | Journal>>(
            `/v1/accounts/${w.account}/${kind}?limit=25` +
              (after ? "&after=" + encodeURIComponent(after) : ""),
            { signal },
          ),
    !!w.account,
  );
  if (page.error)
    return (
      <p className="notice rose" role="alert">
        {page.error}
        <Button onClick={page.refresh}>Retry</Button>
      </p>
    );
  if (!page.rows.length)
    return (
      <Empty
        title={
          page.loading
            ? "Loading recorded activity…"
            : "No " +
              (kind === "activity" ? "recorded activity" : "journal work")
        }
      >
        {!page.loading && "No rows were returned for this account."}
      </Empty>
    );
  return (
    <>
      <div className="activity-list">
        {page.rows.map((row) => {
          const activity = "request_key" in row;
          return (
            <button
              key={activity ? row.input_seq : row.work_id}
              className="activity-row"
              onClick={() =>
                onDetail({
                  title: activity
                    ? "Recorded input #" + row.input_seq
                    : "Journal #" + row.journal_seq,
                  value: row,
                })
              }
            >
              <span className="activity-icon">
                {activity ? (
                  <ActivityIcon size={16} />
                ) : (
                  <FileCode2 size={16} />
                )}
              </span>
              <span>
                <strong>
                  {activity
                    ? "Input #" + row.input_seq
                    : "Journal #" + row.journal_seq}
                </strong>
                <small>
                  {activity
                    ? shortId(row.request_key, 10)
                    : "Work " + row.work_id}
                </small>
              </span>
              <span className="activity-tail">
                <Badge tone={activity ? "muted" : "blue"}>
                  {activity ? row.state : row.publication_state}
                </Badge>
                <small>
                  {activity
                    ? timestamp(row.received_unix_ns)
                    : "Preparation ≠ submission"}
                </small>
              </span>
            </button>
          );
        })}
      </div>
      {page.next && (
        <Button onClick={page.more} disabled={page.loading}>
          Load more {kind}
        </Button>
      )}
      <p className="panel-footnote">
        {kind === "activity"
          ? "Processed inputs are not complete execution or finality outcomes."
          : "Prepared publication means message preparation; chain finality remains unavailable."}{" "}
        History pages are independent reads.
      </p>
    </>
  );
}

function PublicationAttempts() {
  const w = useWorkspace();
  const page = usePaged<PublicationAttempt>(
    `${w.bundle.key}:attempts:${w.bundle.evidenceRevision}`,
    (after, signal) =>
      w.demo
        ? Promise.resolve(demoAccount(w.account!).attempts)
        : api.request<Page<PublicationAttempt>>(
            `/v1/accounts/${w.account}/publication-attempts?limit=10` +
              (after ? "&after=" + encodeURIComponent(after) : ""),
            { signal },
          ),
    !!w.account,
  );
  return (
    <details className="json-details">
      <summary>Prepared publication attempts</summary>
      {page.error ? (
        <p className="notice rose" role="alert">
          {page.error}
          <Button onClick={page.refresh}>Retry</Button>
        </p>
      ) : page.loading && !page.rows.length ? (
        <Skeleton rows={1} />
      ) : (
        <>
          <pre>
            {JSON.stringify(
              { rows: page.rows, next_after: page.next },
              null,
              2,
            )}
          </pre>
          {page.next && (
            <Button onClick={page.more} disabled={page.loading}>
              Load more attempts
            </Button>
          )}
          <p className="fine-print">
            Evidence pages refresh independently of the account view; they are
            not one atomic snapshot.
          </p>
        </>
      )}
    </details>
  );
}
