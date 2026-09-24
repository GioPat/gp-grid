import { describe, expect, it } from "vitest";
import { GridCore } from "../src/grid-core";
import { createServerDataSource } from "../src/data-source";
import type { ColumnDefinition, DataSourceRequest, GridInstruction } from "../src/types";

interface TestRow {
  id: number;
  name: string;
}

const columns: ColumnDefinition[] = [
  { field: "id", cellDataType: "number", width: 80 },
  { field: "name", cellDataType: "text", width: 160 },
];

const waitForAsyncFetch = (): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, 0);
  });

const buildRows = (startRow: number, count: number): TestRow[] =>
  Array.from({ length: count }, (_, index) => {
    const id = startRow + index;
    return { id, name: `Row ${id}` };
  });

const createPaginatedDataSource = (
  requests: DataSourceRequest[],
  totalRows: number = 200,
) =>
  createServerDataSource<TestRow>(async (request) => {
    requests.push(request);
    const startRow = request.range.startRow;
    const endRow = Math.min(request.range.endRow, totalRows);
    return {
      rows: buildRows(startRow, endRow - startRow),
      totalRows,
    };
  });

describe("server paginated loading", () => {
  it("uses paginated loading by default for createServerDataSource", async () => {
    const requests: DataSourceRequest[] = [];
    const grid = new GridCore<TestRow>({
      columns,
      dataSource: createPaginatedDataSource(requests),
      rowHeight: 32,
      rowLoading: {
        cache: { pageSize: 20, prefetchPages: 0, maxPages: 2 },
      },
    });

    await grid.initialize();

    expect(requests[0]?.range).toEqual({ startRow: 0, endRow: 20 });
    expect(grid.rows.getCount()).toBe(200);
    expect(grid.rows.getData(0)?.id).toBe(0);
    expect(grid.rows.getData(41)).toBeUndefined();
  });

  it("fetches additional blocks when the viewport moves", async () => {
    const requests: DataSourceRequest[] = [];
    const grid = new GridCore<TestRow>({
      columns,
      dataSource: createPaginatedDataSource(requests),
      rowHeight: 32,
      rowLoading: {
        cache: { pageSize: 20, prefetchPages: 0, maxPages: 3 },
      },
    });

    await grid.initialize();
    grid.setViewport(45 * 32, 0, 400, 96);
    await waitForAsyncFetch();

    expect(requests.at(-1)?.range).toEqual({ startRow: 40, endRow: 60 });
    expect(grid.rows.getData(45)?.name).toBe("Row 45");
  });

  it("evicts cached blocks according to the cache budget", async () => {
    const requests: DataSourceRequest[] = [];
    const grid = new GridCore<TestRow>({
      columns,
      dataSource: createPaginatedDataSource(requests),
      rowHeight: 32,
      rowLoading: {
        cache: { pageSize: 10, prefetchPages: 0, maxPages: 1 },
      },
    });

    await grid.initialize();
    grid.setViewport(25 * 32, 0, 400, 96);
    await waitForAsyncFetch();

    expect(grid.rows.getData(25)?.id).toBe(25);
    expect(grid.rows.getData(0)).toBeUndefined();
  });

  it("can still fetch all rows when explicitly configured", async () => {
    const requests: DataSourceRequest[] = [];
    const dataSource = createServerDataSource<TestRow>(
      async (request) => {
        requests.push(request);
        return { rows: buildRows(0, 5), totalRows: 5 };
      },
      { loadMode: "all" },
    );

    const grid = new GridCore<TestRow>({
      columns,
      dataSource,
      rowHeight: 32,
    });

    await grid.initialize();

    expect(requests[0]?.range).toEqual({
      startRow: 0,
      endRow: Number.MAX_SAFE_INTEGER,
    });
    expect(grid.rows.getData(4)?.id).toBe(4);
  });
});

describe("server paginated loading with frozen rows", () => {
  const rangesOf = (requests: DataSourceRequest[]): Array<[number, number]> =>
    requests.map(({ range }) => [range.startRow, range.endRow]);

  /** AC-005-04: 1,000,000 rows of 8 px, 400x320 body, 100-row pages. */
  const createFrozenGrid = async (
    requests: DataSourceRequest[],
    maxPages: number,
  ): Promise<{ grid: GridCore<TestRow>; errors: GridInstruction[] }> => {
    const grid = new GridCore<TestRow>({
      columns,
      dataSource: createPaginatedDataSource(requests, 1_000_000),
      rowHeight: 8,
      headerHeight: 36,
      overscan: 2,
      rowLoading: { cache: { pageSize: 100, prefetchPages: 0, maxPages } },
    });
    const errors: GridInstruction[] = [];
    grid.onBatchInstruction((batch) => {
      errors.push(...batch.filter(({ type }) => type === "DATA_ERROR"));
    });

    await grid.initialize();
    grid.setViewport(0, 0, 400, 320);
    grid.setFrozenRowsRequest({ requestedCount: 2 });
    return { grid, errors };
  };

  it("keeps the prefix and the far suffix inside the page budget", async () => {
    const requests: DataSourceRequest[] = [];
    const { grid, errors } = await createFrozenGrid(requests, 3);
    expect(grid.geometry.getRowRegions().frozen).toEqual({
      requestedCount: 2,
      effectiveCount: 2,
      limit: null,
    });

    // DOM top 7,199,976 places rows 899,999–900,036 in the suffix window.
    grid.setViewport(7_199_976, 0, 400, 320);
    await waitForAsyncFetch();

    expect(rangesOf(requests)).toEqual([
      [0, 100],
      [899_900, 900_000],
      [900_000, 900_100],
    ]);

    // A further scroll keeps rows 0–1 resident.
    grid.setViewport(7_200_000, 0, 400, 320);
    await waitForAsyncFetch();

    expect(rangesOf(requests)).toHaveLength(3);
    expect(grid.rows.getData(0)?.id).toBe(0);
    expect(grid.geometry.getRowRegions().frozenCount).toBe(2);
    expect(errors).toEqual([]);
  });

  it("falls back to zero frozen rows and pages only the visible blocks", async () => {
    const requests: DataSourceRequest[] = [];
    const { grid, errors } = await createFrozenGrid(requests, 2);
    // The bound covers every reachable position, so the deep suffix counts.
    expect(grid.geometry.getRowRegions().frozen).toEqual({
      requestedCount: 2,
      effectiveCount: 0,
      limit: "cache",
    });

    grid.setViewport(7_199_976, 0, 400, 320);
    await waitForAsyncFetch();

    expect(rangesOf(requests)).toEqual([
      [0, 100],
      [899_900, 900_000],
      [900_000, 900_100],
    ]);
    // The flat soft policy lets the loaded set exceed the cap rather than
    // evicting a visible page, and never reports an error.
    expect(grid.rows.getData(899_999)?.id).toBe(899_999);
    expect(errors).toEqual([]);
  });
});
