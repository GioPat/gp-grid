// Sort/Filter Performance Benchmark
// Measures operation timing and validates exact benchmark results.

import { test, type Page } from "@playwright/test";
import {
  GRIDS,
  getGridPort,
  type FilterCondition,
  type SortFilterMetrics,
  type SortRule,
} from "../src/data/types";
import {
  generateData,
  type BenchmarkRow,
} from "../src/data/generate-data";
import {
  getBenchmarkIterations,
  getBenchmarkRowCounts,
} from "../src/config/benchmark-config";
import {
  processRows,
  type FilterRule,
} from "../src/data/row-processing";
import {
  waitForFilterComplete,
  waitForGridReady,
  waitForSortComplete,
} from "../src/utils/wait-helpers";
import { saveResult } from "../src/results/json-reporter";
import {
  expectDisplayedRowCount,
  expectDisplayedRowIds,
  getBrowserVersion,
} from "../src/utils/benchmark-assertions";

const SAMPLE_SIZE = 50;
const NAME_ASC: SortRule[] = [{ field: "name", direction: "asc" }];
const NAME_DESC: SortRule[] = [{ field: "name", direction: "desc" }];
const MULTI_SORT: SortRule[] = [
  { field: "status", direction: "asc" },
  { field: "salary", direction: "desc" },
];
const TEXT_FILTER: FilterRule = {
  field: "name",
  condition: { type: "contains", value: "Alice" },
};
// Salaries are integers, so the numeric filter boundaries are deliberately
// half-integers. That places every threshold strictly between possible data
// points, making inclusive-vs-exclusive boundary conventions irrelevant: every
// grid selects the identical row set regardless of how it treats range/compare
// endpoints. Integer boundaries would let a single row sitting exactly on an
// endpoint (e.g. salary === 50000) desync a grid's count from the reference by
// one, which the exact-count wait then hangs on.
const NUMBER_FILTER: FilterRule = {
  field: "salary",
  condition: { type: "greaterThan", value: 100000.5 },
};
const BETWEEN_FILTER: FilterRule = {
  field: "salary",
  condition: { type: "between", value: [49999.5, 150000.5] },
};
const STATUS_FILTER: FilterRule = {
  field: "status",
  condition: { type: "equals", value: "active" },
};

interface ExpectedView {
  rowCount: number;
  firstIds: number[];
}

interface SortFilterExpectations {
  original: ExpectedView;
  sortAsc: ExpectedView;
  sortDesc: ExpectedView;
  multiSort: ExpectedView;
  textFilter: ExpectedView;
  numberFilter: ExpectedView;
  betweenFilter: ExpectedView;
  complexFilter: ExpectedView;
}

const summarizeView = (
  rows: BenchmarkRow[],
  filters: FilterRule[],
  sortRules: SortRule[],
): ExpectedView => {
  const processed = processRows(rows, filters, sortRules);
  return {
    rowCount: processed.length,
    firstIds: processed.slice(0, SAMPLE_SIZE).map((row) => row.id),
  };
};

const buildExpectations = (rowCount: number): SortFilterExpectations => {
  const rows = generateData(rowCount);

  return {
    original: summarizeView(rows, [], []),
    sortAsc: summarizeView(rows, [], NAME_ASC),
    sortDesc: summarizeView(rows, [], NAME_DESC),
    multiSort: summarizeView(rows, [], MULTI_SORT),
    textFilter: summarizeView(rows, [TEXT_FILTER], []),
    numberFilter: summarizeView(rows, [NUMBER_FILTER], []),
    betweenFilter: summarizeView(rows, [BETWEEN_FILTER], []),
    complexFilter: summarizeView(rows, [BETWEEN_FILTER, STATUS_FILTER], []),
  };
};

const measureOperation = async (
  operation: () => Promise<void>,
  waitFn: () => Promise<void>,
  verifyFn: () => Promise<void>,
): Promise<number> => {
  const start = Date.now();
  await operation();
  await waitFn();
  const duration = Date.now() - start;
  await verifyFn();
  return duration;
};

const applyFilter = (
  page: Page,
  field: string,
  condition: FilterCondition,
): Promise<void> => {
  return page.evaluate(
    ({ filterField, filterCondition }) =>
      window.gridApi.filter(filterField, filterCondition),
    { filterField: field, filterCondition: condition },
  );
};

