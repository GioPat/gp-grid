// Row grouping at scale (PRD 008, AC-008-06)
// The scroll measurement of scroll-performance.spec.ts over a low-cardinality
// grouping, fully expanded, plus the DOM the grid keeps mounted while it scrolls.

import * as fs from "fs";
import * as path from "path";
import { expect, test, type Page } from "@playwright/test";
import { getGridPort, type ScrollMetrics } from "../src/data/types";
import {
  getBenchmarkIterations,
  getBenchmarkRowCounts,
  OVERSCAN_ROWS,
  ROW_HEIGHT_PX,
  VIEWPORT,
} from "../src/config/benchmark-config";
import { buildScrollMetrics, startFPSSampling, stopFPSSampling } from "../src/metrics/browser-performance";
import { waitForGridReady } from "../src/utils/wait-helpers";
import { performWheelScroll, scrollToTop } from "../src/utils/scroll-helpers";
import { getRunDir, getRunManifest } from "../src/results/run-context";
import { calculateMedianMetrics, calculateMetricStats } from "../src/results/stats";
import { getBrowserVersion } from "../src/utils/benchmark-assertions";

const WARMUP_DURATION = 1000;
const WARMUP_DISTANCE = 5000;
const MEASURE_DURATION = 5000;
const MEASURE_DISTANCE = 50000;
const MIN_SCROLL_TRAVEL_PX = VIEWPORT.height;
// A full viewport of rows, the overscan on both sides and one partial row at each edge.
const MOUNTED_ROW_BOUND = Math.ceil(VIEWPORT.height / ROW_HEIGHT_PX) + 2 * OVERSCAN_ROWS + 2;

interface RowGroupingMetrics extends ScrollMetrics {
  timeToReadyMs: number;
  viewRows: number;
  groupRows: number;
  mountedRows: number;
  mountedGroupRows: number;
  mountedCells: number;
  mountedNodes: number;
}

interface GroupedGridApi {
  expandAll(): string;
}

const readMounted = (page: Page) => {
  return page.evaluate(() => {
    const container = document.querySelector(".gp-grid-container");
    return {
      role: container?.getAttribute("role") ?? null,
      mountedRows: document.querySelectorAll(".gp-grid-row").length,
      mountedGroupRows: document.querySelectorAll(".gp-grid-row--group, .gp-grid-row--total").length,
      mountedCells: document.querySelectorAll(".gp-grid-row .gp-grid-cell").length,
      mountedNodes: container?.querySelectorAll("*").length ?? 0,
    };
  });
};

const measureGroupedScroll = async (page: Page, port: number, rowCount: number): Promise<RowGroupingMetrics> => {
  const start = Date.now();
  await page.goto(`http://localhost:${port}?rows=${rowCount}&groups=low`);
  await waitForGridReady(page, rowCount);
  const timeToReadyMs = Date.now() - start;

  const viewRows = await page.evaluate(() => window.gridApi.getDisplayedRowCount());
  const expandAll = await page.evaluate(() => (window.gridApi as unknown as GroupedGridApi).expandAll());
  expect(expandAll).toBe("unchanged");
  expect(viewRows).toBeGreaterThan(rowCount);

  await performWheelScroll(page, { duration: WARMUP_DURATION, distance: WARMUP_DISTANCE });
  await scrollToTop(page);
  await page.evaluate(() => window.gridApi.waitForIdle());

  await startFPSSampling(page);
  const scrollResult = await performWheelScroll(page, { duration: MEASURE_DURATION, distance: MEASURE_DISTANCE });
  const fpsMetrics = await stopFPSSampling(page);
  await page.evaluate(() => window.gridApi.waitForIdle());
  const mounted = await readMounted(page);

  expect(Math.abs(scrollResult.actualDelta)).toBeGreaterThanOrEqual(MIN_SCROLL_TRAVEL_PX);
  expect(mounted.role).toBe("treegrid");
  expect(mounted.mountedRows).toBeGreaterThan(0);
  expect(mounted.mountedRows).toBeLessThanOrEqual(MOUNTED_ROW_BOUND);
  expect(await page.evaluate(() => window.gridApi.getDisplayedRowCount())).toBe(viewRows);

  return {
    ...buildScrollMetrics(fpsMetrics, scrollResult.durationMs, scrollResult.actualDelta),
    timeToReadyMs,
    viewRows,
    groupRows: viewRows - rowCount,
    mountedRows: mounted.mountedRows,
    mountedGroupRows: mounted.mountedGroupRows,
    mountedCells: mounted.mountedCells,
    mountedNodes: mounted.mountedNodes,
  };
};

for (const rowCount of getBenchmarkRowCounts()) {
  test(`gp-grid row grouping scroll with ${rowCount.toLocaleString()} rows`, async ({ page }) => {
    const pageErrors: string[] = [];
    page.on("pageerror", (error) => pageErrors.push(error.message));
    const samples: RowGroupingMetrics[] = [];

    for (let iteration = 0; iteration < getBenchmarkIterations(); iteration++) {
      samples.push(await measureGroupedScroll(page, getGridPort("gp-grid"), rowCount));
    }
    expect(pageErrors).toEqual([]);

    const manifest = getRunManifest(getBrowserVersion(page));
    const metrics = calculateMedianMetrics(samples);
    const result = {
      runId: manifest.runId,
      grid: "gp-grid",
      workload: "department x age, sum(salary) and avg(rating), fully expanded, top total row",
      rowCount,
      metrics,
      samples,
      stats: calculateMetricStats(samples),
      iterations: samples.length,
      timestamp: new Date().toISOString(),
    };
    fs.writeFileSync(
      path.join(getRunDir(manifest), `row-grouping-gp-grid-${rowCount}.json`),
      JSON.stringify(result, null, 2),
    );

    console.log(
      `[gp-grid] ${rowCount.toLocaleString()} rows, ${metrics.viewRows.toLocaleString()} view rows - median FPS: ${metrics.avgFPS}, 5% low: ${metrics.low5FPS}, p95 frame: ${metrics.p95FrameTimeMs} ms, mounted rows/cells/nodes: ${metrics.mountedRows}/${metrics.mountedCells}/${metrics.mountedNodes}`,
    );
  });
}
