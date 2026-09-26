import { describe, expect, it } from "vitest";
import { createFixedAxis } from "../src/geometry/fixed-axis";
import type { RowRegionLayout } from "../src/geometry/row-regions";
import { InstructionBatcher } from "../src/managers/instruction-batcher";
import {
  RowDataManager,
  type RowDataManagerOptions,
} from "../src/managers/row-data-manager";
import type {
  CellWriteRejectedEvent,
  ColumnDefinition,
  DataSource,
  DataSourceRequest,
  DataSourceResponse,
  GridInstruction,
  RowLoadingOptions,
} from "../src/types";

interface TestRow {
  id: number;
  name: string;
}

const columns: ColumnDefinition[] = [
  { field: "id", cellDataType: "number", width: 80 },
  { field: "name", cellDataType: "text", width: 160 },
];

interface Deferred<T> {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (reason: unknown) => void;
}

const createDeferred = <T>(): Deferred<T> => {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
};

/** Mutable geometry sample the harness windows and paging contexts read. */
interface HarnessMetrics {
  scrollTop: number;
  viewportHeight: number;
  rowHeight: number;
  overscan: number;
  frozenCount: number;
  rowCount: number;
}

interface ManagerHarness {
  manager: RowDataManager<TestRow>;
  instructions: GridInstruction[];
  loadedNotifications: boolean[];
  metrics: HarnessMetrics;
}

const createManager = (
  dataSource: DataSource<TestRow>,
  rowLoading?: RowLoadingOptions,
  overrides: Partial<RowDataManagerOptions<TestRow>> = {},
): ManagerHarness => {
  const batcher = new InstructionBatcher();
  const instructions: GridInstruction[] = [];
  const loadedNotifications: boolean[] = [];
  batcher.subscribe((batch) => instructions.push(...batch));

  // Mirrors the geometry service (rowHeight 20, overscan 0 by default): a
  // frozen count moves the visible window to the suffix and shifts the budget.
  const metrics: HarnessMetrics = {
    scrollTop: 0,
    viewportHeight: 100,
    rowHeight: 20,
    overscan: 0,
    frozenCount: 0,
    rowCount: 100,
  };
  const axis = () => createFixedAxis(metrics.rowCount, metrics.rowHeight);
  const frozenExtent = () => axis().getOffset(metrics.frozenCount);
  const suffixWindow = (overscan: number) =>
    axis().getWindow(
      metrics.scrollTop + frozenExtent(),
      Math.max(0, metrics.viewportHeight - frozenExtent()),
      overscan,
    );
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
  const getPageBudgetInput = () => ({
    axis: axis(),
    viewportHeight: metrics.viewportHeight,
    scrollTop: metrics.scrollTop,
    maxScrollTop: Math.max(0, axis().extent - metrics.viewportHeight),
  });

  const manager = new RowDataManager<TestRow>({
    dataSource,
    rowLoading,
    batcher,
    getColumns: () => columns,
    getSortModel: () => [],
    getFilterModel: () => ({}),
    getRowWindow: () => suffixWindow(metrics.overscan),
    getVisibleRowWindow: () => suffixWindow(0),
    getBootstrapRowCount: () => 0,
    getPageBudgetInput,
    getLoadContext: () => ({
      ...getPageBudgetInput(),
      visibleWindow: suffixWindow(0),
      overscanWindow: suffixWindow(metrics.overscan),
      regions: regions(),
    }),
    onRowsLoaded: (totalRowsChanged) => {
      loadedNotifications.push(totalRowsChanged);
    },
    ...overrides,
  });

  return { manager, instructions, loadedNotifications, metrics };
};

const response = (rows: TestRow[] = []): DataSourceResponse<TestRow> => ({
  rows,
  totalRows: rows.length,
});

const settle = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

const rangesOf = (requests: DataSourceRequest[]): Array<[number, number]> =>
  requests.map((request) => [request.range.startRow, request.range.endRow]);

const rowsBetween = (startRow: number, endRow: number): TestRow[] =>
  Array.from({ length: endRow - startRow }, (_, index) => ({
    id: startRow + index,
    name: `Row ${startRow + index}`,
  }));

