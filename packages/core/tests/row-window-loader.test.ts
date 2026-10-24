// packages/core/tests/row-window-loader.test.ts
// Slice 2b: C8's noncontiguous paging policy — the required prefix/suffix
// union, optional admission, eviction against the latest set, prefix
// reservations and the flat path's byte-equivalent soft policy.

import { describe, expect, it } from "vitest";
import { createFixedAxis } from "../src/geometry/fixed-axis";
import type { RowRegionLayout } from "../src/geometry/row-regions";
import { RowWindowLoader } from "../src/managers/row-window-loader";
import type {
  ColumnDefinition,
  DataSource,
  DataSourceResponse,
  RowCacheOptions,
} from "../src/types";

interface TestRow {
  id: number;
}

const columns: ColumnDefinition[] = [{ field: "id", cellDataType: "number", width: 80 }];

const settle = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

const rowsBetween = (startRow: number, endRow: number): TestRow[] =>
  Array.from({ length: endRow - startRow }, (_, index) => ({ id: startRow + index }));

interface LoaderMetrics {
  rowCount: number;
  rowHeight: number;
  viewportHeight: number;
  overscan: number;
  frozenCount: number;
  scrollTop: number;
  totalRows: number;
}

interface LoaderHarness {
  loader: RowWindowLoader<TestRow>;
  requests: Array<[number, number]>;
  cachedRows: Map<number, TestRow>;
  metrics: LoaderMetrics;
  resolveBlock: (startRow: number) => Promise<void>;
}

const DEFAULT_METRICS: LoaderMetrics = {
  rowCount: 1_000,
  rowHeight: 10,
  viewportHeight: 100,
  overscan: 0,
  frozenCount: 2,
  scrollTop: 0,
  totalRows: 1_000,
};

const createHarness = (
  cache: RowCacheOptions,
  options: { metrics?: Partial<LoaderMetrics>; manual?: boolean } = {},
): LoaderHarness => {
  const metrics: LoaderMetrics = { ...DEFAULT_METRICS, ...options.metrics };
  const requests: Array<[number, number]> = [];
  const cachedRows = new Map<number, TestRow>();
  const pending = new Map<number, () => void>();
  let totalRows = metrics.totalRows;

  const dataSource: DataSource<TestRow> = {
    loadMode: "paginated",
    query: (request) => {
      requests.push([request.range.startRow, request.range.endRow]);
      const response: DataSourceResponse<TestRow> = {
        rows: rowsBetween(request.range.startRow, request.range.endRow),
        totalRows: metrics.totalRows,
      };
      if (options.manual !== true) return Promise.resolve(response);
      return new Promise<DataSourceResponse<TestRow>>((resolve) => {
        pending.set(request.range.startRow, () => resolve(response));
      });
    },
  };

  // Mirrors the geometry service over the mutable sample.
  const axis = () => createFixedAxis(metrics.rowCount, metrics.rowHeight);
  const frozenExtent = () => axis().getOffset(metrics.frozenCount);
  const suffixWindow = (overscan: number) =>
    axis().getWindow(
      metrics.scrollTop + frozenExtent(),
      Math.max(0, metrics.viewportHeight - frozenExtent()),
      overscan,
    );
  const getPageBudgetInput = () => ({
    axis: axis(),
    viewportHeight: metrics.viewportHeight,
    scrollTop: metrics.scrollTop,
    maxScrollTop: Math.max(0, axis().extent - metrics.viewportHeight),
  });
  const regions = (): RowRegionLayout => ({
    frozenCount: metrics.frozenCount,
    frozenExtent: frozenExtent(),
    suffixViewportHeight: Math.max(0, metrics.viewportHeight - frozenExtent()),
    frozen: {
      requestedCount: metrics.frozenCount,
      effectiveCount: metrics.frozenCount,
      limit: null,
    },
  });

  const loader = new RowWindowLoader<TestRow>(
    {
      getDataSource: () => dataSource,
      getCachedRows: () => cachedRows,
      getTotalRows: () => totalRows,
      setTotalRows: (count) => {
        totalRows = count;
      },
      getSortModel: () => [],
      getFilterModel: () => ({}),
      getColumns: () => columns,
      getPageBudgetInput,
      getLoadContext: () => ({
        ...getPageBudgetInput(),
        visibleWindow: suffixWindow(0),
        overscanWindow: suffixWindow(metrics.overscan),
        regions: regions(),
      }),
    },
    cache,
  );

  return {
    loader,
    requests,
    cachedRows,
    metrics,
    resolveBlock: async (startRow) => {
      const resolve = pending.get(startRow);
      if (resolve === undefined) throw new Error(`No pending request for block ${startRow}`);
      pending.delete(startRow);
      resolve();
      await settle();
    },
  };
};

