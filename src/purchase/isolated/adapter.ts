import type { Session } from "../../api/frontend-v1";
import type * as D from "../../api/purchase-foundation-v1";
import type { PurchaseTransport } from "../consumer/client";
import {
  assertPurchaseScope,
  keyHex,
  parsePurchase,
  PurchaseDataError,
  type Payloads,
  type PurchaseScope,
} from "../consumer/runtime";
import descriptor from "../../../dependencies/p30/3e33090cf9193fd909f57ed75e10f9e59b9409e3c8a8f6c186272d8ee185f86d/p30-descriptor.json";
import { assertReleaseMapping, verifyDescriptorBytes } from "./identity";
import { P30_PROFILE, P30_SOURCE_ROUTES as routes } from "./profile";
export class IsolatedHttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
  ) {
    super(
      code === "service_prerequisite"
        ? "The isolated service contract is not available."
        : code === "resync"
          ? "Start a fresh account read."
          : code === "disabled"
            ? "The isolated connection is not enabled."
            : "The isolated account request could not be completed.",
    );
  }
}
type Phase =
  | "disabled"
  | "guest"
  | "restoring"
  | "authenticated"
  | "expired"
  | "unavailable"
  | "revocation_pending";
type ReadData = {
  catalog: D.PurchaseCatalog | null;
  purchases: D.FixedPage<D.PurchaseStatus> | null;
  owned: D.FixedPage<D.OwnedAccount> | null;
  status: D.PurchaseStatus | null;
  account: D.OwnedAccountRead | null;
};
const empty = (): ReadData => ({
  catalog: null,
  purchases: null,
  owned: null,
  status: null,
  account: null,
});
export interface IsolatedSnapshot {
  phase: Phase;
  epoch: number;
  scope: PurchaseScope | null;
  error: string | null;
  data: Readonly<ReadData>;
}
/** Default stays disabled. Mock injection and the explicit read-only live authority are separate. */
export interface MockHttpContract {
  kind: "explicit_mock_http_contract";
  fetch: typeof fetch;
  browserOrigin: () => string;
  now?: () => number;
  timeoutMs?: number;
}
const LIVE_READ_ONLY = Symbol("explicit-5174-read-only-factory");
interface LiveReadConnection {
  kind: "live_read_only";
  fetch: typeof fetch;
  browserOrigin: () => string;
  now?: never;
  timeoutMs?: never;
}
function session(raw: unknown, now: number): Session {
  const v = raw as Session;
  if (
    !v ||
    typeof v !== "object" ||
    Array.isArray(v) ||
    Object.keys(v).sort().join(",") !==
      "admin_read,api_version,csrf_token,expires_unix_s,lifecycle_application,trading_authority,wallet,wallet_hex" ||
    v.api_version !== "1" ||
    v.admin_read !== false ||
    v.trading_authority !== "actual_trader_signature_per_intent" ||
    v.lifecycle_application !== "operator_only" ||
    typeof v.expires_unix_s !== "string" ||
    !/^(0|[1-9][0-9]*)$/.test(v.expires_unix_s) ||
    v.expires_unix_s.length > 20 ||
    BigInt(v.expires_unix_s) > 18446744073709551615n ||
    BigInt(v.expires_unix_s) * 1000n <= BigInt(now) ||
    typeof v.csrf_token !== "string" ||
    !/^[a-f0-9]{64}$/.test(v.csrf_token)
  )
    throw new IsolatedHttpError(502, "session_shape");
  assertPurchaseScope({
    wallet: v.wallet,
    deploymentId: P30_PROFILE.deployment,
    sessionEpoch: 0,
    evidencePurpose: "chain_observation",
  });
  if (v.wallet_hex !== keyHex(v.wallet))
    throw new IsolatedHttpError(502, "session_wallet");
  return Object.freeze({ ...v });
}
export class IsolatedPurchaseAdapter {
  private state: IsolatedSnapshot;
  private listeners = new Set<() => void>();
  private active = new Map<string, AbortController>();
  private readVersions = new Map<string, number>();
  private authenticated: Session | null = null;
  private revokeCsrf: string | null = null;
  private selectedWallet: string | null | undefined;
  private network: string | null = descriptor.genesisHash;
  private expiry?: ReturnType<typeof setTimeout>;
  private pageCounts = { owned: 0, purchases: 0 };
  private seenRows = { owned: new Set<string>(), purchases: new Set<string>() };
  private seenCursors = {
    owned: new Set<string>(),
    purchases: new Set<string>(),
  };
  private cursors = {
    owned: new Map<string, string>(),
    purchases: new Map<string, string>(),
  };
  readonly transport: PurchaseTransport;
  constructor(
    private readonly mock?: MockHttpContract | LiveReadConnection,
    authority?: symbol,
  ) {
    if (
      mock &&
      ((mock.kind !== "explicit_mock_http_contract" &&
        !(mock.kind === "live_read_only" && authority === LIVE_READ_ONLY)) ||
        typeof mock.fetch !== "function" ||
        typeof mock.browserOrigin !== "function" ||
        (mock.timeoutMs !== undefined &&
          (!Number.isInteger(mock.timeoutMs) ||
            mock.timeoutMs < 1 ||
            mock.timeoutMs > 5000)))
    )
      throw new IsolatedHttpError(0, "disabled");
    this.state = Object.freeze({
      phase: mock ? "guest" : "disabled",
      epoch: 0,
      scope: null,
      error: null,
      data: Object.freeze(empty()),
    });
    this.transport = Object.freeze({
      catalog: (s: PurchaseScope, signal: AbortSignal) =>
        this.read(
          "catalog",
          routes.catalog + "?deployment_id=" + P30_PROFILE.deployment,
          s,
          signal,
        ),
      purchases: (
        s: PurchaseScope,
        cursor: string | null,
        signal: AbortSignal,
      ) => this.page("purchases", s, cursor, signal),
      owned: (s: PurchaseScope, cursor: string | null, signal: AbortSignal) =>
        this.page("owned", s, cursor, signal),
      status: (s: PurchaseScope, id: string, signal: AbortSignal) => {
        this.hex(id);
        return this.read("status", routes.purchases + "/" + id, s, signal);
      },
      account: (s: PurchaseScope, id: string, signal: AbortSignal) => {
        this.hex(id);
        return this.read(
          "account",
          routes.owned + "/" + id + "?deployment_id=" + P30_PROFILE.deployment,
          s,
          signal,
          id,
        );
      },
      quote: async () => {
        throw new IsolatedHttpError(0, "action_gate_disabled");
      },
      prepareAttempt: async () => {
        throw new IsolatedHttpError(0, "action_gate_disabled");
      },
    });
  }
  static readOnlyLive() {
    if (
      typeof window === "undefined" ||
      window.location.origin !== P30_PROFILE.browserOrigin ||
      !["/p30-live.html", "/p30-app.html"].includes(window.location.pathname)
    )
      throw new IsolatedHttpError(0, "live_profile_origin");
    return new IsolatedPurchaseAdapter(
      {
        kind: "live_read_only",
        fetch: window.fetch.bind(window),
        browserOrigin: () => window.location.origin,
      },
      LIVE_READ_ONLY,
    );
  }
  subscribe = (f: () => void) => {
    this.listeners.add(f);
    return () => {
      this.listeners.delete(f);
    };
  };
  getSnapshot = () => this.state;
  private update(p: Partial<IsolatedSnapshot>) {
    this.state = Object.freeze({ ...this.state, ...p });
    for (const f of this.listeners) f();
  }
  private clear(phase: Phase, error: string | null = null) {
    for (const c of this.active.values()) c.abort();
    this.active.clear();
    clearTimeout(this.expiry);
    this.authenticated = null;
    this.cursors.owned.clear();
    this.cursors.purchases.clear();
    this.pageCounts = { owned: 0, purchases: 0 };
    this.seenCursors.owned.clear();
    this.seenCursors.purchases.clear();
    this.seenRows.owned.clear();
    this.seenRows.purchases.clear();
    this.update({
      phase,
      epoch: this.state.epoch + 1,
      scope: null,
      error,
      data: Object.freeze(empty()),
    });
  }
  private retire() {
    this.revokeCsrf ??= this.authenticated?.csrf_token ?? null;
    this.clear(
      this.revokeCsrf ? "revocation_pending" : "unavailable",
      "Account context changed.",
    );
  }
  private now() {
    return this.mock?.now?.() ?? Date.now();
  }
  private hex(id: string) {
    if (!/^[a-f0-9]{64}$/.test(id))
      throw new IsolatedHttpError(400, "invalid_identity");
  }
  private available() {
    if (!this.mock) throw new IsolatedHttpError(0, "disabled");
    if (this.mock.browserOrigin() !== P30_PROFILE.browserOrigin) {
      this.retire();
      throw new IsolatedHttpError(0, "origin_changed");
    }
  }
  private scope(s: PurchaseScope) {
    this.available();
    assertPurchaseScope(s);
    if (
      this.authenticated &&
      BigInt(this.authenticated.expires_unix_s) * 1000n <= BigInt(this.now())
    )
      this.clear("expired");
    const current = this.state.scope;
    if (
      !current ||
      this.state.phase !== "authenticated" ||
      this.network !== descriptor.genesisHash ||
      s.wallet !== current.wallet ||
      s.sessionEpoch !== current.sessionEpoch ||
      s.deploymentId !== current.deploymentId ||
      s.evidencePurpose !== "chain_observation"
    )
      throw new IsolatedHttpError(401, "session_context");
  }
  async restore() {
    this.available();
    if (this.revokeCsrf) throw new IsolatedHttpError(0, "revocation_pending");
    if (this.network !== descriptor.genesisHash)
      throw new IsolatedHttpError(0, "network_changed");
    this.clear("restoring");
    const epoch = this.state.epoch;
    try {
      const raw = await this.request("session", routes.session),
        value = session(raw, this.now());
      if (epoch !== this.state.epoch)
        throw new IsolatedHttpError(0, "cancelled");
      if (
        this.selectedWallet !== undefined &&
        value.wallet !== this.selectedWallet
      )
        throw new IsolatedHttpError(401, "selected_wallet");
      this.authenticated = value;
      const scope = Object.freeze({
        wallet: value.wallet,
        deploymentId: P30_PROFILE.deployment,
        sessionEpoch: epoch,
        evidencePurpose: "chain_observation" as const,
      });
      this.update({ phase: "authenticated", scope, error: null });
      const remaining =
        BigInt(value.expires_unix_s) * 1000n - BigInt(this.now());
      this.expiry = setTimeout(
        () => this.clear("expired"),
        Number(remaining > 3600000n ? 3600000n : remaining),
      );
      return scope;
    } catch (e) {
      if (epoch === this.state.epoch)
        this.clear(
          e instanceof IsolatedHttpError && e.status === 401
            ? "guest"
            : "unavailable",
          "Session read unavailable.",
        );
      throw e;
    }
  }
  async logout() {
    this.available();
    this.revokeCsrf ??= this.authenticated?.csrf_token ?? null;
    this.clear(this.revokeCsrf ? "revocation_pending" : "guest");
    if (!this.revokeCsrf) return;
    const token = this.revokeCsrf,
      epoch = this.state.epoch;
    try {
      const acknowledgment = (await this.request(
        "logout",
        routes.logout,
        undefined,
        { csrf: token, body: {} },
      )) as { api_version?: unknown; logged_out?: unknown };
      if (
        Object.keys(acknowledgment).sort().join(",") !==
          "api_version,logged_out" ||
        acknowledgment.logged_out !== true
      )
        throw new IsolatedHttpError(502, "logout_acknowledgment");
      if (epoch !== this.state.epoch)
        throw new IsolatedHttpError(0, "cancelled");
      this.revokeCsrf = null;
      this.update({ phase: "guest", error: null });
    } catch (e) {
      if (e instanceof IsolatedHttpError && e.status === 401) {
        this.revokeCsrf = null;
        this.clear("guest");
        return;
      }
      if (epoch === this.state.epoch)
        this.update({
          phase: "revocation_pending",
          error:
            "Sign-out could not be confirmed. Retry before restoring a session.",
        });
      throw e;
    }
  }
  walletChanged(wallet: string | null) {
    if (wallet !== null)
      assertPurchaseScope({
        wallet,
        deploymentId: P30_PROFILE.deployment,
        sessionEpoch: 0,
        evidencePurpose: "chain_observation",
      });
    this.selectedWallet = wallet;
    this.retire();
  }
  networkChanged(genesis: string | null) {
    if (genesis !== this.network) {
      this.network = genesis;
      this.retire();
    }
  }
  dispose() {
    this.clear(this.mock ? "guest" : "disabled");
    this.listeners.clear();
    this.revokeCsrf = null;
  }
  private async request(
    channel: string,
    path: string,
    outer?: AbortSignal,
    post?: { csrf: string; body: unknown },
  ) {
    this.available();
    const url = P30_PROFILE.api + path;
    if (
      !path.startsWith("/v1/") ||
      new URL(url).origin !== P30_PROFILE.api ||
      /[\r\n#]/.test(path)
    )
      throw new IsolatedHttpError(400, "request_shape");
    this.active.get(channel)?.abort();
    const c = new AbortController(),
      epoch = this.state.epoch;
    this.active.set(channel, c);
    const cancel = () => c.abort();
    outer?.addEventListener("abort", cancel, { once: true });
    if (outer?.aborted) c.abort();
    const guard = () => {
      if (
        c.signal.aborted ||
        this.active.get(channel) !== c ||
        epoch !== this.state.epoch
      )
        throw new IsolatedHttpError(0, "cancelled");
    };
    let abortListener: () => void = () => {};
    let timedOut = false;
    const aborted = new Promise<never>((_, reject) => {
      abortListener = () =>
        reject(new IsolatedHttpError(0, timedOut ? "timeout" : "cancelled"));
      c.signal.addEventListener("abort", abortListener, { once: true });
      if (c.signal.aborted) abortListener();
    });
    const timer = setTimeout(() => {
      timedOut = true;
      c.abort();
    }, this.mock?.timeoutMs ?? 5000);
    try {
      const work = (async () => {
        guard();
        const response = await this.mock!.fetch(url, {
          method: post ? "POST" : "GET",
          credentials: "include",
          mode: "cors",
          redirect: "error",
          cache: "no-store",
          signal: c.signal,
          headers: {
            Accept: "application/json",
            ...(post
              ? {
                  "Content-Type": "application/json",
                  "X-Setl8-Csrf": post.csrf,
                }
              : {}),
          },
          ...(post ? { body: JSON.stringify(post.body) } : {}),
        });
        guard();
        if (response.redirected || (response.url && response.url !== url))
          throw new IsolatedHttpError(502, "redirect_refused");
        if (response.status === 401)
          throw new IsolatedHttpError(401, "session_expired");
        if (response.status === 404)
          throw new IsolatedHttpError(
            404,
            channel === "account" || channel === "status"
              ? "record_unavailable"
              : "service_prerequisite",
          );
        if (response.status === 409 || response.status === 410)
          throw new IsolatedHttpError(response.status, "resync");
        const max = response.ok ? 262144 : 16384;
        const length = response.headers.get("content-length");
        if (
          length &&
          (length.length > 20 ||
            !/^[0-9]+$/.test(length) ||
            BigInt(length) > BigInt(max))
        )
          throw new IsolatedHttpError(502, "response_limit");
        if (
          !response.headers
            .get("content-type")
            ?.toLowerCase()
            .startsWith("application/json")
        )
          throw new IsolatedHttpError(502, "content_type");
        const reader = response.body?.getReader();
        if (!reader) throw new IsolatedHttpError(502, "response_unavailable");
        const stop = () => {
          void reader.cancel().catch(() => {});
        };
        c.signal.addEventListener("abort", stop, { once: true });
        let size = 0,
          text = "";
        const decoder = new TextDecoder("utf-8", { fatal: true });
        try {
          while (true) {
            const chunk = await reader.read();
            guard();
            if (chunk.done) break;
            size += chunk.value.byteLength;
            if (size > max) {
              await reader.cancel();
              throw new IsolatedHttpError(502, "response_limit");
            }
            text += decoder.decode(chunk.value, { stream: true });
          }
          text += decoder.decode();
        } finally {
          c.signal.removeEventListener("abort", stop);
          reader.releaseLock();
        }
        guard();
        const value = JSON.parse(text);
        if (!response.ok)
          throw new IsolatedHttpError(response.status, "service_unavailable");
        if (value?.api_version !== "1")
          throw new IsolatedHttpError(502, "api_version");
        return value as unknown;
      })();
      const result = await Promise.race([work, aborted]);
      guard();
      return result;
    } catch (e) {
      if (epoch === this.state.epoch && this.active.get(channel) === c) {
        if (
          e instanceof IsolatedHttpError &&
          e.status === 401 &&
          channel !== "logout"
        )
          this.clear("expired", "Session expired.");
        else
          this.update({
            error:
              e instanceof IsolatedHttpError ? e.code : "service_unavailable",
          });
      }
      throw e instanceof IsolatedHttpError
        ? e
        : new IsolatedHttpError(502, "service_unavailable");
    } finally {
      clearTimeout(timer);
      outer?.removeEventListener("abort", cancel);
      c.signal.removeEventListener("abort", abortListener);
      if (this.active.get(channel) === c) this.active.delete(channel);
      c.abort();
    }
  }
  private readFailure(
    e: unknown,
    epoch: number,
    kind: string,
    version: number,
  ) {
    if (epoch !== this.state.epoch || this.readVersions.get(kind) !== version)
      return;
    if (
      e instanceof PurchaseDataError &&
      (e.message.includes("wallet scope") || e.message.includes("owner scope"))
    )
      this.retire();
    else
      this.update({
        error: e instanceof IsolatedHttpError ? e.code : "response_invalid",
      });
  }
  private async read<K extends "catalog" | "status" | "account">(
    kind: K,
    path: string,
    s: PurchaseScope,
    signal: AbortSignal,
    account?: string,
  ): Promise<Payloads[K]> {
    this.scope(s);
    const epoch = this.state.epoch;
    const version = (this.readVersions.get(kind) ?? 0) + 1;
    this.readVersions.set(kind, version);
    try {
      const parsed = parsePurchase(
        kind,
        await this.request(kind, path, signal),
        s,
      );
      assertReleaseMapping(parsed.deployment);
      await verifyDescriptorBytes();
      this.scope(s);
      if (
        signal.aborted ||
        epoch !== this.state.epoch ||
        this.readVersions.get(kind) !== version
      )
        throw new IsolatedHttpError(0, "cancelled");
      if (
        kind === "account" &&
        (parsed as D.OwnedAccountRead).row.account !== account
      )
        throw new IsolatedHttpError(502, "account_identity");
      if (
        kind === "status" &&
        path !==
          routes.purchases + "/" + (parsed as D.PurchaseStatus).purchase_id
      )
        throw new IsolatedHttpError(502, "purchase_identity");
      this.update({
        data: Object.freeze({ ...this.state.data, [kind]: parsed }),
        error: null,
      });
      return parsed;
    } catch (e) {
      this.readFailure(e, epoch, kind, version);
      throw e;
    }
  }
  private async page<K extends "owned" | "purchases">(
    kind: K,
    s: PurchaseScope,
    cursor: string | null,
    signal: AbortSignal,
  ): Promise<Payloads[K]> {
    this.scope(s);
    const epoch = this.state.epoch,
      known = cursor === null ? undefined : this.cursors[kind].get(cursor);
    const version = (this.readVersions.get(kind) ?? 0) + 1;
    this.readVersions.set(kind, version);
    if (cursor !== null && this.pageCounts[kind] >= 10)
      throw new IsolatedHttpError(400, "page_bound");
    if (cursor !== null && (!known || cursor.length > 4096))
      throw new IsolatedHttpError(400, "cursor_context");
    const query = new URLSearchParams({
      deployment_id: P30_PROFILE.deployment,
      limit: "25",
    });
    if (cursor !== null) query.set("cursor", cursor);
    try {
      const parsed = parsePurchase(
        kind,
        await this.request(kind, routes[kind] + "?" + query.toString(), signal),
        s,
      );
      assertReleaseMapping(parsed.deployment);
      if (kind === "purchases")
        for (const row of (parsed as D.FixedPage<D.PurchaseStatus>).rows)
          assertReleaseMapping(row.deployment);
      if (parsed.rows.length > 25)
        throw new IsolatedHttpError(502, "row_bound");
      await verifyDescriptorBytes();
      this.scope(s);
      if (
        signal.aborted ||
        epoch !== this.state.epoch ||
        this.readVersions.get(kind) !== version
      )
        throw new IsolatedHttpError(0, "cancelled");
      const cutoff = JSON.stringify(parsed.read_cutoff);
      if (known !== undefined && known !== cutoff)
        throw new IsolatedHttpError(410, "resync");
      if (parsed.next_cursor === cursor && cursor !== null)
        throw new IsolatedHttpError(502, "cursor_no_progress");
      if (
        cursor !== null &&
        parsed.next_cursor &&
        this.seenCursors[kind].has(parsed.next_cursor)
      )
        throw new IsolatedHttpError(502, "cursor_no_progress");
      const rowIds = parsed.rows.map((r) =>
        "account" in r ? r.account : r.purchase_id,
      );
      if (cursor !== null && rowIds.some((id) => this.seenRows[kind].has(id)))
        throw new IsolatedHttpError(502, "page_repeated_row");
      if (cursor === null) {
        this.cursors[kind].clear();
        this.seenRows[kind].clear();
        this.seenCursors[kind].clear();
      } else this.cursors[kind].delete(cursor);
      for (const id of rowIds) this.seenRows[kind].add(id);
      this.pageCounts[kind] = cursor === null ? 1 : this.pageCounts[kind] + 1;
      if (parsed.next_cursor) {
        this.cursors[kind].set(parsed.next_cursor, cutoff);
        this.seenCursors[kind].add(parsed.next_cursor);
      }
      this.update({
        data: Object.freeze({ ...this.state.data, [kind]: parsed }),
        error: null,
      });
      return parsed;
    } catch (e) {
      this.readFailure(e, epoch, kind, version);
      if (
        epoch === this.state.epoch &&
        this.readVersions.get(kind) === version &&
        e instanceof IsolatedHttpError &&
        e.code === "resync"
      ) {
        this.cursors[kind].clear();
        this.seenCursors[kind].clear();
        this.seenRows[kind].clear();
        this.pageCounts[kind] = 0;
        this.update({
          data: Object.freeze({ ...this.state.data, [kind]: null }),
          error: "resync",
        });
      }
      throw e;
    }
  }
}

/** Pure session validation shared by the customer LOGIN-only transport. */
export { session as parseP30Session };
