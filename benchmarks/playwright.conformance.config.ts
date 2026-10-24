import { defineConfig, devices } from "@playwright/test";

// CONFORMANCE_BROWSER=firefox|webkit runs the suite on that engine (PRD 011 D4,
// the one-off browser pass); the default and CI are the system Chrome.
const BROWSERS = {
  chrome: { ...devices["Desktop Chrome"], channel: "chrome" },
  firefox: { ...devices["Desktop Firefox"] },
  webkit: { ...devices["Desktop Safari"] },
} as const;
const browser = BROWSERS[(process.env.CONFORMANCE_BROWSER ?? "chrome") as keyof typeof BROWSERS] ?? BROWSERS.chrome;

export default defineConfig({
  testDir: "./conformance",
  timeout: 90_000,
  retries: 0,
  workers: 1,
  reporter: [
    ["list"],
    ["json", { outputFile: "results/conformance-report.json" }],
  ],
  use: {
    headless: true,
    viewport: { width: 900, height: 650 },
  },
  projects: [
    { name: "react", use: { ...browser, baseURL: "http://127.0.0.1:5200" } },
    { name: "vue", use: { ...browser, baseURL: "http://127.0.0.1:5201" } },
    { name: "angular", use: { ...browser, baseURL: "http://127.0.0.1:5202" } },
  ],
  webServer: {
    command: "node scripts/conformance-server.mjs",
    url: "http://127.0.0.1:5200",
    reuseExistingServer: process.env.CONFORMANCE_REUSE_SERVERS === "true",
    timeout: 30_000,
  },
});
