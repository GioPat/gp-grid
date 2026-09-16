import { describe, expect, it } from "vitest";
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

interface ManagerHarness {
  manager: RowDataManager<TestRow>;
  instructions: GridInstruction[];
  loadedNotifications: boolean[];
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

  const manager = new RowDataManager<TestRow>({
    dataSource,
    rowLoading,
    batcher,
    getColumns: () => columns,
    getSortModel: () => [],
    getFilterModel: () => ({}),
    getRowHeight: () => 20,
    getOverscan: () => 0,
    getScrollTop: () => 0,
    getViewportHeight: () => 100,
    onRowsLoaded: (totalRowsChanged) => {
      loadedNotifications.push(totalRowsChanged);
    },
    ...overrides,
  });

  return { manager, instructions, loadedNotifications };
};

const response = (rows: TestRow[] = []): DataSourceResponse<TestRow> => ({
  rows,
  totalRows: rows.length,
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
      {
        getScrollTop: () => 1_000,
        getViewportHeight: () => 100,
      },
    );
    manager.setTotalRows(5);

    manager.requestVisibleRows();

    expect(queryCount).toBe(0);
  });
});