/** Always-resolving paginated source that records every requested range. */
const createRecorder = (
  requests: DataSourceRequest[],
  totalRows: number,
): DataSource<TestRow> => ({
  loadMode: "paginated",
  query: async (request) => {
    requests.push(request);
    return {
      rows: rowsBetween(request.range.startRow, request.range.endRow),
      totalRows,
    };
  },
});

describe("RowDataManager", () => {
  it("guards recordless reads and reports an invalid read-only write", async () => {
    const rejections: CellWriteRejectedEvent[] = [];
    let released = false;
    const source: DataSource<TestRow> = {
      writable: false,
      query: async () => ({
        rows: [],
        totalRows: 1,
        access: {
          rowCount: 1,
          getValue: (_row, field) => field === "id" ? 42 : "Ada",
          release: () => {
            released = true;
          },
        },
      }),
    };
    const { manager } = createManager(source, undefined, {
      onWriteRejected: (event) => rejections.push(event),
    });

    await manager.loadInitial();

    expect(manager.getCellValue(0, 9)).toBeNull();
    expect(manager.getCellValue(-1, 0)).toBeNull();
    expect(manager.getFieldValue(1, "id")).toBeNull();
    expect(manager.getRowId(0)).toBeUndefined();
    manager.setCellValue(0, 9, "ignored");
    expect(rejections).toEqual([{
      row: 0,
      col: 9,
      field: "",
      reason: "read-only-source",
      operation: "setCellValue",
    }]);
    manager.setDataSource({ query: async () => response() });
    expect(released).toBe(true);
  });

  it("ignores stale full-load success and failure results", async () => {
    const staleSuccess = createDeferred<DataSourceResponse<TestRow>>();
    const successHarness = createManager({ query: () => staleSuccess.promise });
    const successLoad = successHarness.manager.loadInitial();
    successHarness.manager.setDataSource({ query: async () => response() });
    staleSuccess.resolve(response([{ id: 1, name: "stale" }]));
    await successLoad;

    expect(successHarness.manager.getTotalRows()).toBe(0);
    expect(successHarness.instructions.some(({ type }) => type === "DATA_LOADED"))
      .toBe(false);

    const staleFailure = createDeferred<DataSourceResponse<TestRow>>();
    const failureHarness = createManager({ query: () => staleFailure.promise });
    const failureLoad = failureHarness.manager.loadInitial();
    failureHarness.manager.setDataSource({ query: async () => response() });
    staleFailure.reject(new Error("stale failure"));
    await failureLoad;

    expect(failureHarness.instructions.some(({ type }) => type === "DATA_ERROR"))
      .toBe(false);
  });

  it("discards a paginated result after its cache generation changes", async () => {
    const pending = createDeferred<DataSourceResponse<TestRow>>();
    const { manager, instructions, loadedNotifications } = createManager(
      { loadMode: "paginated", query: () => pending.promise },
      { cache: { pageSize: 10, prefetchPages: 0, maxPages: 2 } },
    );
    const load = manager.loadInitial();
    manager.setDataSource({ query: async () => response() });
    pending.resolve(response([{ id: 1, name: "stale" }]));
    await load;

    expect(instructions.some(({ type }) => type === "DATA_LOADED")).toBe(false);
    expect(loadedNotifications).toEqual([]);
    expect(manager.isLoading()).toBe(false);
  });

  it("emits paginated failures including non-Error values", async () => {
    const { manager, instructions } = createManager({
      loadMode: "paginated",
      query: async () => {
        throw "offline";
      },
    });

    await manager.loadInitial();

    expect(instructions).toContainEqual({ type: "DATA_ERROR", error: "offline" });
    expect(manager.isLoading()).toBe(false);
  });

  it("honors explicit loading modes", async () => {
    const paginatedRequests: DataSourceRequest[] = [];
    const paginated = createManager(
      {
        loadMode: "all",
        query: async (request) => {
          paginatedRequests.push(request);
          return response();
        },
      },
      { mode: "paginated", cache: { pageSize: 10, prefetchPages: 0 } },
    );
    await paginated.manager.loadInitial();

    const allRequests: DataSourceRequest[] = [];
    const all = createManager(
      {
        loadMode: "paginated",
        query: async (request) => {
          allRequests.push(request);
          return response();
        },
      },
      { mode: "all" },
    );
    await all.manager.loadInitial();

    expect(paginatedRequests[0]?.range).toEqual({ startRow: 0, endRow: 10 });
    expect(allRequests[0]?.range).toEqual({
      startRow: 0,
      endRow: Number.MAX_SAFE_INTEGER,
    });
  });

  it("does not request an empty visible range", () => {
    let queryCount = 0;
    const { manager } = createManager(
      {
        loadMode: "paginated",
        query: async () => {
          queryCount += 1;
          return response();
        },
      },
      undefined,
      { getVisibleRowWindow: () => ({ start: 50, end: 55 }), getRowWindow: () => ({ start: 50, end: 55 }) },
    );
    manager.setTotalRows(5);

    manager.requestVisibleRows();

    expect(queryCount).toBe(0);
  });
});

