import { expect, test } from "@playwright/test";
import { getBenchmarkColumnCounts, getBenchmarkIterations, VIEWPORT } from "../src/config/benchmark-config";
import { BENCHMARK_COLUMNS } from "../src/data/column-definitions";
import type { WideGridMetrics } from "../src/data/types";
import { saveResult } from "../src/results/json-reporter";
import { getBrowserVersion } from "../src/utils/benchmark-assertions";
import { waitForDataLoad } from "../src/utils/wait-helpers";

const ROW_COUNT = 100;

// The app does not override core's default columnOverscan.
const COLUMN_OVERSCAN_PX = 240;
const MIN_COLUMN_WIDTH = Math.min(...BENCHMARK_COLUMNS.map((column) => column.width));
/**
 * Widest column window the viewport plus overscan can admit, letting the range
 * end on a partially visible column. Independent of the column count, which is
 * what keeps 1,000 and 10,000 columns mounting the same bounded set.
 */
const COLUMN_BOUND = Math.ceil((VIEWPORT.width + 2 * COLUMN_OVERSCAN_PX) / MIN_COLUMN_WIDTH) + 1;

for (const columnCount of getBenchmarkColumnCounts()) {
  test(`gp-grid wide layout with ${columnCount.toLocaleString()} columns`, async ({ page }) => {
    const samples: WideGridMetrics[] = [];
    for (const _iteration of Array.from({ length: getBenchmarkIterations() })) {
      const start = Date.now();
      await page.goto(`http://localhost:5100?rows=0&cols=${columnCount}`);
      await page.evaluate((count) => window.gridApi.loadData(count), ROW_COUNT);
      await waitForDataLoad(page, ROW_COUNT);
      const timeToReadyMs = Date.now() - start;
      const setup = await page.evaluate(() => window.gridApi.getSetupMetrics?.());
      if (setup === undefined) {
        throw new Error("gp-grid benchmark did not expose setup metrics.");
      }

      const counts = await page.evaluate(() => {
        const cells = Array.from(document.querySelectorAll(".gp-grid-row .gp-grid-cell"));
        return {
          mountedRows: document.querySelectorAll(".gp-grid-row").length,
          mountedCells: cells.length,
          mountedColumns: new Set(cells.map((cell) => cell.getAttribute("data-cell-col"))).size,
        };
      });
      const horizontalStart = Date.now();
      await page.locator(".gp-grid-rows-wrapper").evaluate((element) => {
        const scroller = element.parentElement?.parentElement;
        scroller?.scrollTo({ left: Math.max(0, (scroller.scrollWidth - scroller.clientWidth) / 2) });
      });
      await page.evaluate(() => window.gridApi.waitForIdle());
      const horizontalScrollMs = Date.now() - horizontalStart;

      expect(counts.mountedRows).toBeGreaterThan(0);
      expect(counts.mountedColumns).toBeLessThanOrEqual(COLUMN_BOUND);
      expect(counts.mountedCells).toBe(counts.mountedRows * counts.mountedColumns);
      samples.push({
        timeToReadyMs,
        dataGenerationMs: Math.round(setup.dataGenerationMs * 10) / 10,
        gridBindToReadyMs: Math.round(setup.bindElapsedMs * 10) / 10,
        mountedRows: counts.mountedRows,
        mountedCells: counts.mountedCells,
        horizontalScrollMs,
      });
    }

    saveResult("wide", "gp-grid", ROW_COUNT, samples, {
      browserVersion: getBrowserVersion(page),
      columnCount,
    });
  });
}
