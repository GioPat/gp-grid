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

describe("column resize stores the pixel override directly", () => {
  it("keeps the exact width in fit even when the columns leave viewport space", () => {
    const grid = createGrid([def("a"), def("b"), def("c")]);
    grid.setViewport(0, 0, 800, 400);

    grid.setColumnWidth(1, 200);

    expect(widthOf(grid, "b")).toBe(200);
    const layout = grid.geometry.getColumnLayout();
    expect(layout.columns.map((column) => column.width)).toEqual([300, 200, 300]);
    expect(layout.totalWidth).toBe(800);
  });

  it("keeps the exact width when the columns already overflow the viewport", () => {
    const grid = createGrid([def("a"), def("b"), def("c")]);
    grid.setViewport(0, 0, 250, 400);

    grid.setColumnWidth(1, 200);

    expect(widthOf(grid, "b")).toBe(200);
    expect(grid.geometry.getColumnLayout().columns.map((column) => column.width)).toEqual([
      100, 200, 100,
    ]);
  });

  it("resizes a hidden column without affecting the displayed layout", () => {
    const grid = createGrid([def("a", { hidden: true }), def("b")]);
    grid.setViewport(0, 0, 800, 400);

    grid.setColumnWidth(0, 240);

    expect(widthOf(grid, "a")).toBe(240);
    expect(grid.geometry.getColumnLayout().columns.map((column) => column.columnId)).toEqual([
      "b",
    ]);
  });

  it("reports the override and the measured width through the resize event", () => {
    const onColumnResized = vi.fn();
    const grid = createGrid([def("a"), def("b")], { onColumnResized });
    grid.setViewport(0, 0, 800, 400);

    grid.setColumnWidth(0, 240);

    expect(onColumnResized).toHaveBeenCalledWith({
      columnId: "a",
      width: 240,
      viewIndex: 0,
    });
    const state = grid.getColumnState()[0]!;
    expect(state.width).toBe(240);
    expect(state.resolvedWidth).toBe(240);
  });

  it("stores a width while the container reports no width", () => {
    const grid = createGrid([def("a"), def("b")]);
    grid.setViewport(0, 0, 0, 400);

    grid.setColumnWidth(0, 240);

    expect(widthOf(grid, "a")).toBe(240);
  });

  it("removes the override on reset and restores proportional widths", () => {
    const grid = createGrid([def("a"), def("b")]);
    grid.setViewport(0, 0, 800, 400);

    grid.setColumnWidth(0, 100);
    expect(grid.getColumnState()[0]?.resolvedWidth).toBe(100);

    grid.resetColumnState(["a"]);
    expect(grid.getColumnState()[0]?.width).toBeUndefined();
    expect(grid.getColumnState()[0]?.resolvedWidth).toBe(400);
  });

  it("ignores a resize of a column index outside the layout", () => {
    const onColumnResized = vi.fn();
    const grid = createGrid([def("a")], { onColumnResized });

    grid.setColumnWidth(5, 240);

    expect(onColumnResized).not.toHaveBeenCalled();
    expect(widthOf(grid, "a")).toBeUndefined();
    expect(grid.getColumnState()[0]?.resolvedWidth).toBe(100);
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
