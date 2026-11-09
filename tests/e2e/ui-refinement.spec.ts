import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
const root = process.env.SETL8_EVIDENCE_DIR || "artifacts/current";
test("chart-led workspace keeps compact defaults and mobile panels retain the ticket", async ({
  page,
}, info) => {
  await page.route("http://127.0.0.1:8788/**", (route) =>
    route.fulfill({
      status: 401,
      headers: {
        "Access-Control-Allow-Origin": "http://127.0.0.1:5173",
        "Access-Control-Allow-Credentials": "true",
      },
      contentType: "application/json",
      body: JSON.stringify({
        error: {
          code: "session_required",
          message: "Controlled signed-out fixture",
        },
      }),
    }),
  );
  await page.goto("/demo/terminal");
  await expect(page.locator(".market-chart canvas").first()).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
  const phone = info.project.name === "phone";
  const chart = page.getByRole("tab", { name: "Chart", exact: true }),
    ticket = page.getByRole("tab", { name: "Ticket", exact: true });
  if (phone) {
    const canvas = await page
        .locator(".market-chart canvas")
        .first()
        .boundingBox(),
      nav = await page.locator(".mobile-nav").boundingBox();
    expect(canvas!.y + canvas!.height).toBeLessThanOrEqual(nav!.y);
    await chart.focus();
    await page.keyboard.press("ArrowRight");
    await expect(ticket).toBeFocused();
    await expect(ticket).toHaveAttribute("aria-selected", "true");
  } else {
    const a = await page.locator(".chart-stack").boundingBox(),
      b = await page.locator(".order-panel").boundingBox();
    expect(a!.width).toBeGreaterThan(1000);
    expect(b!.width).toBe(300);
  }
  await expect(page.locator(".draft-scope")).not.toHaveAttribute("open", "");
  await expect(
    page.getByLabel("Development nonce · explicit u32", { exact: true }),
  ).toBeHidden();
  await expect(page.getByRole("button", { name: /Unavailable/ })).toHaveCount(
    0,
  );
  await page.getByLabel("Quantity · base units", { exact: true }).fill("1.25");
  if (phone) {
    await chart.click();
    await page.getByRole("tab", { name: "Account", exact: true }).click();
    await expect(page.locator("#terminal-panel-account")).toBeVisible();
    await ticket.click();
    await expect(
      page.getByLabel("Quantity · base units", { exact: true }),
    ).toHaveValue("1.25");
  }
  await page.getByRole("button", { name: "Set up", exact: true }).click();
  await expect(
    page.getByLabel("Development nonce · explicit u32", { exact: true }),
  ).toBeVisible();
  await page.locator(".draft-scope>summary").click();
  const audit = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .analyze();
  expect(audit.violations).toEqual([]);
  if (phone) await chart.click();
  await page.screenshot({
    path: `${root}/screenshots/refined-${info.project.name}.png`,
    fullPage: true,
  });
  for (const width of phone ? [320, 390] : [768, 1440]) {
    await page.setViewportSize({ width, height: phone ? 844 : 1000 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
    ).toBe(true);
  }
});