describe("RowDataManager — C8 paging", () => {
  it("emits no loading overlay for a frozen-only miss", async () => {
    const requests: DataSourceRequest[] = [];
    const { manager, instructions, metrics } = createManager(
      createRecorder(requests, 1_000),
      { cache: { pageSize: 5, prefetchPages: 0, maxPages: 10 } },
    );
    metrics.rowCount = 1_000;
    metrics.viewportHeight = 500;

    await manager.loadInitial();
    metrics.scrollTop = 1_000;
    manager.requestVisibleRows();
    await settle();

    // Scrolling back under a 22-row prefix shows exactly the rows the flat
    // load cached (50–74), while blocks 0–4 hold frozen rows only: their miss
    // must not raise the suffix overlay.
    metrics.scrollTop = 560;
    metrics.frozenCount = 22;
    const before = instructions.length;
    manager.requestVisibleRows();
    await settle();

    expect(rangesOf(requests)).toContainEqual([0, 5]);
    expect(rangesOf(requests)).toContainEqual([20, 25]);
    expect(instructions.slice(before).some(({ type }) => type === "DATA_LOADING")).toBe(false);

    // A visible suffix miss keeps today's overlay.
    metrics.scrollTop = 1_560;
    manager.requestVisibleRows();
    await settle();

    expect(instructions.slice(before).some(({ type }) => type === "DATA_LOADING")).toBe(true);
  });

  it("discards a response for a block the latest load no longer admits", async () => {
    const requests: DataSourceRequest[] = [];
    const pending = new Map<number, Deferred<DataSourceResponse<TestRow>>>();
    const { manager, metrics } = createManager(
      {
        loadMode: "paginated",
        query: (request) => {
          requests.push(request);
          const deferred = createDeferred<DataSourceResponse<TestRow>>();
          pending.set(request.range.startRow, deferred);
          return deferred.promise;
        },
      },
      { cache: { pageSize: 10, prefetchPages: 0, maxPages: 5 } },
    );
    metrics.rowCount = 1_000;
    metrics.frozenCount = 2;

    const settleBlock = async (startRow: number): Promise<void> => {
      pending.get(startRow)!.resolve({
        rows: rowsBetween(startRow, startRow + 10),
        totalRows: 1_000,
      });
      await settle();
    };

    manager.requestVisibleRows();
    await settleBlock(0);
    metrics.scrollTop = 140;
    manager.requestVisibleRows();
    metrics.scrollTop = 400;
    manager.requestVisibleRows();
    expect([...pending.keys()]).toEqual([0, 10, 20]);

    await settleBlock(20);
    await settleBlock(10);

    expect(manager.getRowData(22)?.name).toBe("Row 22");
    expect(manager.getRowData(11)).toBeUndefined();
    expect(manager.hasRow(11)).toBe(false);
  });

  it("requests the prefix and the straddling visible blocks, never the gap", async () => {
    const requests: DataSourceRequest[] = [];
    const { manager, metrics } = createManager(
      createRecorder(requests, 1_000_000),
      { cache: { pageSize: 100, prefetchPages: 0, maxPages: 3 } },
    );
    metrics.rowCount = 1_000_000;
    metrics.rowHeight = 8;
    metrics.viewportHeight = 320;
    metrics.frozenCount = 2;
    metrics.scrollTop = 7_199_976;

    manager.requestVisibleRows();
    await settle();

    expect(rangesOf(requests)).toEqual([
      [0, 100],
      [899_900, 900_000],
      [900_000, 900_100],
    ]);
  });
});
