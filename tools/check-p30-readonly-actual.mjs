/** Actual isolated READ/AUTH validation. Fresh login-only keys stay in runner memory; no real key files or transaction signing. */
import { createHash } from "node:crypto";
import { request as httpRequest } from "node:http";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { strict as assert } from "node:assert";
import { loginOnlyIdentity } from "./p30-login-only.mjs";
import { chromium } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { PublicKey, p30Devnet } from "@setl8/p30-sdk";
import { verifyP30ServiceReadiness } from "./p30-service-readiness.mjs";
import { previewStatus } from "./p30-readonly-preview.mjs";
const dir = "artifacts/p30-readonly-live/actual",
  base = "http://127.0.0.1:8791",
  origin = "http://127.0.0.1:5174",
  checks = [],
  requests = [],
  errors = [];
const sha = (b) => createHash("sha256").update(b).digest("hex");
await mkdir(dir + "/screenshots", { recursive: true });
const readiness = await verifyP30ServiceReadiness(),
  front = await previewStatus();
assert.ok(front.owned, "Owned5174 preview required");
await writeFile(
  dir + "/readiness.json",
  JSON.stringify({ readiness, front }, null, 2) + "\n",
);
async function progress(stage) {
  console.log(stage);
  await writeFile(
    dir + "/progress.json",
    JSON.stringify({ stage, at: new Date().toISOString() }, null, 2) + "\n",
  );
}
const browser = await chromium.launch();
let context,
  expiryContext,
  expiryPlan,
  expiryPage,
  mainPage,
  sessionCookie,
  success = false;
