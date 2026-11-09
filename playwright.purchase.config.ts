import { defineConfig } from "@playwright/test";
import base from "./playwright.config";
export default defineConfig({
  ...base,
  testMatch: "purchase-consumer.spec.ts",
  use: { ...base.use, baseURL: "http://127.0.0.1:5175" },
  webServer: undefined,
});
