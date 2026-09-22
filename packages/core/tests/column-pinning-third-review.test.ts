// packages/core/tests/column-pinning-third-review.test.ts
// Regressions for layout-index space, seed window,
// end-pin drag sentinel, cross-region edit identity and window commit.

import { afterEach, describe, expect, it } from "vitest";
import { GridCore } from "../src/grid-core";
import { createClientDataSource } from "../src/data-source";
import { createInitialState } from "../src/types/ui-state";
import { computeCellTarget } from "../src/input/cell-target";
import type { ColumnDefinition, GridInstruction } from "../src/types";

const column = (field: string, extra: Partial<ColumnDefinition> = {}): ColumnDefinition => ({
  field,
  cellDataType: "text",
  width: 100,
  editable: true,
  ...extra,
});

const grids: GridCore<Record<string, unknown>>[] = [];

const fixture = async (columns: ColumnDefinition[], width = 400) => {
  const row: Record<string, unknown> = { id: 1, a: "A", b: "B", c: "C" };
  const grid = new GridCore<Record<string, unknown>>({
    columns,
    columnLayout: "fixed",
    columnOverscan: 0,
    rowHeight: 32,
    dataSource: createClientDataSource([row]),
  });
  grids.push(grid);
  await grid.initialize();
  grid.setViewport(0, 0, width, 320);
  const batches: GridInstruction[][] = [];
  grid.onBatchInstruction((batch) => batches.push(batch));
  return { grid, row, batches };
};

afterEach(() => {
  for (const grid of grids.splice(0)) grid.destroy();
});

describe("column pinning third review", () => {
  it("maps a hit to the same data field after hiding a column", async () => {
    const { grid } = await fixture([
      column("a", { hidden: true }),
      column("b"),
      column("c"),
    ]);
    const hit = grid.geometry.hitTest({ x: 50, y: 16 });
    expect(hit.columnId).toBe("b");
    expect(grid.getCellValue(0, hit.col)).toBe("B");
  });

  it("commits an edit to the visible field after hiding a column", async () => {
    const { grid, row } = await fixture([
      column("a", { hidden: true }),
      column("b"),
      column("c"),
    ]);
    const hit = grid.geometry.hitTest({ x: 50, y: 16 });
    grid.startEdit(0, hit.col);
    grid.updateEditValue("edited B");
    grid.commitEdit();
    expect(row).toMatchObject({ a: "A", b: "edited B", c: "C" });
  });

  it("keeps a hidden column out of geometry at its own index", async () => {
    const { grid } = await fixture([
      column("a", { hidden: true }),
      column("b"),
      column("c"),
    ]);
    expect(grid.geometry.getColumnBounds(0)).toBeUndefined();
    expect(grid.geometry.getCellBounds(0, 2)?.columnId).toBe("c");
  });

  it("seeds a nonempty bounded window before measuring width", () => {
    const state = createInitialState({
      initialColumns: Array.from({ length: 100 }, (_, index) => column(`c${index}`)),
      initialColumnLayout: "fixed",
    });
    expect(state.columnWindow!.center.length).toBeGreaterThan(0);
    expect(state.columnWindow!.center.length).toBeLessThan(30);
  });

  it("seeds an empty center when a measured viewport is exhausted by pins", () => {
    const state = createInitialState({
      initialColumns: [
        column("a", { pinned: "start" }),
        column("b", { pinned: "start" }),
        column("c"),
      ],
      initialWidth: 100,
      initialColumnLayout: "fixed",
    });
    expect(state.columnWindow!.start.map((entry) => entry.columnId)).toEqual(["a"]);
    expect(state.columnWindow!.center).toHaveLength(0);
  });

  it("keeps a drag beyond an end pin at the last column", async () => {
    const { grid } = await fixture([column("a"), column("b"), column("c", { pinned: "end" })]);
    const target = computeCellTarget(
      grid,
      { clientX: 350, clientY: 16, button: 0, shiftKey: false, ctrlKey: false, metaKey: false },
      { top: 0, left: 0, width: 400, height: 320, scrollTop: 0, scrollLeft: 0 },
    );
    expect(target.col).toBe(2);
  });

  it("preserves the edit identity through a cross-region move", async () => {
    const { grid, row } = await fixture([
      column("a", { pinned: "start" }),
      column("b"),
      column("c"),
    ]);
    grid.startEdit(0, 2);
    grid.updateEditValue("edited C");
    grid.moveColumn(2, 0);
    expect(grid.getColumnState()[0]).toMatchObject({ columnId: "c", pinned: "start" });
    grid.commitEdit();
    expect(row).toMatchObject({ a: "A", b: "B", c: "edited C" });
  });

  it("follows the active cell through a cross-region move", async () => {
    const { grid } = await fixture([
      column("a", { pinned: "start" }),
      column("b"),
      column("c"),
    ]);
    grid.selection.setActiveCell(0, 2);
    grid.moveColumn(2, 0);
    expect(grid.selection.getActiveCell()).toEqual({ row: 0, col: 0 });
  });

  it("follows a peek through a cross-region move", async () => {
    const { grid } = await fixture([
      column("a", { pinned: "start" }),
      column("b"),
      column("c"),
    ]);
    expect(grid.startPeek(0, 2)).toBe(true);
    grid.moveColumn(2, 0);
    expect(grid.getPeekState()).toEqual({ row: 0, col: 0 });
  });

  it("keeps the committed window unchanged on a tiny scroll after resize", async () => {
    const { grid, batches } = await fixture(
      Array.from({ length: 100 }, (_, index) => column(`c${index}`)),
      180,
    );
    grid.setColumnWidth(0, 110);
    const before = grid.geometry.getColumnWindow();
    const revision = grid.geometry.revision;
    batches.length = 0;
    grid.setViewport(0, 1, 180, 320);
    expect(grid.geometry.getColumnWindow()).toBe(before);
    expect(batches.length).toBe(0);
    expect(grid.geometry.revision).toBe(revision);
  });
});
