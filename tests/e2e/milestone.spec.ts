import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import {
  demoAccount,
  DEMO_ACCOUNT,
  DEMO_SECOND,
  demoMarkets,
  demoAccounts,
} from "../../src/data/demo";
const evidenceRoot = process.env.SETL8_EVIDENCE_DIR || "artifacts/current";
const api = "http://127.0.0.1:8788";
async function mock(
  page: Page,
  { empty = false, unavailable = false, error = false, admin = false } = {},
) {
  const data = demoAccount(unavailable ? DEMO_SECOND : DEMO_ACCOUNT);
  const headers = {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "http://127.0.0.1:5173",
    "Access-Control-Allow-Credentials": "true",
  };
  await page.route(api + "/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    let value: unknown = { api_version: "1" };
    let status = 200;
    if (path.endsWith("/auth/session"))
      value = {
        api_version: "1",
        wallet: "MockOnlyAddress",
        wallet_hex: "11".repeat(32),
        csrf_token: "ab".repeat(32),
        admin_read: admin,
        expires_unix_s: String(Math.floor(Date.now() / 1000) + 3600),
        trading_authority: "actual_trader_signature_per_intent",
        lifecycle_application: "operator_only",
      };
    else if (path === "/v1/accounts") {
      if (error) {
        status = 503;
        value = {
          api_version: "1",
          error: {
            code: "dependency_unavailable",
            message: "Fixture service unavailable",
          },
        };
      } else
        value = {
          api_version: "1",
          rows: empty ? [] : demoAccounts,
          next_after: null,
          has_more: false,
        };
    } else if (path === "/v1/markets")
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
        rows: [
          {
            stream: "explicit-synthetic-stream",
            purpose: "synthetic_test",
            capture_through: "90",
            normalization_through: "89",
            recording_only: true,
            executable_quote: false,
          },
        ],
        next_after: null,
        has_more: false,
      };
    else if (path.endsWith("/observations"))
      value = {
        api_version: "1",
        stream: "explicit-synthetic-stream",
        market: "0",
        purpose: "synthetic_test",
        capture_through: "90",
        normalization_through: "89",
        available: true,
        recording_only: true,
        executable_quote: false,
        coverage_complete: false,
        selection: "latest",
        age_basis: "database_clock",
        rows: [
          {
            sample_id: "4",
            capture_seq: "89",
            observation: {
              identity: demoMarkets[0],
              source_ns: "1792828800000000000",
              receive_ns: "1792828800000000000",
              value_e18: "67842500123456789012345",
              provider_time_ns: null,
              timestamp_basis: "receive_time",
              raw_sha256: "aa".repeat(32),
              metadata_evidence: null,
            },
            raw_sha256: "aa".repeat(32),
            envelope_sha256: "bb".repeat(32),
            endpoint: "synthetic fixture",
            transport_kind: "test",
            receive_age_ns: "-1000000000",
            source_age_ns: "-1000000000",
          },
        ],
      };
    else if (path.endsWith("/updates")) {
      await route.fulfill({
        headers: { ...headers, "Content-Type": "text/event-stream" },
        body: `event: snapshot\nid: mock:cursor\ndata: ${JSON.stringify(data.overview)}\n\n`,
      });
      return;
    } else if (path.endsWith("/positions")) value = data.positions;
    else if (path.endsWith("/pending-orders")) value = data.pending;
    else if (path.endsWith("/activity")) value = data.activity;
    else if (path.endsWith("/journals")) value = data.journals;
    else if (path.endsWith("/publication-attempts")) value = data.attempts;
    else if (path.startsWith("/v1/accounts/")) value = data.overview;
    await route.fulfill({ headers, status, body: JSON.stringify(value) });
  });
}
async function openEvidence(page: Page) {
  // The overview keeps positions/orders/activity in a collapsed disclosure; open it only when closed.
  await page.locator(".journey-evidence>summary").waitFor();
  const closed = page.locator(".journey-evidence:not([open])>summary");
  if (await closed.count()) await closed.click();
}
async function noOverflow(page: Page) {
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth + 1,
    ),
  ).toBe(true);
}
test("public landing, responsive navigation, keyboard focus and screenshots", async ({
  page,
}, info) => {
  await mock(page, { empty: true });
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Your edge. A bigger stage." }),
  ).toBeVisible();
  await page.keyboard.press("Tab");
  await expect(
    page.getByRole("link", { name: "Skip to content" }),
  ).toBeFocused();
  await page.getByRole("button", { name: "ETH / USD", exact: true }).click();
  // The preview no longer shows fixture prices for ETH/SOL; it says plainly that recorded history is required.
  await expect(
    page.getByRole("status").filter({ hasText: "Chart unavailable. ETH/SOL" }),
  ).toBeVisible();
  await noOverflow(page);
  await page.screenshot({
    path: `${evidenceRoot}/screenshots/landing-${info.project.name}.png`,
    fullPage: true,
  });
  const audit = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .analyze();
  expect(audit.violations).toEqual([]);
  expect(errors).toEqual([]);
  expect(await page.getByRole("progressbar").count()).toBe(0);
});
test("demo dashboard distinguishes unavailable, empty and populated state", async ({
  page,
}, info) => {
  await mock(page);
  await page.goto("/demo/accounts");
  await expect(
    page.getByRole("heading", { name: "Account overview." }),
  ).toBeVisible();
  await expect(page.getByText("$104,960.00").first()).toBeVisible();
  await noOverflow(page);
  await page.screenshot({
    path: `${evidenceRoot}/screenshots/dashboard-${info.project.name}.png`,
    fullPage: true,
  });
  const audit = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .analyze();
  expect(audit.violations).toEqual([]);
  await openEvidence(page);
  await page.getByRole("tab", { name: "Pending orders" }).click();
  await expect(
    page.getByRole("heading", { name: "No recorded pending orders" }),
  ).toBeVisible();
  await page
    .getByLabel("Selected account", { exact: true })
    .selectOption(DEMO_SECOND);
  await openEvidence(page);
  await page.getByRole("tab", { name: "Positions" }).click();
  await expect(
    page.getByRole("heading", { name: "Position state unavailable" }),
  ).toBeVisible();
  await expect(page.getByText("$104,960.00")).toHaveCount(0);
  await page
    .getByLabel("Selected account", { exact: true })
    .selectOption(DEMO_ACCOUNT);
  await openEvidence(page);
  await page.getByRole("tab", { name: "Activity", exact: true }).click();
  const input124 = page.getByRole("button", { name: /^Input #124/ });
  await expect(input124).toBeVisible();
  await input124.click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
});
test("demo terminal chart and side panels work; no DOM or AI panel", async ({
  page,
}, info) => {
  await mock(page);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/demo/terminal");
  await expect(
    page.getByRole("region", { name: /Interactive demo market chart/ }),
  ).toBeVisible();
  await page.getByLabel("Market", { exact: true }).selectOption("1");
  await page.getByLabel("Chart timeframe").selectOption("5");
  await page.getByRole("button", { name: "Line chart", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Line chart", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await page
    .getByRole("button", { name: "Candlestick chart", exact: true })
    .click();
  if (info.project.name === "phone")
    await page.getByRole("tab", { name: "Ticket", exact: true }).click();
  await page
    .getByRole("button", { name: "Sell Short · side 1", exact: true })
    .click();
  await page.getByRole("button", { name: "Limit", exact: true }).click();
  await page.getByLabel("Limit price · USD").fill("3600");
  await page.getByLabel("Quantity · base units", { exact: true }).fill("2");
  await expect(
    page.getByRole("button", { name: "Prepare development preview" }),
  ).toBeDisabled();
  await page.getByRole("tab", { name: "Recording", exact: true }).click();
  await expect(
    page.getByText("Deterministic fixture", { exact: true }),
  ).toBeVisible();
  await page.getByRole("tab", { name: "Order", exact: true }).click();
  // At phone width the focus/restore toolbar buttons are hidden by design (the tabs replace the split layout).
  if (info.project.name === "desktop") {
    await page
      .getByRole("button", { name: "Focus chart", exact: true })
      .click();
    await expect(page.getByRole("tablist", { name: "Side panel" })).toHaveCount(
      0,
    );
    await page
      .getByRole("button", { name: "Restore panels", exact: true })
      .click();
  }
  if (info.project.name === "desktop") {
    const splitter = page.getByRole("separator", { name: "Resize side panel" });
    await splitter.focus();
    await page.keyboard.press("ArrowLeft");
    await expect(splitter).toHaveAttribute("aria-valuenow", "316");
  }
  expect(await page.getByText("DOM", { exact: true }).count()).toBe(0);
  expect(await page.getByText(/pspark/i).count()).toBe(0);
  await noOverflow(page);
  await page.screenshot({
    path: `${evidenceRoot}/screenshots/terminal-${info.project.name}.png`,
    fullPage: true,
  });
  const audit = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .analyze();
  expect(audit.violations).toEqual([]);
  expect(errors).toEqual([]);
});
test("connected workspace uses explicit streams, exact values and no demo candles", async ({
  page,
}) => {
  await mock(page);
  await page.goto("/app/terminal");
  await expect(
    page.getByText("Choose stream & time window", { exact: true }),
  ).toBeVisible();
  expect(
    await page.getByRole("region", { name: /Interactive demo/ }).count(),
  ).toBe(0);
  await page.getByLabel("Market", { exact: true }).selectOption("0");
  // The recorded dataset picker is a collapsed disclosure until its summary is opened.
  await page.locator(".recorded-picker>summary").click();
  await page
    .getByLabel("Chart recording stream")
    .selectOption("explicit-synthetic-stream");
  await expect(
    page.getByRole("button", { name: "Use last recorded hour", exact: true }),
  ).toBeEnabled();
  expect(
    await page
      .getByRole("region", { name: /Interactive recorded candle/ })
      .count(),
  ).toBe(0);
  expect(await page.getByRole("link", { name: "Operations" }).count()).toBe(0);
  await noOverflow(page);
});
test("connected account list handles empty and service-error responses", async ({
  page,
}) => {
  await mock(page, { empty: true });
  await page.goto("/app/accounts");
  await expect(
    page.getByRole("heading", { name: "No accounts for this wallet" }),
  ).toBeVisible();
  await page.unrouteAll();
  await mock(page, { error: true });
  await page.reload();
  await expect(page.getByRole("alert")).toContainText(
    "Fixture service unavailable",
  );
  await page.getByRole("button", { name: "Try again" }).click();
  await expect(page.getByRole("alert")).toBeVisible();
});
test("reduced motion preserves keyboard access and visible feedback", async ({
  page,
}) => {
  await mock(page);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await page.keyboard.press("Tab");
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/#main-content$/);
  const animations = await page.evaluate(
    () =>
      document.getAnimations().filter((a) => a.playState === "running").length,
  );
  expect(animations).toBe(0);
});

test("product path includes payable phase features and Live benefits", async ({
  page,
}, info) => {
  await mock(page);
  await page.goto("/");
  await page.getByRole("button", { name: "Phases 2–5", exact: true }).click();
  await expect(
    page.locator("#challenge").getByText("100%", { exact: true }),
  ).toBeVisible();
  await expect(
    page.locator("#challenge").getByText("Target each phase", { exact: true }),
  ).toBeVisible();
  const liveTab = page.getByRole("button", { name: "Live", exact: true });
  if ((await liveTab.count()) === 0) {
    // The demo build deliberately has no Live tab or Live benefits (no roadmap text on demo pages).
    await expect(page.getByText("75% profit split")).toHaveCount(0);
    await noOverflow(page);
    return;
  }
  await liveTab.click();
  for (const feature of [
    "75% profit split",
    "No profit target",
    "No per-payout limit",
    "Unrestricted account scaling",
    "Minimal rules",
    "Negligible spreads",
    "Unrestricted news trading",
    "Multiple payouts per day",
  ])
    await expect(page.getByText(feature, { exact: true })).toBeVisible();
  await noOverflow(page);
  await page.locator("#challenge").screenshot({
    path: `${evidenceRoot}/screenshots/live-features-${info.project.name}.png`,
  });
});
test("small phone and tablet widths keep all major routes within the viewport", async ({
  page,
}, info) => {
  test.skip(info.project.name !== "desktop");
  await mock(page);
  for (const width of [320, 360, 430, 768]) {
    await page.setViewportSize({ width, height: 900 });
    for (const route of ["/", "/demo/accounts", "/demo/terminal"]) {
      await page.goto(route);
      await page.locator("main").waitFor();
      await noOverflow(page);
    }
  }
});

test("server role controls operations navigation; session controls work at phone widths too", async ({
  page,
}, info) => {
  await mock(page, { admin: true });
  await page.goto("/app/accounts");
  await expect(
    page.getByRole("heading", { name: "Account overview." }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Operations", exact: true }).last(),
  ).toBeVisible();
  await page.getByRole("button", { name: /MockOn/ }).click();
  await expect(page.getByRole("dialog", { name: "Your wallet" })).toBeVisible();
  const sessionDialog = page.getByRole("dialog", { name: "Your wallet" });
  await expect(
    sessionDialog.getByRole("button", { name: "Disconnect & log out" }),
  ).toBeVisible();
  await noOverflow(page);
  await page.screenshot({
    path: `${evidenceRoot}/screenshots/session-${info.project.name}.png`,
  });
  await sessionDialog
    .getByRole("button", { name: "Disconnect & log out" })
    .click();
  await expect(
    page.getByRole("heading", { name: "Start with your wallet." }),
  ).toBeVisible();
  await expect(page.getByText("$104,960.00")).toHaveCount(0);
});

test("an open Activity tab refreshes when an account invalidation advances the snapshot", async ({
  page,
}) => {
  await page.addInitScript(() => {
    class FixtureSource extends EventTarget {
      onerror = null;
      constructor(_url: string) {
        super();
        (window as unknown as { __streams: EventTarget[] }).__streams.push(
          this,
        );
      }
      close() {}
    }
    Object.assign(window, { __streams: [], EventSource: FixtureSource });
  });
  await mock(page);
  let updated = false;
  const data = demoAccount();
  const headers = {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "http://127.0.0.1:5173",
    "Access-Control-Allow-Credentials": "true",
  };
  await page.route(api + "/v1/accounts/" + DEMO_ACCOUNT, (route) =>
    route.fulfill({
      headers,
      body: JSON.stringify({
        ...data.overview,
        update_cursor: updated ? "opaque-applied-2" : "opaque-applied-1",
      }),
    }),
  );
  await page.route(
    api + "/v1/accounts/" + DEMO_ACCOUNT + "/activity?*",
    (route) =>
      route.fulfill({
        headers,
        body: JSON.stringify({
          ...data.activity,
          rows: updated
            ? [{ ...data.activity.rows[0], input_seq: "999" }]
            : data.activity.rows,
        }),
      }),
  );
  await page.goto("/app/accounts");
  await openEvidence(page);
  await page.getByRole("tab", { name: "Activity", exact: true }).click();
  await expect(page.getByRole("button", { name: /^Input #124/ })).toBeVisible();
  await page.waitForFunction(
    () =>
      (window as unknown as { __streams?: EventTarget[] }).__streams?.length,
  );
  updated = true;
  await page.evaluate(() =>
    (window as unknown as { __streams: EventTarget[] }).__streams
      .at(-1)
      ?.dispatchEvent(
        new MessageEvent("invalidate", { data: "{}", lastEventId: "notice-2" }),
      ),
  );
  await expect(page.getByRole("button", { name: /^Input #999/ })).toBeVisible();
  await expect(page.getByText("Input #124")).toHaveCount(0);
});
