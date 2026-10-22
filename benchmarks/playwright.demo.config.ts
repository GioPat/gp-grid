// benchmarks/playwright.demo.config.ts
// Demo recordings for gridcast: the same Playwright harness as the conformance
// suite, pointed at the React playground, with video on and a viewport that
// looks good in a social post. One framework only; the videos are about the
// grid, not the binding.
//
// Run:  playwright test --config playwright.demo.config.ts
// Env:  DEMO_PORT (5300), GRIDCAST_CHROMIUM (executable path, optional),
//       GRIDCAST_CHROMIUM_ARGS (space-separated, optional)

import { defineConfig, devices } from "@playwright/test";

const port = Number(process.env.DEMO_PORT ?? 5300);
const executablePath = process.env.GRIDCAST_CHROMIUM;
const extraArgs = (process.env.GRIDCAST_CHROMIUM_ARGS ?? "").split(" ").filter(Boolean);

export const DEMO_VIEWPORT = { width: 1280, height: 720 };

export default defineConfig({
  testDir: "./demo",
  testMatch: /.*\.demo\.ts$/,
  timeout: 180_000,
  retries: 0,
  workers: 1,
  outputDir: "results/demo",
  reporter: [
    ["list"],
    ["json", { outputFile: "results/demo-report.json" }],
  ],
  use: {
    ...devices["Desktop Chrome"],
    headless: true,
    // The system Chrome, as the conformance suite uses: no Playwright-managed download needed.
    ...(executablePath ? {} : { channel: "chrome" }),
    baseURL: `http://127.0.0.1:${port}`,
    viewport: DEMO_VIEWPORT,
    colorScheme: "dark",
    deviceScaleFactor: 1,
    video: { mode: "on", size: DEMO_VIEWPORT },
    launchOptions: {
      ...(executablePath ? { executablePath } : {}),
      args: ["--force-device-scale-factor=1", ...extraArgs],
    },
  },
  projects: [{ name: "react" }],
  webServer: {
    command: "node scripts/demo-server.mjs",
    url: `http://127.0.0.1:${port}`,
    reuseExistingServer: process.env.DEMO_REUSE_SERVER === "true",
    env: { DEMO_PORT: String(port) },
    timeout: 30_000,
  },
});
