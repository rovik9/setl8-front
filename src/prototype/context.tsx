import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  prototypeBridge,
  prototypeEnabled,
  type PrototypeInfo,
} from "./profile";
import { readControllerInfo } from "./bootstrap";
import { beginWork } from "../hooks/loading";
const Context = createContext<{
  info: PrototypeInfo | null;
  busy: boolean;
  synced: boolean;
  error: string | null;
  warnDiscard: (nonce: string) => void;
  operate: (
    a: "stage-open" | "stage-close" | "evaluate" | "recover",
  ) => Promise<void>;
} | null>(null);
export function PrototypeProvider({ children }: { children: ReactNode }) {
  const [warning, setWarning] = useState<string | null>(null),
    [info, setInfo] = useState<PrototypeInfo | null>(null),
    [busy, setBusy] = useState(false),
    [synced, setSynced] = useState(false),
    [error, setError] = useState<string | null>(null);
  const generation = useRef(0);
  const synchronize = async () => {
    const bridge = prototypeBridge();
    if (!bridge) return;
    const version = ++generation.current;
    setSynced(false);
    setInfo(null);
    setBusy(true);
    setError(null);
    const done = beginWork();
    try {
      const current = await readControllerInfo(bridge);
      if (version !== generation.current) return;
      bridge.info = current;
      setInfo(current);
      setSynced(true);
    } catch (e) {
      if (version === generation.current) setError((e as Error).message);
    } finally {
      done();
      if (version === generation.current) setBusy(false);
    }
  };
  useEffect(() => {
    void synchronize();
    return () => {
      ++generation.current;
    };
  }, []);
  const operate = async (
    action: "stage-open" | "stage-close" | "evaluate" | "recover",
  ) => {
    if (busy || !synced) return;
    const bridge = prototypeBridge();
    if (!bridge) return;
    setBusy(true);
    setError(null);
    const done = beginWork();
    try {
      const next = await bridge.operate(action);
      bridge.info = next;
      setInfo(next);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      done();
      setBusy(false);
    }
  };
  return (
    <Context.Provider
      value={{
        info,
        busy,
        synced,
        error,
        operate,
        warnDiscard: (nonce) =>
          setWarning(
            `Interrupted synthetic nonce ${nonce} may have committed. Signed material was cleared by a scope/field change. Inspect this explicit nonce or operator evidence; do not infer or allocate another nonce.`,
          ),
      }}
    >
      {prototypeEnabled() && (
        <details className="simulation-banner">
          <summary>
            <span className="simulation-dot" />
            Simulation{" "}
            <span className="simulation-summary">Local only · No funds</span>
            <span className="simulation-status">
              {synced
                ? "Controller ready"
                : busy
                  ? "Synchronizing…"
                  : "Controller offline"}
            </span>
          </summary>
          <div className="simulation-expanded">
            <strong>
              Synthetic local simulation · No funds or deployed trading
            </strong>
            <p>
              Disposable mock wallet only · gateway 8790 · historical SDK · live
              admission disabled
            </p>
            <p>
              {synced
                ? `${info?.phase} · synthetic clock ${info?.clock}`
                : "Synthetic actions disabled until controller synchronization succeeds."}
            </p>
            <button
              type="button"
              className="button small"
              disabled={busy || !prototypeBridge()}
              onClick={() => void synchronize()}
            >
              Resync controller info
            </button>
          </div>
        </details>
      )}
      {error && (
        <p role="alert" className="simulation-error">
          {error}
        </p>
      )}
      {warning && (
        <p role="alert" className="simulation-banner">
          {warning}
        </p>
      )}
      {children}
    </Context.Provider>
  );
}
export function usePrototype() {
  return useContext(Context);
}
