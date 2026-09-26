// packages/core/tests/paginated-row-loader.test.ts
// Slice 2b: the paginated loader's ranges — bootstrap sizing, the range after
// a scroll reset, the flat fallback a C2 cache limit selects, transaction
// refresh re-acquiring the prefix, and C2's prefix predicate.

import { describe, expect, it } from "vitest";
import { createFixedAxis } from "../src/geometry/fixed-axis";
import { createPrefixAxis } from "../src/geometry/prefix-axis";
import type { VirtualAxis } from "../src/geometry/virtual-axis";
import type { RowRegionLayout } from "../src/geometry/row-regions";
import { InstructionBatcher } from "../src/managers/instruction-batcher";
import { PaginatedRowLoader } from "../src/managers/paginated-row-loader";
import { RowIdDiagnostics } from "../src/managers/row-id-diagnostics";
import type {
  ColumnDefinition,
  DataSource,
  RowLoadingOptions,
} from "../src/types";

interface TestRow {
  id: number;
}

const columns: ColumnDefinition[] = [{ field: "id", cellDataType: "number", width: 80 }];

const settle = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

interface LoaderMetrics {
  rowCount: number;
  rowHeight: number;
  viewportHeight: number;
  frozenCount: number;
  scrollTop: number;
}

interface LoaderHarness {
  loader: PaginatedRowLoader<TestRow>;
  requests: Array<[number, number]>;
  cachedRows: Map<number, TestRow>;
  errors: unknown[];
  metrics: LoaderMetrics;
}

const createHarness = (options: {
  rowLoading?: RowLoadingOptions;
  bootstrapRowCount?: number;
  responseTotalRows?: number;
  axis?: () => VirtualAxis;
  metrics?: Partial<LoaderMetrics>;
} = {}): LoaderHarness => {
  const metrics: LoaderMetrics = {
    rowCount: 1_000,
    rowHeight: 10,
    viewportHeight: 100,
    frozenCount: 0,
    scrollTop: 0,
    ...options.metrics,
  };
  const requests: Array<[number, number]> = [];
  const cachedRows = new Map<number, TestRow>();
  const errors: unknown[] = [];
  let totalRows = 0;

  const dataSource: DataSource<TestRow> = {
    loadMode: "paginated",
    query: async (request) => {
      requests.push([request.range.startRow, request.range.endRow]);
      const length = request.range.endRow - request.range.startRow;
      return {
        rows: Array.from({ length }, (_, index) => ({ id: request.range.startRow + index })),
        totalRows: options.responseTotalRows ?? 1_000,
      };
    },
  };

  // Mirrors the geometry service over the mutable sample.
  const axis = () => options.axis?.() ?? createFixedAxis(metrics.rowCount, metrics.rowHeight);
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

  const diagnostics = new RowIdDiagnostics<TestRow>({
    getCachedRows: () => cachedRows,
    getLoadRange: () => loader.getPaginatedLoadRange(true),
  });
  const loader: PaginatedRowLoader<TestRow> = new PaginatedRowLoader<TestRow>({
    getDataSource: () => dataSource,
    rowLoading: options.rowLoading,
    batcher: new InstructionBatcher(),
    getCachedRows: () => cachedRows,
    getTotalRows: () => totalRows,
    setTotalRows: (count) => {
      totalRows = count;
    },
    getSortModel: () => [],
    getFilterModel: () => ({}),
    getColumns: () => columns,
    getRowWindow: () => suffixWindow(0),
    getVisibleRowWindow: () => suffixWindow(0),
    getBootstrapRowCount: () => options.bootstrapRowCount ?? 0,
    getPageBudgetInput,
    getLoadContext: () => ({
      ...getPageBudgetInput(),
      visibleWindow: suffixWindow(0),
      overscanWindow: suffixWindow(0),
      regions: regions(),
    }),
    diagnostics,
    emitDataError: (error) => errors.push(error),
    setDataLoading: () => undefined,
    onRowsLoaded: () => undefined,
  });

  return { loader, requests, cachedRows, errors, metrics };
};

