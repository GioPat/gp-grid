// Memory Usage Benchmark
// Measures heap size and allocation patterns

import { test } from "@playwright/test";
import {
  GRIDS,
  getGridPort,
  type MemoryMetrics,
} from "../src/data/types";
import { ROW_COUNTS } from "../src/data/generate-data";
import {
  getHeapSize,
  forceGC,
  bytesToMB,
  MemoryTracker,
} from "../src/metrics/memory-snapshot";
import { waitForGridReady, waitForDataLoad } from "../src/utils/wait-helpers";
import { performScroll, scrollToTop } from "../src/utils/scroll-helpers";
import { saveResult } from "../src/results/json-reporter";

for (const grid of GRIDS) {
  for (const rowCount of ROW_COUNTS) {
    test(`${grid} memory usage with ${rowCount.toLocaleString()} rows`, async ({
      page,
    }) => {
      const port = getGridPort(grid);

      // Start CDP session
      const client = await page.context().newCDPSession(page);
      await client.send("HeapProfiler.enable");

      // Navigate to empty grid
      await page.goto(`http://localhost:${port}?rows=0`);
      await page.waitForTimeout(1000);

      // Force GC and get baseline
      await forceGC(client);
      const initialHeap = await getHeapSize(client);

      // Load data
      await page.evaluate((count) => {
        window.gridApi.loadData(count);
      }, rowCount);
      await waitForDataLoad(page, rowCount);

      // Force GC and measure after load
      await forceGC(client);
      const afterLoadHeap = await getHeapSize(client);

      // Start memory tracker for scroll test
      const tracker = new MemoryTracker(client);
      await tracker.startTracking(50);

      // Perform intensive scrolling
      for (let i = 0; i < 5; i++) {
        await performScroll(page, { duration: 1000, distance: 20000 });
        await scrollToTop(page);
        await page.waitForTimeout(100);
      }

      const trackingResult = tracker.stopTracking();
      const peakHeap = trackingResult.peak;

      // Force GC and measure after scroll
      await forceGC(client);
      const afterScrollHeap = await getHeapSize(client);

      // Calculate heap growth rate
      const heapGrowthRate =
        (afterLoadHeap - initialHeap) / (rowCount / 1000) / (1024 * 1024);

      // Test memory release by clearing data
      await page.evaluate(() => {
        window.gridApi.clearData();
      });
      await page.waitForTimeout(500);
      await forceGC(client);
      const afterClearHeap = await getHeapSize(client);

      const metrics: MemoryMetrics = {
        initialHeapSizeMB: bytesToMB(initialHeap),
        afterDataLoadHeapSizeMB: bytesToMB(afterLoadHeap),
        afterScrollHeapSizeMB: bytesToMB(afterScrollHeap),
        peakHeapSizeMB: bytesToMB(peakHeap),
        heapGrowthRateMBPer1KRows: Math.round(heapGrowthRate * 1000) / 1000,
        retainedAfterClearMB: bytesToMB(afterClearHeap - initialHeap),
      };

      // Save results
      saveResult("memory", grid, rowCount, metrics);

      console.log(
        `[${grid}] ${rowCount.toLocaleString()} rows - After Load: ${metrics.afterDataLoadHeapSizeMB}MB, Peak: ${metrics.peakHeapSizeMB}MB, Growth: ${metrics.heapGrowthRateMBPer1KRows}MB/1K rows`
      );
    });
  }
}
