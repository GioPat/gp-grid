// Memory Usage Benchmark
// Measures heap size and allocation patterns.

import { test, type Page } from "@playwright/test";
import {
  GRIDS,
  getGridPort,
  type MemoryMetrics,
} from "../src/data/types";
import {
  getBenchmarkIterations,
  getBenchmarkRowCounts,
} from "../src/config/benchmark-config";
import {
  getHeapSize,
  forceGC,
  bytesToMB,
  MemoryTracker,
} from "../src/metrics/memory-snapshot";
import { waitForDataLoad } from "../src/utils/wait-helpers";
import {
  performProgrammaticScroll,
  scrollToTop,
} from "../src/utils/scroll-helpers";
import { saveResult } from "../src/results/json-reporter";
import { getBrowserVersion } from "../src/utils/benchmark-assertions";

const SCROLL_STRESS_ITERATIONS = 5;

const measureMemory = async (
  page: Page,
  port: number,
  rowCount: number,
): Promise<MemoryMetrics> => {
  const client = await page.context().newCDPSession(page);
  await client.send("HeapProfiler.enable");

  await page.goto(`http://localhost:${port}?rows=0`);
  await waitForDataLoad(page, 0);

  await forceGC(client);
  const initialHeap = await getHeapSize(client);

  await page.evaluate((count) => {
    window.gridApi.loadData(count);
  }, rowCount);
  await waitForDataLoad(page, rowCount);

  await forceGC(client);
  const afterLoadHeap = await getHeapSize(client);

  const tracker = new MemoryTracker(client);
  await tracker.startTracking(50);

  for (const _iteration of Array.from({ length: SCROLL_STRESS_ITERATIONS })) {
    await performProgrammaticScroll(page, { duration: 1000, distance: 20000 });
    await scrollToTop(page);
    await page.evaluate(() => window.gridApi.waitForIdle());
  }

  const trackingResult = tracker.stopTracking();
  const peakHeap = trackingResult.peak;

  await forceGC(client);
  const afterScrollHeap = await getHeapSize(client);

  const heapGrowthRate =
    (afterLoadHeap - initialHeap) / (rowCount / 1000) / (1024 * 1024);

  await page.evaluate(() => {
    window.gridApi.clearData();
  });
  await waitForDataLoad(page, 0);

  // React-based wrappers keep the pre-clear state reachable until the NEXT
  // commit (fiber double buffering and lazily recomputed row-model memos), so
  // measuring right after the clearing render can report the entire dataset as
  // "retained" even though one more render releases it. Force that extra
  // commit — loadData(0) builds a fresh empty dataset — so retainedAfterClearMB
  // reflects what the grid library actually holds onto.
  await page.evaluate(() => {
    window.gridApi.loadData(0);
  });
  await waitForDataLoad(page, 0);

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

  // Detach the per-iteration CDP session so sessions do not accumulate across
  // the (iterations x grids) matrix.
  await client.detach();

  return metrics;
};

for (const grid of GRIDS) {
  for (const rowCount of getBenchmarkRowCounts()) {
    test(`${grid} memory usage with ${rowCount.toLocaleString()} rows`, async ({
      page,
    }) => {
      const port = getGridPort(grid);
      const samples: MemoryMetrics[] = [];

      for (const _iteration of Array.from({ length: getBenchmarkIterations() })) {
        samples.push(await measureMemory(page, port, rowCount));
      }

      const result = saveResult("memory", grid, rowCount, samples, {
        browserVersion: getBrowserVersion(page),
      });

      console.log(
        `[${grid}] ${rowCount.toLocaleString()} rows - median after load: ${result.metrics.afterDataLoadHeapSizeMB}MB, median peak: ${result.metrics.peakHeapSizeMB}MB, samples: ${samples.length}`,
      );
    });
  }
}
