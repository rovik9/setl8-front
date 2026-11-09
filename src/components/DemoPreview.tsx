import { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowUpRight, Maximize2, ChevronDown } from "lucide-react";
import { Badge } from "./ui";
import PreviewChart from "./PreviewChart";
import { usd } from "../data/exact";
import { demoPrices } from "../data/demo";
export default function DemoPreview() {
  const [market, setMarket] = useState("0");
  return (
    <div className="landing-terminal">
      <div className="mini-accountbar">
        <span className="terminal-word">
          Setl8 <span>Terminal</span>
        </span>
        <span className="mini-meta">
          Leveraged challenge <ChevronDown size={12} />
        </span>
        <Badge tone="amber">Demo data</Badge>
      </div>
      <div className="preview-body">
        <div className="preview-main">
          <div className="preview-toolbar">
            <div className="preview-market-tabs">
              {["BTC / USD", "ETH / USD", "SOL / USD"].map((m, i) => (
                <button
                  key={m}
                  aria-pressed={market === String(i)}
                  onClick={() => setMarket(String(i))}
                >
                  {m}
                </button>
              ))}
            </div>
            <Link to="/demo/terminal" aria-label="Open demo terminal">
              <Maximize2 size={15} />
            </Link>
          </div>
          <div className="preview-price">
            {market === "0"
              ? usd(demoPrices[0], 18)
              : "Recorded history required"}
            <span>
              {market === "0"
                ? "Illustrative BTC price"
                : "ETH/SOL recorded charts only"}
            </span>
          </div>
          <PreviewChart market={market} />
          <div className="preview-time">
            <span>09:00</span>
            <span>12:00</span>
            <span>15:00</span>
            <span>UTC</span>
          </div>
        </div>
        <aside className="preview-account">
          <div>
            <span className="label">Demo account balance</span>
            <strong>$104,960.00</strong>
            <span className="positive">+$4,960.00</span>
          </div>
          <div>
            <div className="split">
              <span>Phase 1</span>
              <Badge tone="blue">Evaluation</Badge>
            </div>
            <div className="progress-track">
              <span style={{ width: "62%" }} />
            </div>
            <div className="split muted">
              <span>Illustrative target</span>
              <span>$108,000</span>
            </div>
          </div>
          <div className="preview-account-note">
            Built for focus.
            <br />
            Every phase in view.
          </div>
        </aside>
      </div>
      <div className="preview-caption">
        <span>Deterministic fixtures · No live quotes or orders</span>
        <Link to="/demo/terminal">
          Explore the workspace <ArrowUpRight size={13} />
        </Link>
      </div>
    </div>
  );
}
