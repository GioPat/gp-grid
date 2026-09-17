import { defineConfig, devices } from "@playwright/test";

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
    channel: "chrome",
  },
  projects: [
    { name: "react", use: { ...devices["Desktop Chrome"], baseURL: "http://127.0.0.1:5200" } },
    { name: "vue", use: { ...devices["Desktop Chrome"], baseURL: "http://127.0.0.1:5201" } },
    { name: "angular", use: { ...devices["Desktop Chrome"], baseURL: "http://127.0.0.1:5202" } },
  ],
  webServer: {
    command: "node scripts/conformance-server.mjs",
    url: "http://127.0.0.1:5200",
    reuseExistingServer: process.env.CONFORMANCE_REUSE_SERVERS === "true",
    timeout: 30_000,
  },
});
