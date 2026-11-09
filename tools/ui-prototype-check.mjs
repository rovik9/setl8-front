import { expect } from "@playwright/test";
import { writeFile } from "node:fs/promises";
import { launchPrototype } from "./prototype-session.mjs";
import { FRONT, GATEWAY, sha } from "./prototype-core.mjs";
const root = FRONT + "artifacts/ui-refinement/real-prototype-" + Date.now();
const running = await launchPrototype({ headless: true, logRoot: root }),
  { page, context } = running;
const account = running.session.info.account,
  checks = [],
  posts = [],
  errors = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("request", (r) => {
  if (r.url().includes(":8788")) errors.push("Unexpected source request");
  if (
    r.url().startsWith(GATEWAY + `/v1/accounts/${account}/intents`) &&
    r.method() === "POST"
  ) {
    const b = JSON.parse(r.postData());
    posts.push({
      nonce: b.nonce,
      order: b.order,
      body_sha256: sha(r.postData()),
      csrf: !!r.headers()["x-setl8-csrf"],
    });
  }
});
const read = (path) =>
  page.evaluate(
    async ({ path, base }) => {
      const r = await fetch(base + path, { credentials: "include" });
      return { status: r.status, body: await r.json() };
    },
    { path, base: GATEWAY },
  );
async function phase(value) {
  await expect
    .poll(() => page.evaluate(() => window.__SETL8_PROTOTYPE__.info.phase))
    .toBe(value);
}
async function ticket() {
  const t = page.getByRole("tab", { name: "Ticket", exact: true });
  if (await t.isVisible()) await t.click();
}
async function settings() {
  await ticket();
  if (!(await page.locator(".draft-scope").evaluate((el) => el.open)))
    await page.locator(".draft-scope>summary").click();
}
async function prepare(nonce, kind) {
  await settings();
  await page.getByRole("button", { name: kind, exact: true }).click();
  if (kind === "Market")
    await page.getByLabel("Quantity · base units", { exact: true }).fill("1");
  await page
    .getByLabel("Confirm this account for the draft", { exact: true })
    .check();
  await page
    .getByLabel("Development nonce · explicit u32", { exact: true })
    .fill(String(nonce));
  await page
    .getByRole("button", { name: "Use synthetic clock", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Prepare development preview", exact: true })
    .click();
  await page.locator(".exact-order-details>summary").click();
  await page
    .getByLabel("I inspected this exact order and signing message.", {
      exact: true,
    })
    .check();
  await page
    .getByRole("button", {
      name: "Sign inspected synthetic bytes",
      exact: true,
    })
    .click();
  await expect(page.locator(".synthetic-receipt")).toContainText(
    "Exact inspected bytes signed locally",
  );
  await page.locator(".exact-order-details>summary").click();
  await page.locator(".draft-scope>summary").click();
}
async function submit(text) {
  await page
    .getByRole("button", { name: "Submit synthetic intent", exact: true })
    .click();
  await expect(page.locator(".synthetic-receipt")).toContainText(text);
}
async function evaluate(value) {
  await page
    .getByRole("button", {
      name: "Evaluate received synthetic intent",
      exact: true,
    })
    .click();
  await phase(value);
}
try {
  await page.locator(".simulation-banner>summary").click();
  await expect(
    page.getByText(
      "Synthetic local simulation · No funds or deployed trading",
      { exact: true },
    ),
  ).toBeVisible();
  await page.locator(".simulation-banner>summary").click();
  await page
    .getByRole("button", { name: "Connect wallet", exact: true })
    .last()
    .click();
  await expect(
    page.getByRole("button", { name: "Phantom", exact: true }),
  ).toHaveCount(0);
  await page
    .getByRole("button", { name: "Disposable synthetic wallet", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Sign in with wallet", exact: true })
    .click();
  await expect(
    page.getByLabel("Selected account", { exact: true }),
  ).toHaveValue(account);
  const cookies = await context.cookies(GATEWAY);
  expect(
    cookies.some((c) => c.name === "setl8_prototype_session" && c.httpOnly),
  ).toBe(true);
  expect(cookies.some((c) => c.name === "setl8_local_session")).toBe(false);
  checks.push(
    "actual disposable login, distinct cookie, real-wallet choices excluded",
  );
  await expect(page.locator(".market-chart canvas").first()).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Illustrative", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator(".draft-scope")).not.toHaveAttribute("open", "");
  await expect(page.getByText("Account size", { exact: true })).toBeVisible();
  await expect(page.getByText("Initial phase", { exact: true })).toBeVisible();
  await page.screenshot({
    path: root + "/fresh-prototype-desktop.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({
    path: root + "/fresh-prototype-phone-chart.png",
    fullPage: true,
  });
  await ticket();
  await page.screenshot({
    path: root + "/fresh-prototype-phone-ticket.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.getByLabel("Market", { exact: true }).selectOption("0");
  await page.getByRole("tab", { name: "Order", exact: true }).click();
  await settings();
  await page
    .getByRole("button", {
      name: "Stage manufactured open sample",
      exact: true,
    })
    .click();
  await phase("staged-open");
  await prepare(1, "Market");
  await page.screenshot({
    path: root + "/friendly-review-desktop.png",
    fullPage: true,
  });
  await submit("Durable receipt");
  await page
    .getByRole("button", { name: "Retry identical signed intent", exact: true })
    .click();
  await expect(page.locator(".synthetic-receipt")).toContainText(
    "identical retry confirmed",
  );
  expect(posts[0].body_sha256).toBe(posts[1].body_sha256);
  expect(posts.every((p) => p.csrf)).toBe(true);
  checks.push(
    "exact inspected Market, authenticated CSRF receipt, identical signed retry",
  );
  await evaluate("evaluated-open");
  await expect
    .poll(
      async () =>
        (await read(`/v1/accounts/${account}`)).body.evaluator_state?.positions
          ?.length,
    )
    .toBe(1);
  const opened = await read(`/v1/accounts/${account}`),
    openStatus = await read(`/v1/accounts/${account}/intents/1`);
  expect(opened.body.evaluator_state.positions[0].qty).toBe("1000000");
  expect(openStatus.body.state).toBe("executed");
  expect(openStatus.body.complete_outcomes_available).toBe(false);
  await expect(
    page
      .getByRole("region", { name: "Scrollable account table" })
      .getByRole("cell", { name: "1", exact: true }),
  ).toBeVisible();
  checks.push(
    "CLI tick/drain/work, actual persisted position and execution evidence",
  );
  await page.screenshot({ path: root + "/opened-desktop.png", fullPage: true });
  // The controller survives page reload; no old draft or signed body may survive it.
  const postsBeforeReload = posts.length;
  await page.reload();
  await expect
    .poll(() => page.evaluate(() => window.__SETL8_PROTOTYPE__.info.phase))
    .toBe("evaluated-open");
  await expect
    .poll(() => page.evaluate(() => window.__SETL8_PROTOTYPE__.info.clock))
    .toBe("1791813601");
  await page.getByLabel("Market", { exact: true }).selectOption("0");
  await page.getByRole("tab", { name: "Order", exact: true }).click();
  await expect(
    page.getByLabel("Development nonce · explicit u32", { exact: true }),
  ).toHaveValue("");
  await expect(
    page.getByLabel("Quantity · base units", { exact: true }),
  ).toHaveValue("");
  await expect(page.getByLabel("Canonical order hex")).toHaveCount(0);
  await expect(
    page.getByLabel("Confirm this account for the draft", { exact: true }),
  ).not.toBeChecked();
  expect(posts.length).toBe(postsBeforeReload);
  checks.push(
    "reload after open synchronizes authoritative phase/clock read-only, clears draft/signature/nonce and performs no intent POST",
  );
  await page.setViewportSize({ width: 390, height: 844 });
  await settings();
  await page
    .getByRole("button", {
      name: "Stage manufactured close sample",
      exact: true,
    })
    .click();
  await phase("staged-close");
  await prepare(1, "Close");
  await submit("Nonce conflict");
  checks.push(
    "actual differently signed Close reusing nonce rejected with nonce_conflict",
  );
  await prepare(2, "Close");
  await submit("Durable receipt");
  await evaluate("evaluated-close");
  await expect
    .poll(
      async () =>
        (await read(`/v1/accounts/${account}`)).body.evaluator_state?.positions
          ?.length,
    )
    .toBe(0);
  const closed = await read(`/v1/accounts/${account}`),
    closeStatus = await read(`/v1/accounts/${account}/intents/2`),
    journals = await read(`/v1/accounts/${account}/journals?limit=25`);
  expect(closeStatus.body.state).toBe("executed");
  expect(closeStatus.body.chain_finality).toBe("unavailable");
  expect(journals.body.rows.length).toBeGreaterThanOrEqual(2);
  await page
    .getByRole("button", { name: "Check explicit nonce status", exact: true })
    .click();
  await expect(page.locator(".synthetic-receipt")).toContainText(
    "Recorded intent state: executed",
  );
  const accountTab = page.getByRole("tab", { name: "Account", exact: true });
  if (await accountTab.isVisible()) await accountTab.click();
  await page.getByRole("tab", { name: "Evidence", exact: true }).click();
  await expect(
    page.getByText("Journal #" + journals.body.rows[0].journal_seq, {
      exact: true,
    }),
  ).toBeVisible();
  await settings();
  await page
    .getByRole("button", { name: "Check canonical replay", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Check canonical replay", exact: true }),
  ).toBeEnabled();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  ).toBe(true);
  await page.locator(".draft-scope>summary").click();
  await page.getByRole("tab", { name: "Chart", exact: true }).click();
  await page.getByRole("tab", { name: "Ticket", exact: true }).click();
  await expect(page.locator(".synthetic-receipt")).toContainText(
    "Recorded intent state: executed",
  );
  checks.push(
    "phone Chart/Account/Ticket transitions retain signed review and explicit status without re-signing",
  );
  await page.screenshot({ path: root + "/closed-phone.png", fullPage: true });
  checks.push(
    "phone Close, empty persisted positions, two journals, status/replay; finality unavailable",
  );
  expect(
    await page.evaluate(() => [
      Object.keys(localStorage),
      Object.keys(sessionStorage),
    ]),
  ).toEqual([[], []]);
  expect(errors).toEqual([]);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.getByRole("button", { name: "Log out", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Connect wallet", exact: true }).first(),
  ).toBeVisible();
  await expect(page.locator(".synthetic-actions")).toHaveCount(0);
  expect((await read("/v1/auth/session")).status).toBe(401);
  checks.push("logout, no stored secrets/source calls/browser errors");
  await writeFile(
    root + "/results.json",
    JSON.stringify(
      {
        passed: true,
        conditions:
          "Actual synthetic 8790/55450 API, no success interception or backend rebuild/restart. Disposable memory-only key. No source access.",
        checks,
        posts,
        account,
        opened: opened.body,
        openStatus: openStatus.body,
        closed: closed.body,
        closeStatus: closeStatus.body,
        journals: journals.body,
        errors,
      },
      null,
      2,
    ),
  );
  console.log(
    JSON.stringify({
      passed: true,
      checks: checks.length,
      account,
      artifact: root + "/results.json",
    }),
  );
} finally {
  await running.close();
}
