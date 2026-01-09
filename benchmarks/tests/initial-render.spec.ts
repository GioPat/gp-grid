// Initial Render Benchmark
// Measures time to first paint and full render with large datasets

import { test } from "@playwright/test";
import { GRIDS, getGridPort, type RenderMetrics } from "../src/data/types";
import { ROW_COUNTS } from "../src/data/generate-data";
import { waitForGridReady } from "../src/utils/wait-helpers";
import { saveResult } from "../src/results/json-reporter";

for (const grid of GRIDS) {
  for (const rowCount of ROW_COUNTS) {
    test(`${grid} initial render with ${rowCount.toLocaleString()} rows`, async ({
      page,
    }) => {
      const port = getGridPort(grid);

      // Set up CDP for performance metrics
      const client = await page.context().newCDPSession(page);
      await client.send("Performance.enable");

      // Record start time
      const navigationStart = Date.now();

      // Navigate with data loading
      await page.goto(`http://localhost:${port}?rows=${rowCount}`, {
        waitUntil: "domcontentloaded",
      });

      const domContentLoaded = Date.now() - navigationStart;

      // Inject PerformanceObserver for LCP
      const lcpPromise = page.evaluate(() => {
        return new Promise<number>((resolve) => {
          let lcpTime = 0;

          const observer = new PerformanceObserver((list) => {
            const entries = list.getEntries();
            if (entries.length > 0) {
              const lastEntry = entries[entries.length - 1] as PerformanceEntry & {
                startTime: number;
              };
              lcpTime = lastEntry.startTime;
            }
          });

          observer.observe({ type: "largest-contentful-paint", buffered: true });

          // Resolve after a timeout or when we think rendering is done
          setTimeout(() => {
            observer.disconnect();
            resolve(lcpTime);
          }, 10000);
        });
      });

      // Wait for grid to be ready
      const fullRenderTime = await waitForGridReady(page, grid);

      // Get LCP
      const lcp = await lcpPromise;

      // Get FCP from Performance API
      const paintEntries = await page.evaluate(() => {
        const entries = performance.getEntriesByType("paint");
        return entries.map((e) => ({ name: e.name, startTime: e.startTime }));
      });

      const fcpEntry = paintEntries.find((e) => e.name === "first-contentful-paint");
      const timeToFirstPaint = fcpEntry?.startTime ?? 0;

      // Calculate Total Blocking Time (TBT) approximation
      const longTasks = await page.evaluate(() => {
        return new Promise<number>((resolve) => {
          let tbt = 0;
          const observer = new PerformanceObserver((list) => {
            for (const entry of list.getEntries()) {
              // TBT = sum of (task duration - 50ms) for tasks > 50ms
              if (entry.duration > 50) {
                tbt += entry.duration - 50;
              }
            }
          });

          try {
            observer.observe({ type: "longtask", buffered: true });
          } catch {
            // longtask may not be supported
          }

          setTimeout(() => {
            observer.disconnect();
            resolve(tbt);
          }, 2000);
        });
      });

      const metrics: RenderMetrics = {
        timeToFirstPaint: Math.round(timeToFirstPaint),
        timeToFullRender: fullRenderTime,
        domContentLoaded,
        largestContentfulPaint: Math.round(lcp),
        totalBlockingTime: Math.round(longTasks),
      };

      // Save results
      saveResult("render", grid, rowCount, metrics);

      console.log(
        `[${grid}] ${rowCount.toLocaleString()} rows - FCP: ${metrics.timeToFirstPaint}ms, Full: ${metrics.timeToFullRender}ms, LCP: ${metrics.largestContentfulPaint}ms`
      );
    });
  }
}
