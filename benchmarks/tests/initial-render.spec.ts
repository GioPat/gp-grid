// Initial Render Benchmark
// Measures navigation-to-ready and browser paint metrics with large datasets.

import { test, type Page } from "@playwright/test";
import { GRIDS, getGridPort, type RenderMetrics } from "../src/data/types";
import {
  getBenchmarkIterations,
  getBenchmarkRowCounts,
} from "../src/config/benchmark-config";
import { waitForGridReady } from "../src/utils/wait-helpers";
import { saveResult } from "../src/results/json-reporter";
import {
  getBrowserVersion,
} from "../src/utils/benchmark-assertions";
import {
  getPerformanceMetrics,
  installPerformanceObservers,
} from "../src/metrics/browser-performance";

const measureInitialRender = async (
  page: Page,
  port: number,
  rowCount: number,
): Promise<RenderMetrics> => {
  const navigationStart = Date.now();

  await page.goto(`http://localhost:${port}?rows=${rowCount}`, {
    waitUntil: "domcontentloaded",
  });

  const domContentLoaded = Date.now() - navigationStart;
  await waitForGridReady(page, rowCount);
  const timeToFullRender = Date.now() - navigationStart;

  const paintEntries = await page.evaluate(() => {
    const entries = performance.getEntriesByType("paint");
    return entries.map((entry) => ({
      name: entry.name,
      startTime: entry.startTime,
    }));
  });
  const firstContentfulPaint = paintEntries.find(
    (entry) => entry.name === "first-contentful-paint",
  );
  const performanceMetrics = await getPerformanceMetrics(page);

  return {
    timeToFirstPaint: Math.round(firstContentfulPaint?.startTime ?? 0),
    timeToFullRender,
    domContentLoaded,
    largestContentfulPaint: performanceMetrics.largestContentfulPaint,
    totalBlockingTime: performanceMetrics.totalBlockingTime,
  };
};

for (const grid of GRIDS) {
  for (const rowCount of getBenchmarkRowCounts()) {
    test(`${grid} initial render with ${rowCount.toLocaleString()} rows`, async ({
      page,
    }) => {
      const port = getGridPort(grid);
      const samples: RenderMetrics[] = [];

      await installPerformanceObservers(page);

      for (let iteration = 0; iteration < getBenchmarkIterations(); iteration++) {
        samples.push(await measureInitialRender(page, port, rowCount));
      }

      const result = saveResult("render", grid, rowCount, samples, {
        browserVersion: getBrowserVersion(page),
      });

      console.log(
        `[${grid}] ${rowCount.toLocaleString()} rows - median FCP: ${result.metrics.timeToFirstPaint}ms, median full: ${result.metrics.timeToFullRender}ms, samples: ${samples.length}`,
      );
    });
  }
}
