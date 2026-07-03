// Scroll Performance Benchmark
// Measures animation-frame pacing during user-like wheel scrolling.

import { expect, test, type Page } from "@playwright/test";
import {
  GRIDS,
  getGridPort,
  type GridType,
  type ScrollMetrics,
} from "../src/data/types";
import {
  getBenchmarkIterations,
  getBenchmarkRowCounts,
} from "../src/config/benchmark-config";
import {
  buildScrollMetrics,
  startFPSSampling,
  stopFPSSampling,
} from "../src/metrics/browser-performance";
import { waitForGridReady } from "../src/utils/wait-helpers";
import { performMeasuredScroll, scrollToTop } from "../src/utils/scroll-helpers";
import { saveResult } from "../src/results/json-reporter";
import { getBrowserVersion } from "../src/utils/benchmark-assertions";

const WARMUP_DURATION = 1000;
const WARMUP_DISTANCE = 5000;
const MEASURE_DURATION = 5000;
const MEASURE_DISTANCE = 50000;
// The scroll comparison is only fair if every grid actually travels a similar
// distance under identical wheel input. Requiring at least this fraction of the
// requested distance guards against a grid whose custom scrollbar swallows or
// rescales wheel events (which would otherwise post an inflated FPS for doing
// far less work).
const MIN_SCROLL_FIDELITY = 0.8;

const measureScroll = async (
  page: Page,
  grid: GridType,
  port: number,
  rowCount: number,
): Promise<ScrollMetrics> => {
  await page.goto(`http://localhost:${port}?rows=${rowCount}`);
  await waitForGridReady(page, rowCount);

  await performMeasuredScroll(page, grid, {
    duration: WARMUP_DURATION,
    distance: WARMUP_DISTANCE,
  });

  await scrollToTop(page);
  await page.evaluate(() => window.gridApi.waitForIdle());

  await startFPSSampling(page);
  const scrollResult = await performMeasuredScroll(page, grid, {
    duration: MEASURE_DURATION,
    distance: MEASURE_DISTANCE,
  });
  const fpsMetrics = await stopFPSSampling(page);

  expect(Math.abs(scrollResult.actualDelta)).toBeGreaterThanOrEqual(
    MEASURE_DISTANCE * MIN_SCROLL_FIDELITY,
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
        samples.push(await measureScroll(page, grid, port, rowCount));
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
