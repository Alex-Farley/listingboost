import { defineConfig } from "@playwright/test";

const PORT = 8788;
const ORIGIN = `http://localhost:${PORT}`;
const STATE = ".wrangler/e2e-state";

/**
 * E2E runs the built app on real workerd (wrangler dev) with local D1, R2 and
 * Queues, against a fresh database per run. Secrets are test-only values.
 */
export default defineConfig({
  testDir: "tests/e2e",
  timeout: 90_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: ORIGIN,
    trace: "retain-on-failure",
    launchOptions: process.env.LB_CHROMIUM_PATH ? { executablePath: process.env.LB_CHROMIUM_PATH } : {},
  },
  webServer: {
    command: [
      `rm -rf ${STATE}`,
      `bunx wrangler d1 migrations apply DB --local --persist-to ${STATE}`,
      `bunx wrangler dev --port ${PORT} --persist-to ${STATE} --var APP_ORIGIN:${ORIGIN} --var MEDIA_SIGNING_SECRET:e2e-only-signing-secret-0123456789abcdef`,
    ].join(" && "),
    url: `${ORIGIN}/api/session`,
    timeout: 120_000,
    reuseExistingServer: false,
    env: { CI: "1" },
  },
});
