import { mkdir } from "node:fs/promises";
import { chromium } from "@playwright/test";
const evidenceRoot = process.env.SETL8_EVIDENCE_DIR || "artifacts/current";
await mkdir(`${evidenceRoot}/screenshots`, { recursive: true });
const browser = await chromium.launch();
try {
  for (const [name, viewport] of [
    ["desktop", { width: 1440, height: 1000 }],
    ["phone", { width: 390, height: 844 }],
  ]) {
    const context = await browser.newContext({
      viewport,
      deviceScaleFactor: 1,
      reducedMotion: "reduce",
      isMobile: name === "phone",
      hasTouch: name === "phone",
    });
    const page = await context.newPage();
    for (const [route, file, selector] of [
      ["/", "landing", ".landing-terminal"],
      ["/demo/accounts", "dashboard", ".metric-grid"],
      ["/demo/terminal", "terminal", ".market-chart"],
    ]) {
      await page.goto("http://127.0.0.1:5173" + route);
      await page.locator(selector).waitFor();
      await page.getByRole("progressbar").waitFor({ state: "hidden" });
      await page.evaluate(() => document.fonts.ready);
      await page.screenshot({
        path: `${evidenceRoot}/screenshots/${file}-${name}-viewport.png`,
        animations: "disabled",
      });
    }
    await context.close();
  }
} finally {
  await browser.close();
}
