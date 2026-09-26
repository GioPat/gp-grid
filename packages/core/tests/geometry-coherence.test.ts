import { afterEach, describe, expect, it, vi } from "vitest";
import { GridCore } from "../src/grid-core";
import { createClientDataSource } from "../src/data-source";
import type { ColumnDefinition, DataSource, GridInstruction } from "../src/types";

interface Row {
  id: number;
  name?: string;
}

const columns: ColumnDefinition[] = [
  { field: "id", cellDataType: "number", width: 200 },
  { field: "name", cellDataType: "text", width: 400 },
];

const settle = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

const createLocalGrid = async (): Promise<GridCore<Row>> => {
  const data = Array.from({ length: 100 }, (_, id) => ({ id, name: `Row ${id}` }));
  const grid = new GridCore<Row>({
    dataSource: createClientDataSource(data),
    columns,
    rowHeight: 32,
    overscan: 3,
    columnLayout: "fixed",
  });
  await grid.initialize();
  grid.setViewport(0, 0, 300, 320);
  return grid;
};

const createPaginatedGrid = async (
  totalRows: number,
): Promise<{ grid: GridCore<Row>; requests: Array<[number, number]> }> => {
  const requests: Array<[number, number]> = [];
  const dataSource: DataSource<Row> = {
    loadMode: "paginated",
    query: async ({ range }) => {
      requests.push([range.startRow, range.endRow]);
      const length = range.endRow - range.startRow;
      return { rows: Array.from({ length }, (_, i) => ({ id: i + range.startRow })), totalRows };
    },
  };
  const grid = new GridCore<Row>({
    dataSource,
    columns: columns.slice(0, 1),
    rowHeight: 32,
    overscan: 3,
    rowLoading: { mode: "paginated", cache: { pageSize: 5, prefetchPages: 0, maxPages: 100 } },
  });
  grid.setViewport(0, 0, 300, 320);
  await grid.initialize();
  await settle();
  return { grid, requests };
};

const unloadedRows = (grid: GridCore<Row>): number[] => {
  const window = grid.geometry.getVisibleRowWindow();
  const missing: number[] = [];
  for (let row = window.start; row < window.end; row++) {
    if (grid.rows.getData(row) === undefined) missing.push(row);
  }
  return missing;
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe("paginated loading follows the committed geometry", () => {
  it("sizes the first load from the viewport while the row axis is empty", async () => {
    const { grid, requests } = await createPaginatedGrid(1_000);
    expect(requests).toEqual([[0, 5], [5, 10], [10, 15]]);
    expect(unloadedRows(grid)).toEqual([]);
  });

  it("requests the window of the new ratio after a compressed resize", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const { grid } = await createPaginatedGrid(1_000_000);
    grid.setViewport(5_000_000, 0, 300, 320);
    await settle();
    grid.setViewport(5_000_000, 0, 300, 640);
    await settle();
    expect(grid.geometry.getVisibleRowWindow()).toEqual({ start: 500_023, end: 500_044 });
    expect(unloadedRows(grid)).toEqual([]);
  });
});

describe("committed geometry revisions", () => {
  it("advances on every column width change", async () => {
    const grid = await createLocalGrid();
    const first = grid.geometry.revision;
    grid.columns.setWidth(0, 250);
    const second = grid.geometry.revision;
    grid.columns.setWidth(0, 300);
    expect(second).toBeGreaterThan(first);
    expect(grid.geometry.revision).toBeGreaterThan(second);
  });

  it("stamps the layout and content size of one batch with the same revision", async () => {
    const grid = await createLocalGrid();
    const batches: GridInstruction[][] = [];
    grid.onBatchInstruction((batch) => batches.push(batch));
    grid.columns.setWidth(0, 250);
    const batch = batches.at(-1)!;
    const layout = batch.find((i) => i.type === "COLUMNS_CHANGED");
    const size = batch.find((i) => i.type === "SET_CONTENT_SIZE");
    expect(layout).toBeDefined();
    expect(layout).toMatchObject({ revision: (size as { revision: number }).revision });
    expect((layout as { revision: number }).revision).toBe(grid.geometry.revision);
  });
});

describe("public geometry surface", () => {
  it("exposes queries only, so a mode change must go through setColumnLayout", async () => {
    const grid = await createLocalGrid();
    const surface = grid.geometry as unknown as Record<string, unknown>;
    for (const mutator of ["setColumnLayoutMode", "refresh", "syncWindows", "getRowGeometry"]) {
      expect(surface[mutator]).toBeUndefined();
    }
    expect(Object.isFrozen(grid.geometry)).toBe(true);

    expect(grid.geometry.getRowBounds(2)).toEqual({ start: 64, end: 96 });
    expect(grid.geometry.getColumnBounds(1)).toEqual({ start: 200, end: 600 });
    expect(grid.geometry.getRowEdgeOffset(100, "content")).toBe(3200);
    expect(grid.geometry.getContentSize()).toEqual({
      width: 600,
      height: 3200,
      coordinateSpace: "content",
    });

    grid.columns.setLayout("fit");
    expect(grid.geometry.getColumnLayout().mode).toBe("fit");
    const before = grid.geometry.revision;
    grid.columns.setWidth(0, 250);
    expect(grid.geometry.revision).toBeGreaterThan(before);
  });
});

describe("viewport normalization", () => {
  it("renders an empty window for a measured zero-height viewport", async () => {
    const grid = await createLocalGrid();
    const destroyed: GridInstruction[] = [];
    grid.onBatchInstruction((batch) => destroyed.push(...batch.filter((i) => i.type === "DESTROY_SLOT")));
    grid.setViewport(0, 0, 300, 0);
    expect(grid.geometry.getRowWindow()).toEqual({ start: 0, end: 0 });
    expect(destroyed.length).toBeGreaterThan(0);
  });

  it("mounts an estimated slate before any measurement", async () => {
    const data = Array.from({ length: 100 }, (_, id) => ({ id }));
    const grid = new GridCore<Row>({ dataSource: createClientDataSource(data), columns, rowHeight: 32 });
    await grid.initialize();
    expect(grid.geometry.getVisibleRowWindow()).toEqual({ start: 0, end: 19 });
  });

  it("answers from the clamped sample and corrects the DOM in the same batch", async () => {
    const grid = await createLocalGrid();
    const batches: GridInstruction[][] = [];
    grid.onBatchInstruction((batch) => batches.push(batch));
    grid.setViewport(100_000, 10_000, 300, 320);
    expect(batches).toHaveLength(1);
    expect(batches[0]).toContainEqual({ type: "SCROLL_TO", scrollTop: 2880, scrollLeft: 300 });
    expect(grid.geometry.getVisibleRowWindow()).toEqual({ start: 90, end: 100 });
    expect(grid.geometry.getCellBounds(99, 1)).toMatchObject({ top: 288, left: -100 });
  });
});
