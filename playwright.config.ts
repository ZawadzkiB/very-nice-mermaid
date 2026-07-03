import { defineConfig, devices } from "@playwright/test";

/**
 * E2E tests drive the *exported* self-contained HTML file (and the mounted
 * custom element) over file://, so no dev server is needed. Browsers must be
 * installed with `npx playwright install chromium` for these to run.
 */
const isCI = !!process.env.CI;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: isCI,
  // On CI, retry twice to ride out the rare flake and capture a trace on retry;
  // locally, fail fast with no retries.
  retries: isCI ? 2 : 0,
  workers: 1,
  // On CI, also emit an HTML report (with traces) as a debuggable artifact.
  reporter: isCI ? [["list"], ["html", { open: "never" }]] : [["list"]],
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
