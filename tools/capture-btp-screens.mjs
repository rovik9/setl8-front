/** Reusable BTP shots. Defaults to local render/static proof and explicit mocked account reads. */
import { chromium } from "@playwright/test";
import { readFile, writeFile, mkdir, copyFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { createHash } from "node:crypto";
import { mockAccountRpc, fixture, watermark } from "./f3-mocked-rpc.mjs";
export async function captureControlledTerminal(page, path, info) {
  if (new URL(page.url()).origin !== "http://127.0.0.1:5173")
    throw Error("Controlled local page required");
  const current = await page.evaluate(() => window.__SETL8_PROTOTYPE__?.info);
  if (!current || current.id !== info.id || current.account !== info.account)
    throw Error("Exclusive controller identity mismatch");
  await page.screenshot({ path, fullPage: true });
  return {
    classification: "ACTUAL_LOCAL_SYNTHETIC_EVALUATOR_NOT_DEVNET",
    path,
    account: info.account,
    controller: info.id,
  };
}
export async function captureScreens({ out = "artifacts/btp-screens" } = {}) {
  await mkdir(out, { recursive: true });
  const browser = await chromium.launch({ headless: true }),
    shots = [],
    skipped = [];
  const take = async (page, name, classification) => {
    await page.evaluate(() => scrollTo(0, 0));
    await page.screenshot({ path: out + "/" + name + ".png", fullPage: true });
    shots.push({ path: out + "/" + name + ".png", classification });
  };
  try {
    const context = await browser.newContext({
      viewport: { width: 1440, height: 1000 },
      reducedMotion: "reduce",
    });
    const state = await mockAccountRpc(context),
      page = await context.newPage();
    await page.goto("http://127.0.0.1:5173/");
    await page.getByRole("heading", { level: 1 }).waitFor();
    await page.evaluate(() => document.fonts.ready);
    await take(page, "01-landing", "LOCAL_RENDER_NO_EXECUTION_CLAIM");
    await page.locator("#pricing").scrollIntoViewIfNeeded();
    await page.screenshot({
      path: out + "/02-pricing-ten-sizes.png",
      fullPage: false,
    });
    shots.push({
      path: out + "/02-pricing-ten-sizes.png",
      classification: "LOCAL_RECORDED_EXAMPLE_PRICES",
    });
    for (const [n, source] of [
      ["03-buy-checklist", "gated-route-phone"],
      ["04-buy-review", "mock-review-desktop"],
      ["05-buy-origin", "mock-verified-desktop"],
    ]) {
      const path = out + "/" + n + "-MOCKED-WALLET-NOT-A-REAL-TRANSACTION.png";
      await copyFile(
        "artifacts/f2-direct-buy/screenshots/" + source + ".png",
        path,
      );
      shots.push({
        path,
        classification: "REUSED_F2_MOCKED_WALLET_NOT_REAL_TRANSACTION",
        source: "artifacts/f2-direct-buy/screenshots/" + source + ".png",
      });
    }
    await page.goto(
      "http://127.0.0.1:5173/my-account?wallet=" + fixture.wallet,
    );
    await page
      .getByText("Recorded closed balance B", { exact: true })
      .waitFor();
    await watermark(page);
    await take(
      page,
      "06-my-account-MOCKED-WALLET-NOT-A-REAL-TRANSACTION",
      "MOCKED_PUBLIC_RPC_NOT_CURRENT_CHAIN",
    );
    await page.locator("#recorded-a1").scrollIntoViewIfNeeded();
    await page.screenshot({
      path:
        out +
        "/07-demo-account-timeline-MOCKED-WALLET-NOT-A-REAL-TRANSACTION.png",
      fullPage: true,
    });
    shots.push({
      path:
        out +
        "/07-demo-account-timeline-MOCKED-WALLET-NOT-A-REAL-TRANSACTION.png",
      classification: "UNCHANGED_RECORDED_PROOF_WITH_MOCKED_ACCOUNT_READ",
    });
    await page.goto("http://127.0.0.1:5173/devnet-proof");
    await page.getByRole("heading", { name: "Devnet proof." }).waitFor();
    await take(
      page,
      "08-devnet-proof",
      "STATIC_RECORDED_SOURCE_NOT_FRESH_VERIFICATION",
    );
    skipped.push(
      "09-simulated-terminal: this standalone kit does not attach to a controller or create a fixture. Capture through captureControlledTerminal in the single owned actual synthetic runner; bare /demo/terminal is visual-only.",
    );
    await context.close();
    for (const s of shots)
      s.sha256 = createHash("sha256")
        .update(await readFile(s.path))
        .digest("hex");
    const result = {
      shots,
      skipped,
      mocked_rpc_calls: state.calls,
      external_blocked: state.external,
      no_real_wallet_or_chain_actions: true,
    };
    await writeFile(
      out + "/manifest.json",
      JSON.stringify(result, null, 2) + "\n",
    );
    return result;
  } finally {
    await browser.close();
  }
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const r = await captureScreens();
  console.log(
    JSON.stringify({ screenshots: r.shots.length, skipped: r.skipped }),
  );
}
