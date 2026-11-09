import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import {
  demoAccount,
  demoAccounts,
  demoMarkets,
  DEMO_ACCOUNT,
  DEMO_SECOND,
} from "../../src/data/demo";
import {
  prepareOrderDraft,
  emptyDraft,
  type DraftFields,
  type DraftScope,
} from "../../src/data/orderDraft";
const root = process.env.SETL8_EVIDENCE_DIR || "artifacts/current";
const base = "http://127.0.0.1:8788";
async function fixture(page: Page) {
  const posts: string[] = [];
  page.on("request", (r) => {
    if (r.method() === "POST") posts.push(r.url());
  });
  await page.addInitScript(() => {
    Object.assign(window, {
      __signRequests: 0,
      phantom: {
        solana: {
          isPhantom: true,
          publicKey: null,
          connect: async () => {
            throw new Error("No connect for draft review");
          },
          signMessage: async () => {
            (window as unknown as { __signRequests: number }).__signRequests++;
            throw new Error("Order signing must remain gated");
          },
        },
      },
    });
  });
  const headers = {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "http://127.0.0.1:5173",
    "Access-Control-Allow-Credentials": "true",
  };
  await page.route(base + "/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    let body: unknown = {
      api_version: "1",
      rows: [],
      next_after: null,
      has_more: false,
    };
    if (path === "/v1/auth/session")
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
    else if (path === "/v1/markets")
      body = {
        api_version: "1",
        rows: demoMarkets,
        launch_sha256: "ab".repeat(32),
        live_admission: "disabled",
        production_reorder_window_ns: null,
      };
    else if (path === "/v1/accounts")
      body = {
        api_version: "1",
        rows: demoAccounts,
        next_after: null,
        has_more: false,
      };
    else if (path.endsWith("/updates")) {
      await route.fulfill({
        headers: { ...headers, "Content-Type": "text/event-stream" },
        body: ": fixture heartbeat\n\n",
      });
      return;
    } else if (/\/accounts\/[a-f0-9]{64}$/.test(path))
      body = demoAccount(path.split("/").at(-1)!).overview;
    await route.fulfill({ headers, body: JSON.stringify(body) });
  });
  return posts;
}
async function ticket(page: Page) {
  const tab = page.getByRole("tab", { name: "Ticket", exact: true });
  if (await tab.isVisible()) await tab.click();
}
async function settings(page: Page) {
  await ticket(page);
  if (
    !(await page
      .locator(".draft-scope")
      .evaluate((el: HTMLDetailsElement) => el.open))
  )
    await page.locator(".draft-scope>summary").click();
}
async function exact(page: Page) {
  if (
    !(await page
      .locator(".exact-order-details")
      .evaluate((el: HTMLDetailsElement) => el.open))
  )
    await page.locator(".exact-order-details>summary").click();
}
async function fill(page: Page, kind: DraftFields["kind"] = "Limit") {
  await settings(page);
  await page
    .getByRole("button", { name: "Sell Short · side 1", exact: true })
    .click();
  await page.getByRole("button", { name: kind, exact: true }).click();
  await page
    .getByLabel("Quantity · base units", { exact: true })
    .fill("1.000001");
  if (kind !== "Market")
    await page
      .getByLabel(kind + " price · USD", { exact: true })
      .fill("18446744.073709551615");
  await page.getByLabel("Stop loss", { exact: true }).check();
  await page
    .getByLabel("Stop loss price · USD", { exact: true })
    .fill("1.000000000001");
  await page.getByLabel("Take profit", { exact: true }).check();
  await page
    .getByLabel("Take profit price · USD", { exact: true })
    .fill("2.000000000002");
  await page
    .getByLabel("Confirm this account for the draft", { exact: true })
    .check();
  await page
    .getByLabel("Development nonce · explicit u32", { exact: true })
    .fill("4294967295");
  await page
    .getByLabel("Client time · Unix seconds", { exact: true })
    .fill("-9223372036854775808");
}
test("connected drafts prepare exact market/limit/stop bytes without an order signature or POST", async ({
  page,
}, info) => {
  const posts = await fixture(page),
    errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/app/terminal");
  await page.getByLabel("Market", { exact: true }).selectOption("0");
  await ticket(page);
  await page.getByRole("tab", { name: "Order", exact: true }).click();
  // A page/backend assertion cannot override the compiled explicit opt-in gate.
  await page.evaluate(() => {
    const info = {
      id: "spoofed",
      account: "de".repeat(32),
      wallet: "MockOnlyAddress",
      walletHex: "11".repeat(32),
      clock: "1791813600",
      phase: "staged-open",
      gateway: "http://127.0.0.1:8790" as const,
      origin: "http://127.0.0.1:5173" as const,
    };
    window.__SETL8_PROTOTYPE__ = {
      info,
      readInfo: async () => info,
      signLogin: async () => [],
      signOrder: async () => "ab".repeat(64),
      operate: async () => info,
    };
  });
  await expect(
    page.getByRole("button", { name: "Close", exact: true }),
  ).toHaveCount(0);
  await expect(page.locator(".simulation-banner")).toHaveCount(0);
  await expect(page.locator(".synthetic-actions")).toHaveCount(0);
  const scope: DraftScope = {
    account: DEMO_ACCOUNT,
    market: "0",
    wallet: "11".repeat(32),
    sessionEpoch: 1,
    mode: "connected",
    gateway: base,
  };
  for (const kind of ["Market", "Limit", "Stop"] as const) {
    await fill(page, kind);
    const f: DraftFields = {
      ...emptyDraft(),
      accountConfirmed: true,
      kind,
      side: "Sell",
      quantity: "1.000001",
      price: "18446744.073709551615",
      slEnabled: true,
      sl: "1.000000000001",
      tpEnabled: true,
      tp: "2.000000000002",
      nonce: "4294967295",
      clientTime: "-9223372036854775808",
    };
    const expected = await prepareOrderDraft(scope, f);
    const prepare = page.getByRole("button", {
      name: "Prepare development preview",
      exact: true,
    });
    await expect(prepare).toBeEnabled();
    await prepare.focus();
    await page.keyboard.press("Enter");
    await expect(
      page.getByRole("region", { name: "Prepared development draft" }),
    ).toBeVisible();
    await exact(page);
    await expect(
      page.getByLabel("Canonical order hex", { exact: true }),
    ).toHaveText(expected.orderHex);
    await expect(
      page.getByLabel("Signing message hex", { exact: true }),
    ).toHaveText(expected.messageHex);
    await expect(
      page.getByRole("button", {
        name: "Sign inspected synthetic bytes",
        exact: true,
      }),
    ).toHaveCount(0);
  }
  await page.locator(".draft-review").scrollIntoViewIfNeeded();
  await page.screenshot({
    path: `${root}/screenshots/draft-review-${info.project.name}.png`,
    fullPage: true,
  });
  await page
    .getByLabel("Quantity · base units", { exact: true })
    .fill("0.0000001");
  await expect(
    page.getByRole("region", { name: "Prepared development draft" }),
  ).toHaveCount(0);
  await expect(
    page.getByText(/use at most 6 decimal places; values are never rounded/),
  ).toBeVisible();
  await expect(
    page.getByRole("button", {
      name: "Prepare development preview",
      exact: true,
    }),
  ).toBeDisabled();
  expect(posts).toEqual([]);
  expect(
    await page.evaluate(
      () => (window as unknown as { __signRequests: number }).__signRequests,
    ),
  ).toBe(0);
  expect(errors).toEqual([]);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  ).toBe(true);
  const audit = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .analyze();
  expect(audit.violations).toEqual([]);
});
test("account/market/profile edits clear reviewed bytes and demo remains a separate draft", async ({
  page,
}, info) => {
  const posts = await fixture(page);
  await page.goto("/demo/terminal");
  await expect(page.locator(".market-chart canvas").first()).toBeVisible();
  await ticket(page);
  await expect(
    page.getByText("Illustrative ticket", { exact: true }),
  ).toBeVisible();
  await fill(page);
  await page
    .getByRole("button", { name: "Prepare development preview", exact: true })
    .click();
  await exact(page);
  await expect(page.getByLabel("Canonical order hex")).toBeVisible();
  await page.getByLabel("Draft SDK profile").selectOption("");
  await expect(page.getByLabel("Canonical order hex")).toHaveCount(0);
  await page.getByLabel("Draft SDK profile").selectOption("setl8-sdk-dev-v1");
  await expect(page.getByLabel("Canonical order hex")).toHaveCount(0);
  await page
    .getByRole("button", { name: "Prepare development preview", exact: true })
    .click();
  await exact(page);
  await expect(page.getByLabel("Canonical order hex")).toBeVisible();
  await page
    .getByLabel("Selected account", { exact: true })
    .selectOption(DEMO_SECOND);
  await expect(page.getByLabel("Canonical order hex")).toHaveCount(0);
  await expect(
    page.getByLabel("Development nonce · explicit u32", { exact: true }),
  ).toHaveValue("");
  await expect(
    page.getByLabel("Confirm this account for the draft", { exact: true }),
  ).not.toBeChecked();
  await fill(page);
  await page
    .getByRole("button", { name: "Prepare development preview", exact: true })
    .click();
  await exact(page);
  await expect(page.getByLabel("Canonical order hex")).toBeVisible();
  const chartTab = page.getByRole("tab", { name: "Chart", exact: true });
  if (await chartTab.isVisible()) await chartTab.click();
  await page.getByLabel("Market", { exact: true }).selectOption("1");
  await ticket(page);
  await expect(page.getByLabel("Canonical order hex")).toHaveCount(0);
  await expect(
    page.getByLabel("Quantity · base units", { exact: true }),
  ).toHaveValue("");
  await expect(
    page.getByRole("button", {
      name: "Prepare development preview",
      exact: true,
    }),
  ).toBeDisabled();
  await settings(page);
  await expect(
    page.getByText(/Execution disabled. A reviewed combined runtime/),
  ).toBeVisible();
  for (const width of info.project.name === "desktop"
    ? [320, 390, 768]
    : [390]) {
    await page.setViewportSize({ width, height: 900 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
    ).toBe(true);
  }
  await page.screenshot({
    path: `${root}/screenshots/draft-controls-${info.project.name}.png`,
    fullPage: true,
  });
  expect(posts).toEqual([]);
});
