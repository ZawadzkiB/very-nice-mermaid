import { defineConfig, devices } from "@playwright/test";

/**
 * E2E tests drive the *exported* self-contained HTML file (and the mounted
 * custom element) over file://, so no dev server is needed. Browsers must be
 * installed with `npx playwright install chromium` for these to run.
 */
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: 1,
  reporter: [["list"]],
  use: {
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
