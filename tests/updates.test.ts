import { describe, it, expect, vi, afterEach } from "vitest";
import { AccountUpdates, type EventSourceLike } from "../src/api/updates";
import { ApiClient } from "../src/api/client";
import { demoAccount, DEMO_ACCOUNT } from "../src/data/demo";
class Source implements EventSourceLike {
  closed = false;
  onerror: ((e: Event) => void) | null = null;
  listeners = new Map<string, (e: MessageEvent) => void>();
  close() {
    this.closed = true;
  }
  addEventListener(t: string, fn: (e: MessageEvent) => void) {
    this.listeners.set(t, fn);
  }
  emit(t: string, data: unknown = {}, id = "") {
    this.listeners.get(t)?.(
      new MessageEvent(t, { data: JSON.stringify(data), lastEventId: id }),
    );
  }
}
const streams: AccountUpdates[] = [];
afterEach(() => {
  streams.forEach((s) => s.stop());
  streams.length = 0;
  vi.useRealTimers();
});
function setup() {
  const sources: Source[] = [];
  const urls: string[] = [];
  const snapshot = vi.fn(() => true);
  const refresh = vi.fn(
    async (_signal: AbortSignal): Promise<string | null> =>
      "newest:opaque:cursor",
  );
  const expired = vi.fn();
  const status = vi.fn();
  const fetcher = vi.fn(
    async () =>
      new Response(JSON.stringify({ api_version: "1" }), { status: 200 }),
  );
  const client = new ApiClient(
    "http://127.0.0.1:8788",
    fetcher as typeof fetch,
  );
  const stream = new AccountUpdates({
    client,
    account: DEMO_ACCOUNT,
    refresh,
    snapshot,
    expired,
    status,
    random: () => 0,
    source: (url) => {
      urls.push(url);
      const s = new Source();
      sources.push(s);
      return s;
    },
  });
  streams.push(stream);
  stream.start();
  return { sources, urls, snapshot, refresh, expired, status, fetcher, stream };
}
describe("account stream lifecycle", () => {
  it("applies a snapshot and reuses its opaque ID on rotation", async () => {
    vi.useFakeTimers();
    const s = setup();
    s.sources[0].emit(
      "snapshot",
      demoAccount().overview,
      "feed:special opaque",
    );
    expect(s.snapshot).toHaveBeenCalled();
    s.sources[0].emit("reconnect");
    expect(s.sources[0].closed).toBe(true);
    await vi.advanceTimersByTimeAsync(1000);
    expect(s.urls[1]).toContain("cursor=feed%3Aspecial%20opaque");
    expect(s.fetcher).toHaveBeenCalled();
  });
  it("coalesces overlapping invalidations and advances only after successful refetch", async () => {
    vi.useFakeTimers();
    const s = setup();
    let release!: (cursor: string | null) => void;
    s.refresh.mockImplementationOnce(() => new Promise((r) => (release = r)));
    s.sources[0].emit("invalidate", {}, "notice-not-applied");
    s.sources[0].emit("invalidate", {}, "notice-2");
    s.sources[0].emit("invalidate", {}, "notice-3");
    expect(s.refresh).toHaveBeenCalledTimes(1);
    release("applied:cursor");
    await vi.advanceTimersByTimeAsync(0);
    expect(s.refresh).toHaveBeenCalledTimes(2);
    s.sources[0].emit("reconnect");
    await vi.advanceTimersByTimeAsync(1000);
    expect(s.urls[1]).toContain("newest%3Aopaque%3Acursor");
    expect(s.urls[1]).not.toContain("notice");
  });
  it("resynchronizes from a fresh read after resync_required", async () => {
    vi.useFakeTimers();
    const s = setup();
    s.sources[0].emit("snapshot", demoAccount().overview, "old");
    s.sources[0].emit("resync_required", { code: "slow_consumer" });
    await vi.advanceTimersByTimeAsync(1000);
    expect(s.refresh).toHaveBeenCalledTimes(1);
    expect(s.urls[1]).toContain("newest%3Aopaque%3Acursor");
  });
  it("closes and expires the private scope on session_closed", () => {
    const s = setup();
    s.sources[0].emit("session_closed");
    expect(s.expired).toHaveBeenCalledOnce();
    expect(s.sources[0].closed).toBe(true);
    s.sources[0].emit("snapshot", demoAccount().overview);
    expect(s.snapshot).not.toHaveBeenCalled();
  });
  it("uses bounded backoff and stops after six unsuccessful connections", async () => {
    vi.useFakeTimers();
    const s = setup();
    for (let i = 0; i < 7; i++) {
      s.sources.at(-1)!.onerror?.(new Event("error"));
      await vi.advanceTimersByTimeAsync(30000);
    }
    expect(s.sources).toHaveLength(7);
    expect(s.status).toHaveBeenCalledWith("paused");
  });
  it("cleans up an old account and aborts in-flight refetches", () => {
    const s = setup();
    let captured: AbortSignal | undefined;
    s.refresh.mockImplementation(async (signal: AbortSignal) => {
      captured = signal;
      return "cursor";
    });
    s.sources[0].emit("invalidate");
    s.stream.stop();
    expect(captured?.aborted).toBe(true);
    expect(s.sources[0].closed).toBe(true);
  });
  it("clears identity when reconnect session inspection returns 401", async () => {
    vi.useFakeTimers();
    const s = setup();
    s.fetcher.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          api_version: "1",
          error: { code: "unauthenticated", message: "Expired" },
        }),
        { status: 401 },
      ),
    );
    s.sources[0].onerror?.(new Event("error"));
    await vi.advanceTimersByTimeAsync(1000);
    expect(s.expired).toHaveBeenCalledOnce();
    expect(s.sources).toHaveLength(1);
  });
});

describe("snapshot and refresh acknowledgement ordering", () => {
  it("does not replace a newer snapshot cursor with an older refresh continuation", async () => {
    vi.useFakeTimers();
    const s = setup();
    s.refresh.mockImplementationOnce(async () => {
      s.sources[0].emit(
        "snapshot",
        demoAccount().overview,
        "newer-streamed-cursor",
      );
      return "older-http-cursor";
    });
    s.sources[0].emit("invalidate");
    await vi.advanceTimersByTimeAsync(0);
    s.sources[0].emit("reconnect");
    await vi.advanceTimersByTimeAsync(1000);
    expect(new URL(s.urls[1]).searchParams.get("cursor")).toBe(
      "newer-streamed-cursor",
    );
  });
  it("does not acknowledge a discarded HTTP refresh", async () => {
    vi.useFakeTimers();
    const s = setup();
    s.sources[0].emit(
      "snapshot",
      demoAccount().overview,
      "applied-before-read",
    );
    s.refresh.mockResolvedValueOnce(null);
    s.sources[0].emit("invalidate", {}, "not-applied");
    await vi.advanceTimersByTimeAsync(0);
    s.sources[0].emit("reconnect");
    await vi.advanceTimersByTimeAsync(1000);
    expect(new URL(s.urls[1]).searchParams.get("cursor")).toBe(
      "applied-before-read",
    );
  });
  it("does not acknowledge a snapshot rejected by its consumer", async () => {
    vi.useFakeTimers();
    const s = setup();
    s.sources[0].emit("snapshot", demoAccount().overview, "last-applied");
    s.snapshot.mockReturnValueOnce(false);
    s.sources[0].emit("snapshot", demoAccount().overview, "not-installed");
    s.sources[0].emit("reconnect");
    await vi.advanceTimersByTimeAsync(1000);
    expect(new URL(s.urls[1]).searchParams.get("cursor")).toBe("last-applied");
  });
});
