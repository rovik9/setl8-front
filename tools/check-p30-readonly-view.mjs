/** Focused final real-view check after adding checkpoint age; no transaction or populated-account claim. */
import { chromium } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { strict as assert } from "node:assert";
import { verifyP30ServiceReadiness } from "./p30-service-readiness.mjs";
import { previewStatus } from "./p30-readonly-preview.mjs";
import { loginOnlyIdentity } from "./p30-login-only.mjs";
const dir = "artifacts/p30-readonly-live/actual-view-final",
  base = "http://127.0.0.1:8791",
  origin = "http://127.0.0.1:5174";
await mkdir(dir + "/screenshots", { recursive: true });
const readiness = await verifyP30ServiceReadiness(),
  frontend = await previewStatus();
assert.ok(frontend.owned);
const browser = await chromium.launch(),
  context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    reducedMotion: "reduce",
  }),
  page = await context.newPage(),
  requests = [],
  errors = [];
let passed = false;
context.on("request", (r) => {
  if (r.url().startsWith(base)) {
    const path = new URL(r.url()).pathname;
    requests.push({ method: r.method(), path });
    if (
      r.method() === "POST" &&
      !["/v1/auth/challenge", "/v1/auth/login", "/v1/auth/logout"].includes(
        path,
      )
    )
      errors.push("Forbidden transaction-like POST");
  }
});
page.on("pageerror", (e) => errors.push(e.message));
async function api(path, body, csrf) {
  return page.evaluate(
    async ({ base, path, body, csrf }) => {
      const r = await fetch(base + path, {
        method: body === undefined ? "GET" : "POST",
        credentials: "include",
        redirect: "error",
        signal: AbortSignal.timeout(5000),
        headers: {
          ...(body === undefined ? {} : { "Content-Type": "application/json" }),
          ...(csrf ? { "X-Setl8-Csrf": csrf } : {}),
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
      return { status: r.status, value: await r.json() };
    },
    { base, path, body, csrf },
  );
}
try {
  await page.goto(origin + "/p30-live.html");
  const identity = loginOnlyIdentity(),
    challenge = await api("/v1/auth/challenge", { wallet: identity.wallet });
  assert.equal(challenge.status, 200);
  const login = identity.signChallenge(challenge.value);
  assert.equal((await api("/v1/auth/login", login.body)).status, 200);
  await page
    .getByRole("button", { name: "Check sign-in", exact: true })
    .click();
  await page.getByRole("button", { name: "Refresh account records" }).click();
  await page.getByText(/Recorded checkpoint .*ago/).waitFor();
  await page.getByText(/The account search is incomplete/).waitFor();
  const prior = JSON.parse(
    await readFile(
      "artifacts/p30-readonly-live/actual/strict-read-results.json",
      "utf8",
    ),
  );
  const denial = await page.evaluate(async (id) => {
    const { createLiveP30ReadOnlyAdapter } =
      await import("/src/purchase/isolated/live.ts");
    const a = createLiveP30ReadOnlyAdapter(),
      scope = await a.restore();
    try {
      await a.transport.account(scope, id, new AbortController().signal);
      return null;
    } catch (e) {
      return { status: e.status, code: e.code };
    } finally {
      a.dispose();
    }
  }, prior.publicA1DenialTarget);
  assert.deepEqual(denial, { status: 404, code: "record_unavailable" });
  for (const [name, width, height] of [
    ["desktop", 1440, 1000],
    ["phone", 390, 844],
  ]) {
    await page.setViewportSize({ width, height });
    const audit = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
      .analyze();
    assert.deepEqual(audit.violations, []);
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth + 1,
      ),
      false,
    );
    await page.screenshot({
      path: dir + "/screenshots/accounts-" + name + ".png",
      fullPage: true,
    });
  }
  await page.setViewportSize({ width: 320, height: 844 });
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth + 1,
    ),
    false,
  );
  assert.deepEqual(errors, []);
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await page
    .getByRole("button", { name: "Check sign-in", exact: true })
    .waitFor();
  assert.equal((await api("/v1/auth/session")).status, 401);
  passed = true;
  await writeFile(
    dir + "/results.json",
    JSON.stringify(
      {
        purpose:
          "actual final empty/partial read-only page, checkpoint age and detail404 classification",
        passed,
        readiness,
        frontend,
        login: login.evidence,
        recordDenial: denial,
        desktopPhoneAuditsPassed: true,
        phone320Overflow: false,
        populatedAccountChecked: false,
        requests,
        errors,
      },
      null,
      2,
    ) + "\n",
  );
  console.log(
    "Final real read-only page/age/owner-denial checks passed; disposable session revoked.",
  );
} finally {
  try {
    const s = await api("/v1/auth/session");
    if (s.status === 200) await api("/v1/auth/logout", {}, s.value.csrf_token);
  } catch {}
  await context.close();
  await browser.close();
}
