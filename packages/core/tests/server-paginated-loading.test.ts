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

describe("server paginated loading with variable row heights", () => {
  const ROW_HEIGHT = 32;
  const TALL = 96;
  const TOTAL = 10_000_000;
  const PAGE = 100;
  const OVERRIDES = 50;
  const FIRST_TALL = 5_000_000;

  const rangesOf = (requests: DataSourceRequest[]): Array<[number, number]> =>
    requests.map(({ range }) => [range.startRow, range.endRow]);

  const createHeightsGrid = async (requests: DataSourceRequest[]): Promise<GridCore<TestRow>> => {
    const grid = new GridCore<TestRow>({
      columns,
      dataSource: createPaginatedDataSource(requests, TOTAL),
      rowHeight: ROW_HEIGHT,
      headerHeight: 36,
      overscan: 2,
      getRowId: (row) => row.id,
      rowLoading: { cache: { pageSize: PAGE, prefetchPages: 0, maxPages: 3 } },
    });
    await grid.initialize();
    grid.setViewport(0, 0, 400, 320);
    return grid;
  };

  const record = (grid: GridCore<TestRow>): GridInstruction[][] => {
    const batches: GridInstruction[][] = [];
    grid.onBatchInstruction((batch) => batches.push([...batch]));
    return batches;
  };

  const heightAt = (grid: GridCore<TestRow>, viewIndex: number): number | undefined => {
    const bounds = grid.geometry.getRowBounds(viewIndex, "content");
    return bounds === undefined ? undefined : bounds.end - bounds.start;
  };

  /** First suffix row at the clip top, and where the clip shows it. */
  const anchorOf = (grid: GridCore<TestRow>): { index: number; top: number } => {
    const index = grid.geometry.getVisibleRowWindow().start;
    return { index, top: grid.geometry.getRowBounds(index, "viewport")?.start ?? 0 };
  };

  const pendingHeights = (): Array<{ rowId: number; height: number }> =>
    Array.from({ length: OVERRIDES }, (_, index) => ({
      rowId: FIRST_TALL + index,
      height: TALL,
    }));

  it("places pending heights when their page arrives without moving the anchor", async () => {
    const requests: DataSourceRequest[] = [];
    const grid = await createHeightsGrid(requests);
    const idle = record(grid);

    grid.rowHeights.set(pendingHeights());

    // Nothing is resident yet: no batch, no placement, no sized-by-count state.
    expect(idle).toHaveLength(0);
    expect(grid.rowHeights.getOverrides()).toHaveLength(OVERRIDES);
    expect(grid.geometry.getContentSize().height).toBe(TOTAL * ROW_HEIGHT);

    const target = grid.geometry.getScrollTarget(FIRST_TALL + 60, 0);
    grid.setViewport(target.scrollTop ?? 0, 0, 400, 320);
    const before = anchorOf(grid);
    const batches = record(grid);
    await waitForAsyncFetch();

    expect(rangesOf(requests)).toEqual([
      [0, PAGE],
      [FIRST_TALL, FIRST_TALL + PAGE],
    ]);

    // The arrival is one batch that publishes the new extent and anchors.
    const batch = batches.find((candidate) =>
      candidate.some((instruction) => instruction.type === "SCROLL_TO"),
    );
    expect(batch).toBeDefined();
    expect(batch!.some((instruction) => instruction.type === "SET_CONTENT_SIZE")).toBe(true);
    const scrollTo = batch!.find((instruction) => instruction.type === "SCROLL_TO");
    expect(scrollTo?.type === "SCROLL_TO" && (scrollTo.scrollTop ?? 0) > 0).toBe(true);

    const after = anchorOf(grid);
    expect(after.index).toBe(before.index);
    expect(Math.abs(after.top - before.top)).toBeLessThanOrEqual(1);
    expect(grid.geometry.getContentSize().height).toBe(
      TOTAL * ROW_HEIGHT + OVERRIDES * (TALL - ROW_HEIGHT),
    );
  });

  it("sizes only what it placed and unplaces the heights on a sort", async () => {
    const requests: DataSourceRequest[] = [];
    const grid = await createHeightsGrid(requests);
    grid.rowHeights.set(pendingHeights());
    const target = grid.geometry.getScrollTarget(FIRST_TALL + 60, 0);

    grid.setViewport(target.scrollTop ?? 0, 0, 400, 320);
    await waitForAsyncFetch();

    for (let index = 0; index < OVERRIDES; index += 1) {
      expect(heightAt(grid, FIRST_TALL + index)).toBe(TALL);
    }
    expect(heightAt(grid, FIRST_TALL + OVERRIDES)).toBe(ROW_HEIGHT);
    expect(heightAt(grid, FIRST_TALL - 1)).toBe(ROW_HEIGHT);

    await grid.sortFilter.setSort("id", "desc");

    // The heights stay known by identity but wait for their pages again.
    expect(grid.rowHeights.getOverrides()).toHaveLength(OVERRIDES);
    expect(heightAt(grid, FIRST_TALL)).toBe(ROW_HEIGHT);
    expect(grid.geometry.getContentSize().height).toBe(TOTAL * ROW_HEIGHT);
    expect(rangesOf(requests).at(-1)).toEqual([0, PAGE]);
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
