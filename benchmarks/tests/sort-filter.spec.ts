// Sort/Filter Performance Benchmark
// Measures time for sorting and filtering operations

import { test } from "@playwright/test";
import {
  GRIDS,
  getGridPort,
  type SortFilterMetrics,
} from "../src/data/types";
import { ROW_COUNTS } from "../src/data/generate-data";
import { waitForGridReady, waitForSortComplete, waitForFilterComplete } from "../src/utils/wait-helpers";
import { saveResult } from "../src/results/json-reporter";

// Helper to measure operation time
async function measureOperation(
  operation: () => Promise<void>,
  waitFn: () => Promise<void>
): Promise<number> {
  const start = Date.now();
  await operation();
  await waitFn();
  return Date.now() - start;
}

for (const grid of GRIDS) {
  for (const rowCount of ROW_COUNTS) {
    test(`${grid} sort/filter with ${rowCount.toLocaleString()} rows`, async ({
      page,
    }) => {
      const port = getGridPort(grid);

      // Navigate and wait for grid to be ready
      await page.goto(`http://localhost:${port}?rows=${rowCount}`);
      await waitForGridReady(page);

      // Allow grid to fully settle
      await page.waitForTimeout(500);

      // Test Sort Ascending
      const sortAscTime = await measureOperation(
        () => page.evaluate(() => window.gridApi.sort("name", "asc")),
        () => waitForSortComplete(page)
      );

      // Test Sort Descending
      const sortDescTime = await measureOperation(
        () => page.evaluate(() => window.gridApi.sort("name", "desc")),
        () => waitForSortComplete(page)
      );

      // Clear sort before multi-column test
      await page.evaluate(() => window.gridApi.clearSort());
      await page.waitForTimeout(100);

      // Test Multi-column Sort (simulate by sorting twice)
      const multiSortStart = Date.now();
      await page.evaluate(() => window.gridApi.sort("status", "asc"));
      await waitForSortComplete(page);
      await page.evaluate(() => window.gridApi.sort("salary", "desc"));
      await waitForSortComplete(page);
      const multiColumnSortTime = Date.now() - multiSortStart;

      // Clear sort before filter tests
      await page.evaluate(() => window.gridApi.clearSort());
      await page.waitForTimeout(100);

      // Test Text Filter (contains)
      const textFilterTime = await measureOperation(
        () =>
          page.evaluate(() =>
            window.gridApi.filter("name", { type: "contains", value: "Alice" })
          ),
        () => waitForFilterComplete(page, { greaterThan: 0, lessThan: rowCount })
      );

      // Clear filter
      await page.evaluate(() => window.gridApi.clearFilters());
      await waitForFilterComplete(page, { equals: rowCount });

      // Test Number Filter (greaterThan)
      const numberFilterTime = await measureOperation(
        () =>
          page.evaluate(() =>
            window.gridApi.filter("salary", { type: "greaterThan", value: 100000 })
          ),
        () => waitForFilterComplete(page, { greaterThan: 0, lessThan: rowCount })
      );

      // Clear filter
      await page.evaluate(() => window.gridApi.clearFilters());
      await waitForFilterComplete(page, { equals: rowCount });

      // Test Complex Filter (between + additional condition)
      const complexFilterStart = Date.now();
      await page.evaluate(() =>
        window.gridApi.filter("salary", { type: "between", value: [50000, 150000] })
      );
      await waitForFilterComplete(page, { greaterThan: 0, lessThan: rowCount });
      const betweenRowCount = await page.evaluate(
        () => window.gridApi.getDisplayedRowCount(),
      );
      await page.evaluate(() =>
        window.gridApi.filter("status", { type: "equals", value: "active" })
      );
      await waitForFilterComplete(page, {
        greaterThan: 0,
        lessThan: betweenRowCount,
      });
      const complexFilterTime = Date.now() - complexFilterStart;

      // Test Clear Filter
      const clearFilterTime = await measureOperation(
        () => page.evaluate(() => window.gridApi.clearFilters()),
        () => waitForFilterComplete(page, { equals: rowCount })
      );

      const metrics: SortFilterMetrics = {
        sortAscTime,
        sortDescTime,
        multiColumnSortTime,
        textFilterTime,
        numberFilterTime,
        complexFilterTime,
        clearFilterTime,
      };

      // Save results
      saveResult("sort", grid, rowCount, metrics);

      console.log(
        `[${grid}] ${rowCount.toLocaleString()} rows - Sort Asc: ${sortAscTime}ms, Text Filter: ${textFilterTime}ms, Number Filter: ${numberFilterTime}ms`
      );
    });
  }
}