async function instrument(ctx) {
  await ctx.route(base + "/**", (r) => {
    const u = new URL(r.request().url()),
      method = r.request().method();
    if (
      method === "POST" &&
      !["/v1/auth/challenge", "/v1/auth/login", "/v1/auth/logout"].includes(
        u.pathname,
      )
    ) {
      errors.push("Forbidden request " + method + u.pathname);
      return r.abort();
    }
    return r.continue();
  });
  ctx.on("response", async (r) => {
    if (!r.url().startsWith(base + "/")) return;
    const h = await r.allHeaders();
    requests.push({
      method: r.request().method(),
      path: new URL(r.url()).pathname,
      status: r.status(),
      allowOrigin: h["access-control-allow-origin"] ?? null,
      allowCredentials: h["access-control-allow-credentials"] ?? null,
      noStore: h["cache-control"] === "no-store",
      nosniff: h["x-content-type-options"] === "nosniff",
    });
  });
}
async function api(page, path, body, csrf) {
  assert.ok(
    /^\/v1\/(auth\/|owned-accounts|purchases|purchase-catalog|status)/.test(
      path,
    ),
  );
  return page.evaluate(
    async ({ base, path, body, csrf }) => {
      const r = await fetch(base + path, {
        method: body === undefined ? "GET" : "POST",
        credentials: "include",
        mode: "cors",
        redirect: "error",
        signal: AbortSignal.timeout(8000),
        headers: {
          ...(body === undefined ? {} : { "Content-Type": "application/json" }),
          ...(csrf ? { "X-Setl8-Csrf": csrf } : {}),
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
      const reader = r.body.getReader();
      let text = "",
        size = 0;
      const d = new TextDecoder("utf-8", { fatal: true });
      try {
        while (true) {
          const c = await reader.read();
          if (c.done) break;
          size += c.value.byteLength;
          if (size > 262144) {
            await reader.cancel();
            throw Error("Response bound");
          }
          text += d.decode(c.value, { stream: true });
        }
        text += d.decode();
      } finally {
        reader.releaseLock();
      }
      return { status: r.status, value: JSON.parse(text) };
    },
    { base, path, body, csrf },
  );
}
async function audit(page, label) {
  const report = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .analyze();
  assert.deepEqual(report.violations, []);
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth + 1,
    ),
    false,
  );
  checks.push({ check: label + " accessibility/layout", passed: true });
}
try {
  await progress(
    "Verified reviewed backend build/processes; beginning actual disposable login-only checks",
  );
  // Start a real120second challenge expiry observation in a separate cookie jar while main checks run.
  expiryContext = await browser.newContext();
  await instrument(expiryContext);
  expiryPage = await expiryContext.newPage();
  await expiryPage.goto(origin + "/p30-live.html");
  const expiryIdentity = loginOnlyIdentity(),
    expChallenge = await api(expiryPage, "/v1/auth/challenge", {
      wallet: expiryIdentity.wallet,
    });
  assert.equal(expChallenge.status, 200);
  expiryPlan = expiryIdentity.signChallenge(expChallenge.value);
  context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    reducedMotion: "reduce",
  });
  await instrument(context);
  mainPage = await context.newPage();
  mainPage.on("pageerror", (e) => errors.push(e.message));
  await mainPage.goto(origin + "/p30-live.html");
  await mainPage
    .getByRole("heading", { name: "Your recorded accounts" })
    .waitFor();
  const unauth = await api(mainPage, "/v1/auth/session");
  assert.equal(unauth.status, 401);
  checks.push({ check: "Actual unauthenticated session401", passed: true });
  const identity = loginOnlyIdentity(),
    challenge = await api(mainPage, "/v1/auth/challenge", {
      wallet: identity.wallet,
    });
  assert.equal(challenge.status, 200);
  const login = identity.signChallenge(challenge.value);
  const before = await context.cookies(base);
  const binding = before.find((c) => c.name === "setl8_p30_login");
  assert.ok(
    binding?.httpOnly && binding.sameSite === "Strict" && binding.path === "/",
  );
  const authenticated = await api(mainPage, "/v1/auth/login", login.body);
  assert.equal(authenticated.status, 200);
  const cookies = await context.cookies(base);
  sessionCookie = cookies.find((c) => c.name === "setl8_p30_session");
  assert.ok(
    sessionCookie?.httpOnly &&
      sessionCookie.sameSite === "Strict" &&
      sessionCookie.path === "/",
  );
  assert.ok(!cookies.some((c) => c.name === "setl8_p30_login"));
  assert.ok(cookies.every((c) => c.name.startsWith("setl8_p30_")));
  checks.push({
    check:
      "Actual exact off-chain login, binding consumption and dedicated HttpOnly/Strict cookies",
    passed: true,
    ...login.evidence,
    cookies: cookies.map(
      ({ name, httpOnly, sameSite, path, secure, expires }) => ({
        name,
        httpOnly,
        sameSite,
        path,
        secure,
        expires,
      }),
    ),
  });
  await mainPage
    .getByRole("button", { name: "Check sign-in", exact: true })
    .click();
  await mainPage
    .getByRole("button", { name: "Refresh account records" })
    .waitFor();
  await mainPage
    .getByRole("button", { name: "Refresh account records" })
    .click();
  await mainPage
    .getByRole("region", { name: "Recorded account list" })
    .waitFor();
  await mainPage
    .getByText("The account search is incomplete.", { exact: false })
    .waitFor();
  const publicReceipt = JSON.parse(
    await readFile(
      "/Users/rovik/Documents/setl8-back/tools/p30-snapshot-adapter/tests/data/public-a1-historical-receipt.json",
      "utf8",
    ),
  );
  const descriptor = JSON.parse(
    await readFile(
      "dependencies/p30/3e33090cf9193fd909f57ed75e10f9e59b9409e3c8a8f6c186272d8ee185f86d/p30-descriptor.json",
      "utf8",
    ),
  );
  const publicA1 = new p30Devnet.Context(descriptor).tradingAccount(
    new PublicKey(publicReceipt.expected.wallet),
    BigInt(publicReceipt.expected.challenge_id),
  )[0];
  const a1hex = Buffer.from(publicA1.toBytes()).toString("hex");
  assert.ok(
    publicReceipt.sources[0].transaction.transaction.message.accountKeys
      .map((k) => (typeof k === "string" ? k : k.pubkey))
      .includes(publicA1.toBase58()),
    "Known public target must belong to the recorded receipt",
  );
  const reads = await mainPage.evaluate(
    async ({ a1hex }) => {
      const { createLiveP30ReadOnlyAdapter } =
        await import("/src/purchase/isolated/live.ts");
      const a = createLiveP30ReadOnlyAdapter(),
        s = await a.restore(),
        sig = () => new AbortController().signal;
      const owned = await a.transport.owned(s, null, sig()),
        purchases = await a.transport.purchases(s, null, sig());
      const failure = async (f) => {
        try {
          await f();
          return null;
        } catch (e) {
          return { status: e.status, code: e.code };
        }
      };
      const accountDenial = await failure(() =>
          a.transport.account(s, a1hex, sig()),
        ),
        catalogDisabled = await failure(() => a.transport.catalog(s, sig())),
        statusDenial = await failure(() =>
          a.transport.status(s, "00".repeat(32), sig()),
        );
      const quoteGate = await failure(() => a.transport.quote(s, {}, sig())),
        attemptGate = await failure(() =>
          a.transport.prepareAttempt(s, {}, sig()),
        );
      a.dispose();
      return {
        wallet: s.wallet,
        epoch: s.sessionEpoch,
        owned,
        purchases,
        accountDenial,
        catalogDisabled,
        statusDenial,
        quoteGate,
        attemptGate,
      };
    },
    { a1hex },
  );
  assert.equal(reads.wallet, identity.wallet);
  assert.equal(reads.owned.rows.length, 0);
  assert.equal(reads.purchases.rows.length, 0);
  assert.equal(reads.owned.coverage.discovery, "partial");
  assert.equal(reads.accountDenial.status, 404);
  assert.equal(reads.statusDenial.status, 404);
  assert.equal(reads.catalogDisabled.status, 503);
  assert.equal(reads.quoteGate.code, "action_gate_disabled");
  assert.equal(reads.attemptGate.code, "action_gate_disabled");
  await writeFile(
    dir + "/strict-read-results.json",
    JSON.stringify({ ...reads, publicA1DenialTarget: a1hex }, null, 2) + "\n",
  );
  checks.push({
    check:
      "Actual strict page DTO/source-to-npm mapping, honest partial empty records, A1 owner404, missing status404, catalogue503 and frontend action gates",
    passed: true,
    populatedDashboardChecked: false,
  });
  await audit(mainPage, "Actual desktop partial-empty accounts");
  await mainPage.screenshot({
    path: dir + "/screenshots/accounts-desktop.png",
    fullPage: true,
  });
  await mainPage.setViewportSize({ width: 390, height: 844 });
  await audit(mainPage, "Actual phone partial-empty accounts");
  await mainPage.screenshot({
    path: dir + "/screenshots/accounts-phone.png",
    fullPage: true,
  });
  await mainPage.setViewportSize({ width: 320, height: 844 });
  assert.equal(
    await mainPage.evaluate(
      () => document.documentElement.scrollWidth > innerWidth + 1,
    ),
    false,
  );
  await mainPage.reload();
  await mainPage
    .getByRole("button", { name: "Check sign-in", exact: true })
    .click();
  await mainPage
    .getByRole("button", { name: "Refresh account records" })
    .waitFor();
  checks.push({
    check:
      "Actual session restore after reload without another login signature",
    passed: true,
  });
  const storage = await mainPage.evaluate(() => ({
    local: Object.keys(localStorage),
    session: Object.keys(sessionStorage),
  }));
  assert.deepEqual(storage, { local: [], session: [] });
  assert.equal((await api(mainPage, "/v1/auth/logout", {})).status, 403);
  assert.equal(
    (await api(mainPage, "/v1/auth/logout", {}, "00".repeat(32))).status,
    403,
  );
  assert.equal((await api(mainPage, "/v1/auth/session")).status, 200);
  checks.push({
    check: "Actual missing/wrong CSRF403 leaves session live",
    passed: true,
  });
  const preflight = await fetch(base + "/v1/auth/logout", {
    method: "OPTIONS",
    headers: {
      Origin: origin,
      "Access-Control-Request-Method": "POST",
      "Access-Control-Request-Headers": "content-type,x-setl8-csrf",
    },
    redirect: "error",
    signal: AbortSignal.timeout(5000),
  });
  assert.equal(preflight.status, 204);
  assert.equal(preflight.headers.get("access-control-allow-origin"), origin);
  assert.equal(
    preflight.headers.get("access-control-allow-credentials"),
    "true",
  );
  const wrongOrigin = await fetch(base + "/v1/auth/session", {
    headers: { Origin: "http://127.0.0.1:5173" },
    redirect: "error",
    signal: AbortSignal.timeout(5000),
  });
  assert.equal(wrongOrigin.status, 403);
  assert.equal(wrongOrigin.headers.get("access-control-allow-origin"), null);
  const wrongHost = await new Promise((done, reject) => {
    const req = httpRequest(
      base + "/v1/auth/session",
      { method: "GET", headers: { Origin: origin, Host: "localhost:8791" } },
      (res) => {
        res.resume();
        res.once("end", () => done(res.statusCode));
      },
    );
    req.setTimeout(5000, () => req.destroy(Error("Host probe timeout")));
    req.once("error", reject);
    req.end();
  });
  assert.equal(wrongHost, 403);
  const deniedPage = await context.newPage();
  await deniedPage.goto("http://127.0.0.1:5173/p30-isolated.html");
  const corsDenied = await deniedPage.evaluate(async (base) => {
    try {
      await fetch(base + "/v1/auth/session", { credentials: "include" });
      return false;
    } catch {
      return true;
    }
  }, base);
  assert.equal(corsDenied, true);
  await deniedPage.close();
  checks.push({
    check:
      "Actual credentialed CORS/preflight, wrong-Origin browser denial and wrong-Host403",
    passed: true,
  });
  // This clock test is frontend expiry only; it is NOT a server session expiry claim.
  const clockPage = await context.newPage();
  await clockPage.clock.install({ time: new Date() });
  await clockPage.goto(origin + "/p30-live.html");
  await clockPage
    .getByRole("button", { name: "Check sign-in", exact: true })
    .click();
  await clockPage
    .getByRole("button", { name: "Refresh account records" })
    .waitFor();
  await clockPage.clock.fastForward(3601000);
  await clockPage
    .getByRole("heading", { name: "Your session has expired" })
    .waitFor();
  await clockPage.close();
  checks.push({
    check:
      "Frontend session expiry/epoch invalidation against actual session DTO (browser clock advanced)",
    passed: true,
    serverSessionExpiryWaited: false,
  });
  await mainPage.getByRole("button", { name: "Sign out", exact: true }).click();
  await mainPage
    .getByRole("button", { name: "Check sign-in", exact: true })
    .waitFor();
  assert.equal((await api(mainPage, "/v1/auth/session")).status, 401);
  const revoked = await fetch(base + "/v1/auth/session", {
    headers: {
      Origin: origin,
      Cookie: `setl8_p30_session=${sessionCookie.value}`,
    },
    redirect: "error",
    signal: AbortSignal.timeout(5000),
  });
  assert.equal(revoked.status, 401);
  assert.ok(
    !(await context.cookies(base)).some((c) => c.name === "setl8_p30_session"),
  );
  checks.push({
    check:
      "Actual valid-CSRF logout, cookie removal and revoked-cookie replay401",
    passed: true,
  });
  await progress(
    "Main actual read/auth checks passed; waiting once for the independent120-second login challenge expiry",
  );
  const until = Number(BigInt(expiryPlan.evidence.expiresUnixS) * 1000n) + 1100;
  while (Date.now() < until)
    await new Promise((r) => setTimeout(r, Math.min(1000, until - Date.now())));
  const expired = await api(expiryPage, "/v1/auth/login", expiryPlan.body);
  assert.equal(expired.status, 401);
  assert.ok(
    !(await expiryContext.cookies(base)).some(
      (c) => c.name === "setl8_p30_session",
    ),
  );
  checks.push({
    check:
      "Actual server login challenge expiry401 after real deadline; no session created",
    passed: true,
    expiryUnixS: expiryPlan.evidence.expiresUnixS,
  });
  assert.deepEqual(errors, []);
  assert.ok(
    requests.some(
      (r) => r.allowOrigin === origin && r.allowCredentials === "true",
    ),
  );
  success = true;
  await progress(
    "Actual isolated read/auth validation complete; disposable sessions revoked, no transaction requests",
  );
} finally {
  // Revoke only disposable sessions from these isolated cookie jars, even after a failed assertion.
  for (const ctx of [context, expiryContext])
    if (ctx) {
      try {
        const pages = ctx.pages(),
          p =
            pages.find((p) => p.url().startsWith(origin)) ??
            (await ctx.newPage());
        if (!p.url().startsWith(origin))
          await p.goto(origin + "/p30-live.html");
        const s = await api(p, "/v1/auth/session");
        if (s.status === 200)
          await api(p, "/v1/auth/logout", {}, s.value.csrf_token);
      } catch {}
      await ctx.close();
    }
  await browser.close();
  await writeFile(
    dir + "/browser-results.json",
    JSON.stringify(
      {
        purpose: "actual isolated HTTP/browser read-auth validation only",
        success,
        readiness,
        frontend: front,
        checks,
        requests,
        errors,
        populatedDashboardChecked: false,
        actualPurchaseChecked: false,
        serverSessionExpiryWaited: false,
        serverLoginChallengeExpiryChecked: success,
        privateKeys:
          "fresh login-only runner memory; never exported/read from files/shipped",
        transactions: 0,
      },
      null,
      2,
    ) + "\n",
  );
}
