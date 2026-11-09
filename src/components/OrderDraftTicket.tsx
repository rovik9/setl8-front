import { useRef, useState, type FormEvent } from "react";
import { LockKeyhole, ChevronRight, SlidersHorizontal } from "lucide-react";
import { usePrototype } from "../prototype/context";
import { SyntheticActions } from "../prototype/Actions";
import { useOrderDraft } from "../hooks/orderDraft";
import {
  emptyDraft,
  ORDER_PROFILE,
  type DraftFields,
  type DraftScope,
} from "../data/orderDraft";
import { quantity, shortId } from "../data/exact";
import { Button, JsonDetails } from "./ui";
export function OrderDraftTicket({
  scope,
  symbol,
}: {
  scope: DraftScope;
  symbol?: string;
}) {
  return (
    <Ticket
      key={JSON.stringify(scope)}
      scope={scope}
      symbol={symbol ?? `Market ${scope.market}`}
    />
  );
}
function Ticket({ scope, symbol }: { scope: DraftScope; symbol: string }) {
  const prototype = usePrototype(),
    settings = useRef<HTMLDetailsElement>(null);
  const [fields, setFields] = useState(emptyDraft),
    [touched, setTouched] = useState(false);
  const draft = useOrderDraft(scope, fields);
  const update = (patch: Partial<DraftFields>) => {
    draft.invalidate();
    setFields((old) => ({ ...old, ...patch }));
    setTouched(true);
  };
  const error = (field: keyof DraftFields | "scope") =>
    touched && draft.errors[field] ? (
      <span className="draft-field-error" id={"draft-error-" + field}>
        {draft.errors[field]}
      </span>
    ) : null;
  const input = (
    field: "quantity" | "price" | "sl" | "tp" | "nonce" | "clientTime",
    label: string,
    mode: "decimal" | "numeric" = "decimal",
  ) => (
    <label className={"draft-label field-" + field} htmlFor={"draft-" + field}>
      {label}
      <input
        id={"draft-" + field}
        aria-label={label}
        value={fields[field]}
        placeholder={field === "quantity" ? "0.00" : undefined}
        maxLength={48}
        autoComplete="off"
        spellCheck={false}
        inputMode={mode}
        aria-invalid={touched && !!draft.errors[field]}
        aria-describedby={
          touched && draft.errors[field] ? "draft-error-" + field : undefined
        }
        onChange={(e) => update({ [field]: e.target.value })}
      />
      {error(field)}
    </label>
  );
  const submit = (e: FormEvent) => {
    e.preventDefault();
    setTouched(true);
    void draft.prepare();
  };
  const identityMissing = !!(
    draft.errors.nonce ||
    draft.errors.clientTime ||
    draft.errors.profile
  );
  return (
    <form className="order-draft-ticket" onSubmit={submit}>
      <div className="ticket-caption">
        <span>
          {scope.mode === "demo"
            ? "Illustrative ticket"
            : scope.mode === "prototype"
              ? "Synthetic order"
              : "Order draft"}
        </span>
        <span>No live execution</span>
      </div>
      <div className="side-picker">
        {(["Buy", "Sell"] as const).map((side) => (
          <button
            type="button"
            key={side}
            className={
              (fields.side === side ? "selected " : "") + side.toLowerCase()
            }
            aria-label={
              side + " " + (side === "Buy" ? "Long · side 0" : "Short · side 1")
            }
            aria-pressed={fields.side === side}
            disabled={fields.kind === "Close" && side === "Sell"}
            onClick={() => update({ side })}
          >
            <strong>{side}</strong>
            <span>{side === "Buy" ? "Long" : "Short"}</span>
          </button>
        ))}
      </div>
      <div className="order-type" aria-label="Order type">
        {(scope.mode === "prototype"
          ? (["Market", "Limit", "Stop", "Close"] as const)
          : (["Market", "Limit", "Stop"] as const)
        ).map((kind) => (
          <button
            type="button"
            key={kind}
            aria-pressed={fields.kind === kind}
            onClick={() =>
              update(
                kind === "Close"
                  ? {
                      kind,
                      side: "Buy",
                      quantity: "0",
                      price: "",
                      slEnabled: false,
                      tpEnabled: false,
                    }
                  : { kind },
              )
            }
          >
            {kind}
          </button>
        ))}
      </div>
      <div className="order-fields">
        {input("quantity", "Quantity · base units")}
        <span className="unit-caption">
          {fields.kind === "Close"
            ? "0 closes the whole position"
            : "Base quantity · 6 decimal places"}
        </span>
        {!["Market", "Close"].includes(fields.kind) &&
          input("price", fields.kind + " price · USD")}
        <div className="draft-protection">
          <div className="protection-switches">
            {(
              [
                ["slEnabled", "Stop loss"],
                ["tpEnabled", "Take profit"],
              ] as const
            ).map(([name, label]) => (
              <label className="draft-toggle" key={name}>
                <input
                  type="checkbox"
                  checked={fields[name]}
                  disabled={fields.kind === "Close"}
                  onChange={(e) => update({ [name]: e.target.checked })}
                />
                {label}
              </label>
            ))}
          </div>
          {fields.slEnabled && input("sl", "Stop loss price · USD")}
          {fields.tpEnabled && input("tp", "Take profit price · USD")}
        </div>
        <div className="ticket-account">
          <span>Account</span>
          <strong>
            {scope.account ? shortId(scope.account, 6) : "Select an account"}
          </strong>
        </div>
        <label className="draft-toggle account-consent">
          <input
            type="checkbox"
            checked={fields.accountConfirmed}
            disabled={!scope.account}
            onChange={(e) => update({ accountConfirmed: e.target.checked })}
          />
          Confirm this account for the draft
        </label>
        {error("accountConfirmed")}
      </div>
      {draft.error && (
        <p className="notice rose" role="alert">
          {draft.error}
        </p>
      )}
      {identityMissing && (
        <div className="draft-needed">
          <span>Draft identity required</span>
          <button
            type="button"
            onClick={() => {
              if (settings.current) {
                settings.current.open = true;
                settings.current.scrollIntoView({ block: "nearest" });
              }
            }}
          >
            Set up <ChevronRight size={12} />
          </button>
        </div>
      )}
      <Button
        type="submit"
        variant="primary"
        aria-label="Prepare development preview"
        className={"full review-order " + fields.side.toLowerCase()}
        disabled={Object.keys(draft.errors).length > 0 || draft.busy}
      >
        {draft.busy
          ? "Preparing…"
          : "Review " + fields.side.toLowerCase() + " order"}
      </Button>
      {draft.busy && (
        <p role="status" className="fine-print">
          Preparing exact SDK bytes…
        </p>
      )}
      <p className="ticket-execution-note">
        <LockKeyhole size={12} />
        {scope.mode === "prototype"
          ? "Disposable simulation only"
          : "Execution unavailable · unsigned preview"}
      </p>
      {draft.prepared && (
        <section
          className="draft-review"
          aria-label="Prepared development draft"
          aria-live="polite"
        >
          <div className="review-heading">
            <span>Order review</span>
            <strong className={fields.side.toLowerCase()}>
              {fields.side} {symbol}
            </strong>
          </div>
          <dl className="review-values">
            <div>
              <dt>Type</dt>
              <dd>{fields.kind}</dd>
            </div>
            <div>
              <dt>Quantity</dt>
              <dd>
                {fields.kind === "Close"
                  ? "Whole position"
                  : quantity(draft.prepared.decoded.qty) + " base units"}
              </dd>
            </div>
            {!["Market", "Close"].includes(fields.kind) && (
              <div>
                <dt>Price · USD</dt>
                <dd>{fields.price}</dd>
              </div>
            )}
            <div>
              <dt>Account</dt>
              <dd>{shortId(draft.prepared.scope.account!, 6)}</dd>
            </div>
          </dl>
          <details className="exact-order-details">
            <summary>Exact fields & signing bytes</summary>
            <dl className="definition-list">
              <div>
                <dt>Account</dt>
                <dd>
                  <code>{draft.prepared.scope.account}</code>
                </dd>
              </div>
              <div>
                <dt>Development nonce</dt>
                <dd>{draft.prepared.nonce}</dd>
              </div>
              <div>
                <dt>Profile / SDK</dt>
                <dd>
                  {draft.prepared.profile} / {draft.prepared.sdkVersion}
                </dd>
              </div>
            </dl>
            <JsonDetails
              title="SDK-decoded order fields"
              value={draft.prepared.decoded}
            />
            <details className="draft-bytes" open>
              <summary>
                Canonical order · {draft.prepared.orderLength} bytes
              </summary>
              <pre aria-label="Canonical order hex">
                {draft.prepared.orderHex}
              </pre>
            </details>
            <details className="draft-bytes" open>
              <summary>
                Signing message · {draft.prepared.messageLength} bytes
              </summary>
              <pre aria-label="Signing message hex">
                {draft.prepared.messageHex}
              </pre>
            </details>
          </details>
        </section>
      )}
      {draft.prepared && scope.mode === "prototype" && (
        <SyntheticActions
          key={draft.prepared.orderHex + draft.prepared.messageHex}
          draft={draft.prepared}
        />
      )}
      <details ref={settings} className="draft-scope">
        <summary>
          <SlidersHorizontal size={14} />
          Developer settings{" "}
          <span>{identityMissing ? "Required" : "Configured"}</span>
        </summary>
        <p className="fine-print">
          Exact development inputs. No nonce allocation, margin or eligibility
          is inferred.
        </p>
        <label className="draft-label">
          SDK profile
          <select
            aria-label="Draft SDK profile"
            value={fields.profile}
            onChange={(e) => update({ profile: e.target.value })}
          >
            <option value="">Choose a profile</option>
            <option value={ORDER_PROFILE}>{ORDER_PROFILE} · historical</option>
          </select>
          {error("profile")}
        </label>
        <p className="draft-account">
          Account address
          <code>{scope.account ?? "Select an account above"}</code>
        </p>
        {error("scope")}
        {input("nonce", "Development nonce · explicit u32", "numeric")}
        <p className="fine-print">
          1–4,294,967,295. Explicit and not checked for availability.
        </p>
        {input("clientTime", "Client time · Unix seconds", "numeric")}
        <Button
          type="button"
          variant="ghost"
          onClick={() =>
            update({
              clientTime:
                scope.mode === "prototype"
                  ? (prototype?.info?.clock ?? "")
                  : String(BigInt(Date.now()) / 1000n),
            })
          }
        >
          {scope.mode === "prototype"
            ? "Use synthetic clock"
            : "Use device time"}
        </Button>
        <p className="fine-print">
          Signed i64 seconds. Quantity uses 10⁻⁶ base units; prices use 10⁻¹²
          USD. Market price is zero, without an executable quote. Disabled SL/TP
          encode zero. Structural bytes do not prove acceptance.
        </p>
        {scope.mode === "prototype" && (
          <div className="synthetic-controls">
            <strong>Simulation operator</strong>
            <p>
              Synthetic clock: {prototype?.info?.clock} ·{" "}
              {prototype?.info?.phase}
            </p>
            <Button
              type="button"
              disabled={prototype?.busy}
              onClick={() => void prototype?.operate("stage-open")}
            >
              Stage manufactured open sample
            </Button>
            <Button
              type="button"
              disabled={prototype?.busy}
              onClick={() => void prototype?.operate("stage-close")}
            >
              Stage manufactured close sample
            </Button>
            <Button
              type="button"
              disabled={prototype?.busy}
              onClick={() => void prototype?.operate("recover")}
            >
              Check canonical replay
            </Button>
            <p className="fine-print">
              Guarded local CLI. No operator HTTP route or live market data.
              Market 0 only; Buy Market / whole-position Close with zero
              protective levels are executable.
            </p>
          </div>
        )}
        <p className="fine-print">
          Execution disabled. A reviewed combined runtime/SDK and enabled
          admission are required for connected/live trading. Purchase, reset,
          payout and lifecycle actions remain unavailable.
        </p>
      </details>
      {prototype?.error && scope.mode === "prototype" && (
        <p role="alert" className="notice rose">
          {prototype.error}
        </p>
      )}
    </form>
  );
}
