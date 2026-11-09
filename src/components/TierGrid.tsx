import { useId } from "react";
import { Check } from "lucide-react";
import { TIERS, formatMicro, sizeLabel, type Tier } from "../buy/tiers";

/**
 * All ten devnet challenge sizes as one radio group (native inputs: arrow keys, Space, focus ring).
 * Amounts are devnet test tokens, never real funds.
 */
export default function TierGrid({
  selected,
  onSelect,
  tiers = TIERS,
  legend = "Account size",
}: {
  selected: number | null;
  onSelect: (tierIndex: number) => void;
  tiers?: readonly Tier[];
  legend?: string;
}) {
  const name = useId();
  return (
    <fieldset className="cx-tiers">
      <legend>{legend}</legend>
      <div className="cx-tier-grid">
        {tiers.map((t) => (
          <label
            key={t.index}
            className={"cx-tier" + (selected === t.index ? " is-selected" : "")}
          >
            <input
              type="radio"
              name={name}
              value={t.index}
              checked={selected === t.index}
              onChange={() => onSelect(t.index)}
            />
            <span className="cx-tier-size">{sizeLabel(t.accountSizeUsd)}</span>
            <span className="cx-tier-sub">
              {"$" + t.accountSizeUsd.toLocaleString("en-US")} account
            </span>
            <span className="cx-tier-rows">
              <span>
                <small>Price</small>
                <b>{formatMicro(t.priceMicro)}</b>
              </span>
              <span>
                <small>Fee 0.4%</small>
                <b>{formatMicro(t.feeMicro)}</b>
              </span>
              <span className="cx-tier-total">
                <small>Total</small>
                <b>{formatMicro(t.totalMicro)}</b>
              </span>
            </span>
            {selected === t.index && (
              <Check className="cx-tier-check" size={16} aria-hidden="true" />
            )}
          </label>
        ))}
      </div>
      <p className="cx-tier-note">
        Devnet - test tokens, no real funds. Totals are in test tokens: price
        plus a 0.4% fee, rounded up.
      </p>
    </fieldset>
  );
}
