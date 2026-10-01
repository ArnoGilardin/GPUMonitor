import { defineConfig, devices } from "@playwright/test";

// E2E tests expect a development server with the admin/admin account
// (created automatically on an empty database) and some simulated servers:
//   npm run dev  &  npm run simulate -- --servers 4
const PORT = process.env.PORT || "5100";
const baseURL = process.env.E2E_BASE_URL || `http://localhost:${PORT}`;

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    launchOptions: process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : undefined,
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"], headless: true } }],
  webServer: {
    command: "npm run dev",
    url: `${baseURL}/health`,
    reuseExistingServer: true,
    timeout: 120 * 1000,
  },
});
