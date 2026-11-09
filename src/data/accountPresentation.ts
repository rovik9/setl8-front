import type {
  AccountOverview,
  EvaluatorState,
  RecordedJson,
} from "../api/frontend-v1";
function object(value: RecordedJson | undefined) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : null;
}
/** Display-only configuration. Never substitute initial capital for current balance. */
export function initialAccount(config: RecordedJson) {
  const params = object(object(config)?.params);
  const decimal = (v: RecordedJson | undefined) =>
    typeof v === "string" && /^\d{1,20}$/.test(v) ? v : undefined;
  return { size: decimal(params?.size_micro), phase: decimal(params?.phase) };
}
export function recordedStatus(state: EvaluatorState | null | undefined) {
  if (!state) return "Awaiting state";
  const status = state.status || "State available";
  const flags = [state.frozen && "Frozen", state.ended && "Ended"].filter(
    (flag): flag is string =>
      !!flag && flag.toLowerCase() !== status.toLowerCase(),
  );
  return [status, ...flags].join(" · ");
}
export function isAgedRead(ns: string, now = Date.now()) {
  return /^\d+$/.test(ns) && BigInt(now) * 1000000n - BigInt(ns) > 60000000000n;
}
export function accountContext(overview: AccountOverview) {
  const initial = initialAccount(overview.initial_config);
  return {
    size: overview.evaluator_state?.size_micro ?? initial.size,
    phase: overview.evaluator_state?.phase ?? initial.phase,
    initial: !overview.evaluator_state,
  };
}
