import { defineConfig, devices } from "@playwright/test";
export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  workers: 1,
  reporter: [
    ["list"],
    [
      "json",
      {
        outputFile: `${process.env.SETL8_EVIDENCE_DIR || "artifacts/current"}/browser-results.json`,
      },
    ],
  ],
  outputDir: `${process.env.SETL8_EVIDENCE_DIR || "test-results"}/playwright-results`,
  use: {
    baseURL: "http://127.0.0.1:5173",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "desktop",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1440, height: 1000 },
      },
    },
    {
      name: "phone",
      use: { ...devices["iPhone 13"], defaultBrowserType: "chromium" },
    },
  ],
  webServer: {
    command: "npm run dev:legacy",
    url: "http://127.0.0.1:5173",
    reuseExistingServer: true,
  },
});
