import { useEffect, useRef, useState } from "react";
import { useAuth } from "../auth/context";
import type { PreparedDraft } from "../data/orderDraft";
import { Button, JsonDetails } from "../components/ui";
import { beginWork } from "../hooks/loading";
import { assertSyntheticDraft, prototypeBridge } from "./profile";
import { SyntheticSubmission, type SubmissionState } from "./submission";
import { usePrototype } from "./context";
export function SyntheticActions({ draft }: { draft: PreparedDraft }) {
  const auth = useAuth(),
    prototype = usePrototype();
  const [state, setState] = useState<SubmissionState | null>(null),
    [inspected, setInspected] = useState(false);
  const engine = useRef<SyntheticSubmission | null>(null);
  let prerequisite: string | null = null;
  const bridge = prototypeBridge();
  try {
    if (!bridge) throw new Error("Opt-in disposable controller required.");
    assertSyntheticDraft(draft, bridge.info, auth.session?.wallet_hex ?? "");
  } catch (e) {
    prerequisite = (e as Error).message;
  }
  useEffect(() => {
    if (prerequisite || !bridge) return;
    const current = new SyntheticSubmission(
      draft,
      bridge,
      auth.session!.wallet_hex,
      setState,
      undefined,
      (nonce) => prototype?.warnDiscard(nonce),
    );
    engine.current = current;
    setState(current.snapshot());
    return () => {
      current.dispose();
      engine.current = null;
    };
  }, [draft, prerequisite, bridge, auth.session?.wallet_hex]);
  const work = async (action: "sign" | "submit" | "reconcile") => {
    const current = engine.current;
    if (!current) return;
    const done = beginWork();
    try {
      await current[action]();
    } catch (e) {
      setState((old) =>
        old ? { ...old, message: (e as Error).message } : old,
      );
    } finally {
      done();
    }
  };
  if (prerequisite)
    return <p className="notice amber">Preview only: {prerequisite}</p>;
  return (
    <section
      className="synthetic-actions"
      aria-label="Synthetic intent submission"
    >
      <h4>Confirm simulation order</h4>
      <label className="draft-toggle">
        <input
          type="checkbox"
          checked={inspected}
          onChange={(e) => setInspected(e.target.checked)}
        />
        I inspected this exact order and signing message.
      </label>
      <Button
        type="button"
        disabled={!inspected || state?.busy || state?.phase !== "unsigned"}
        onClick={() => void work("sign")}
      >
        Sign inspected synthetic bytes
      </Button>
      <Button
        type="button"
        disabled={
          state?.busy ||
          !["signed", "received", "uncertain"].includes(state?.phase ?? "")
        }
        onClick={() => void work("submit")}
      >
        {state?.receipt || state?.phase === "uncertain"
          ? "Retry identical signed intent"
          : "Submit synthetic intent"}
      </Button>
      <Button
        type="button"
        disabled={state?.busy}
        onClick={() => void work("reconcile")}
      >
        Check explicit nonce status
      </Button>
      <p role="status" className="synthetic-receipt">
        {state?.message}
      </p>
      {state?.receipt && (
        <JsonDetails
          title="Durable receipt · not execution"
          value={state.receipt}
        />
      )}
      {state?.status && (
        <JsonDetails
          title="Recorded intent status · completion/finality unavailable"
          value={state.status}
        />
      )}
      {state?.receipt && (
        <Button
          type="button"
          disabled={state.busy || prototype?.busy}
          onClick={() => void prototype?.operate("evaluate")}
        >
          Evaluate received synthetic intent
        </Button>
      )}
      <details className="submission-details">
        <summary>Execution details</summary>
        <p className="fine-print">
          Evaluation uses the local runner's guarded tick/drain/work CLI. There
          is no operator HTTP API. Receipt, supported Fill/Close evidence and
          unavailable full outcomes/finality remain separate.
        </p>
      </details>
    </section>
  );
}
