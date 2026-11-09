import {
  devnetExecutionHttp,
  validateDevnetContext,
  priorPublicationProblem,
} from "./execution";
import { fixedStageProblem } from "./fixedStage";
import { DevnetIntentStore } from "./intentRecovery";
export async function checkSourcePreparation(
  wallet: string,
  account: string,
  stage: "Market" | "Close",
  signal: AbortSignal,
  http: Pick<
    typeof devnetExecutionHttp,
    "context" | "ledger" | "recorded"
  > = devnetExecutionHttp,
  store: Pick<DevnetIntentStore, "read"> = new DevnetIntentStore(localStorage),
) {
  const c = validateDevnetContext(await http.context(signal), wallet);
  if (signal.aborted) throw Error("Source preparation canceled.");
  if (c.account?.account !== account)
    throw Error("Account changed before source preparation.");
  if (c.account.runtime_admission === "blocked")
    throw Error(
      "Genuine account admission is blocked. No source attempt was requested.",
    );
  if (c.publication_compilation !== "reviewed_ready")
    throw Error(
      "Reviewed publication adapter is not ready. No source attempt was requested.",
    );
  const l = await http.ledger(account, signal);
  const prior = priorPublicationProblem(c, l, stage);
  if (prior) throw Error(prior);
  const retained = store.read(wallet, account),
    market =
      stage === "Close" ? await http.recorded(account, "1", signal) : null;
  if (signal.aborted) throw Error("Source preparation canceled.");
  const p = c.first_run_intent_policy,
    problem = fixedStageProblem(
      c,
      l,
      stage,
      stage === "Market"
        ? (p?.market_nonce ?? "")
        : (p?.whole_close_nonce ?? ""),
      { retained, market },
    );
  if (problem) throw Error(problem);
  // No source freshness/trade-ready gate here: this job is what acquires that source.
  // Those checks remain mandatory in bounded draft review, wallet signing and admission.
}
