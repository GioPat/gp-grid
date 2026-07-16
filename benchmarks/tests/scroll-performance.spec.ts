// Scroll Performance Benchmark
// Measures animation-frame pacing while every grid receives the identical
// user-like wheel input. Grids translate that input into different scroll
// distances (custom scrollbars and dampened wheel handling rescale the
// deltas), which is reported as rows traversed instead of being equalized.

import { expect, test, type Page } from "@playwright/test";
import {
  GRIDS,
  getGridPort,
  type ScrollMetrics,
} from "../src/data/types";
import {
  getBenchmarkIterations,
  getBenchmarkRowCounts,
  VIEWPORT,
} from "../src/config/benchmark-config";
import {
  buildScrollMetrics,
  startFPSSampling,
  stopFPSSampling,
} from "../src/metrics/browser-performance";
import { waitForGridReady } from "../src/utils/wait-helpers";
import { performWheelScroll, scrollToTop } from "../src/utils/scroll-helpers";
import { saveResult } from "../src/results/json-reporter";
import { getBrowserVersion } from "../src/utils/benchmark-assertions";

const WARMUP_DURATION = 1000;
const WARMUP_DISTANCE = 5000;
const MEASURE_DURATION = 5000;
const MEASURE_DISTANCE = 50000;
// Sanity floor, not a fairness guard: the grid must at least respond to wheel
// input by roughly a viewport of content, otherwise the FPS was sampled over a
// grid that effectively did not scroll.
const MIN_SCROLL_TRAVEL_PX = VIEWPORT.height;

const measureScroll = async (
  page: Page,
  port: number,
  rowCount: number,
): Promise<ScrollMetrics> => {
  await page.goto(`http://localhost:${port}?rows=${rowCount}`);
  await waitForGridReady(page, rowCount);

  await performWheelScroll(page, {
    duration: WARMUP_DURATION,
    distance: WARMUP_DISTANCE,
  });

  await scrollToTop(page);
  await page.evaluate(() => window.gridApi.waitForIdle());

  await startFPSSampling(page);
  const scrollResult = await performWheelScroll(page, {
    duration: MEASURE_DURATION,
    distance: MEASURE_DISTANCE,
  });
  const fpsMetrics = await stopFPSSampling(page);

  expect(Math.abs(scrollResult.actualDelta)).toBeGreaterThanOrEqual(
    MIN_SCROLL_TRAVEL_PX,
  );

  return buildScrollMetrics(
    fpsMetrics,
    scrollResult.durationMs,
    scrollResult.actualDelta,
  );
};

for (const grid of GRIDS) {
  for (const rowCount of getBenchmarkRowCounts()) {
    test(`${grid} scroll performance with ${rowCount.toLocaleString()} rows`, async ({
      page,
    }) => {
      const port = getGridPort(grid);
      const samples: ScrollMetrics[] = [];

      for (let iteration = 0; iteration < getBenchmarkIterations(); iteration++) {
        samples.push(await measureScroll(page, port, rowCount));
      }

      const result = saveResult("scroll", grid, rowCount, samples, {
        browserVersion: getBrowserVersion(page),
      });

      console.log(
        `[${grid}] ${rowCount.toLocaleString()} rows - median FPS: ${result.metrics.avgFPS}, p05: ${result.metrics.p05FPS}, samples: ${samples.length}`,
      );
    });
  }
}
