// Explicit remote-only verification: no local server, fake model, deploy or infrastructure changes.
import { defineConfig } from "@playwright/test";

const baseURL = process.env.PRODUCTION_BASE_URL ?? "https://zc-billpay-agent.onrender.com";
if (new URL(baseURL).protocol !== "https:") throw new Error("Production checks require an HTTPS URL");

export default defineConfig({
  testDir: ".",
  testMatch: ["e2e/demo.spec.ts", "production-e2e/*.spec.ts"],
  // The local simulator is intentionally unavailable on the real provider; production voice has its own check.
  grepInvert: /voice read-back: nothing happens until/,
  workers: 1,
  fullyParallel: false,
  retries: 0,
  timeout: 120_000,
  expect: { timeout: 65_000 },
  reporter: [["list"], ["json", { outputFile: process.env.PRODUCTION_REPORT ?? "../../.cache/production-e2e/browser.json" }]],
  outputDir: process.env.PRODUCTION_OUTPUT ?? "../../.cache/production-e2e/browser-output",
  use: {
    baseURL,
    locale: "ar-IQ",
    // The original keyboard-scroll scenario assumes an overflowing log; its mobile/200% case sets its own viewport.
    viewport: { width: 1280, height: 720 },
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
    ...(process.env.PW_CHROMIUM ? { launchOptions: { executablePath: process.env.PW_CHROMIUM } } : {}),
  },
});