/** The window the manager would pass for the harness's current sample. */
const currentRange = (harness: LoaderHarness): { startRow: number; endRow: number } => {
  const axis = createFixedAxis(harness.metrics.rowCount, harness.metrics.rowHeight);
  const frozenExtent = axis.getOffset(harness.metrics.frozenCount);
  const window = axis.getWindow(
    harness.metrics.scrollTop + frozenExtent,
    Math.max(0, harness.metrics.viewportHeight - frozenExtent),
    harness.metrics.overscan,
  );
  return { startRow: window.start, endRow: window.end };
};

describe("RowWindowLoader — C8 strict paging", () => {
  it("requests the prefix and the visible suffix blocks, never the gap", async () => {
    const harness = createHarness(
      { pageSize: 100, prefetchPages: 0, maxPages: 3 },
      {
        metrics: {
          rowCount: 1_000_000,
          rowHeight: 8,
          viewportHeight: 320,
          frozenCount: 2,
          scrollTop: 7_199_976,
          totalRows: 1_000_000,
        },
      },
    );

    // Rows 899,999/900,000 straddle block 8999/9000.
    await harness.loader.loadRange(currentRange(harness));
    expect(harness.requests).toEqual([
      [0, 100],
      [899_900, 900_000],
      [900_000, 900_100],
    ]);

    // A further scroll keeps the reserved prefix resident.
    harness.metrics.scrollTop = 7_200_000;
    await harness.loader.loadRange(currentRange(harness));
    expect(harness.requests).toHaveLength(3);
    expect(harness.cachedRows.has(0)).toBe(true);
    expect(harness.cachedRows.has(899_990)).toBe(true);
  });

  it("admits overscan then prefetch, nearest first and never inside the gap", async () => {
    const harness = createHarness(
      { pageSize: 10, prefetchPages: 2, maxPages: 10 },
      { metrics: { viewportHeight: 100, scrollTop: 3_000, frozenCount: 5, overscan: 10 } },
    );

    // Visible rows 305–309 in block 30; block 29 sits in the prefix gap, so
    // only the overscan block 31 and the prefetch block 32 may follow.
    await harness.loader.loadRange(currentRange(harness));
    expect(harness.requests).toEqual([
      [0, 10],
      [300, 310],
      [310, 320],
      [320, 330],
    ]);
  });

  it("evicts unprotected pages before admission and keeps the required union whole", async () => {
    const harness = createHarness(
      { pageSize: 10, prefetchPages: 0, maxPages: 2 },
      { metrics: { viewportHeight: 300, frozenCount: 20, overscan: 10 } },
    );

    await harness.loader.loadRange(currentRange(harness));
    expect(harness.cachedRows.has(20)).toBe(true);

    harness.metrics.scrollTop = 300;
    await harness.loader.loadRange(currentRange(harness));
    expect(harness.cachedRows.has(50)).toBe(true);
    // Block 2 is neither required nor reserved at the new center: it goes first.
    expect(harness.cachedRows.has(20)).toBe(false);
    expect(harness.cachedRows.has(0)).toBe(true);
    // Overscan blocks 4 and 6 are optional, so capacity 3 admits neither.
    expect(harness.requests).not.toContainEqual([40, 50]);
    expect(harness.requests).not.toContainEqual([60, 70]);

    // A union larger than maxPages is still fetched whole.
    const wide = createHarness(
      { pageSize: 10, prefetchPages: 0, maxPages: 1 },
      { metrics: { viewportHeight: 300, scrollTop: 3_000, frozenCount: 20 } },
    );
    await wide.loader.loadRange(currentRange(wide));
    expect(wide.requests).toEqual([[0, 10], [10, 20], [320, 330]]);
  });

  it("keeps reservations across scrolls and releases them on shrink, unfreeze and reset", async () => {
    const harness = createHarness(
      { pageSize: 10, prefetchPages: 0, maxPages: 10 },
      { metrics: { viewportHeight: 400, scrollTop: 3_000, frozenCount: 30 } },
    );

    await harness.loader.loadRange(currentRange(harness));
    expect(harness.requests).toEqual([[0, 10], [10, 20], [20, 30], [330, 340]]);

    // A count shrink leaves block 2 outside the prefix: it is released.
    harness.metrics.frozenCount = 20;
    await harness.loader.loadRange(currentRange(harness));
    expect(harness.cachedRows.has(20)).toBe(false);
    expect(harness.cachedRows.has(0)).toBe(true);

    // Unfreezing releases the rest without re-requesting them.
    const beforeUnfreeze = harness.requests.length;
    harness.metrics.frozenCount = 0;
    await harness.loader.loadRange(currentRange(harness));
    expect(harness.cachedRows.has(0)).toBe(false);
    expect(harness.requests.slice(beforeUnfreeze)).toEqual([[300, 310], [310, 320]]);

    // A reset drops the cache, so the next load re-acquires everything.
    harness.metrics.frozenCount = 30;
    const beforeReset = harness.requests.length;
    await harness.loader.loadRange(currentRange(harness), true);
    expect(harness.requests.slice(beforeReset)).toEqual([
      [0, 10],
      [10, 20],
      [20, 30],
      [330, 340],
    ]);

    // Unfreezing with the old prefix on screen keeps it cached: the flat load
    // requires it, so releasing it must not blank a visible row.
    harness.metrics.frozenCount = 0;
    harness.metrics.scrollTop = 0;
    const beforeTopUnfreeze = harness.requests.length;
    await harness.loader.loadRange(currentRange(harness));
    expect(harness.cachedRows.has(0)).toBe(true);
    expect(harness.requests.slice(beforeTopUnfreeze)).toEqual([[30, 40]]);
  });

  it("discards a late response for a block the latest load no longer admits", async () => {
    const harness = createHarness(
      { pageSize: 10, prefetchPages: 0, maxPages: 5 },
      { metrics: { viewportHeight: 300, frozenCount: 2 }, manual: true },
    );

    const seed = harness.loader.loadRange(currentRange(harness));
    await harness.resolveBlock(0);
    await harness.resolveBlock(10);
    await harness.resolveBlock(20);
    await seed;

    // A (rows 22–49) then B (rows 62–89): both stay pending.
    harness.metrics.scrollTop = 200;
    const first = harness.loader.loadRange(currentRange(harness));
    harness.metrics.scrollTop = 600;
    const second = harness.loader.loadRange(currentRange(harness));

    await harness.resolveBlock(60);
    await harness.resolveBlock(70);
    await harness.resolveBlock(80);
    await second;

    await harness.resolveBlock(30);
    await harness.resolveBlock(40);
    await first;

    expect(harness.cachedRows.has(70)).toBe(true);
    expect(harness.cachedRows.has(30)).toBe(false);
    expect(harness.cachedRows.has(40)).toBe(false);
  });

  it("re-acquires the prefix when the visible suffix is past the known total", async () => {
    const harness = createHarness(
      { pageSize: 10, prefetchPages: 0, maxPages: 1 },
      { metrics: { rowCount: 20, frozenCount: 10, totalRows: 20 } },
    );

    await harness.loader.loadRange(currentRange(harness));
    expect(harness.requests).toEqual([[0, 10]]);

    // Flat eviction drops block 0 while the known total stays.
    harness.metrics.frozenCount = 0;
    harness.metrics.scrollTop = 100;
    await harness.loader.loadRange(currentRange(harness));
    expect(harness.cachedRows.has(0)).toBe(false);

    // The suffix window is empty (clip 0) and the range past the total: the
    // flat block rule would return nothing, the prefix must still load.
    harness.metrics.scrollTop = 0;
    harness.metrics.frozenCount = 10;
    const before = harness.requests.length;
    await harness.loader.loadRange({ startRow: 20, endRow: 20 });
    expect(harness.requests.slice(before)).toEqual([[0, 10]]);
  });
});

