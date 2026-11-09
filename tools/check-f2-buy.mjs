/** F2 finite offline browser check. No live wallet/RPC sends or requests. */
import { chromium } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { mkdir, writeFile } from "node:fs/promises";
const root = "artifacts/f2-direct-buy",
  base = "http://127.0.0.1:5173";
await mkdir(root + "/screenshots", { recursive: true });
const browser = await chromium.launch({ headless: true });
const results = {
  scope: "OFFLINE MOCKED WALLET ONLY; zero chain network requests",
  checks: [],
  errors: [],
  blockedExternal: [],
  screenshots: [],
};
function assert(value, label) {
  if (!value) throw Error(label);
  results.checks.push(label);
}
async function context(width = 1440) {
  const c = await browser.newContext({
    viewport: { width, height: 1000 },
    reducedMotion: "reduce",
  });
  await c.route("**/*", async (r) => {
    const u = new URL(r.request().url());
    if (u.origin !== base) {
      results.blockedExternal.push(u.origin + u.pathname);
      return r.abort();
    }
    return r.continue();
  });
  return c;
}
async function pageIn(c, scenario = "happy") {
  const p = await c.newPage();
  p.on("pageerror", (e) => results.errors.push(String(e)));
  await p.goto(
    base + "/artifacts/f2-direct-buy/mock.html?scenario=" + scenario,
  );
  await p
    .getByRole("button", { name: "Connect Offline test wallet", exact: true })
    .waitFor();
  return p;
}
async function connect(p) {
  await p
    .getByRole("button", { name: "Connect Offline test wallet", exact: true })
    .click();
  await p
    .getByRole("button", { name: "Review purchase — read only", exact: true })
    .waitFor({ state: "visible" });
}
async function review(p) {
  await connect(p);
  await p
    .getByRole("button", { name: "Review purchase — read only", exact: true })
    .click();
  await p
    .getByRole("heading", { name: "Your checked review", exact: true })
    .waitFor();
}
async function shot(p, name) {
  const path = root + "/screenshots/" + name + ".png";
  await p.evaluate(() => window.scrollTo(0, 0));
  await p.screenshot({ path, fullPage: true });
  results.screenshots.push(path);
}
try {
  const c = await context(),
    p = await pageIn(c);
  assert(
    (await p.getByRole("radio").count()) === 10,
    "all ten F1 tiers remain available",
  );
  assert(
    await p
      .getByText(
        "Requires signTransaction; signing and sending together is unsupported",
      )
      .isVisible(),
    "send-only wallet is listed as unsupported",
  );
  await review(p);
  assert(
    (await p.getByText("30120000", { exact: true }).count()) === 0,
    "raw micro-units are not mislabeled as displayed test USDC",
  );
  await p.getByText("What will be signed", { exact: true }).click();
  await shot(p, "mock-review-desktop");
  await p
    .getByRole("button", { name: "Approve in mocked wallet", exact: true })
    .click();
  await p
    .getByRole("heading", { name: "Outcome needs checking", exact: true })
    .waitFor();
  assert(
    await p.getByText("Exact signature", { exact: true }).isVisible(),
    "exact signature retained after one mocked send",
  );
  await shot(p, "mock-uncertain-desktop");
  await p
    .getByRole("button", { name: "Check again — read only", exact: true })
    .click();
  await p
    .getByRole("heading", { name: "Purchase origin verified", exact: true })
    .waitFor();
  await shot(p, "mock-verified-desktop");
  assert(
    await p.getByText("Observed actual debit", { exact: true }).isVisible(),
    "finalized mocked receipt shows exact actual debit",
  );
  await p.reload();
  await p
    .getByRole("heading", { name: "Outcome needs checking", exact: true })
    .waitFor();
  assert(
    await p
      .getByRole("button", { name: "Check again — read only", exact: true })
      .isEnabled(),
    "reload retains attempt and allows read-only reconciliation",
  );
  assert(
    (await p
      .getByRole("button", { name: "Review purchase — read only", exact: true })
      .count()) === 0,
    "reload never unlocks another payment",
  );
  await c.close();
  const phone = await context(390),
    m = await pageIn(phone);
  await review(m);
  assert(
    await m.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    "390px layout has no horizontal overflow",
  );
  const audit = await new AxeBuilder({ page: m })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .analyze();
  await writeFile(
    root + "/axe-phone.json",
    JSON.stringify(
      {
        violations: audit.violations.map((v) => ({
          id: v.id,
          impact: v.impact,
          nodes: v.nodes.map((n) => ({
            target: n.target,
            summary: n.failureSummary,
          })),
        })),
      },
      null,
      2,
    ) + "\n",
  );
  assert(
    audit.violations.length === 0,
    "phone review passes WCAG A/AA automated checks",
  );
  await shot(m, "mock-review-phone");
  await m
    .getByRole("button", { name: "Approve in mocked wallet", exact: true })
    .click();
  await m
    .getByRole("heading", { name: "Outcome needs checking", exact: true })
    .waitFor();
  await m
    .getByRole("button", { name: "Check again — read only", exact: true })
    .click();
  await m
    .getByRole("heading", { name: "Purchase origin verified", exact: true })
    .waitFor();
  assert(
    await m.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    "phone finalized recovery fits without horizontal overflow",
  );
  await shot(m, "mock-verified-phone");
  await phone.close();
  for (const scenario of [
    "missing_ata",
    "insufficient_sol",
    "reject",
    "changed_message",
    "lost_send",
    "expiry",
  ]) {
    const c = await context(390),
      p = await pageIn(c, scenario);
    if (["missing_ata", "insufficient_sol"].includes(scenario)) {
      await connect(p);
      await p
        .getByRole("button", {
          name: "Review purchase — read only",
          exact: true,
        })
        .click();
      await p.getByRole("alert").waitFor();
      assert(
        await p
          .getByRole("button", {
            name: "Approve in mocked wallet",
            exact: true,
          })
          .isDisabled(),
        scenario + " blocks approval with a fix",
      );
    } else {
      await review(p);
      await p
        .getByRole("button", { name: "Approve in mocked wallet", exact: true })
        .click();
      await p
        .getByRole("heading", { name: "Outcome needs checking", exact: true })
        .waitFor();
      if (scenario === "lost_send") {
        await p
          .getByRole("button", { name: "Check again — read only", exact: true })
          .click();
        await p
          .getByRole("heading", {
            name: "Purchase origin verified",
            exact: true,
          })
          .waitFor();
        assert(
          true,
          "lost mocked send response recovers from finalized receipt",
        );
      } else if (scenario === "expiry") {
        await p
          .getByRole("button", { name: "Check again — read only", exact: true })
          .click();
        await p
          .getByText(
            "Signature status is missing from at least one provider.",
            { exact: false },
          )
          .waitFor();
        assert(
          (await p
            .getByRole("button", {
              name: "Review purchase — read only",
              exact: true,
            })
            .count()) === 0,
          "missing status/expiry never unlocks repayment",
        );
      } else
        assert(
          await p
            .getByText("Earlier attempt retained", { exact: true })
            .isVisible(),
          scenario + " leaves unresolved attempt locked",
        );
    }
    await shot(p, "mock-" + scenario + "-phone");
    await c.close();
  }
  const c2 = await context(390),
    real = await c2.newPage();
  real.on("pageerror", (e) => results.errors.push(String(e)));
  await real.goto(base + "/buy?tier=9");
  await real
    .getByRole("heading", { name: "Connect, choose, review.", exact: true })
    .waitFor();
  assert(
    (await real.locator("input[type=radio]:checked").inputValue()) === "9",
    "public lazy /buy route preserves query tier",
  );
  assert(
    await real
      .getByText(
        "Wallet approval and sending are disabled pending code review",
        { exact: false },
      )
      .isVisible(),
    "public route keeps real signing and sending disabled",
  );
  assert(
    (await real
      .getByRole("button", { name: "Approve in mocked wallet" })
      .count()) === 0,
    "offline harness is absent from public route",
  );
  await real.evaluate(() => {
    const el = document.createElement("div");
    el.textContent = "MOCKED WALLET - NOT A REAL TRANSACTION";
    el.style.cssText =
      "background:#f3d76c;color:#24200e;text-align:center;font:10px monospace;padding:10px;";
    document.body.prepend(el);
  });
  assert(
    await real.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
    "public phone route fits width",
  );
  await shot(real, "gated-route-phone");
  await real.setViewportSize({ width: 320, height: 900 });
  assert(
    await real.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
    "320px public route fits without horizontal overflow",
  );
  await shot(real, "gated-route-320px");
  await c2.close();
  assert(
    results.blockedExternal.every(
      (u) => !u.includes("solana") && !u.includes("onfinality"),
    ),
    "no chain network request was attempted",
  );
  assert(results.errors.length === 0, "no browser runtime errors");
  results.status = "passed";
} catch (e) {
  results.status = "failed";
  results.failure = String(e);
  throw e;
} finally {
  await writeFile(
    root + "/browser-results.json",
    JSON.stringify(results, null, 2) + "\n",
  );
  await browser.close();
  console.log(
    JSON.stringify({
      status: results.status,
      checks: results.checks.length,
      errors: results.errors,
      failure: results.failure,
      screenshots: results.screenshots.length,
    }),
  );
}
