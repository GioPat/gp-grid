// packages/core/tests/grid-core-operations.test.ts

import { describe, it, expect, vi } from "vitest";
import { GridCore } from "../src/grid-core";
import { createClientDataSource } from "../src/data-source";
import type { ColumnDefinition, GridCoreOptions } from "../src/types";

interface TestRow {
  id: number;
  a: string;
}

const rows = (): TestRow[] => [
  { id: 1, a: "a1" },
  { id: 2, a: "a2" },
  { id: 3, a: "a3" },
];

const def = (field: string, extra: Partial<ColumnDefinition> = {}): ColumnDefinition => ({
  field,
  cellDataType: "text",
  width: 100,
  ...extra,
});

const createGrid = (
  columns: ColumnDefinition[],
  extra: Partial<GridCoreOptions<TestRow>> = {},
): GridCore<TestRow> =>
  new GridCore<TestRow>({
    columns,
    dataSource: createClientDataSource(rows()),
    rowHeight: 32,
    ...extra,
  });

const widthOf = (grid: GridCore<TestRow>, columnId: string): number | undefined =>
  grid.getColumnState().find((state) => state.columnId === columnId)?.width;

describe("column resize stored width", () => {
  it("back-solves the stored width when the columns leave viewport space", () => {
    const grid = createGrid([def("a"), def("b"), def("c")]);
    grid.setViewport(0, 0, 800, 400);

    grid.setColumnWidth(1, 200);

    // 200 displayed with 200 px of other columns in 800 px: 200 * 200 / 600.
    expect(widthOf(grid, "b")).toBeCloseTo(66.67, 2);
  });

  it("stores the displayed width when the columns already fill the viewport", () => {
    const grid = createGrid([def("a"), def("b"), def("c")]);
    grid.setViewport(0, 0, 250, 400);

    grid.setColumnWidth(1, 200);

    expect(widthOf(grid, "b")).toBe(200);
  });

  it("ignores hidden columns when distributing the remaining space", () => {
    const grid = createGrid([def("a", { hidden: true }), def("b"), def("c")]);
    grid.setViewport(0, 0, 800, 400);

    grid.setColumnWidth(1, 200);

    // Only c (100 px) shares the space: 200 * 100 / 600.
    expect(widthOf(grid, "b")).toBeCloseTo(33.33, 2);
  });

  it("stores the displayed width for a single visible column", () => {
    const grid = createGrid([def("a")]);
    grid.setViewport(0, 0, 800, 400);

    grid.setColumnWidth(0, 300);

    expect(widthOf(grid, "a")).toBe(300);
  });

  it("stores the displayed width while the container reports no width", () => {
    const grid = createGrid([def("a"), def("b")]);
    grid.setViewport(0, 0, 0, 400);

    grid.setColumnWidth(0, 240);

    expect(widthOf(grid, "a")).toBe(240);
  });

  it("stores the displayed width for a hidden column", () => {
    const grid = createGrid([def("a", { hidden: true }), def("b")]);
    grid.setViewport(0, 0, 800, 400);

    grid.setColumnWidth(0, 240);

    expect(widthOf(grid, "a")).toBe(240);
  });

  it("ignores a resize of a column index outside the layout", () => {
    const onColumnResized = vi.fn();
    const grid = createGrid([def("a")], { onColumnResized });

    grid.setColumnWidth(5, 240);

    expect(onColumnResized).not.toHaveBeenCalled();
    expect(widthOf(grid, "a")).toBe(100);
  });
});

describe("column move guards", () => {
  it("ignores a move from an index outside the layout", () => {
    const onColumnMoved = vi.fn();
    const grid = createGrid([def("a"), def("b")], { onColumnMoved });

    grid.moveColumn(5, 0);

    expect(onColumnMoved).not.toHaveBeenCalled();
  });

  it("ignores a move that leaves the column where it is", () => {
    const onColumnMoved = vi.fn();
    const grid = createGrid([def("a"), def("b")], { onColumnMoved });

    grid.moveColumn(0, 1);

    expect(onColumnMoved).not.toHaveBeenCalled();
    expect(grid.getColumnState().map((state) => state.columnId)).toEqual(["a", "b"]);
  });
});

describe("row drag commit", () => {
  it("leaves rows in place when the source cannot move rows", async () => {
    const inner = createClientDataSource(rows());
    const grid = new GridCore<TestRow>({
      columns: [def("a")],
      dataSource: { query: (request) => inner.query(request) },
      rowHeight: 32,
    });
    await grid.initialize();
    grid.setViewport(0, 0, 800, 400);

    grid.commitRowDrag(0, 2);

    expect(grid.getRowData(0)).toMatchObject({ id: 1 });
  });

  it("reorders resident rows and clears highlight caches", async () => {
    const grid = createGrid([def("a")], {
      highlighting: { computeRowClasses: () => [] },
    });
    await grid.initialize();
    grid.setViewport(0, 0, 800, 400);

    grid.commitRowDrag(0, 2);

    expect(grid.getRowData(0)).toMatchObject({ id: 2 });
  });
});