describe("RowWindowLoader — flat path", () => {
  it("keeps the flat blocks and evicts the latest set when calls resolve out of order", async () => {
    const harness = createHarness(
      { pageSize: 10, prefetchPages: 0, maxPages: 1 },
      { metrics: { frozenCount: 0 }, manual: true },
    );

    const first = harness.loader.loadRange({ startRow: 0, endRow: 10 });
    harness.metrics.scrollTop = 200;
    const second = harness.loader.loadRange({ startRow: 20, endRow: 30 });
    expect(harness.requests).toEqual([[0, 10], [20, 30]]);

    // The newer call resolves first; the older one's eviction must protect the
    // latest required set rather than reinstating its own.
    await harness.resolveBlock(20);
    await harness.resolveBlock(0);
    await first;
    await second;

    expect(harness.cachedRows.has(20)).toBe(true);
    expect(harness.cachedRows.has(0)).toBe(false);
  });

  it("overflows the cap for a straddling window without thrashing", async () => {
    const harness = createHarness(
      { pageSize: 10, prefetchPages: 0, maxPages: 1 },
      { metrics: { frozenCount: 0, scrollTop: 45 } },
    );

    await harness.loader.loadRange({ startRow: 4, endRow: 15 });
    expect(harness.requests).toEqual([[0, 10], [10, 20]]);
    expect(harness.cachedRows.has(4)).toBe(true);
    expect(harness.cachedRows.has(14)).toBe(true);

    await harness.loader.loadRange({ startRow: 4, endRow: 15 });
    expect(harness.requests).toHaveLength(2);
    expect(harness.cachedRows.has(4)).toBe(true);
  });
});

