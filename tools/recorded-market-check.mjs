/** Actual loopback gateway + existing recordings only. Disposable mock wallet; no source seeding. */
import { generateKeyPairSync, sign } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { strict as assert } from "node:assert";
import { chromium, expect } from "@playwright/test";
import bs58 from "bs58";
const root =
  process.env.SETL8_EVIDENCE_DIR || "artifacts/milestone-2/real-gateway";
const base = "http://127.0.0.1:8788",
  origin = "http://127.0.0.1:5173";
await mkdir(root + "/screenshots", { recursive: true });
const checks = [],
  ranges = [];
const { publicKey, privateKey } = generateKeyPairSync("ed25519");
const wallet = bs58.encode(
  publicKey.export({ format: "der", type: "spki" }).subarray(-32),
);
const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: { width: 1440, height: 1000 },
});
const page = await context.newPage();
const pageErrors = [];
page.on("pageerror", (e) => pageErrors.push(e.message));
let loggedIn = false;
async function read(path) {
  return page.evaluate(
    async ({ base, path }) => {
      const r = await fetch(base + path, { credentials: "include" });
      return { status: r.status, body: await r.json() };
    },
    { base, path },
  );
}
try {
  await page.exposeFunction("__mockSign", (bytes) =>
    Array.from(sign(null, Buffer.from(bytes), privateKey)),
  );
  await page.addInitScript(
    ({ wallet }) => {
      const listeners = new Map();
      const key = { toString: () => wallet };
      window.phantom = {
        solana: {
          publicKey: key,
          connect: async () => ({ publicKey: key }),
          signMessage: async (bytes) => ({
            signature: Uint8Array.from(
              await window.__mockSign(Array.from(bytes)),
            ),
          }),
          disconnect: async () => listeners.get("disconnect")?.(),
          on: (n, f) => listeners.set(n, f),
          removeListener: (n) => listeners.delete(n),
        },
      };
    },
    { wallet },
  );
  await page.goto(origin + "/app/terminal");
  const anonymous = await read(
    "/v1/markets/0/candles?stream=probe&from_ns=1792800000000000000&to_ns=1792800060000000000&interval_s=60&limit=25",
  );
  assert.equal(anonymous.status, 401);
  checks.push("activated candle route enforces authentication");
  await page
    .getByRole("button", { name: "Connect wallet", exact: true })
    .last()
    .click();
  await page.getByRole("button", { name: "Phantom", exact: true }).click();
  await page
    .getByRole("button", { name: "Sign in with wallet", exact: true })
    .click();
  await expect(page.getByLabel("Chart recording stream")).toBeVisible();
  loggedIn = true;
  checks.push(
    "actual browser challenge/signature login; fresh in-memory mock wallet",
  );
  const catalog = await read("/v1/markets");
  assert.equal(catalog.status, 200);
  const streams = [];
  let after = null;
  for (let i = 0; i < 8; i++) {
    const result = await read(
      "/v1/market-recordings?limit=25" +
        (after ? "&after=" + encodeURIComponent(after) : ""),
    );
    assert.equal(result.status, 200);
    streams.push(...result.body.rows);
    after = result.body.next_after;
    if (!result.body.has_more || !after) break;
  }
  const candidates = streams
    .filter((s) => s.purpose === "live_record_only")
    .sort(
      (a, b) =>
        Number(b.stream.startsWith("m3-live-final-")) -
        Number(a.stream.startsWith("m3-live-final-")),
    );
  assert.ok(
    candidates.length,
    "Existing live_record_only recording required; do not create one",
  );
  const chosen = [];
  for (const source of ["2", "4"]) {
    search: for (const stream of candidates) {
      for (const market of catalog.body.rows.filter(
        (m) => m.source === source,
      )) {
        const r = await read(
          `/v1/markets/${market.market}/observations?stream=${encodeURIComponent(stream.stream)}`,
        );
        if (r.status === 200 && r.body.available && r.body.rows.length) {
          chosen.push({ stream, market, sample: r.body.rows[0] });
          break search;
        }
      }
    }
  }
  assert.ok(
    chosen.length,
    "Existing recorded samples required; do not seed data",
  );
  await expect
    .poll(async () =>
      page.getByLabel("Chart recording stream").locator("option").count(),
    )
    .toBeGreaterThan(1);
  for (const { stream, market, sample } of chosen) {
    // Load bounded catalog pages in the UI, preserving explicit stream selection.
    while (
      (await page
        .getByLabel("Chart recording stream")
        .locator("option")
        .filter({ hasText: stream.stream })
        .count()) === 0
    ) {
      const more = page.getByRole("button", {
        name: "More streams",
        exact: true,
      });
      assert.ok(
        await more.count(),
        "Selected existing stream not reachable in catalog",
      );
      const streamPage = page.waitForResponse(
        (r) =>
          r.url().includes("/v1/market-recordings?") &&
          r.request().method() === "GET",
      );
      await more.click();
      await streamPage;
      await expect(
        page.getByText("Loading streams…", { exact: true }),
      ).toHaveCount(0);
    }
    await page
      .getByLabel("Market", { exact: true })
      .selectOption(market.market);
    await page.getByLabel("Chart recording stream").selectOption(stream.stream);
    await page.getByLabel("Recorded candle interval").selectOption("1");
    const shortcut = page.getByRole("button", {
      name: "Use last recorded 15 minutes",
      exact: true,
    });
    await expect(shortcut).toBeEnabled();
    await shortcut.click();
    const responsePromise = page.waitForResponse(
      (r) =>
        r.url().includes(`/v1/markets/${market.market}/candles?`) &&
        r.request().method() === "GET",
    );
    await page
      .getByRole("button", { name: "Load recorded range", exact: true })
      .click();
    const response = await responsePromise;
    assert.equal(response.status(), 200);
    let data = await response.json();
    const first = data;
    assert.equal(data.purpose, "live_record_only");
    assert.equal(data.coverage.complete, false);
    assert.equal(data.executable_quote, false);
    assert.equal(data.recording_only, true);
    assert.equal(data.finalized, false);
    assert.ok(data.rows.length > 0);
    const pages = [data];
    let loaded = [...data.rows];
    while (data.has_more) {
      const nextPromise = page.waitForResponse(
        (r) =>
          r.url().includes("/candles?") &&
          new URL(r.url()).searchParams.get("cursor") === data.next_cursor,
      );
      await page
        .getByRole("button", { name: "Load more candles", exact: true })
        .click();
      const next = await nextPromise;
      assert.equal(next.status(), 200);
      data = await next.json();
      assert.deepEqual(data.cutoff, first.cutoff);
      pages.push(data);
      loaded.push(...data.rows);
      assert.ok(pages.length <= 80);
    }
    assert.equal(
      new Set(loaded.map((c) => c.bucket_start_ns)).size,
      loaded.length,
    );
    const chart = page.getByRole("region", {
      name: /Interactive recorded candle chart/,
    });
    await expect(chart.locator("canvas").first()).toBeVisible();
    assert.equal(
      await page.getByRole("region", { name: /Interactive demo/ }).count(),
      0,
    );
    assert.equal(
      await page.getByRole("button", { name: /Buy · Unavailable/ }).count(),
      0,
    ); // Recording tab is the default; trading stays disabled.
    const selected = loaded.at(-1);
    await expect(page.getByLabel("Exact candle bucket")).toHaveValue(
      selected.bucket_start_ns,
    );
    await page
      .getByText("Exact ns/e18 values and OHLC provenance", { exact: true })
      .click();
    await expect(page.locator(".candle-details pre")).toContainText(
      selected.close_e18,
    );
    await expect(page.locator(".candle-details pre")).toContainText(
      selected.bucket_start_ns,
    );
    await page
      .getByText("Exact ns/e18 values and OHLC provenance", { exact: true })
      .click();
    const history = await read(
      `/v1/markets/${market.market}/history?` +
        new URLSearchParams({
          stream: stream.stream,
          from_ns: first.from_ns,
          to_ns: first.to_ns,
          limit: "25",
          cursor: first.observation_cursor,
        }),
    );
    assert.equal(history.status, 200);
    assert.deepEqual(history.body.cutoff, first.cutoff);
    assert.ok(history.body.rows.length > 0);
    const savedRange = {
      stream: stream.stream,
      market: market.market,
      symbol: market.symbol,
      source: market.source,
      purpose: first.purpose,
      timestamp_basis: first.timestamp_basis,
      from_ns: first.from_ns,
      to_ns: first.to_ns,
      cutoff: first.cutoff,
      pages: pages.length,
      candles: loaded.length,
      distinct_samples_in_range: first.distinct_samples_in_range,
      provider_time_absent_counts: loaded.map(
        (c) => c.provider_time_absent_count,
      ),
      recorded_sample_source_ns: sample.observation.source_ns,
      coverage: first.coverage,
      first_page: first,
      history_same_cutoff: history.body,
    };
    ranges.push(savedRange);
    await page
      .getByRole("button", { name: "Fit / reset view", exact: true })
      .click();
    // Return internal scroll to the chart for a readable screenshot.
    await page
      .locator(".recorded-chart-scroll")
      .evaluate((el) => (el.scrollTop = 0));
    await page.screenshot({
      path: `${root}/screenshots/recorded-source-${market.source}-desktop.png`,
      fullPage: true,
    });
    await page.locator(".chart-stack").screenshot({
      path: `${root}/screenshots/recorded-source-${market.source}-chart.png`,
    });
    await page.setViewportSize({ width: 390, height: 844 });
    assert.ok(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
    );
    await chart.scrollIntoViewIfNeeded();
    await page.screenshot({
      path: `${root}/screenshots/recorded-source-${market.source}-phone-viewport.png`,
    });
    await page.screenshot({
      path: `${root}/screenshots/recorded-source-${market.source}-phone.png`,
      fullPage: true,
    });
    await page.setViewportSize({ width: 1440, height: 1000 });
    const freshPromise = page.waitForResponse(
      (r) =>
        r.url().includes("/candles?") &&
        !new URL(r.url()).searchParams.has("cursor"),
    );
    await page
      .getByRole("button", { name: "Refresh recording", exact: true })
      .click();
    const fresh = await freshPromise;
    assert.equal(fresh.status(), 200);
    assert.equal((await fresh.json()).stream, stream.stream);
    checks.push(
      `source ${market.source}: actual existing candles, exact details, same-cutoff observation cursor, explicit refresh and desktop/phone render`,
    );
  }
  assert.deepEqual(pageErrors, []);
  checks.push(
    "no browser page errors; no mixed demo candles; no horizontal phone overflow",
  );
  await page.getByRole("tab", { name: "Order", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Buy · Unavailable", exact: true }),
  ).toBeDisabled();
  checks.push("order submission remains disabled");
  await page.getByRole("button", { name: "Log out", exact: true }).click();
  loggedIn = false;
  assert.equal((await read("/v1/auth/session")).status, 401);
  checks.push("only disposable session logged out");
  await writeFile(
    root + "/results.json",
    JSON.stringify(
      {
        timestamp: new Date().toISOString(),
        passed: true,
        conditions:
          "Actual loopback gateway/database, Chromium desktop + resized phone, disposable mock wallet, existing recorded history only. No mocked API routes, source seeding, recorder, transaction or extension wallet.",
        checks,
        ranges,
        pageErrors,
      },
      null,
      2,
    ),
  );
  console.log(
    JSON.stringify(
      {
        passed: true,
        checks: checks.length,
        ranges: ranges.map((r) => ({
          stream: r.stream,
          source: r.source,
          candles: r.candles,
          pages: r.pages,
          recorded_ns: r.recorded_sample_source_ns,
        })),
        evidence: root,
      },
      null,
      2,
    ),
  );
} finally {
  if (loggedIn) {
    await page
      .evaluate(async (base) => {
        const s = await fetch(base + "/v1/auth/session", {
          credentials: "include",
        }).then((r) => r.json());
        if (s.csrf_token)
          await fetch(base + "/v1/auth/logout", {
            method: "POST",
            credentials: "include",
            headers: {
              "Content-Type": "application/json",
              "X-Setl8-Csrf": s.csrf_token,
            },
            body: "{}",
          });
      }, base)
      .catch(() => {});
  }
  await browser.close();
}
