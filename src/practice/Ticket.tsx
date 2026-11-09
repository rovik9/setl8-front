import { useEffect, useRef, useState } from "react";
import { useAuth } from "../auth/context";
import type { PracticeAccount, PracticeContext } from "../api/practice-v1";
import type { PreparedDraft } from "../data/orderDraft";
import { Button, JsonDetails } from "../components/ui";
import { quantity, usd } from "../data/exact";
import { PracticeHttp } from "./http";
import {
  emptyPracticeOrder,
  preparePracticeOrder,
  type PracticeOrderFields,
} from "./orders";
import {
  PracticeOutbox,
  PracticeSubmission,
  type IntentView,
} from "./submission";
export type TicketChoice = Partial<PracticeOrderFields> & { revision: number };
export type PracticeTicketProps = {
  account: PracticeAccount;
  capabilities: PracticeContext["capabilities"];
  http: PracticeHttp;
  choice?: TicketChoice;
  refresh: () => void;
};
export function PracticeTicket({
  account,
  capabilities,
  http,
  choice,
  refresh,
}: PracticeTicketProps) {
  const auth = useAuth(),
    [fields, setFields] = useState(emptyPracticeOrder),
    [draft, setDraft] = useState<PreparedDraft | null>(null),
    [error, setError] = useState<string | null>(null),
    [view, setView] = useState<IntentView | null>(null),
    [inspected, setInspected] = useState(false),
    [preparing, setPreparing] = useState(false);
  const engine = useRef<PracticeSubmission | null>(null);
  const [outbox] = useState(() => new PracticeOutbox(localStorage));
  useEffect(() => {
    if (choice) {
      setFields((f) => ({ ...f, ...choice, confirmed: false }));
      setDraft(null);
      setInspected(false);
    }
  }, [choice?.revision]);
  useEffect(() => {
    const e = new PracticeSubmission(
      account,
      draft,
      auth.manager,
      http,
      outbox,
      setView,
    );
    engine.current = e;
    setView(e.snapshot());
    return () => {
      e.dispose();
      engine.current = null;
    };
  }, [account.account, auth.epoch, draft]);
  const update = (patch: Partial<PracticeOrderFields>) => {
    setFields((f) => ({ ...f, ...patch }));
    setDraft(null);
    setInspected(false);
    setError(null);
  };
  const prepare = async () => {
    setPreparing(true);
    setError(null);
    try {
      const c = await http.context(account.wallet);
      const fresh = c.accounts.find((a) => a.account === account.account);
      if (!fresh) throw Error("Practice account unavailable.");
      setDraft(
        await preparePracticeOrder(
          fresh,
          auth.session!.wallet_hex,
          auth.epoch,
          fields,
        ),
      );
      setInspected(false);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setPreparing(false);
    }
  };
  const work = async (action: "sign" | "submit" | "reconcile") => {
    setError(null);
    try {
      await engine.current?.[action]();
      refresh();
    } catch (e) {
      setError((e as Error).message);
    }
  };
  const input = (
    key: "quantity" | "price" | "nonce" | "targetNonce" | "sl" | "tp",
    label: string,
  ) => (
    <label className="draft-label" htmlFor={"practice-" + key}>
      {label}
      <input
        id={"practice-" + key}
        aria-label={label}
        value={fields[key]}
        inputMode="decimal"
        autoComplete="off"
        maxLength={48}
        onChange={(e) => update({ [key]: e.target.value })}
      />
    </label>
  );
  return (
    <section
      className="order-draft-ticket practice-ticket"
      aria-label="Practice order ticket"
    >
      <div className="ticket-caption">
        <span>Synthetic replay order</span>
        <span>No token spend</span>
      </div>
      <div className="side-picker">
        {(["Buy", "Sell"] as const).map((side) => (
          <button
            type="button"
            key={side}
            className={
              (fields.side === side ? "selected " : "") + side.toLowerCase()
            }
            aria-pressed={fields.side === side}
            onClick={() => update({ side })}
          >
            <strong>{side}</strong>
            <span>{side === "Buy" ? "Long" : "Short"}</span>
          </button>
        ))}
      </div>
      <div className="order-type" aria-label="Practice order type">
        {(
          ["Market", "Limit", "Stop", "Close", "Cancel", "SetSlTp"] as const
        ).map((kind) => (
          <button
            key={kind}
            type="button"
            aria-pressed={fields.kind === kind}
            onClick={() =>
              update({
                kind,
                quantity: kind === "Close" ? "0" : fields.quantity,
              })
            }
          >
            {kind === "SetSlTp" ? "SL / TP" : kind}
          </button>
        ))}
      </div>
      <div className="order-fields">
        {!["Cancel", "SetSlTp"].includes(fields.kind) &&
          input(
            "quantity",
            fields.kind === "Close"
              ? "Close quantity · 0 for all"
              : "Quantity · base units",
          )}
        {["Limit", "Stop"].includes(fields.kind) &&
          input("price", fields.kind + " price · USD")}
        {fields.kind === "Cancel" &&
          input("targetNonce", "Pending order reference to cancel")}
        {["Market", "Limit", "Stop", "SetSlTp"].includes(fields.kind) && (
          <details>
            <summary>Stop loss / take profit</summary>
            {input("sl", "Stop loss · USD (optional)")}
            {input("tp", "Take profit · USD (optional)")}
            <p className="fine-print">
              Applies to the full remaining position where supported. Multiple
              targets and automated partial take profit are unavailable.
            </p>
          </details>
        )}
        {input("nonce", "Order reference")}
        <p className="fine-print">
          Explicit unique reference; a retry reuses identical signed bytes.
          Quantity uses six decimals and prices twelve. Close reductions are
          exact quantities.
        </p>
        <label className="draft-toggle account-consent">
          <input
            type="checkbox"
            checked={fields.confirmed}
            onChange={(e) => update({ confirmed: e.target.checked })}
          />
          Use this synthetic replay account
        </label>
      </div>
      <Button
        variant="primary"
        className={"full review-order " + fields.side.toLowerCase()}
        disabled={preparing || view?.busy || account.state === "blocked"}
        onClick={() => void prepare()}
      >
        {preparing
          ? "Preparing…"
          : "Review " + fields.side.toLowerCase() + " order"}
      </Button>
      {error && (
        <p className="notice rose" role="alert">
          {error}
        </p>
      )}
      {draft && (
        <div className="draft-review">
          <h3>Review synthetic replay order</h3>
          <dl className="review-values">
            <div>
              <dt>Type / side</dt>
              <dd>
                {fields.kind} / {fields.side}
              </dd>
            </div>
            <div>
              <dt>Quantity</dt>
              <dd>{quantity(draft.decoded.qty)} BTC</dd>
            </div>
            <div>
              <dt>Trigger price</dt>
              <dd>
                {draft.decoded.priceE12 === "0"
                  ? "Runtime replay price"
                  : usd(draft.decoded.priceE12, 12, 12)}
              </dd>
            </div>
            <div>
              <dt>Replay client time</dt>
              <dd>{draft.decoded.clientTime}</dd>
            </div>
            <div>
              <dt>Order reference</dt>
              <dd>{draft.nonce}</dd>
            </div>
          </dl>
          <JsonDetails
            title="Exact SDK order and signing message"
            value={{
              account: account.account,
              order_hex: draft.orderHex,
              signing_message_hex: draft.messageHex,
              profile: draft.profile,
            }}
          />
          <label className="draft-toggle">
            <input
              type="checkbox"
              checked={inspected}
              onChange={(e) => setInspected(e.target.checked)}
            />
            I reviewed this exact practice order. This message does not spend
            tokens.
          </label>
          <Button
            disabled={!inspected || view?.busy || view?.phase === "signed"}
            onClick={() => void work("sign")}
          >
            Sign practice order in wallet
          </Button>
        </div>
      )}
      {view?.retained && (
        <div className="practice-recovery">
          <strong>Retained order {view.retained.nonce}</strong>
          <Button disabled={view.busy} onClick={() => void work("submit")}>
            {view.retained.receipt || view.phase === "uncertain"
              ? "Retry identical signed order"
              : "Submit signed practice order"}
          </Button>
          <Button
            variant="ghost"
            disabled={view.busy}
            onClick={() => void work("reconcile")}
          >
            Check order reference
          </Button>
          {view.retained.receipt && (
            <Button
              variant="ghost"
              onClick={() => {
                setDraft(null);
                setFields((f) => ({
                  ...f,
                  nonce: String(BigInt(view.retained!.nonce) + 1n),
                  confirmed: false,
                }));
                setInspected(false);
              }}
            >
              Review next order reference
            </Button>
          )}
        </div>
      )}
      {view && (
        <p className="notice" role="status">
          {view.message}
        </p>
      )}
      {view?.status && (
        <JsonDetails
          title="Durable intent status · not complete outcome"
          value={view.status}
        />
      )}
      <p className="ticket-execution-note">
        Backend synthetic replay only. Receipt, execution evidence and
        settlement are distinct. Real funds and chain submission are disabled.
      </p>
      {!capabilities.multi_target_partial_tp && (
        <p className="fine-print">
          Automatic partial TP ladders are not supported.
        </p>
      )}
    </section>
  );
}
