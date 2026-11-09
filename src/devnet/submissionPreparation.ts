import { decodeOrder, IntentKind } from "@setl8/order-codec";
import { fromHex } from "../buy/bytes";
import { fixed } from "../data/exact";
import {
  devnetExecutionHttp,
  validateDevnetContext,
  devnetReviewProblem,
  priorPublicationProblem,
} from "./execution";
import { armedMarketSizeProblem } from "./marketSize";
import { fixedStageProblem } from "./fixedStage";
import { DevnetIntentStore, type DevnetSignedRecord } from "./intentRecovery";
import type { DevnetExecutionContext } from "../api/devnet-execution-v1";
export async function checkRetainedSubmission(
  record: DevnetSignedRecord,
  wallet: string,
  signal: AbortSignal,
  http: Pick<
    typeof devnetExecutionHttp,
    "context" | "ledger" | "recorded"
  > = devnetExecutionHttp,
  store: Pick<DevnetIntentStore, "read"> = new DevnetIntentStore(localStorage),
  context?: DevnetExecutionContext,
) {
  const c = validateDevnetContext(
    context ?? (await http.context(signal)),
    wallet,
  );
  if (signal.aborted)
    throw Error(
      "Submission review canceled. Exact signature remains retained.",
    );
  if (
    c.account?.account !== record.account ||
    record.wallet !== wallet ||
    !c.clock_unix_s
  )
    throw Error(
      "Original account/session differs from the current submission context.",
    );
  const problem = devnetReviewProblem(c, wallet);
  if (problem) throw Error(problem);
  const order = decodeOrder(fromHex(record.body.order));
  if (order.kind !== IntentKind.Market && order.kind !== IntentKind.Close)
    throw Error("Only the armed Market/wholeClose stage can be submitted.");
  const kind = order.kind === IntentKind.Market ? "Market" : "Close",
    delta = BigInt(c.clock_unix_s) - order.clientTime;
  const size = armedMarketSizeProblem(
    fixed(order.qty.toString(), 6, 6, false),
    kind,
    c.market_quantity_policy,
  );
  if (size) throw Error(size);
  if (delta < -5n || delta > 5n)
    throw Error(
      "This exact signature is stale. No app submission occurred; explicit review is required.",
    );
  const l = await http.ledger(record.account, signal),
    prior = priorPublicationProblem(c, l, kind);
  if (prior) throw Error(prior);
  const current = store.read(wallet, record.account);
  if (
    !current ||
    current.submission !== "not_sent" ||
    current.messageHex !== record.messageHex ||
    current.nonce !== record.nonce ||
    current.body.order !== record.body.order ||
    current.body.signature !== record.body.signature
  )
    throw Error(
      "Original signed candidate changed or was already forwarded. Exact recovery is required.",
    );
  // The exact app-unsent candidate has been checked; all predecessor proof comes from durable history.
  const market =
    kind === "Close" ? await http.recorded(record.account, "1", signal) : null;
  const stage = fixedStageProblem(c, l, kind, record.nonce, {
    retained: null,
    market,
  });
  if (stage) throw Error(stage);
  if (signal.aborted)
    throw Error(
      "Submission review canceled. Exact signature remains retained.",
    );
}