describe("RowWindowLoader — ranges, budget and stale loads", () => {
  it("skips empty ranges and ranges past the known total", async () => {
    const harness = createHarness(
      { pageSize: 10, prefetchPages: 1, maxPages: 5 },
      { metrics: { frozenCount: 0, rowCount: 20, totalRows: 20 } },
    );

    expect(harness.loader.hasMissingRows({ startRow: 5, endRow: 5 })).toBe(false);
    expect(harness.loader.hasMissingRows({ startRow: 0, endRow: 10 })).toBe(true);
    await harness.loader.loadRange({ startRow: 5, endRow: 5 });
    expect(harness.requests).toEqual([]);

    await harness.loader.loadRange({ startRow: 0, endRow: 10 });
    expect(harness.requests).toEqual([[0, 10], [10, 20]]);
    expect(harness.loader.hasMissingRows({ startRow: 0, endRow: 30 })).toBe(false);
    expect(harness.loader.hasMissingRows({ startRow: 20, endRow: 30 })).toBe(false);

    await harness.loader.loadRange({ startRow: 25, endRow: 30 });
    expect(harness.requests).toHaveLength(2);
  });

  it("reports cache options and the page budget", () => {
    const harness = createHarness({ pageSize: 10, prefetchPages: 0, maxPages: 4 });
    expect(harness.loader.getPageSize()).toBe(10);
    expect(harness.loader.getPageBudget()).toMatchObject({
      viewportHeight: 100,
      scrollTop: 0,
      maxScrollTop: 9_900,
      pageSize: 10,
      maxPages: 4,
    });

    harness.loader.configure({ pageSize: 25, maxPages: 8 });
    expect(harness.loader.getPageSize()).toBe(25);
    expect(harness.loader.getPageBudget()).toMatchObject({ pageSize: 25, maxPages: 8 });
  });

  it.each([
    ["flat", 0],
    ["strict", 2],
  ])("does not apply a %s load that a reset superseded", async (_, frozenCount) => {
    const harness = createHarness(
      { pageSize: 10, prefetchPages: 0, maxPages: 5 },
      { metrics: { frozenCount }, manual: true },
    );

    const stale = harness.loader.loadRange(currentRange(harness));
    harness.loader.reset();
    await harness.resolveBlock(0);

    await expect(stale).resolves.toEqual({ applied: false, loadedBlockCount: 0, totalRowsChanged: false });
    expect(harness.cachedRows.has(0)).toBe(false);
  });
});
