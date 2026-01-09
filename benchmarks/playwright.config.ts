import { defineConfig, devices } from "@playwright/test";

// Get grid from environment variable, default to all
const targetGrid = process.env.BENCH_GRID || "all";

// Server configs per grid
const serverConfigs: Record<string, { command: string; port: number }> = {
  "gp-grid": { command: "pnpm dev:gp-grid", port: 5100 },
  "ag-grid": { command: "pnpm dev:ag-grid", port: 5101 },
  "tanstack-table": { command: "pnpm dev:tanstack", port: 5102 },
  handsontable: { command: "pnpm dev:handsontable", port: 5103 },
};

// Only start the server we need, or expect them to be running already
const webServer =
  targetGrid !== "all" && serverConfigs[targetGrid]
    ? [
        {
          command: serverConfigs[targetGrid].command,
          port: serverConfigs[targetGrid].port,
          reuseExistingServer: true,
          timeout: 60_000,
        },
      ]
    : []; // When running all, start servers manually first

export default defineConfig({
  testDir: "./tests",
  timeout: 120_000, // 2 minutes per test (large datasets)
  retries: 1,
  workers: 1, // Sequential for consistent memory measurements

  reporter: [
    ["list"],
    ["json", { outputFile: "results/playwright-report.json" }],
  ],

  use: {
    headless: true,
    viewport: { width: 1280, height: 720 },

    // Chrome-specific settings for CDP access
    channel: "chrome",
    launchOptions: {
      args: [
        "--enable-precise-memory-info",
        "--js-flags=--expose-gc",
        "--disable-background-timer-throttling",
        "--disable-backgrounding-occluded-windows",
        "--disable-renderer-backgrounding",
      ],
    },
  },

  projects: [
    {
      name: "benchmarks",
      use: { ...devices["Desktop Chrome"] },
    },
  ],

  webServer,
});
