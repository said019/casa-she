import { defineConfig, devices } from "@playwright/test";
import * as dotenv from "dotenv";

dotenv.config({ path: ".env.test" });

/**
 * Playwright E2E Configuration — Balance Room Pilates
 * Skill: e2e-testing-patterns
 */
export default defineConfig({
  testDir: "./e2e/tests",
  timeout: 45_000,
  expect: {
    timeout: 8_000,
  },
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 2 : undefined,
  reporter: [
    ["list"],
    ["html", { outputFolder: "e2e/reports/html", open: "never" }],
    ["junit", { outputFile: "e2e/reports/results.xml" }],
  ],
  use: {
    baseURL: process.env.BASE_URL ?? "http://localhost:8080",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
    locale: "es-MX",
    timezoneId: "America/Mexico_City",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "mobile",
      use: { ...devices["Pixel 7"] },
    },
  ],
  webServer: {
    command: "npm run preview",
    url: "http://localhost:4173",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