describe("PaginatedRowLoader — ranges", () => {
  it("sizes the first load from the bootstrap estimate while the axis is empty", async () => {
    const harness = createHarness({
      bootstrapRowCount: 42,
      axis: () => createFixedAxis(0, 10),
      rowLoading: { mode: "paginated", cache: { pageSize: 10, prefetchPages: 0, maxPages: 10 } },
    });

    expect(harness.loader.getInitialPaginatedRange()).toEqual({ startRow: 0, endRow: 42 });

    await harness.loader.loadInitial();
    expect(harness.requests).toEqual([
      [0, 10],
      [10, 20],
      [20, 30],
      [30, 40],
      [40, 50],
    ]);
  });

  it("sizes the first range from the topped window after a scroll reset", async () => {
    const harness = createHarness({
      rowLoading: { mode: "paginated", cache: { pageSize: 100, prefetchPages: 0, maxPages: 10 } },
    });

    harness.metrics.scrollTop = 5_000;
    expect(harness.loader.getPaginatedLoadRange(true)).toEqual({ startRow: 500, endRow: 510 });
    expect(harness.loader.getInitialPaginatedRange()).toEqual({ startRow: 0, endRow: 510 });

    harness.metrics.scrollTop = 0;
    expect(harness.loader.getInitialPaginatedRange()).toEqual({ startRow: 0, endRow: 100 });
  });

  it("keeps the flat soft policy when the cache limit resolves the prefix to zero", async () => {
    const harness = createHarness({
      rowLoading: { mode: "paginated", cache: { pageSize: 10, prefetchPages: 0, maxPages: 1 } },
      metrics: { scrollTop: 45, frozenCount: 0 },
    });

    // Rows 4–14 straddle blocks 0 and 1: the flat policy overflows the cap
    // instead of failing or re-fetching in a loop.
    harness.loader.requestVisibleRows();
    await settle();
    expect(harness.requests).toEqual([[0, 10], [10, 20]]);
    expect(harness.errors).toEqual([]);

    harness.loader.requestVisibleRows();
    await settle();
    expect(harness.requests).toHaveLength(2);
    expect(harness.cachedRows.has(4)).toBe(true);
  });

  it("re-acquires the prefix on a transaction refresh and keeps it resident", async () => {
    const harness = createHarness({
      rowLoading: { mode: "paginated", cache: { pageSize: 10, prefetchPages: 0, maxPages: 2 } },
      metrics: { frozenCount: 2, scrollTop: 300 },
    });

    await harness.loader.refreshFromTransaction();
    expect(harness.requests).toEqual([[0, 10], [30, 40]]);
    expect(harness.cachedRows.has(0)).toBe(true);

    // The next scroll must not evict the freshly reserved prefix.
    harness.metrics.scrollTop = 600;
    harness.loader.requestVisibleRows();
    await settle();
    expect(harness.cachedRows.has(0)).toBe(true);
    expect(harness.cachedRows.has(60)).toBe(true);
  });
});

describe("PaginatedRowLoader — C2 prefix predicate", () => {
  it("is undefined while paging is inactive", () => {
    const all = createHarness({ rowLoading: { mode: "all" } });
    expect(all.loader.getPrefixAdmission()).toBeUndefined();

    const paginated = createHarness({
      rowLoading: { mode: "paginated", cache: { pageSize: 10, prefetchPages: 0, maxPages: 3 } },
    });
    const admitsPrefix = paginated.loader.getPrefixAdmission();
    expect(admitsPrefix?.(2)).toBe(true);
    expect(admitsPrefix?.(100)).toBe(false);
  });

  it("is undefined for a non-uniform row axis", () => {
    const sizes = [13, 12, 39, 6, 33, 16, 35, 26];
    const harness = createHarness({
      rowLoading: { mode: "paginated", cache: { pageSize: 2, prefetchPages: 0, maxPages: 3 } },
      axis: () => createPrefixAxis(sizes),
      metrics: { rowCount: sizes.length, rowHeight: 10 },
    });

    expect(harness.loader.getPrefixAdmission()).toBeUndefined();
  });
});
