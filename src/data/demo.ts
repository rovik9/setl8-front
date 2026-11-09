import type {
  AccountSummary,
  MarketIdentity,
  Position,
  Activity,
  Journal,
  PublicationAttempt,
  Page,
} from "../api/frontend-v1";
import type { AccountBundle } from "./account";
export const DEMO_ACCOUNT = "de".repeat(32);
export const DEMO_SECOND = "fa".repeat(32);
export const demoMarkets: MarketIdentity[] = [
  {
    market: "0",
    symbol: "BTC / USD",
    source: "2",
    feed_id: "ab".repeat(32),
    max_age_secs: "60",
  },
  {
    market: "1",
    symbol: "ETH / USD",
    source: "2",
    feed_id: "bc".repeat(32),
    max_age_secs: "60",
  },
  {
    market: "2",
    symbol: "SOL / USD",
    source: "4",
    feed_id: "cd".repeat(32),
    max_age_secs: "60",
  },
];
export const demoAccounts: AccountSummary[] = [
  {
    account: DEMO_ACCOUNT,
    trader_hex: "11".repeat(32),
    received_through: "128",
    processed_through: "128",
    evaluator_status: "Active",
    state_available: true,
  },
  {
    account: DEMO_SECOND,
    trader_hex: "11".repeat(32),
    received_through: "0",
    processed_through: "0",
    evaluator_status: null,
    state_available: false,
  },
];
const positions: Position[] = [
  {
    market: "0",
    qty: "125000",
    avg_entry_e12: "67412500000000000",
    timer_start: "1792828800",
    opened_at: "1792828800",
    fee_day: "20750",
    sl: "66200000000000000",
    tp: "69800000000000000",
  },
  {
    market: "1",
    qty: "-2000000",
    avg_entry_e12: "3548200000000000",
    timer_start: "1792829400",
    opened_at: "1792829400",
    fee_day: "20750",
    sl: "3610000000000000",
    tp: "3420000000000000",
  },
];
const activity: Activity[] = Array.from({ length: 5 }, (_, i) => ({
  input_seq: String(124 + i),
  request_key: [
    "demo-price-observation",
    "demo-tick",
    "demo-intent",
    "demo-sample",
    "demo-drain",
  ][i],
  input: { kind: ["Sample", "Tick", "Intent", "Sample", "Drain"][i] },
  input_sha256: "11".repeat(32),
  received_unix_ns: String(1792828800000000000n + BigInt(i) * 900000000000n),
  processing_outcome: { fixture: "Deterministic demonstration only" },
  recorded_refusals: null,
  result_sha256: "22".repeat(32),
  state: "processed",
}));
// Evidence fixtures remain demo-only; connected account bundles never carry pages.
export interface DemoAccountBundle extends AccountBundle {
  activity: Page<Activity>;
  journals: Page<Journal>;
  attempts: Page<PublicationAttempt>;
}
export function demoAccount(account = DEMO_ACCOUNT): DemoAccountBundle {
  const available = account !== DEMO_SECOND;
  const cursor = "demo-only-cursor";
  return {
    overview: {
      api_version: "1",
      account,
      trader_hex: "11".repeat(32),
      initial_config: { demonstration: true },
      received_through: available ? "128" : "0",
      processed_through: available ? "128" : "0",
      evaluator_state: available
        ? {
            balance_micro: "104960000000",
            size_micro: "100000000000",
            q_tally: "0",
            lock_until: "0",
            flat: false,
            latch: false,
            tight_on: false,
            r: "0",
            l_start: "8000000000",
            g_peak: "4960000000",
            l_level: "96960000000",
            phase: "1",
            status: "Active",
            frozen: false,
            ended: false,
            clock: "1792832400",
            processed_through: "128",
            journal_seq: "24",
            journal_hash: "33".repeat(32),
            trades_closed: "12",
            queued_events: "0",
            positions,
            pending: [],
            samples: "642",
            archive_bytes: "24048",
            intents_bytes: "1536",
            archive_sha256: "44".repeat(32),
            intents_sha256: "55".repeat(32),
            exec_refused: "0",
          }
        : null,
      worker_live: false,
      worker_error: null,
      read_at_unix_ns: "1792832400000000000",
      update_cursor: cursor,
      chain_origins: [],
      chain_finality: {
        publication_reconciled: false,
        deployed_compatibility_verified: false,
        status: "unavailable",
      },
      features: {
        live_market_admission: false,
        production_reorder_window_ns: null,
        complete_outcomes: false,
        cancel_sltp_completion: false,
        lifecycle_application: "operator_only",
        independent_verdict: "unavailable",
      },
    },
    positions: {
      api_version: "1",
      account,
      processed_through: available ? "128" : "0",
      available,
      rows: available ? positions : null,
      update_cursor: cursor,
      basis: "last_committed_canonical_view",
      complete_outcomes_available: false,
    },
    pending: {
      api_version: "1",
      account,
      processed_through: available ? "128" : "0",
      available,
      rows: available ? [] : null,
      update_cursor: cursor,
      basis: "last_committed_canonical_view",
      complete_outcomes_available: false,
    },
    activity: {
      api_version: "1",
      rows: available ? activity : [],
      next_after: null,
      has_more: false,
    },
    journals: {
      api_version: "1",
      rows: available
        ? [
            {
              work_id: "24",
              input_seq: "128",
              journal_seq: "24",
              journal_hash: "33".repeat(32),
              payload: { fixture: "Illustrative journal" },
              publication_state: "prepared",
              chain_reconciliation_available: false,
            },
          ]
        : [],
      next_after: null,
      has_more: false,
    },
    attempts: { api_version: "1", rows: [], next_after: null, has_more: false },
  };
}
export const demoPrices = [
  "67842500000000000000000",
  "3548280000000000000000",
  "172450000000000000000",
];
/** Deterministic fixtures; never used by a connected resource or market response. */
export function demoCandles(market = "0", interval = 15) {
  if (!["0", "1", "2"].includes(market)) return [];
  const base = market === "1" ? 3548.28 : market === "2" ? 172.45 : 67842.5;
  const end =
    0.972 +
    95 * 0.00029 +
    Math.sin(95 * 0.46) * 0.003 +
    Math.cos(95 * 0.17) * 0.002;
  let previous = base * (0.974 - end + 1);
  return Array.from({ length: 96 }, (_, i) => {
    const close =
      base *
      (0.972 +
        i * 0.00029 +
        Math.sin(i * 0.46) * 0.003 +
        Math.cos(i * 0.17) * 0.002 -
        end +
        1);
    const open = previous;
    previous = close;
    return {
      time: 1792796400 + i * interval * 60,
      open,
      close,
      high:
        Math.max(open, close) +
        base * (0.0004 + Math.abs(Math.sin(i)) * 0.0008),
      low:
        Math.min(open, close) -
        base * (0.0004 + Math.abs(Math.cos(i)) * 0.0006),
    };
  });
}
