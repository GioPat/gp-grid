// Scroll Performance Benchmark
// Measures FPS, frame drops, and scroll latency during continuous scrolling

import { test } from "@playwright/test";
import { GRIDS, getGridPort } from "../src/data/types";
import { ROW_COUNTS } from "../src/data/generate-data";
import { FPSTracker, measureFPSSimple } from "../src/metrics/fps-tracker";
import { waitForGridReady } from "../src/utils/wait-helpers";
import { performScroll, scrollToTop } from "../src/utils/scroll-helpers";
import { saveResult } from "../src/results/json-reporter";

// Test configuration
const WARMUP_DURATION = 1000; // 1 second warmup
const WARMUP_DISTANCE = 5000;
const MEASURE_DURATION = 5000; // 5 seconds measurement
const MEASURE_DISTANCE = 50000;

for (const grid of GRIDS) {
  for (const rowCount of ROW_COUNTS) {
    test(`${grid} scroll performance with ${rowCount.toLocaleString()} rows`, async ({
      page,
    }) => {
      const port = getGridPort(grid);

      // Navigate to grid app with row count
      await page.goto(`http://localhost:${port}?rows=${rowCount}`);

      // Wait for grid to be fully rendered
      await waitForGridReady(page, grid);

      // Start CDP session for precise metrics
      const client = await page.context().newCDPSession(page);

      // Warmup scroll (helps JIT compilation and cache warming)
      await performScroll(page, {
        duration: WARMUP_DURATION,
        distance: WARMUP_DISTANCE,
      });

      // Return to top
      await scrollToTop(page);
      await page.waitForTimeout(500); // Settle

      // Begin actual measurement
      const fpsTracker = new FPSTracker(client);
      await fpsTracker.start();

      // Perform controlled scroll
      const scrollStart = Date.now();
      await performScroll(page, {
        duration: MEASURE_DURATION,
        distance: MEASURE_DISTANCE,
      });
      const scrollLatency = Date.now() - scrollStart;

      // Stop measurement and get metrics
      const cdpMetrics = await fpsTracker.stop();

      // Also get simple FPS measurement for comparison
      await scrollToTop(page);
      await page.waitForTimeout(200);
      const simpleMetrics = await measureFPSSimple(page, 2000);

      // Use the better metrics source
      const metrics = {
        avgFPS: cdpMetrics.avgFPS || simpleMetrics.avgFPS,
        minFPS: cdpMetrics.minFPS || Math.min(...simpleMetrics.samples.slice(0, 100)),
        maxFPS: cdpMetrics.maxFPS || Math.max(...simpleMetrics.samples.slice(0, 100)),
        frameDropCount: cdpMetrics.frameDropCount,
        percentile95FPS: cdpMetrics.percentile95FPS || simpleMetrics.avgFPS * 0.9,
        scrollLatencyMs: scrollLatency,
        totalFrames: cdpMetrics.totalFrames || simpleMetrics.samples.length,
      };

      // Save results
      saveResult("scroll", grid, rowCount, metrics);

      console.log(
        `[${grid}] ${rowCount.toLocaleString()} rows - Avg FPS: ${metrics.avgFPS}, Min: ${metrics.minFPS}, Drops: ${metrics.frameDropCount}`
      );
    });
  }
}

// Single grid test for quick iteration
test.describe("Quick scroll test", () => {
  test.skip(); // Skip by default, enable manually

  test("gp-grid scroll 100k", async ({ page }) => {
    await page.goto("http://localhost:5100?rows=100000");
    await waitForGridReady(page, "gp-grid");

    const metrics = await measureFPSSimple(page, 3000);
    console.log("Quick FPS result:", metrics.avgFPS);
  });
});
