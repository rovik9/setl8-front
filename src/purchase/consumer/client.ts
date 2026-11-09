import { beginWork } from "../../hooks/loading";
import type * as D from "../../api/purchase-foundation-v1";
import {
  parsePurchase,
  assertPurchaseScope,
  type PurchaseScope,
} from "./runtime";
import descriptor from "../../../dependencies/p30/3e33090cf9193fd909f57ed75e10f9e59b9409e3c8a8f6c186272d8ee185f86d/p30-descriptor.json";
import type { prepareP30UnsignedPurchase } from "../prepareUnsigned";
type Prepared = Awaited<ReturnType<typeof prepareP30UnsignedPurchase>>;
export interface PurchaseTransport {
  catalog(s: PurchaseScope, signal: AbortSignal): Promise<unknown>;
  quote(
    s: PurchaseScope,
    request: D.QuoteRequest,
    signal: AbortSignal,
  ): Promise<unknown>;
  prepareAttempt(
    s: PurchaseScope,
    request: D.PurchaseAttemptRequest,
    signal: AbortSignal,
  ): Promise<unknown>;
  status(s: PurchaseScope, id: string, signal: AbortSignal): Promise<unknown>;
  purchases(
    s: PurchaseScope,
    cursor: string | null,
    signal: AbortSignal,
  ): Promise<unknown>;
  owned(
    s: PurchaseScope,
    cursor: string | null,
    signal: AbortSignal,
  ): Promise<unknown>;
  account(s: PurchaseScope, id: string, signal: AbortSignal): Promise<unknown>;
}
const disabled = async () => {
  throw Error("Purchase connection is not enabled. No request was sent.");
};
export const disabledPurchaseTransport: PurchaseTransport = Object.freeze({
  catalog: disabled,
  quote: disabled,
  prepareAttempt: disabled,
  status: disabled,
  purchases: disabled,
  owned: disabled,
  account: disabled,
});
export interface PurchaseState {
  scope: PurchaseScope;
  pending: readonly string[];
  error: string | null;
  catalog: D.PurchaseCatalog | null;
  quote: D.PurchaseQuote | null;
  prepared: Prepared | null;
  attempt: D.PurchaseAcknowledgment | null;
  status: D.PurchaseStatus | null;
  pendingAttempt: D.PurchaseAttemptRequest | null;
  reconcileRequired: boolean;
  historyIncomplete: boolean;
  history: D.FixedPage<D.PurchaseStatus> | null;
  owned: D.FixedPage<D.OwnedAccount> | null;
  account: D.OwnedAccountRead | null;
}
const fresh = (scope: PurchaseScope): PurchaseState => ({
  scope: Object.freeze({ ...scope }),
  pending: [],
  error: null,
  catalog: null,
  quote: null,
  prepared: null,
  attempt: null,
  status: null,
  pendingAttempt: null,
  reconcileRequired: false,
  historyIncomplete: true,
  history: null,
  owned: null,
  account: null,
});
function sameAttempt(
  v: D.PurchaseStatus,
  expected: D.PurchaseAttemptRequest | D.PurchaseStatus,
) {
  const message =
    "message_sha256" in expected
      ? expected.message_sha256
      : expected.expected_message_sha256;
  if (
    v.request_id !== expected.request_id ||
    v.quote_id !== expected.quote_id ||
    v.expected_account !== expected.expected_account ||
    v.expected_message_sha256 !== message ||
    v.recent_blockhash !== expected.recent_blockhash ||
    v.last_valid_block_height !== expected.last_valid_block_height ||
    ("purchase_id" in expected &&
      (v.purchase_id !== expected.purchase_id ||
        (expected.transaction_signature !== null &&
          v.transaction_signature !== expected.transaction_signature)))
  )
    throw Error(
      "Attempt context changed. The original purchase remains uncertain; check its progress before continuing.",
    );
}
export class PurchaseClient {
  private value: PurchaseState;
  private listeners = new Set<() => void>();
  private generation = 0;
  private requests = new Map<string, AbortController>();
  private ownedPages = 0;
  private knownAttempts = new Map<string, D.PurchaseStatus>();
  constructor(
    scope: PurchaseScope,
    private transport: PurchaseTransport = disabledPurchaseTransport,
    private now: () => bigint = () => BigInt(Date.now()) * 1000000n,
    private prepare: typeof prepareP30UnsignedPurchase = async (input) =>
      (await import("../prepareUnsigned")).prepareP30UnsignedPurchase(input),
    private timeoutMs = 5000,
  ) {
    this.value = fresh(assertPurchaseScope(scope));
  }
  getSnapshot = () => this.value;
  subscribe = (f: () => void) => {
    this.listeners.add(f);
    return () => this.listeners.delete(f);
  };
  private emit(p: Partial<PurchaseState>) {
    this.value = Object.freeze({
      ...this.value,
      ...p,
      pending: Object.freeze([...this.requests.keys()]),
    });
    for (const f of this.listeners) f();
  }
  setScope(scope: PurchaseScope) {
    const checked = assertPurchaseScope(scope);
    this.generation++;
    for (const c of this.requests.values()) c.abort();
    this.requests.clear();
    this.ownedPages = 0;
    this.knownAttempts.clear();
    this.value = fresh(checked);
    this.emit({});
  }
  dispose() {
    this.generation++;
    for (const c of this.requests.values()) c.abort();
    this.requests.clear();
    this.listeners.clear();
  }
  private async run<T>(
    channel: string,
    work: (
      scope: PurchaseScope,
      signal: AbortSignal,
      guard: () => void,
    ) => Promise<T>,
    apply: (v: T) => void,
  ) {
    this.requests.get(channel)?.abort();
    const c = new AbortController(),
      g = this.generation,
      scope = this.value.scope;
    this.requests.set(channel, c);
    const done = beginWork();
    this.emit({ error: null });
    const current = () =>
      g === this.generation && this.requests.get(channel) === c;
    const guard = () => {
      if (!current() || c.signal.aborted)
        throw Error("Context changed; review discarded.");
    };
    let timer: ReturnType<typeof setTimeout>;
    try {
      const abort = new Promise<never>((_, reject) => {
        c.signal.addEventListener(
          "abort",
          () =>
            reject(
              Error(
                "Read interrupted or timed out. Reconcile an existing attempt before another preparation.",
              ),
            ),
          { once: true },
        );
        timer = setTimeout(() => c.abort(), this.timeoutMs);
      });
      const result = await Promise.race([work(scope, c.signal, guard), abort]);
      guard();
      apply(result);
    } catch (e) {
      if (current())
        this.emit({
          error: e instanceof Error ? e.message : "Purchase read unavailable.",
        });
    } finally {
      clearTimeout(timer!);
      if (this.requests.get(channel) === c) {
        this.requests.delete(channel);
        this.emit({});
      }
      done();
    }
  }
  private remember(rows: readonly D.PurchaseStatus[]) {
    // Validate the full set before learning any new canonical identity.
    for (const row of rows) {
      const old =
        this.knownAttempts.get(row.purchase_id) ??
        [...this.knownAttempts.values()].find(
          (r) => r.request_id === row.request_id,
        );
      if (old) sameAttempt(row, old);
      const pending = this.value.pendingAttempt;
      if (
        pending &&
        (row.request_id === pending.request_id ||
          old?.request_id === pending.request_id)
      )
        sameAttempt(row, pending);
    }
    if (
      new Set([...this.knownAttempts.keys(), ...rows.map((r) => r.purchase_id)])
        .size > 1000
    )
      throw Error(
        "Purchase history is too large for this preview. No new attempt is enabled.",
      );
    for (const row of rows) this.knownAttempts.set(row.purchase_id, row);
  }
  initialize = () =>
    this.run(
      "catalog",
      async (s, signal) => {
        const [a, b] = await Promise.all([
          this.transport.catalog(s, signal),
          this.transport.purchases(s, null, signal),
        ]);
        return {
          catalog: parsePurchase("catalog", a, s),
          history: parsePurchase("purchases", b, s),
        };
      },
      ({ catalog, history }) => {
        this.remember(history.rows);
        const unresolved = history.rows.find((p) => p.chain.state !== "failed");
        this.emit({
          catalog,
          history,
          historyIncomplete:
            history.has_more ||
            history.coverage.discovery !== "complete_through_checkpoint" ||
            history.coverage.missing_history,
          reconcileRequired: this.value.reconcileRequired || !!unresolved,
          status: this.value.status ?? unresolved ?? null,
        });
      },
    );
  requestQuote = (tier: string, mint: string, requestId: string) => {
    if (
      !this.value.catalog?.offers.some(
        (o) => o.tier_index === tier && o.charge.mint.address === mint,
      ) ||
      !/^[a-f0-9]{64}$/.test(requestId)
    ) {
      this.emit({ error: "An explicit request identity is required." });
      return Promise.resolve();
    }
    if (this.value.reconcileRequired) {
      this.emit({
        error: "Reconcile the existing attempt before another preparation.",
      });
      return Promise.resolve();
    }
    this.requests.get("prepare")?.abort();
    this.emit({ quote: null, prepared: null });
    return this.run(
      "quote",
      async (s, signal) => {
        const q = parsePurchase(
          "quote",
          await this.transport.quote(
            s,
            {
              deployment_id: s.deploymentId,
              request_id: requestId,
              tier_index: tier,
              mint,
            },
            signal,
          ),
          s,
        );
        if (
          q.request_id !== requestId ||
          q.offer.tier_index !== tier ||
          q.offer.charge.mint.address !== mint
        )
          throw Error("Quote does not match the selected context.");
        return q;
      },
      (quote) => this.emit({ quote }),
    );
  };
  quoteCurrent = (quote = this.value.quote) =>
    !!quote && BigInt(quote.refresh_required_at_unix_ns) > this.now();
  recordAttempt = (
    requestId: string,
    blockInput: {
      recentBlockhash: string;
      lastValidBlockHeight: string | null;
    },
    priorityInput:
      { kind: "omitted" } | { kind: "micro_lamports_per_cu"; value: string },
  ) => {
    const block = Object.freeze({ ...blockInput });
    const priorityFee = Object.freeze({ ...priorityInput });
    const quote = this.value.quote;
    if (
      (block.lastValidBlockHeight !== null &&
        (!/^(0|[1-9][0-9]*)$/.test(block.lastValidBlockHeight) ||
          block.lastValidBlockHeight.length > 20 ||
          BigInt(block.lastValidBlockHeight) > 18446744073709551615n)) ||
      !quote ||
      !this.quoteCurrent(quote) ||
      this.value.historyIncomplete ||
      this.value.reconcileRequired ||
      !/^[a-f0-9]{64}$/.test(requestId)
    ) {
      this.emit({
        error:
          "Refresh the quote and complete recovery before preparing an attempt.",
      });
      return Promise.resolve();
    }
    return this.run(
      "prepare",
      async (s, signal, guard) => {
        const history = parsePurchase(
          "purchases",
          await this.transport.purchases(s, null, signal),
          s,
        );
        guard();
        const unresolved = history.rows.find((p) => p.chain.state !== "failed");
        if (
          history.has_more ||
          history.coverage.discovery !== "complete_through_checkpoint" ||
          history.coverage.missing_history ||
          unresolved
        ) {
          this.emit({
            historyIncomplete:
              history.has_more ||
              history.coverage.discovery !== "complete_through_checkpoint" ||
              history.coverage.missing_history,
            reconcileRequired: !!unresolved,
            status: unresolved ?? this.value.status,
          });
          throw Error("Recovery must complete before a new attempt.");
        }
        if (this.value.quote !== quote || !this.quoteCurrent(quote))
          throw Error("Quote expired during recovery. Request a fresh review.");
        if (
          quote.deployment.sdk_profile !== "p30-devnet-2026-10-31-v1" ||
          quote.deployment.sdk_release !== "0.1.0-dev.5" ||
          quote.deployment.sdk_artifact_sha256 !==
            "3e33090cf9193fd909f57ed75e10f9e59b9409e3c8a8f6c186272d8ee185f86d" ||
          quote.deployment.compatibility !== "approved_for_purchase_reads"
        )
          throw Error("SDK identity needs review.");
        const prepared = await this.prepare({
          inputKind: "p30-public-unsigned-input-v1",
          sdkProfile: quote.deployment.sdk_profile,
          descriptor,
          connectedWallet: s.wallet,
          trader: quote.wallet,
          sessionEpoch: s.sessionEpoch,
          expectedAccount: quote.expected_account_address,
          nextChallengeId: quote.next_challenge_id,
          tierIndex: quote.offer.tier_index,
          mint:
            quote.offer.charge.mint.address === descriptor.usdcMint
              ? "usdc"
              : "usdt",
          recentBlockhash: block.recentBlockhash,
          priorityFee,
        });
        guard();
        if (this.value.quote !== quote || !this.quoteCurrent(quote))
          throw Error(
            "Quote changed or expired during preparation. Refresh and review again.",
          );
        if (
          prepared.context.connectedWallet !== s.wallet ||
          prepared.context.sessionEpoch !== s.sessionEpoch ||
          prepared.context.expectedAccount !== quote.expected_account_address ||
          prepared.context.nextChallengeId !== quote.next_challenge_id ||
          prepared.sdk.profile !== quote.deployment.sdk_profile
        )
          throw Error(
            "Prepared context no longer matches the captured quote/session.",
          );
        const request: D.PurchaseAttemptRequest = Object.freeze({
          deployment_id: s.deploymentId,
          request_id: requestId,
          quote_id: quote.quote_id,
          message_sha256: prepared.messageSha256,
          expected_account: quote.expected_account,
          recent_blockhash: block.recentBlockhash,
          last_valid_block_height: block.lastValidBlockHeight,
        });
        this.emit({
          prepared,
          pendingAttempt: request,
          reconcileRequired: true,
        });
        const ack = parsePurchase(
          "ack",
          await this.transport.prepareAttempt(s, request, signal),
          s,
        );
        sameAttempt(ack.purchase, request);
        return ack;
      },
      (attempt) => {
        this.remember([attempt.purchase]);
        this.emit({ attempt, status: attempt.purchase });
      },
    );
  };
  refreshStatus = () => {
    const old = this.value.status;
    const id = old?.purchase_id;
    if (!id) return this.reconcile();
    return this.run(
      "status",
      async (s, signal) => {
        const v = parsePurchase(
          "status",
          await this.transport.status(s, id, signal),
          s,
        );
        sameAttempt(v, old!);
        return v;
      },
      (status) => {
        this.remember([status]);
        this.emit({ status, reconcileRequired: true });
      },
    );
  };
  reconcile = (more = false) =>
    this.run(
      "recovery",
      async (s, signal) => {
        const old = more ? this.value.history : null;
        if (more && (!old?.next_cursor || old.rows.length >= 1000))
          throw Error("Start a fresh recovery read; page bound reached.");
        const page = parsePurchase(
          "purchases",
          await this.transport.purchases(s, old?.next_cursor ?? null, signal),
          s,
        );
        if (old) {
          if (
            JSON.stringify(old.read_cutoff) !== JSON.stringify(page.read_cutoff)
          )
            throw Error("Recovery cutoff changed. Start a fresh read.");
          const ids = new Set(old.rows.map((r) => r.purchase_id));
          if (
            page.rows.some((r) => ids.has(r.purchase_id)) ||
            page.next_cursor === old.next_cursor
          )
            throw Error("Recovery page did not advance.");
          if (old.rows.length + page.rows.length > 1000)
            throw Error("Recovery page bound reached. Start a fresh read.");
          return { ...page, rows: [...old.rows, ...page.rows] };
        }
        return page;
      },
      (page) => {
        const request = this.value.pendingAttempt?.request_id;
        const status = page.rows.find(
          (p) => !request || p.request_id === request,
        );
        this.remember(page.rows);
        this.emit({
          history: page,
          status: status ?? this.value.status,
          historyIncomplete:
            page.has_more ||
            page.coverage.discovery !== "complete_through_checkpoint" ||
            page.coverage.missing_history,
          reconcileRequired: this.value.reconcileRequired || !!status,
          error:
            !status && this.value.pendingAttempt
              ? "The attempt is not visible in this read. Its outcome is still unknown; no new payment is enabled."
              : null,
        });
      },
    );
  invalidateQuote() {
    this.requests.get("quote")?.abort();
    this.requests.get("prepare")?.abort();
    this.emit({
      quote: null,
      prepared: null,
      reconcileRequired:
        this.value.reconcileRequired || !!this.value.pendingAttempt,
    });
  }
  loadOwned = (more = false) =>
    this.run(
      "owned",
      async (s, signal) => {
        if (more && (!this.value.owned?.next_cursor || this.ownedPages >= 10))
          throw Error("Start a fresh account read; page bound reached.");
        const old = more ? this.value.owned : null;
        const page = parsePurchase(
          "owned",
          await this.transport.owned(s, old?.next_cursor ?? null, signal),
          s,
        );
        if (old) {
          if (
            JSON.stringify(old.read_cutoff) !== JSON.stringify(page.read_cutoff)
          )
            throw Error("Account cutoff changed. Start a fresh read.");
          if (page.next_cursor && page.next_cursor === old.next_cursor)
            throw Error("Account cursor did not advance.");
          const ids = new Set(old.rows.map((r) => r.account));
          if (page.rows.some((r) => ids.has(r.account)))
            throw Error("Account page repeated a row.");
          return { ...page, rows: [...old.rows, ...page.rows] };
        }
        return page;
      },
      (owned) => {
        this.ownedPages = more ? this.ownedPages + 1 : 1;
        this.emit({ owned });
      },
    );
  openAccount = (id: string) =>
    this.run(
      "account",
      async (s, signal) => {
        const a = parsePurchase(
          "account",
          await this.transport.account(s, id, signal),
          s,
        );
        if (a.row.account !== id) throw Error("Account identity mismatch.");
        return a;
      },
      (account) => this.emit({ account }),
    );
}
