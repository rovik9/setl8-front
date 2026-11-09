import { describe, it, expect } from "vitest";
import {
  acceptCandlePage,
  candlePath,
  exactPrice,
  exactTime,
  inputNs,
  NS,
  plottedCandle,
  plottedPrice,
  plottedTime,
  rangeProblem,
  historyFailure,
  recordedAge,
} from "../src/data/history";
import { ApiClient, ApiError } from "../src/api/client";
import {
  candle,
  candlePage,
  fixtureScope as scope,
  FROM,
} from "./fixtures/candles";
describe("recorded exact values and bounded presentation", () => {
  it("retains every e18/ns digit and provider absence", () => {
    expect(exactPrice("9007199254740993123456789")).toBe(
      "$9,007,199.254740993123456789",
    );
    expect(exactPrice("-1")).toBe("$−0.000000000000000001");
    expect(exactTime("1792800000123456789")).toBe(
      "2026-10-24T00:00:00.123456789Z",
    );
    expect(inputNs("2026-10-24T00:00:00")).toBe(scope.from_ns);
    expect(candle().open_ref.provider_time_ns).toBeNull();
  });
  it("labels old recorded sessions in hours even before a full day has passed", () => {
    const now = Number(FROM / 1_000_000n + 23n * 3600n * 1000n);
    expect(recordedAge(String(FROM), now)).toBe("23 hours old");
    expect(recordedAge(String(FROM), now + 3600 * 1000)).toBe("1 day old");
    expect(recordedAge(String(FROM + NS), Number(FROM / 1_000_000n))).toContain(
      "future",
    );
  });
  it("converts only bounded approximate USD/whole-second coordinates", () => {
    expect(plottedPrice("1000000")).toBe(1e-12);
    expect(plottedPrice("1000000000000000000000000000000")).toBe(1e12);
    expect(plottedPrice("0")).toBe(0);
    for (const v of ["1", "1000000000000000000000000000001", "NaN"])
      expect(() => plottedPrice(v)).toThrow();
    expect(plottedTime(String(FROM))).toBe(1792800000);
    expect(() => plottedTime(String(FROM + 1n))).toThrow();
    expect(() => plottedTime("18446744074000000000")).toThrow();
    expect(plottedCandle(candle()).close).toBeCloseTo(67842.50012345679);
    expect(exactTime("18446744073709551615")).toBe(
      "2554-07-21T23:34:33.709551615Z",
    );
  });
});
describe("range, pagination and input bounds", () => {
  it("counts intersected bucket positions including clipped/empty boundaries", () => {
    expect(
      rangeProblem({
        ...scope,
        interval_s: "1",
        to_ns: String(FROM + 2000n * NS),
      }),
    ).toBeNull();
    expect(
      rangeProblem({
        ...scope,
        interval_s: "1",
        from_ns: String(FROM + 1n),
        to_ns: String(FROM + 2000n * NS + 1n),
      }),
    ).toContain("2,000");
    expect(
      rangeProblem({
        ...scope,
        interval_s: "3600",
        to_ns: String(FROM + 7n * 86400n * NS),
      }),
    ).toBeNull();
    expect(
      rangeProblem({
        ...scope,
        interval_s: "3600",
        to_ns: String(FROM + 7n * 86400n * NS + 1n),
      }),
    ).toContain("seven days");
    expect(rangeProblem({ ...scope, to_ns: scope.from_ns })).toContain(
      "start before",
    );
    expect(rangeProblem({ ...scope, to_ns: "18446744073709551616" })).toContain(
      "timestamp",
    );
  });
  it("uses a conservative page limit and opaque cursor without decoding it", () => {
    const url = new URL(
      candlePath(scope, "opaque/&?=continuation"),
      "http://127.0.0.1",
    );
    expect(url.searchParams.get("cursor")).toBe("opaque/&?=continuation");
    expect(url.searchParams.get("limit")).toBe("25");
    expect(() => candlePath(scope, "x".repeat(2049))).toThrow();
    expect(() => candlePath({ ...scope, stream: "x".repeat(4100) })).toThrow();
  });
  it("keeps empty buckets absent and partial boundary windows exact", () => {
    const clipped = {
      ...scope,
      from_ns: String(FROM + 1n),
      to_ns: String(FROM + 180n * NS - 1n),
    };
    const rows = [
      candle(FROM, undefined, clipped),
      candle(FROM + 120n * NS, undefined, clipped),
    ];
    const result = acceptCandlePage(
      clipped,
      candlePage(rows, clipped),
      null,
      [],
    );
    expect(result).toHaveLength(2);
    expect(result.map((c) => c.range_clipped)).toEqual([true, true]);
    expect(result[0].sample_from_ns).toBe(String(FROM + 1n));
    expect(result[1].sample_to_ns).toBe(clipped.to_ns);
    expect(acceptCandlePage(scope, candlePage([], scope), null, [])).toEqual(
      [],
    );
  });
  it("rejects changed cutoffs, duplicate pages and whole-range bounds", () => {
    const first = candlePage([candle()], scope, "9", "opaque-next", 2);
    const second = candlePage([candle(FROM + 60n * NS)], scope, "9", null, 2);
    expect(acceptCandlePage(scope, second, first, first.rows)).toHaveLength(2);
    expect(() =>
      acceptCandlePage(
        scope,
        { ...second, cutoff: { ...second.cutoff, normalized_through: "10" } },
        first,
        first.rows,
      ),
    ).toThrow();
    expect(() =>
      acceptCandlePage(
        scope,
        { ...second, rows: first.rows },
        first,
        first.rows,
      ),
    ).toThrow();
    expect(() =>
      acceptCandlePage(
        scope,
        { ...second, distinct_samples_in_range: "10001" },
        null,
        [],
      ),
    ).toThrow();
    expect(() =>
      acceptCandlePage(
        scope,
        { ...second, range_point_count: "2001" },
        null,
        [],
      ),
    ).toThrow();
    expect(() =>
      acceptCandlePage(
        scope,
        { ...second, rows: Array(26).fill(candle()) },
        null,
        [],
      ),
    ).toThrow();
  });
  it.each([
    [401, "session"],
    [404, "prerequisite"],
    [409, "resync"],
    [410, "resync"],
    [422, "limit"],
    [503, "unavailable"],
    [414, "resync"],
    [400, "resync"],
  ])("classifies HTTP %s explicitly", (status, kind) => {
    expect(
      historyFailure(new ApiError(status as number, "code", "Fixture failure"))
        .kind,
    ).toBe(kind);
  });
  it("bounds streamed response bytes even without Content-Length", async () => {
    const client = new ApiClient(
      "http://fixture",
      async () =>
        new Response(
          JSON.stringify({ api_version: "1", rows: "x".repeat(2048) }),
        ),
    );
    await expect(
      client.request("/candles", { maxBytes: 100 }),
    ).rejects.toMatchObject({ code: "response_limit" });
    await expect(
      client.request("/candles", { maxBytes: 3000 }),
    ).resolves.toMatchObject({ api_version: "1" });
  });
});
