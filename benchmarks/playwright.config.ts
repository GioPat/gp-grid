import { defineConfig, devices } from "@playwright/test";
import {
  HEADLESS,
  PLAYWRIGHT_RETRIES,
  PLAYWRIGHT_WORKERS,
  VIEWPORT,
} from "./src/config/benchmark-config";

// Get grid from environment variable, default to all
const targetGrid = process.env.BENCH_GRID || "all";

// Server configs per grid
const serverConfigs: Record<string, { command: string; port: number }> = {
  "gp-grid": { command: "pnpm bench-server:gp-grid", port: 5100 },
  "ag-grid": { command: "pnpm bench-server:ag-grid", port: 5101 },
  "tanstack-table": { command: "pnpm bench-server:tanstack", port: 5102 },
  handsontable: { command: "pnpm bench-server:handsontable", port: 5103 },
  "smart-grid": { command: "pnpm bench-server:smart-grid", port: 5104 },
};

// Only start the server we need, or expect them to be running already
const webServer =
  targetGrid !== "all" && serverConfigs[targetGrid]
    ? [
        {
          command: serverConfigs[targetGrid].command,
          port: serverConfigs[targetGrid].port,
          reuseExistingServer: false,
          timeout: 180_000,
        },
      ]
    : []; // When running all, start servers manually first

export default defineConfig({
  testDir: "./tests",
  // 30 min per test. Handsontable at 1,000,000 rows is slow enough that its
  // sort/filter spec (a dozen operations across 10 iterations) needs more than
  // the previous 15 min. Genuine hangs are still caught by the 30s inner
  // waitFor* guards; this only raises the overall per-test budget.
  timeout: 1_800_000,
  retries: PLAYWRIGHT_RETRIES,
  workers: PLAYWRIGHT_WORKERS,

  reporter: [
    ["list"],
    ["json", { outputFile: "results/playwright-report.json" }],
  ],

  use: {
    headless: HEADLESS,
    viewport: VIEWPORT,

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
