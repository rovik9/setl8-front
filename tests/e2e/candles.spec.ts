import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import {
  candle,
  candlePage,
  fixtureScope,
  FROM,
  reference,
} from "../fixtures/candles";
import type { CandleScope } from "../../src/data/history";
import { NS } from "../../src/data/history";
import { demoMarkets } from "../../src/data/demo";
const root = process.env.SETL8_EVIDENCE_DIR || "artifacts/current";
const base = "http://127.0.0.1:8788";
async function fixture(page: Page) {
  const state = {
    status: 200,
    code: "history_work_limit",
    revision: "9",
    empty: false,
    requests: [] as string[],
    hold: false,
    release: () => {},
    body: "",
  };
  await page.route(base + "/**", async (route) => {
    const u = new URL(route.request().url()),
      path = u.pathname;
    let value: unknown = {
      api_version: "1",
      rows: [],
      next_after: null,
      has_more: false,
    };
    let status = 200;
    if (path === "/v1/auth/session")
      value = {
        api_version: "1",
        wallet: "MockOnlyAddress",
        wallet_hex: "11".repeat(32),
        csrf_token: "aa".repeat(32),
        admin_read: false,
        expires_unix_s: String(Math.floor(Date.now() / 1000) + 3600),
        trading_authority: "actual_trader_signature_per_intent",
        lifecycle_application: "operator_only",
      };
    else if (path === "/v1/markets")
      value = {
        api_version: "1",
        rows: demoMarkets,
        launch_sha256: "ab".repeat(32),
        live_admission: "disabled",
        production_reorder_window_ns: null,
      };
    else if (path === "/v1/market-recordings")
      value = {
        api_version: "1",
        rows: [fixtureScope.stream, "other-synthetic"].map((stream) => ({
          stream,
          purpose: "synthetic_test",
          capture_through: "9",
          normalization_through: "9",
          recording_only: true,
          executable_quote: false,
        })),
        next_after: null,
        has_more: false,
      };
    else if (path.endsWith("/observations"))
      value = {
        api_version: "1",
        stream: u.searchParams.get("stream"),
        market: "0",
        purpose: "synthetic_test",
        capture_through: "9",
        normalization_through: "9",
        available: true,
        recording_only: true,
        executable_quote: false,
        coverage_complete: false,
        selection: "latest",
        age_basis: "database_clock",
        rows: [
          {
            sample_id: "1",
            capture_seq: "9",
            observation: {
              identity: demoMarkets[0],
              ...reference(FROM + 599n * NS),
              value_e18: "67842500123456789012345",
            },
            raw_sha256: "aa".repeat(32),
            envelope_sha256: "bb".repeat(32),
            endpoint: "controlled fixture",
            transport_kind: "test",
            receive_age_ns: "0",
            source_age_ns: "0",
          },
        ],
      };
    else if (path.endsWith("/candles")) {
      state.requests.push(u.toString());
      const scope: CandleScope = {
        stream: u.searchParams.get("stream")!,
        market: path.split("/")[3],
        from_ns: u.searchParams.get("from_ns")!,
        to_ns: u.searchParams.get("to_ns")!,
        interval_s: u.searchParams.get(
          "interval_s",
        )! as CandleScope["interval_s"],
      };
      status = state.status;
      const start =
        (BigInt(scope.from_ns) / (BigInt(scope.interval_s) * NS)) *
        (BigInt(scope.interval_s) * NS);
      const close =
        state.revision === "9"
          ? "67842500123456789012345"
          : "67843500123456789012345";
      value =
        status !== 200
          ? {
              api_version: "1",
              error: { code: state.code, message: "Controlled failure" },
            }
          : state.empty
            ? candlePage([], scope, state.revision)
            : u.searchParams.has("cursor")
              ? candlePage(
                  [candle(start + 120n * NS, close, scope)],
                  scope,
                  state.revision,
                  null,
                  2,
                )
              : candlePage(
                  [candle(start, close, scope)],
                  scope,
                  state.revision,
                  "opaque-candle-next",
                  2,
                );
      if (state.hold) {
        state.hold = false;
        await new Promise<void>((resolve) => (state.release = resolve));
      }
      if (state.body) {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          headers: {
            "Access-Control-Allow-Origin": "http://127.0.0.1:5173",
            "Access-Control-Allow-Credentials": "true",
          },
          body: state.body,
        });
        return;
      }
    }
    await route
      .fulfill({
        status,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "http://127.0.0.1:5173",
          "Access-Control-Allow-Credentials": "true",
        },
        body: JSON.stringify(value),
      })
      .catch(() => {});
  });
  return state;
}
async function picker(page: Page) {
  const el = page.locator(".recorded-picker");
  if (!(await el.evaluate((e: HTMLDetailsElement) => e.open)))
    await el.locator(":scope>summary").click();
}
async function exactCandle(page: Page) {
  await page.locator(".candle-details>summary").click();
}
async function choose(page: Page) {
  await page.goto("/app/terminal");
  await page.getByLabel("Market", { exact: true }).selectOption("0");
  await picker(page);
  await page
    .getByLabel("Chart recording stream")
    .selectOption(fixtureScope.stream);
  await picker(page);
  await page.getByLabel("Recorded range start UTC").fill("2026-10-24T00:00:01");
  await picker(page);
  await page.getByLabel("Recorded range end UTC").fill("2026-10-24T00:09:59");
  await page
    .getByRole("button", { name: "Load recorded range", exact: true })
    .click();
}
async function noOverflow(page: Page) {
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  ).toBe(true);
}
test("recorded candles paginate within a cutoff, expose exact clipped values and replace on refresh", async ({
  page,
}, info) => {
  const f = await fixture(page);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await choose(page);
  await exactCandle(page);
  await expect(
    page.getByText("$67,842.500123456789012345", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText(
      "Coverage unknown · Not finalized · Not a current market feed",
      { exact: true },
    ),
  ).toBeVisible();
  await expect(
    page.getByText(/Partial boundary bucket; only samples/),
  ).toBeVisible();
  await expect(
    page.getByText(/distinct samples · 3 without provider time/),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Load more candles", exact: true })
    .click();
  await expect(page.getByText(/2 of 2 nonempty buckets/)).toBeVisible();
  expect(new URL(f.requests[1]).searchParams.get("cursor")).toBe(
    "opaque-candle-next",
  );
  const chart = page.getByRole("region", {
    name: /Interactive recorded candle chart/,
  });
  await expect(chart.locator("canvas").first()).toBeVisible();
  await chart.focus();
  await page.keyboard.press("ArrowLeft");
  const original = await chart.locator("canvas").first().elementHandle();
  f.revision = "10";
  await page
    .getByRole("button", { name: "Refresh recording", exact: true })
    .click();
  await expect(
    page.getByText("$67,843.500123456789012345", { exact: true }),
  ).toBeVisible();
  await expect(page.getByText(/1 of 2 nonempty buckets/)).toBeVisible();
  expect(new URL(f.requests.at(-1)!).searchParams.has("cursor")).toBe(false);
  expect(
    await chart
      .locator("canvas")
      .first()
      .evaluate((el, old) => el === old, original),
  ).toBe(true);
  await page
    .getByRole("button", { name: "Fit / reset view", exact: true })
    .click();
  await page
    .locator(".recorded-chart-scroll")
    .evaluate((el) => (el.scrollTop = 0));
  await page.screenshot({
    path: `${root}/screenshots/recorded-chart-fixture-${info.project.name}.png`,
    fullPage: true,
  });
  await page
    .getByText("Recording provenance, cutoff and receive diagnostics", {
      exact: true,
    })
    .click();
  await expect(
    page.getByText(/Diagnostics truncated: only an inspected/),
  ).toBeVisible();
  await noOverflow(page);
  await page.screenshot({
    path: `${root}/screenshots/recorded-fixture-${info.project.name}.png`,
    fullPage: true,
  });
  const audit = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .analyze();
  expect(audit.violations).toEqual([]);
  expect(errors).toEqual([]);
});
test("selector change discards a delayed read and shows empty coverage honestly", async ({
  page,
}) => {
  const f = await fixture(page);
  f.hold = true;
  await choose(page);
  await expect.poll(() => f.requests.length).toBe(1);
  f.empty = true;
  await picker(page);
  await page
    .getByLabel("Chart recording stream")
    .selectOption("other-synthetic");
  f.release();
  await expect(
    page.getByText("$67,842.500123456789012345", { exact: true }),
  ).toHaveCount(0);
  await picker(page);
  await page.getByLabel("Recorded range start UTC").fill("2026-10-24T00:00");
  await picker(page);
  await page.getByLabel("Recorded range end UTC").fill("2026-10-24T00:10");
  await page
    .getByRole("button", { name: "Load recorded range", exact: true })
    .click();
  await expect(page.getByText(/No stored samples in this range/)).toBeVisible();
  await expect(page.getByText(/0 of 0 nonempty buckets/)).toBeVisible();
  await noOverflow(page);
});
test("work/range failures, missing-route prerequisite and expired/resync cutoffs stay explicit", async ({
  page,
}, info) => {
  const f = await fixture(page);
  f.status = 404;
  await choose(page);
  await expect(
    page.getByText("History integration required", { exact: true }),
  ).toBeVisible();
  await expect(page.getByText(/this is not an empty recording/)).toBeVisible();
  for (const status of [422, 503, 409, 410]) {
    f.status = status;
    await page
      .getByRole("button", { name: "Start fresh read", exact: true })
      .click();
    await expect(page.getByRole("alert").last()).toContainText(
      status === 422
        ? "work or response bound"
        : status === 503
          ? "unavailable or exceeded"
          : status === 409
            ? "ahead of available"
            : "can no longer be continued",
    );
  }
  f.status = 422;
  await page
    .getByRole("button", { name: "Start fresh read", exact: true })
    .click();
  await picker(page);
  await page
    .getByRole("button", { name: "Narrow range by half", exact: true })
    .click();
  await expect(page.getByLabel("Recorded range end UTC")).toHaveValue(
    "2026-10-24T00:05",
  );
  await picker(page);
  await page.getByLabel("Recorded candle interval").selectOption("1");
  await picker(page);
  await page.getByLabel("Recorded range end UTC").fill("2026-11-02T00:00");
  await expect(page.getByText(/seven days or less/)).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Load recorded range", exact: true }),
  ).toBeDisabled();
  await picker(page);
  await page.getByLabel("Recorded range end UTC").fill("2026-10-24T01:00");
  await expect(page.getByText(/more than 2,000 bucket/)).toBeVisible();
  await noOverflow(page);
  await page.screenshot({
    path: `${root}/screenshots/recorded-limits-${info.project.name}.png`,
    fullPage: true,
  });
  f.status = 401;
  f.code = "unauthenticated";
  await picker(page);
  await page.getByLabel("Recorded range end UTC").fill("2026-10-24T00:10");
  await page
    .getByRole("button", { name: "Load recorded range", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Start with your wallet." }),
  ).toBeVisible();
  await expect(
    page.getByRole("region", { name: /Interactive recorded/ }),
  ).toHaveCount(0);
});
