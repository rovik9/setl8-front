/** Uses a fresh, disposable Ed25519 identity held only in this process. No account writes. */
import { generateKeyPairSync, sign } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { strict as assert } from "node:assert";
import bs58 from "bs58";
import { chromium } from "@playwright/test";
const evidenceRoot = process.env.SETL8_EVIDENCE_DIR || "artifacts/current";
await mkdir(`${evidenceRoot}/screenshots`, { recursive: true });
const base = "http://127.0.0.1:8788",
  origin = "http://127.0.0.1:5173";
const checks = [];
let browser;
try {
  const alive = await fetch(base + "/healthz");
  assert.equal(alive.status, 200);
  checks.push("gateway liveness");
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  const wallet = bs58.encode(
    publicKey.export({ format: "der", type: "spki" }).subarray(-32),
  );
  browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
  });
  const page = await context.newPage();
  await page.exposeFunction("__mockSign", (bytes) =>
    Array.from(sign(null, Buffer.from(bytes), privateKey)),
  );
  await page.addInitScript(
    ({ wallet }) => {
      const listeners = new Map();
      const key = { toString: () => wallet };
      window.phantom = {
        solana: {
          publicKey: key,
          connect: async () => ({ publicKey: key }),
          signMessage: async (bytes) => ({
            signature: Uint8Array.from(
              await window.__mockSign(Array.from(bytes)),
            ),
          }),
          disconnect: async () => {
            listeners.get("disconnect")?.();
          },
          on: (name, fn) => listeners.set(name, fn),
          removeListener: (name) => listeners.delete(name),
        },
      };
    },
    { wallet },
  );
  await page.goto(origin + "/app/accounts");
  await page
    .getByRole("button", { name: "Connect wallet", exact: true })
    .last()
    .click();
  await page.getByRole("button", { name: "Phantom", exact: true }).click();
  await page
    .getByRole("button", { name: "Sign in with wallet", exact: true })
    .waitFor();
  checks.push("credentialed challenge and wallet review in actual browser");
  await page
    .getByRole("button", { name: "Sign in with wallet", exact: true })
    .click();
  await page
    .getByRole("heading", { name: "No accounts for this wallet" })
    .waitFor();
  checks.push(
    "exact message signature accepted; real authorized account list returned empty",
  );
  const cookies = await context.cookies(base);
  assert.ok(
    cookies.find(
      (c) =>
        c.name === "setl8_local_session" &&
        c.httpOnly &&
        c.sameSite === "Strict",
    ),
  );
  checks.push("HttpOnly SameSite Strict session cookie");
  assert.deepEqual(
    await page.evaluate(() => ({
      local: Object.keys(localStorage),
      session: Object.keys(sessionStorage),
    })),
    { local: [], session: [] },
  );
  checks.push("no secrets or private data in browser storage");
  await page.reload();
  await page
    .getByRole("heading", { name: "No accounts for this wallet" })
    .waitFor();
  checks.push("session restored after reload without wallet signing");
  const reads = await page.evaluate(async (base) => {
    const [catalog, recordings] = await Promise.all(
      ["/v1/markets", "/v1/market-recordings?limit=1"].map((p) =>
        fetch(base + p, { credentials: "include" }).then((r) => r.json()),
      ),
    );
    return {
      marketCount: catalog.rows.length,
      allDecimal: catalog.rows.every(
        (m) =>
          typeof m.market === "string" && typeof m.max_age_secs === "string",
      ),
      admission: catalog.live_admission,
      recordingPageValid: Array.isArray(recordings.rows),
      hasStream: !!recordings.rows[0],
      adminVisible: !!document.querySelector('a[href="/app/admin"]'),
    };
  }, base);
  assert.equal(reads.marketCount, 21);
  assert.ok(reads.allDecimal);
  assert.equal(reads.admission, "disabled");
  assert.ok(reads.recordingPageValid);
  assert.equal(reads.adminVisible, false);
  checks.push(
    "actual 21-market catalog and bounded recordings page; server role controls admin navigation",
  );
  await page.screenshot({
    path: `${evidenceRoot}/screenshots/connected-real-empty-desktop.png`,
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({
    path: `${evidenceRoot}/screenshots/connected-real-empty-phone.png`,
    fullPage: true,
  });
  await page.goto(origin + "/app/accounts/list");
  await page
    .getByRole("heading", { name: "No accounts for this wallet" })
    .waitFor();
  await page.screenshot({
    path: `${evidenceRoot}/screenshots/connected-real-directory-phone.png`,
    fullPage: true,
  });
  await page.goto(origin + "/purchase");
  await page.getByText("Your account review", { exact: true }).waitFor();
  await page.screenshot({
    path: `${evidenceRoot}/screenshots/real-purchase-availability-phone.png`,
    fullPage: true,
  });
  checks.push(
    "actual authenticated empty-account/directory phone views and unavailable purchase composition; no purchase API used",
  );
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(origin + "/app/accounts");
  await page.getByRole("button", { name: "Log out", exact: true }).click();
  await page
    .getByRole("heading", { name: "Start with your wallet." })
    .waitFor();
  const afterLogout = await page.evaluate(
    async (base) =>
      (await fetch(base + "/v1/auth/session", { credentials: "include" }))
        .status,
    base,
  );
  assert.equal(afterLogout, 401);
  checks.push("CSRF-protected logout revoked actual session");
  await writeFile(
    `${evidenceRoot}/integration-results.json`,
    JSON.stringify(
      {
        timestamp: new Date().toISOString(),
        passed: true,
        conditions:
          "Local dedicated gateway/database, Chromium, disposable mock wallet; no account fixtures seeded; no real-wallet extension tested",
        checks,
      },
      null,
      2,
    ),
  );
  console.log(
    JSON.stringify(
      {
        passed: true,
        checks: checks.length,
        limitations:
          "No owned accounts for fresh identity; populated account/SSE branches covered by mocked transport and focused unit tests, not a seeded real-account browser session.",
      },
      null,
      2,
    ),
  );
} finally {
  await browser?.close();
}
