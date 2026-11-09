import { useSearchParams } from "react-router-dom";
import { prototypeEnabled } from "../prototype/profile";
import Terminal from "./Terminal";
import PythPanel from "../pyth/Panel";
import LivePanel from "../live/Panel";
import "../pyth/terminal.css";

export default function TerminalEntry() {
  const [params, setParams] = useSearchParams();
  const simulation = prototypeEnabled();
  // The labelled BTC simulation is always the first thing a viewer sees; Pyth prices are an opt-in tab.
  const view =
    params.get("view") === "live"
      ? "live"
      : params.get("view") === "pyth"
        ? "pyth"
        : "simulation";
  const choose = (next: string) => {
    const search = new URLSearchParams(params);
    search.set("view", next);
    setParams(search, { preventScrollReset: true });
  };
  return (
    <div className="terminal-entry">
      <nav className="terminal-view-switch" aria-label="Terminal view">
        <button
          aria-pressed={view === "simulation"}
          onClick={() => choose("simulation")}
        >
          BTC simulation
        </button>
        <button aria-pressed={view === "pyth"} onClick={() => choose("pyth")}>
          Live Pyth prices
        </button>
        <button aria-pressed={view === "live"} onClick={() => choose("live")}>
          Live prices
        </button>
      </nav>
      {view === "simulation" ? (
        <>
          <p className="terminal-simulation-label">
            {simulation
              ? "Simulated BTC trading · disposable account · synthetic execution"
              : "Simulation · Local only · No funds. The workspace below is read only until the disposable simulation session is opened."}
          </p>
          <Terminal />
        </>
      ) : view === "live" ? (
        <LivePanel />
      ) : (
        <PythPanel />
      )}
    </div>
  );
}
