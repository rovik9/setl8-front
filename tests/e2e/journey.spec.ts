import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import {
  demoAccount,
  demoMarkets,
  DEMO_ACCOUNT,
  DEMO_SECOND,
} from "../../src/data/demo";
const third = "ac".repeat(32),
  base = "http://127.0.0.1:8788",
  root = process.env.SETL8_EVIDENCE_DIR || "artifacts/current";
async function fixture(page: Page) {
  const state = {
    empty: false,
    expired: false,
    aged: false,
    hold: false,
    release: () => {},
    requests: [] as string[],
    posts: [] as string[],
  };
  await page.addInitScript(() => {
    Object.assign(window, {
      __purchaseSigns: 0,
      phantom: {
        solana: {
          isPhantom: true,
          connect: async () => {
            throw Error("Purchase must not connect");
          },
          signMessage: async () => {
            (window as unknown as { __purchaseSigns: number })
              .__purchaseSigns++;
            throw Error("Purchase must not sign");
          },
        },
      },
    });
  });
  await page.route(base + "/**", async (route) => {
    const req = route.request(),
      u = new URL(req.url()),
      p = u.pathname;
    state.requests.push(req.url());
    if (req.method() === "POST") state.posts.push(p);
    const headers = {
      "Access-Control-Allow-Origin": "http://127.0.0.1:5173",
      "Access-Control-Allow-Credentials": "true",
      "Content-Type": "application/json",
    };
    let body: unknown = {
      api_version: "1",
      rows: [],
      next_after: null,
      has_more: false,
    };
    if (state.expired) {
      await route.fulfill({
        status: 401,
        headers,
        body: JSON.stringify({
          error: { code: "session_expired", message: "Controlled expiry" },
        }),
      });
      return;
    }
    if (p === "/v1/auth/session")
      body = {
        api_version: "1",
        wallet: "MockOnlyAddress",
        wallet_hex: "11".repeat(32),
        csrf_token: "aa".repeat(32),
        admin_read: false,
        expires_unix_s: String(Math.floor(Date.now() / 1000) + 3600),
        trading_authority: "actual_trader_signature_per_intent",
        lifecycle_application: "operator_only",
      };
    else if (p === "/v1/markets")
      body = {
        api_version: "1",
        rows: demoMarkets,
        live_admission: "disabled",
        production_reorder_window_ns: null,
      };
    else if (p === "/v1/accounts") {
      const ids = u.searchParams.has("after")
        ? [third]
        : [DEMO_ACCOUNT, DEMO_SECOND];
      body = {
        api_version: "1",
        rows: state.empty
          ? []
          : ids.map((id) => ({
              account: id,
              trader_hex: "11".repeat(32),
              received_through: "1",
              processed_through: "1",
              evaluator_status: id === DEMO_SECOND ? null : "Active",
              state_available: id !== DEMO_SECOND,
            })),
        next_after:
          state.empty || u.searchParams.has("after") ? null : DEMO_SECOND,
        has_more: !state.empty && !u.searchParams.has("after"),
      };
    } else if (p.endsWith("/updates")) {
      await route.fulfill({
        headers: { ...headers, "Content-Type": "text/event-stream" },
        body: ": controlled stream\n\n",
      });
      return;
    } else if (/\/accounts\/[a-f0-9]{64}$/.test(p)) {
      const id = p.split("/").at(-1)!;
      const overview = demoAccount(id).overview;
      overview.initial_config = {
        params: { size_micro: "100000000000", phase: "2" },
      };
      overview.read_at_unix_ns = String(
        BigInt(Date.now() - (state.aged ? 120000 : 0)) * 1000000n,
      );
      if (overview.evaluator_state)
        overview.evaluator_state.balance_micro =
          id === third ? "200001234567" : "104960123456";
      body = overview;
      if (state.hold && id === DEMO_ACCOUNT) {
        state.hold = false;
        await new Promise<void>((r) => (state.release = r));
      }
    } else if (p.endsWith("/activity")) body = demoAccount().activity;
    await route
      .fulfill({ headers, body: JSON.stringify(body) })
      .catch(() => {});
  });
  return state;
}
async function audit(page: Page) {
  const result = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .analyze();
  expect(result.violations).toEqual([]);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  ).toBe(true);
}
test("overview displays exact committed metrics, initial state and account-preserving terminal handoff", async ({
  page,
}, info) => {
  const f = await fixture(page);
  await page.goto("/app/accounts");
  await expect(page.locator(".capital-value")).toHaveText("$104,960.12");
  await expect(page.locator(".capital-exact")).toContainText("$104,960.123456");
  await expect(
    page.getByRole("heading", { name: "Account activity", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".journey-evidence")).not.toHaveAttribute(
    "open",
    "",
  );
  await expect(
    page.getByRole("link", { name: "Open terminal", exact: true }),
  ).toHaveAttribute("href", "/app/terminal?account=" + DEMO_ACCOUNT);
  await expect(
    page.getByRole("link", {
      name: "Open terminal for selected account",
      exact: true,
    }),
  ).toHaveAttribute("href", "/app/terminal?account=" + DEMO_ACCOUNT);
  await audit(page);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({
    path: `${root}/screenshots/overview-viewport-${info.project.name}.png`,
  });
  await page.screenshot({
    path: `${root}/screenshots/overview-${info.project.name}.png`,
    fullPage: true,
  });
  await page
    .getByLabel("Selected account", { exact: true })
    .selectOption(DEMO_SECOND);
  await expect(
    page.getByText("Initial account size", { exact: true }),
  ).toBeVisible();
  await expect(page.locator(".capital-value")).toHaveCount(0);
  await expect(
    page.getByText("Initial phase", { exact: true }).first(),
  ).toBeVisible();
  await page.getByRole("link", { name: "Open terminal", exact: true }).click();
  await expect(page).toHaveURL(
    new RegExp("/app/terminal\\?account=" + DEMO_SECOND),
  );
  await expect(
    page.getByLabel("Selected account", { exact: true }),
  ).toHaveValue(DEMO_SECOND);
  await expect(
    page.getByRole("button", { name: "Illustrative", exact: true }),
  ).toHaveCount(0);
  expect(f.posts).toEqual([]);
});
test("directory filters loaded pages and opens the selected account overview", async ({
  page,
}, info) => {
  const f = await fixture(page);
  await page.goto("/app/accounts/list");
  await expect(page.locator(".directory-card")).toHaveCount(2);
  await page.getByLabel("Account state filter").selectOption("waiting");
  await expect(page.locator(".directory-card")).toHaveCount(1);
  await page.getByLabel("Account state filter").selectOption("all");
  await page
    .getByRole("button", { name: "Load more accounts", exact: true })
    .click();
  await expect(page.locator(".directory-card")).toHaveCount(3);
  expect(f.requests.some((s) => s.includes("after=" + DEMO_SECOND))).toBe(true);
  await audit(page);
  await page.screenshot({
    path: `${root}/screenshots/accounts-${info.project.name}.png`,
    fullPage: true,
  });
  await page.getByLabel("Search loaded accounts").fill(third.slice(0, 8));
  await expect(page.locator(".directory-card")).toHaveCount(1);
  await page.getByRole("link", { name: "Open overview", exact: true }).click();
  await expect(page.locator(".capital-exact")).toContainText("$200,001.234567");
  await expect(page).toHaveURL(new RegExp("account=" + third));
});
test("delayed account reads cannot replace a newly selected account and stale reads stay explicit", async ({
  page,
}, info) => {
  const f = await fixture(page);
  f.hold = true;
  f.aged = true;
  await page.goto("/app/accounts?account=" + DEMO_ACCOUNT);
  await expect(
    page.getByLabel("Selected account", { exact: true }),
  ).toHaveValue(DEMO_ACCOUNT);
  await expect
    .poll(() => f.requests.some((s) => s.endsWith("/accounts/" + DEMO_ACCOUNT)))
    .toBe(true);
  await page
    .getByLabel("Selected account", { exact: true })
    .selectOption(DEMO_SECOND);
  await expect(
    page.getByText("Initial account size", { exact: true }),
  ).toBeVisible();
  f.release();
  await expect(page.locator(".capital-value")).toHaveCount(0);
  await expect(page.locator(".journey-notice")).toContainText(
    "Showing the last committed account view",
  );
  await page.screenshot({
    path: `${root}/screenshots/awaiting-state-${info.project.name}.png`,
    fullPage: true,
  });
  expect(f.posts).toEqual([]);
});
test("empty ownership, unavailable reads and session expiry have separate recovery", async ({
  page,
}) => {
  const f = await fixture(page);
  f.empty = true;
  await page.goto("/app/accounts");
  await expect(
    page.getByRole("heading", { name: "No accounts for this wallet" }),
  ).toBeVisible();
  await page
    .getByRole("link", { name: "Explore account availability", exact: true })
    .click();
  await expect(
    page.getByText("Account purchases aren't open yet.", { exact: false }),
  ).toBeVisible();
  f.empty = false;
  await page.goto("/app/accounts");
  await expect(page.locator(".capital-value")).toBeVisible();
  f.expired = true;
  await page
    .getByRole("button", { name: "Refresh account", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Start with your wallet." }),
  ).toBeVisible();
  await expect(page.locator(".capital-value")).toHaveCount(0);
});
test("normal purchase route ignores fixture/status query flags and has no payment CTA", async ({
  page,
}, info) => {
  const f = await fixture(page);
  await page.goto("/purchase?demo=1&status=ready");
  await expect(page.getByText("Not quoted", { exact: true })).toHaveCount(2);
  await expect(page.getByRole("status")).toHaveCount(0);
  await expect(page.locator(".purchase-sizes")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: /pay|buy|sign|submit/i }),
  ).toHaveCount(0);
  await audit(page);
  await page.screenshot({
    path: `${root}/screenshots/purchase-availability-${info.project.name}.png`,
    fullPage: true,
  });
  expect(f.posts).toEqual([]);
  expect(
    await page.evaluate(
      () => (window as unknown as { __purchaseSigns: number }).__purchaseSigns,
    ),
  ).toBe(0);
});
test("isolated catalog review and confirmation examples never sign, pay or create accounts", async ({
  page,
}, info) => {
  const f = await fixture(page);
  await page.goto("/demo/purchase");
  await expect(
    page.getByText("Purchase demonstration", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: /\$50,000/ }).click();
  await page
    .getByRole("button", { name: "Preview review", exact: true })
    .click();
  await expect(page.locator(".purchase-review")).toContainText(
    "39.00 demo credits",
  );
  await expect(page.locator(".purchase-review-size")).toContainText("$50,000");
  await audit(page);
  await page.screenshot({
    path: `${root}/screenshots/purchase-review-demo-${info.project.name}.png`,
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "View example status", exact: true })
    .click();
  for (const state of [
    "confirming",
    "unknown",
    "verification",
    "indexing",
    "ready",
    "expired",
    "rejected",
    "failed",
  ]) {
    await page.getByLabel("Example state", { exact: true }).selectOption(state);
    await expect(page.locator(".purchase-example-state")).toBeVisible();
  }
  await page
    .getByLabel("Example state", { exact: true })
    .selectOption("unknown");
  await audit(page);
  await page.screenshot({
    path: `${root}/screenshots/purchase-unknown-demo-${info.project.name}.png`,
    fullPage: true,
  });
  await page
    .getByRole("link", { name: "Explore an account demo", exact: true })
    .click();
  await expect(page).toHaveURL(/\/demo\/accounts/);
  await expect(page.locator(".capital-value")).toHaveText("$104,960.00");
  await page.goto("/purchase");
  await expect(page.locator(".purchase-sizes")).toHaveCount(0);
  expect(f.posts).toEqual([]);
  expect(
    await page.evaluate(
      () => (window as unknown as { __purchaseSigns: number }).__purchaseSigns,
    ),
  ).toBe(0);
});
