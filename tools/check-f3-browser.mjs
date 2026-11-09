import { chromium } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { writeFile, mkdir } from "node:fs/promises";
import { mockAccountRpc, fixture, watermark } from "./f3-mocked-rpc.mjs";
const root = "artifacts/f3-account",
  browser = await chromium.launch({ headless: true }),
  checks = [],
  errors = [],
  screens = [];
await mkdir(root + "/screenshots", { recursive: true });
const assert = (x, label) => {
  if (!x) throw Error(label);
  checks.push(label);
};
async function open(options = {}, width = 1440) {
  const c = await browser.newContext({
      viewport: { width, height: 1000 },
      reducedMotion: "reduce",
    }),
    rpc = await mockAccountRpc(c, options),
    p = await c.newPage();
  p.on("pageerror", (e) => errors.push(String(e)));
  await p.goto("http://127.0.0.1:5173/my-account?wallet=" + fixture.wallet);
  await p.getByText("Last observed:", { exact: false }).waitFor();
  return { c, p, rpc };
}
async function shot(p, name) {
  await watermark(p);
  await p.evaluate(() => scrollTo(0, 0));
  const path =
    root + "/screenshots/" + name + "-MOCKED-WALLET-NOT-A-REAL-TRANSACTION.png";
  await p.screenshot({ path, fullPage: true });
  screens.push(path);
}
let failure = null;
try {
  const { c, p, rpc } = await open();
  await p.getByText("Recorded closed balance B", { exact: true }).waitFor();
  assert(
    await p.getByText("Current equity / P&L", { exact: true }).isVisible(),
    "decoder balance shown and current valuation unavailable",
  );
  assert(
    await p
      .getByText("Public address view only; connecting a wallet", {
        exact: false,
      })
      .isVisible(),
    "query address mode makes no ownership/authentication claim",
  );
  assert(
    rpc.calls.length === 6,
    "one bounded page uses six paired public reads",
  );
  await shot(p, "account-desktop");
  await p
    .getByRole("button", { name: "Check A1 — read only", exact: true })
    .click();
  await p.getByText("A1 CURRENT STATE", { exact: true }).waitFor();
  assert(
    (await p.getByText("Pending", { exact: true }).count()) >= 3,
    "null payout facts remain pending",
  );
  await p.setViewportSize({ width: 390, height: 900 });
  const axe = await new AxeBuilder({ page: p })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .analyze();
  await writeFile(
    root + "/axe.json",
    JSON.stringify(
      {
        violations: axe.violations.map((v) => ({
          id: v.id,
          nodes: v.nodes.map((n) => ({
            target: n.target,
            summary: n.failureSummary,
          })),
        })),
      },
      null,
      2,
    ),
  );
  assert(axe.violations.length === 0, "phone WCAG A/AA checks pass");
  assert(
    await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    "phone account/timeline has no horizontal overflow",
  );
  await shot(p, "account-phone");
  await p.setViewportSize({ width: 320, height: 900 });
  assert(
    await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    "320px account view fits",
  );
  await shot(p, "account-320px");
  await c.close();
  const empty = await open({ counter: "0" }, 390);
  await empty.p
    .getByRole("heading", { name: "No accounts found on this page." })
    .waitFor();
  empty.rpc.counter = "1";
  await empty.p.getByRole("button", { name: "Refresh", exact: true }).click();
  await empty.p
    .getByText("Recorded closed balance B", { exact: true })
    .waitFor();
  assert(true, "new account appears after explicit refreshed counter");
  await empty.p
    .getByLabel("Public wallet address", { exact: true })
    .fill("11111111111111111111111111111111");
  await empty.p
    .getByRole("button", { name: "View address", exact: true })
    .click();
  await empty.p
    .getByRole("heading", { name: "No accounts found on this page." })
    .waitFor();
  assert(
    (await empty.p
      .getByText("Recorded closed balance B", { exact: true })
      .count()) === 0,
    "wallet switch clears old account detail",
  );
  await empty.c.close();
  const wrong = await open({ wrongOwner: true }, 390);
  await wrong.p
    .getByRole("heading", { name: "Could not verify this record." })
    .waitFor();
  assert(
    (await wrong.p
      .getByText("Recorded closed balance B", { exact: true })
      .count()) === 0,
    "wrong owner never appears as normal account",
  );
  await shot(wrong.p, "wrong-owner-phone");
  await wrong.c.close();
  const limited = await browser.newContext({
      viewport: { width: 390, height: 900 },
    }),
    lr = await mockAccountRpc(limited, { status: 429 }),
    lp = await limited.newPage();
  await lp.goto("http://127.0.0.1:5173/my-account?wallet=" + fixture.wallet);
  await lp.getByRole("alert").waitFor();
  await lp.getByRole("button", { name: "Refresh", exact: true }).click();
  assert(
    lr.calls.length === 1,
    "RetryAfter blocks another request/provider instead of bypass",
  );
  await shot(lp, "rpc-limited-phone");
  await limited.close();
  assert(errors.length === 0, "no runtime errors");
} catch (e) {
  failure = String(e);
  throw e;
} finally {
  await writeFile(
    root + "/browser-results.json",
    JSON.stringify(
      {
        status: failure ? "failed" : "passed",
        checks,
        errors,
        screens,
        failure,
        classification: "MOCKED PUBLIC RPC ONLY",
      },
      null,
      2,
    ) + "\n",
  );
  await browser.close();
  console.log(JSON.stringify({ checks: checks.length, errors, failure }));
}
