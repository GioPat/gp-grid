import { describe, expect, it } from "vitest";
import { GridCore } from "../src/grid-core";
import { createServerDataSource } from "../src/data-source";
import type { ColumnDefinition, DataSourceRequest } from "../src/types";

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
    expect(grid.getRowCount()).toBe(200);
    expect(grid.getRowData(0)?.id).toBe(0);
    expect(grid.getRowData(41)).toBeUndefined();
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
    expect(grid.getRowData(45)?.name).toBe("Row 45");
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

    expect(grid.getRowData(25)?.id).toBe(25);
    expect(grid.getRowData(0)).toBeUndefined();
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
    expect(grid.getRowData(4)?.id).toBe(4);
  });
});
