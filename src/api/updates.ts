import { ApiClient, ApiError } from "./client";
import type { AccountOverview } from "./frontend-v1";
export type StreamStatus =
  "connecting" | "connected" | "reconnecting" | "paused" | "closed";
export interface EventSourceLike {
  close(): void;
  addEventListener(type: string, listener: (event: MessageEvent) => void): void;
  onerror: ((e: Event) => void) | null;
}
interface Options {
  client: ApiClient;
  account: string;
  /** Null means the read was discarded, so it must not acknowledge a cursor. */
  refresh: (signal: AbortSignal) => Promise<string | null>;
  /** True means core state was installed and independent evidence invalidated. */
  snapshot: (value: AccountOverview) => boolean;
  expired: () => void;
  status: (status: StreamStatus) => void;
  source?: (url: string) => EventSourceLike;
  random?: () => number;
}
/** Cursor covers applied core state + evidence invalidation, not an atomic set of HTTP pages. */
export class AccountUpdates {
  private source?: EventSourceLike;
  private abort = new AbortController();
  private timer?: ReturnType<typeof setTimeout>;
  private stopped = false;
  private cursor: string | null = null;
  private failures = 0;
  private refreshing = false;
  private dirty = false;
  private recoveryAfterRefresh: { resync: boolean } | null = null;
  private snapshotGeneration = 0;
  constructor(private options: Options) {}
  start() {
    this.connect();
  }
  stop() {
    this.stopped = true;
    this.source?.close();
    this.abort.abort();
    clearTimeout(this.timer);
    this.options.status("closed");
  }
  private connect() {
    if (this.stopped) return;
    this.options.status(this.failures ? "reconnecting" : "connecting");
    const url =
      this.options.client.base +
      `/v1/accounts/${encodeURIComponent(this.options.account)}/updates` +
      (this.cursor ? "?cursor=" + encodeURIComponent(this.cursor) : "");
    const source = (
      this.options.source ??
      ((url) => new EventSource(url, { withCredentials: true }))
    )(url);
    this.source = source;
    const active = () => !this.stopped && source === this.source;
    source.addEventListener("snapshot", (e) => {
      if (!active()) return;
      try {
        const value = JSON.parse(e.data) as AccountOverview;
        if (value.account !== this.options.account)
          throw new Error("Account mismatch");
        if (!this.options.snapshot(value)) return;
        this.snapshotGeneration++;
        this.dirty = false;
        this.cursor = e.lastEventId || value.update_cursor;
        this.failures = 0;
        this.options.status("connected");
      } catch {
        void this.recover(true);
      }
    });
    source.addEventListener("connected", () => {
      if (active()) {
        this.failures = 0;
        this.options.status("connected");
      }
    });
    source.addEventListener("invalidate", () => {
      if (active()) {
        this.dirty = true;
        void this.refetch();
      }
    });
    source.addEventListener("session_closed", () => {
      if (active()) {
        this.stop();
        this.options.expired();
      }
    });
    source.addEventListener("resync_required", () => {
      if (active()) void this.recover(true);
    });
    source.addEventListener("reconnect", () => {
      if (active()) void this.recover(false);
    });
    source.onerror = () => {
      if (active()) void this.recover(true);
    };
  }
  private async refetch() {
    if (this.refreshing || this.stopped) return;
    this.refreshing = true;
    try {
      do {
        this.dirty = false;
        const generation = this.snapshotGeneration;
        const cursor = await this.options.refresh(this.abort.signal);
        if (this.stopped) return;
        // A newer streamed snapshot wins even if an HTTP callback resolved just
        // before it and its awaiting continuation only runs afterwards.
        if (cursor !== null && generation === this.snapshotGeneration) {
          this.cursor = cursor;
          this.failures = 0;
        }
      } while (this.dirty && !this.stopped);
    } catch (e) {
      if (!this.stopped) {
        if (e instanceof ApiError && e.status === 401) {
          this.stop();
          this.options.expired();
        } else void this.recover(true);
      }
    } finally {
      this.refreshing = false;
      if (this.recoveryAfterRefresh && !this.stopped) {
        const { resync } = this.recoveryAfterRefresh;
        this.recoveryAfterRefresh = null;
        void this.recover(resync);
      }
    }
  }
  private async recover(resync: boolean) {
    if (this.stopped) return;
    this.source?.close();
    this.source = undefined;
    clearTimeout(this.timer);
    if (this.refreshing) {
      this.recoveryAfterRefresh = {
        resync: resync || !!this.recoveryAfterRefresh?.resync,
      };
      return;
    }
    this.failures++;
    this.options.status(this.failures > 6 ? "paused" : "reconnecting");
    if (this.failures > 6) return;
    // Every failed/rotated stream checks the cookie session; no cached-auth fallback.
    const attempt = this.failures;
    this.timer = setTimeout(
      async () => {
        if (this.stopped) return;
        try {
          await this.options.client.request("/v1/auth/session", {
            signal: this.abort.signal,
            authFailure: false,
          });
          if (resync) {
            const generation = this.snapshotGeneration;
            const cursor = await this.options.refresh(this.abort.signal);
            if (this.stopped) return;
            if (cursor !== null && generation === this.snapshotGeneration)
              this.cursor = cursor;
          }
          if (!this.stopped) this.connect();
        } catch (e) {
          if (this.stopped) return;
          if (e instanceof ApiError && e.status === 401) {
            this.stop();
            this.options.expired();
          } else void this.recover(true);
        }
      },
      Math.min(30000, 1000 * 2 ** (attempt - 1)) +
        (this.options.random ?? Math.random)() * 250,
    );
  }
}
