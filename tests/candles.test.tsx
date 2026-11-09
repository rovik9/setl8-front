import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, it, expect, vi } from "vitest";
import { api, ApiError } from "../src/api/client";
import { useCandles } from "../src/hooks/candles";
import {
  candle,
  candlePage,
  fixtureScope as scope,
  FROM,
} from "./fixtures/candles";
import { NS } from "../src/data/history";
import type { RecordedCandlePage } from "../src/api/frontend-v1";
function deferred() {
  let resolve!: (v: RecordedCandlePage) => void;
  const promise = new Promise<RecordedCandlePage>((r) => (resolve = r));
  return { resolve, promise };
}
afterEach(() => vi.restoreAllMocks());
describe("cutoff-isolated candle reads", () => {
  it("loads multiple pages using only the returned cursor and same scope", async () => {
    const first = candlePage([candle()], scope, "9", "opaque/page2", 2);
    const second = candlePage([candle(FROM + 60n * NS)], scope, "9", null, 2);
    const request = vi
      .spyOn(api, "request")
      .mockResolvedValueOnce(first)
      .mockResolvedValueOnce(second);
    const { result } = renderHook(() => useCandles(scope, "wallet-1"));
    await waitFor(() => expect(result.current.rows).toHaveLength(1));
    act(() => {
      result.current.more();
      result.current.more();
    });
    await waitFor(() => expect(result.current.rows).toHaveLength(2));
    expect(request).toHaveBeenCalledTimes(2);
    const urls = request.mock.calls.map(
      ([path]) => new URL(path, "http://fixture"),
    );
    expect(urls[0].searchParams.has("cursor")).toBe(false);
    expect(urls[1].searchParams.get("cursor")).toBe("opaque/page2");
    for (const u of urls) {
      expect(u.searchParams.get("from_ns")).toBe(scope.from_ns);
      expect(u.searchParams.get("limit")).toBe("25");
    }
  });
  it.each(["stream", "market", "from_ns", "to_ns", "interval_s", "session"])(
    "aborts and rejects delayed %s scope data",
    async (field) => {
      const old = deferred(),
        fresh = deferred();
      const request = vi
        .spyOn(api, "request")
        .mockReturnValueOnce(old.promise)
        .mockReturnValueOnce(fresh.promise);
      const { result, rerender } = renderHook(
        ({ selected, session }) => useCandles(selected, session),
        { initialProps: { selected: scope, session: "w1" } },
      );
      const next = {
        ...scope,
        ...(field === "session"
          ? {}
          : {
              [field]: (
                {
                  stream: "other",
                  market: "1",
                  from_ns: String(FROM + NS),
                  to_ns: String(FROM + 120n * NS),
                  interval_s: "300",
                } as Record<string, string>
              )[field],
            }),
      };
      rerender({ selected: next, session: field === "session" ? "w2" : "w1" });
      expect(request.mock.calls[0][1]?.signal?.aborted).toBe(true);
      expect(result.current.rows).toHaveLength(0);
      const start =
        (BigInt(next.from_ns) / (BigInt(next.interval_s) * NS)) *
        (BigInt(next.interval_s) * NS);
      await act(async () =>
        fresh.resolve(candlePage([candle(start, undefined, next)], next, "10")),
      );
      await waitFor(() =>
        expect(result.current.page?.cutoff.normalized_through).toBe("10"),
      );
      await act(async () => old.resolve(candlePage()));
      expect(result.current.page?.stream).toBe(next.stream);
      expect(result.current.page?.cutoff.normalized_through).toBe("10");
    },
  );
  it("a fresh cutoff replaces buckets and discards late old-cutoff pagination", async () => {
    const delayed = deferred();
    const request = vi
      .spyOn(api, "request")
      .mockResolvedValueOnce(candlePage([candle()], scope, "9", "old-next", 2))
      .mockReturnValueOnce(delayed.promise)
      .mockResolvedValueOnce(
        candlePage([candle(FROM, "67843500123456789012345")], scope, "10"),
      );
    const { result } = renderHook(() => useCandles(scope, "wallet"));
    await waitFor(() => expect(result.current.rows).toHaveLength(1));
    act(() => result.current.more());
    act(() => result.current.refresh());
    expect(request.mock.calls[1][1]?.signal?.aborted).toBe(true);
    await waitFor(() =>
      expect(result.current.page?.cutoff.normalized_through).toBe("10"),
    );
    await act(async () =>
      delayed.resolve(
        candlePage([candle(FROM + 60n * NS)], scope, "9", null, 2),
      ),
    );
    expect(result.current.rows).toHaveLength(1);
    expect(result.current.rows[0].close_e18).toBe("67843500123456789012345");
    expect(
      new URL(request.mock.calls[2][0], "http://fixture").searchParams.has(
        "cursor",
      ),
    ).toBe(false);
  });
  it("stops at resync instead of mixing a changed prefix", async () => {
    vi.spyOn(api, "request")
      .mockResolvedValueOnce(candlePage([candle()], scope, "9", "next", 2))
      .mockResolvedValueOnce(
        candlePage([candle(FROM + 60n * NS)], scope, "10", null, 2),
      );
    const { result } = renderHook(() => useCandles(scope, "wallet"));
    await waitFor(() => expect(result.current.rows).toHaveLength(1));
    act(() => result.current.more());
    await waitFor(() => expect(result.current.error?.kind).toBe("resync"));
    expect(result.current.rows).toHaveLength(1);
    expect(result.current.page?.cutoff.normalized_through).toBe("9");
    expect(result.current.continuationBlocked).toBe(true);
  });
  it("401 clears previously displayed candles and stops continuation", async () => {
    vi.spyOn(api, "request")
      .mockResolvedValueOnce(candlePage())
      .mockRejectedValueOnce(new ApiError(401, "unauthenticated", "Expired"));
    const { result } = renderHook(() => useCandles(scope, "wallet"));
    await waitFor(() => expect(result.current.rows).toHaveLength(1));
    act(() => result.current.refresh());
    await waitFor(() => expect(result.current.error?.kind).toBe("session"));
    expect(result.current.rows).toEqual([]);
    expect(result.current.page).toBeNull();
  });
});