const measureSortFilter = async (
  page: Page,
  port: number,
  rowCount: number,
  expected: SortFilterExpectations,
): Promise<SortFilterMetrics> => {
  await page.goto(`http://localhost:${port}?rows=${rowCount}`);
  await waitForGridReady(page, rowCount);
  await expectDisplayedRowIds(page, expected.original.firstIds);

  const sortAscTime = await measureOperation(
    () => page.evaluate(() => window.gridApi.sort("name", "asc")),
    () => waitForSortComplete(page),
    () => expectDisplayedRowIds(page, expected.sortAsc.firstIds),
  );

  const sortDescTime = await measureOperation(
    () => page.evaluate(() => window.gridApi.sort("name", "desc")),
    () => waitForSortComplete(page),
    () => expectDisplayedRowIds(page, expected.sortDesc.firstIds),
  );

  await page.evaluate(() => window.gridApi.clearSort());
  await waitForSortComplete(page);
  await expectDisplayedRowIds(page, expected.original.firstIds);

  const multiColumnSortTime = await measureOperation(
    () => page.evaluate((rules) => window.gridApi.sortMany(rules), MULTI_SORT),
    () => waitForSortComplete(page),
    () => expectDisplayedRowIds(page, expected.multiSort.firstIds),
  );

  await page.evaluate(() => window.gridApi.clearSort());
  await waitForSortComplete(page);
  await expectDisplayedRowIds(page, expected.original.firstIds);

  const textFilterTime = await measureOperation(
    () => applyFilter(page, TEXT_FILTER.field, TEXT_FILTER.condition),
    () => waitForFilterComplete(page, { equals: expected.textFilter.rowCount }),
    async () => {
      await expectDisplayedRowCount(page, expected.textFilter.rowCount);
      await expectDisplayedRowIds(page, expected.textFilter.firstIds);
    },
  );

  await page.evaluate(() => window.gridApi.clearFilters());
  await waitForFilterComplete(page, { equals: rowCount });
  await expectDisplayedRowIds(page, expected.original.firstIds);

  const numberFilterTime = await measureOperation(
    () => applyFilter(page, NUMBER_FILTER.field, NUMBER_FILTER.condition),
    () => waitForFilterComplete(page, { equals: expected.numberFilter.rowCount }),
    async () => {
      await expectDisplayedRowCount(page, expected.numberFilter.rowCount);
      await expectDisplayedRowIds(page, expected.numberFilter.firstIds);
    },
  );

  await page.evaluate(() => window.gridApi.clearFilters());
  await waitForFilterComplete(page, { equals: rowCount });
  await expectDisplayedRowIds(page, expected.original.firstIds);

  const complexFilterStart = Date.now();
  await applyFilter(page, BETWEEN_FILTER.field, BETWEEN_FILTER.condition);
  await waitForFilterComplete(page, { equals: expected.betweenFilter.rowCount });
  await expectDisplayedRowIds(page, expected.betweenFilter.firstIds);
  await applyFilter(page, STATUS_FILTER.field, STATUS_FILTER.condition);
  await waitForFilterComplete(page, { equals: expected.complexFilter.rowCount });
  const complexFilterTime = Date.now() - complexFilterStart;
  await expectDisplayedRowCount(page, expected.complexFilter.rowCount);
  await expectDisplayedRowIds(page, expected.complexFilter.firstIds);

  const clearFilterTime = await measureOperation(
    () => page.evaluate(() => window.gridApi.clearFilters()),
    () => waitForFilterComplete(page, { equals: rowCount }),
    async () => {
      await expectDisplayedRowCount(page, expected.original.rowCount);
      await expectDisplayedRowIds(page, expected.original.firstIds);
    },
  );

  return {
    sortAscTime,
    sortDescTime,
    multiColumnSortTime,
    textFilterTime,
    numberFilterTime,
    complexFilterTime,
    clearFilterTime,
  };
};

for (const grid of GRIDS) {
  for (const rowCount of getBenchmarkRowCounts()) {
    test(`${grid} sort/filter with ${rowCount.toLocaleString()} rows`, async ({
      page,
    }) => {
      const port = getGridPort(grid);
      const expected = buildExpectations(rowCount);
      const samples: SortFilterMetrics[] = [];

      for (let iteration = 0; iteration < getBenchmarkIterations(); iteration++) {
        samples.push(await measureSortFilter(page, port, rowCount, expected));
      }

      const result = saveResult("sort", grid, rowCount, samples, {
        browserVersion: getBrowserVersion(page),
      });

      console.log(
        `[${grid}] ${rowCount.toLocaleString()} rows - median sort asc: ${result.metrics.sortAscTime}ms, median text filter: ${result.metrics.textFilterTime}ms, samples: ${samples.length}`,
      );
    });
  }
}
