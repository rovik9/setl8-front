import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
const root = process.env.SETL8_EVIDENCE_DIR || "artifacts/current";
async function open(page: Page) {
  const api: string[] = [],
    errors: string[] = [];
  page.on("request", (r) => {
    if (
      ["fetch", "xhr"].includes(r.resourceType()) ||
      r.url().includes("/v1/") ||
      r.url().includes(":8788") ||
      r.url().includes(":8790") ||
      r.url().includes(":8791")
    )
      api.push(r.url());
  });
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/purchase-preview.html");
  await expect(
    page.getByRole("button", { name: "Review this account", exact: true }),
  ).toBeEnabled();
  return { api, errors };
}
async function quote(page: Page) {
  await page
    .getByRole("button", { name: "Review this account", exact: true })
    .click();
  await expect(
    page.getByRole("button", {
      name: "Preview purchase progress",
      exact: true,
    }),
  ).toBeVisible();
}
async function scenario(page: Page, name: string) {
  await page.getByText("Example settings", { exact: false }).click();
  await page.getByLabel("Example scenario", { exact: true }).selectOption(name);
  await page.getByText("Example settings", { exact: false }).click();
}
async function audit(page: Page) {
  const a = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .analyze();
  expect(a.violations).toEqual([]);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  ).toBe(true);
}
test("controlled DTO review, separate confirmation and account handoff", async ({
  page,
}, info) => {
  const trace = await open(page);
  await expect(
    page.getByRole("heading", { name: "Start your SETL8 challenge." }),
  ).toBeVisible();
  await expect(
    page.getByText("Simulated purchase preview", { exact: true }),
  ).toHaveCount(1);
  await page.getByRole("button", { name: /\$10,000/ }).click();
  await quote(page);
  await expect(page.locator(".purchase-total")).toContainText(
    "99.396 Test USDC",
  );
  await page.getByRole("button", { name: /\$2,500/ }).click();
  await quote(page);
  expect(await page.locator("main").innerText()).not.toMatch(
    /DTO|evaluator|parsed DTOs|separate ownership read/,
  );
  await expect(page.locator(".purchase-total")).toContainText(
    "30.12 Test USDC",
  );
  await audit(page);
  await page.screenshot({
    path: `${root}/screenshots/review-${info.project.name}.png`,
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "Preview purchase progress", exact: true })
    .click();
  await expect(page.locator(".consumer-stages")).toContainText("Ready");
  for (let i = 0; i < 3; i++) {
    await page
      .getByRole("button", { name: "Show next update", exact: true })
      .click();
    await expect(
      page.getByRole("button", {
        name: "Show next update",
        exact: true,
      }),
    ).toBeEnabled();
  }
  await expect(
    page.getByRole("button", { name: "View account details", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "View account details", exact: true })
    .click();
  await expect(
    page.getByRole("region", { name: "Selected example account" }),
  ).toContainText("Trading setup is pending");
  await audit(page);
  await page.screenshot({
    path: `${root}/screenshots/account-handoff-${info.project.name}.png`,
    fullPage: true,
  });
  expect(trace.api).toEqual([]);
  expect(trace.errors).toEqual([]);
});
test("lost acknowledgment reconciles without a second payment or attempt", async ({
  page,
}, info) => {
  const trace = await open(page);
  await scenario(page, "lost_ack");
  await quote(page);
  await page
    .getByRole("button", { name: "Preview purchase progress", exact: true })
    .click();
  await expect(page.getByRole("alert")).toContainText(
    "latest update could not be confirmed",
  );
  await page
    .getByRole("button", { name: "Check purchase progress", exact: true })
    .click();
  await expect(page.locator(".consumer-stages")).toContainText(
    "Outcome unknown",
  );
  await expect(
    page.getByRole("button", {
      name: "Preview purchase progress",
      exact: true,
    }),
  ).toBeDisabled();
  await expect(
    page.getByRole("button", { name: "Review this account", exact: true }),
  ).toBeDisabled();
  await page.screenshot({
    path: `${root}/screenshots/unknown-${info.project.name}.png`,
    fullPage: true,
  });
  expect(trace.api).toEqual([]);
  expect(trace.errors).toEqual([]);
});
test("wallet switching clears prior quote/material and partial discovery remains explicit", async ({
  page,
}, info) => {
  const trace = await open(page);
  await quote(page);
  await page.getByText("Example settings", { exact: false }).click();
  await page
    .getByLabel("Example wallet", { exact: true })
    .selectOption({ index: 1 });
  await expect(
    page.getByRole("button", {
      name: "Preview purchase progress",
      exact: true,
    }),
  ).toHaveCount(0);
  await page
    .getByLabel("Example scenario", { exact: true })
    .selectOption("partial");
  await page.getByText("Example settings", { exact: false }).click();
  await expect(
    page.getByText("The account search is incomplete.", { exact: false }),
  ).toBeVisible();
  await expect(
    page.getByText("No accounts found in this example.", {
      exact: true,
    }),
  ).toHaveCount(0);
  await quote(page);
  await expect(
    page.getByRole("button", {
      name: "Preview purchase progress",
      exact: true,
    }),
  ).toBeDisabled();
  await audit(page);
  await page.screenshot({
    path: `${root}/screenshots/partial-${info.project.name}.png`,
    fullPage: true,
  });
  expect(trace.api).toEqual([]);
  expect(trace.errors).toEqual([]);
});
test("expired quote never prepares and verification mismatch does not erase ownership", async ({
  page,
}, info) => {
  const trace = await open(page);
  await scenario(page, "expired");
  await quote(page);
  await expect(
    page.getByRole("button", {
      name: "Preview purchase progress",
      exact: true,
    }),
  ).toBeDisabled();
  await expect(
    page.getByText("This review has expired.", { exact: false }),
  ).toBeVisible();
  await scenario(page, "mismatch");
  await quote(page);
  await page
    .getByRole("button", { name: "Preview purchase progress", exact: true })
    .click();
  await expect(page.locator(".consumer-stages")).toContainText("Ready");
  for (let i = 0; i < 3; i++) {
    await page
      .getByRole("button", { name: "Show next update", exact: true })
      .click();
    await expect(
      page.getByRole("button", {
        name: "Show next update",
        exact: true,
      }),
    ).toBeEnabled();
  }
  await expect(
    page.getByText("The recorded price differs from the review.", {
      exact: false,
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "View account details", exact: true }),
  ).toBeVisible();
  if (info.project.name === "phone") {
    await page.setViewportSize({ width: 320, height: 844 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
    ).toBe(true);
  }
  expect(trace.api).toEqual([]);
  expect(trace.errors).toEqual([]);
});
