import { defineConfig, devices } from "@playwright/test";

/**
 * E2E against the production backend serving the built frontend in DEMO mode
 * (no upstream configured), on an isolated localhost port.
 */
export default defineConfig({
  testDir: "./e2e",
  timeout: 60000,
  retries: 0,
  workers: 1,
  reporter: [["list"]],
  use: {
    baseURL: "http://127.0.0.1:4180",
    trace: "off",
  },
  webServer: {
    command: "node ../backend/dist/server.js",
    port: 4180,
    timeout: 30000,
    reuseExistingServer: !process.env.CI,
    env: {
      DASHBOARD_HOST: "127.0.0.1",
      DASHBOARD_PORT: "4180",
      ENABLE_DEMO_MODE: "true",
      LOG_LEVEL: "warn",
      ADMIN_DATA_DIR: "/tmp/rag-console-e2e",
    },
  },
  projects: [
    // Chromium-based mobile emulation (390x844 as required).
    {
      name: "mobile",
      use: {
        ...devices["Pixel 7"],
        viewport: { width: 390, height: 844 },
      },
    },
    // Desktop Chromium (1440x900 as required).
    {
      name: "desktop",
      use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } },
    },
  ],
});