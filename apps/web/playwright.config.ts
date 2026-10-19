// Browser end-to-end tests of the demo app with the scripted model (no key, no network) and the fake ASR simulator.
//   pnpm --filter @zc/web e2e          (builds, starts on :3200, runs Chromium headless)
// PW_CHROMIUM: path to a preinstalled Chromium (e.g. /opt/pw-browsers/chromium); CI installs Playwright's own.
import { defineConfig } from "@playwright/test";

const PORT = 3200;
export default defineConfig({
  testDir: "e2e",
  timeout: 60_000,
  expect: { timeout: 15_000 },
  fullyParallel: true,
  retries: 0,
  reporter: [["list"]],
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    locale: "ar-IQ",
    ...(process.env.PW_CHROMIUM ? { launchOptions: { executablePath: process.env.PW_CHROMIUM } } : {}),
  },
  webServer: {
    // the same standalone server the Docker image runs (static files copied next to it, as in the Dockerfile)
    command: `next build && cp -r .next/static .next/standalone/apps/web/.next/static && node .next/standalone/apps/web/server.js`,
    url: `http://127.0.0.1:${PORT}/api/health`,
    timeout: 300_000,
    reuseExistingServer: !process.env.CI,
    env: { PORT: String(PORT), HOSTNAME: "127.0.0.1", LLM_PROVIDER: "fake", ASR_PROVIDER: "fake", DEMO_MODE: "1", LLM_CACHE: "0" },
  },
});
