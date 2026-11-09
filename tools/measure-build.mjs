import { chromium } from "@playwright/test";
import { mkdir, stat, readdir, readFile, writeFile } from "node:fs/promises";
import { gzipSync } from "node:zlib";
const evidenceRoot = process.env.SETL8_EVIDENCE_DIR || "artifacts/current";
await mkdir(`${evidenceRoot}/screenshots`, { recursive: true });
const files = await readdir("dist/assets");
const chunks = [];
for (const file of files.filter(
  (f) => f.endsWith(".js") || f.endsWith(".css"),
)) {
  const data = await readFile("dist/assets/" + file);
  chunks.push({ file, bytes: data.length, gzipBytes: gzipSync(data).length });
}
const browser = await chromium.launch();
try {
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1000 },
  });
  await page.addInitScript(() => {
    window.__perf = { shifts: 0, lcp: 0 };
    new PerformanceObserver((list) => {
      for (const e of list.getEntries())
        if (!e.hadRecentInput) window.__perf.shifts += e.value;
    }).observe({ type: "layout-shift", buffered: true });
    new PerformanceObserver((list) => {
      window.__perf.lcp = list.getEntries().at(-1)?.startTime ?? 0;
    }).observe({ type: "largest-contentful-paint", buffered: true });
  });
  await page.goto("http://127.0.0.1:5173/");
  await page
    .getByRole("heading", { name: "Your edge. A bigger stage." })
    .waitFor();
  await page.locator(".landing-terminal").waitFor();
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({
    path: `${evidenceRoot}/screenshots/landing-desktop-viewport.png`,
  });
  const perf = await page.evaluate(() => ({
    lcpMs: window.__perf.lcp,
    cls: window.__perf.shifts,
    navigation: performance.getEntriesByType("navigation").map((n) => ({
      domContentLoadedMs: n.domContentLoadedEventEnd,
      loadMs: n.loadEventEnd,
    })),
    initialResources: performance.getEntriesByType("resource").map((r) => ({
      name: r.name.split("/").pop(),
      bytes: r.encodedBodySize,
    })),
  }));
  await writeFile(
    `${evidenceRoot}/performance.json`,
    JSON.stringify(
      {
        conditions:
          "Single local Chromium run at 1440x1000; Vite development server, warm OS cache, no CPU/network throttling. Directional diagnostics, not a field performance or fps claim.",
        logoBytes: (await stat("public/setl8-logo.png")).size,
        chunks,
        observed: perf,
      },
      null,
      2,
    ),
  );
  console.log(
    JSON.stringify({
      chunks: chunks.length,
      jsGzipBytes: chunks
        .filter((c) => c.file.endsWith(".js"))
        .reduce((n, c) => n + c.gzipBytes, 0),
      chartGzipBytes: chunks.find((c) => /^chart-/.test(c.file))?.gzipBytes,
      lcpMs: perf.lcpMs,
      cls: perf.cls,
    }),
  );
} finally {
  await browser.close();
}
