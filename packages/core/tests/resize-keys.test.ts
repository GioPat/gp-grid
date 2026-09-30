// packages/core/tests/resize-keys.test.ts
// PRD 007 D4: Alt+Arrow, Alt+Shift+Arrow and Alt+Enter on the grid acting on
// the active cell, and the edge handle double-click (AC-007-01, AC-007-07,
// AC-007-11).

import { afterEach, describe, expect, it, vi } from "vitest";
import { GridCore } from "../src/grid-core";
import { createClientDataSource } from "../src/data-source";
import { InputEventAdapter, type InputEventAdapterDeps } from "../src/adapter";
import type {
  AutoFitOptions,
  CellPosition,
  ColumnDefinition,
  ColumnResizedEvent,
  RowResizedEvent,
} from "../src/types";
import type { KeyEventData } from "../src/types/input";

interface Row {
  id: number;
}

const ROW_HEIGHT = 32;

// Layout indices: s 0 (start pin), a 1, b 2, h 3 (hidden), c 4, d 5, e 6 (end pin).
const allColumns = (): ColumnDefinition[] => [
  { field: "s", cellDataType: "text", width: 100, pinned: "start" },
  { field: "a", cellDataType: "text", width: 100, movable: false },
  { field: "b", cellDataType: "text", width: 100, minWidth: 60, maxWidth: 124 },
  { field: "h", cellDataType: "text", width: 100, hidden: true },
  { field: "c", cellDataType: "text", width: 100, resizable: false },
  { field: "d", cellDataType: "text", width: 100 },
  { field: "e", cellDataType: "text", width: 100, pinned: "end" },
];

interface HarnessOptions {
  columns?: ColumnDefinition[];
  autoFit?: AutoFitOptions;
  rowResize?: boolean;
}

const createGrid = async (options: HarnessOptions = {}) => {
  const rowEvents: RowResizedEvent[] = [];
  const columnEvents: ColumnResizedEvent[] = [];
  const grid = new GridCore<Row>({
    columns: options.columns ?? allColumns(),
    dataSource: createClientDataSource(Array.from({ length: 50 }, (_, id) => ({ id }))),
    rowHeight: ROW_HEIGHT,
    columnLayout: "fixed",
    getRowId: (row) => row.id,
    autoFit: options.autoFit,
    rowResize: options.rowResize ?? true,
    onRowResized: (event) => rowEvents.push(event),
    onColumnResized: (event) => columnEvents.push(event),
  });
  await grid.initialize();
  grid.setViewport(0, 0, 1_000, 320);
  return { grid, rowEvents, columnEvents };
};

const key = (name: string, modifiers: Partial<KeyEventData> = {}): KeyEventData => ({
  key: name,
  shiftKey: false,
  ctrlKey: false,
  metaKey: false,
  ...modifiers,
});

const alt = (name: string, shiftKey = false): KeyEventData => key(name, { altKey: true, shiftKey });

const press = (grid: GridCore<Row>, event: KeyEventData, editing: CellPosition | null = null) =>
  grid.input.handleKeyDown(event, grid.selection.getActiveCell(), editing, false);

const widthOf = (grid: GridCore<Row>, columnId: string): number | undefined =>
  grid.columns.getState().find((state) => state.columnId === columnId)?.resolvedWidth;

const heightAt = (grid: GridCore<Row>, viewIndex: number): number => {
  const bounds = grid.geometry.getRowBounds(viewIndex, "content");
  return bounds === undefined ? 0 : bounds.end - bounds.start;
};

const displayedIds = (grid: GridCore<Row>): string[] =>
  grid.geometry.getColumnLayout().columns.map((column) => column.columnId);

afterEach(() => {
  vi.restoreAllMocks();
});

describe("Alt+Arrow on the grid (AC-007-01)", () => {
  it("steps the active cell's column and clamps it at both ends, one event per change", async () => {
    const { grid, columnEvents } = await createGrid();
    grid.selection.setActiveCell(0, 2);

    for (let step = 0; step < 4; step += 1) {
      expect(press(grid, alt("ArrowRight")).preventDefault).toBe(true);
    }
    expect(widthOf(grid, "b")).toBe(124);
    expect(columnEvents.map((event) => event.width)).toEqual([108, 116, 124]);

    columnEvents.length = 0;
    for (let step = 0; step < 10; step += 1) press(grid, alt("ArrowLeft"));
    expect(widthOf(grid, "b")).toBe(60);
    expect(columnEvents).toHaveLength(8);
    expect(grid.selection.getActiveCell()).toEqual({ row: 0, col: 2 });
  });

  it("steps the active cell's row and clamps it into [16, maxRowHeight]", async () => {
    const { grid, rowEvents } = await createGrid({ autoFit: { maxRowHeight: 40 } });
    grid.selection.setActiveCell(5, 1);

    press(grid, alt("ArrowDown"));
    press(grid, alt("ArrowDown"));
    expect(press(grid, alt("ArrowDown")).preventDefault).toBe(true);
    expect(heightAt(grid, 5)).toBe(40);
    expect(rowEvents.map((event) => event.height)).toEqual([36, 40]);

    rowEvents.length = 0;
    for (let step = 0; step < 8; step += 1) press(grid, alt("ArrowUp"));
    expect(heightAt(grid, 5)).toBe(16);
    expect(rowEvents).toHaveLength(6);
    expect(grid.selection.getActiveCell()).toEqual({ row: 5, col: 1 });
  });

  it("leaves a key without a target to the browser and moves no focus", async () => {
    const { grid, columnEvents } = await createGrid();
    grid.selection.setActiveCell(2, 4);

    expect(press(grid, alt("ArrowRight"))).toEqual({ preventDefault: false });
    expect(widthOf(grid, "c")).toBe(100);
    expect(press(grid, key("ArrowRight", { altKey: true, ctrlKey: true }))).toEqual({ preventDefault: false });
    expect(grid.selection.getActiveCell()).toEqual({ row: 2, col: 4 });
    expect(columnEvents).toEqual([]);

    const flat = await createGrid({
      columns: [{ field: "x", cellDataType: "text", width: 100 }],
      rowResize: false,
    });
    flat.grid.selection.setActiveCell(2, 0);
    expect(press(flat.grid, alt("ArrowDown"))).toEqual({ preventDefault: false });
    expect(heightAt(flat.grid, 2)).toBe(ROW_HEIGHT);
    expect(flat.grid.selection.getActiveCell()).toEqual({ row: 2, col: 0 });

    flat.grid.selection.clearSelection();
    expect(press(flat.grid, alt("ArrowRight"))).toEqual({ preventDefault: false });
  });

  it("does nothing while an editor is open", async () => {
    const { grid, rowEvents, columnEvents } = await createGrid();
    grid.selection.setActiveCell(1, 1);

    expect(press(grid, alt("ArrowRight"), { row: 1, col: 1 })).toEqual({ preventDefault: false });
    expect(press(grid, alt("ArrowDown"), { row: 1, col: 1 })).toEqual({ preventDefault: false });
    expect(widthOf(grid, "a")).toBe(100);
    expect(heightAt(grid, 1)).toBe(ROW_HEIGHT);
    expect(rowEvents).toEqual([]);
    expect(columnEvents).toEqual([]);
  });
});

describe("Alt+Shift+Arrow on the grid (AC-007-11)", () => {
  it("moves the column before the previous and after the next displayed column", async () => {
    const { grid } = await createGrid();
    grid.selection.setActiveCell(3, 2);

    expect(press(grid, alt("ArrowLeft", true))).toMatchObject({ preventDefault: true });
    expect(displayedIds(grid)).toEqual(["s", "b", "a", "c", "d", "e"]);
    expect(grid.selection.getActiveCell()).toEqual({ row: 3, col: 1 });

    press(grid, alt("ArrowRight", true));
    // Skips the hidden `h` between `a` and `c`.
    press(grid, alt("ArrowRight", true));
    expect(displayedIds(grid)).toEqual(["s", "a", "c", "b", "d", "e"]);
    expect(grid.columns.get()[grid.selection.getActiveCell()!.col]?.field).toBe("b");
  });

  it("moves past the last column of its region without leaving it", async () => {
    const { grid } = await createGrid();
    grid.selection.setActiveCell(0, 4);

    expect(press(grid, alt("ArrowRight", true)).preventDefault).toBe(true);
    expect(displayedIds(grid)).toEqual(["s", "a", "b", "d", "c", "e"]);
    expect(grid.columns.getState().find((state) => state.columnId === "c")?.pinned).toBeNull();
    expect(grid.columns.get()[grid.selection.getActiveCell()!.col]?.field).toBe("c");

    expect(press(grid, alt("ArrowRight", true))).toEqual({ preventDefault: false });
    expect(displayedIds(grid)).toEqual(["s", "a", "b", "d", "c", "e"]);
  });

  it("stays in its region and respects movable: false", async () => {
    const { grid } = await createGrid();
    grid.selection.setActiveCell(0, 2);
    press(grid, alt("ArrowLeft", true));
    expect(press(grid, alt("ArrowLeft", true))).toEqual({ preventDefault: false });

    grid.selection.setActiveCell(0, 2);
    expect(grid.columns.get()[2]?.field).toBe("a");
    expect(press(grid, alt("ArrowRight", true))).toEqual({ preventDefault: false });
    expect(displayedIds(grid)).toEqual(["s", "b", "a", "c", "d", "e"]);
  });
});

describe("Alt+Enter and Alt+Shift+Enter on the grid (AC-007-07)", () => {
  it("fits the active cell's column and row without moving focus or editing", async () => {
    const { grid } = await createGrid();
    const fitColumns = vi.spyOn(grid.columns, "fit");
    const fitRows = vi.spyOn(grid.rowHeights, "fit");
    grid.selection.setActiveCell(4, 2);

    expect(press(grid, alt("Enter"))).toEqual({ preventDefault: true });
    expect(press(grid, alt("Enter", true))).toEqual({ preventDefault: true });

    expect(fitColumns.mock.calls).toEqual([[["b"]]]);
    expect(fitRows.mock.calls).toEqual([[[4]]]);
    expect(grid.selection.getActiveCell()).toEqual({ row: 4, col: 2 });
    expect(grid.edit.getState()).toBeNull();
  });

  it("leaves a key without a target to the browser", async () => {
    const { grid } = await createGrid();
    const fitColumns = vi.spyOn(grid.columns, "fit");
    grid.selection.setActiveCell(2, 4);

    expect(press(grid, alt("Enter"))).toEqual({ preventDefault: false });
    expect(press(grid, key("Enter", { altKey: true, ctrlKey: true }))).toEqual({ preventDefault: false });
    expect(fitColumns).not.toHaveBeenCalled();
    expect(grid.edit.getState()).toBeNull();
    expect(grid.selection.getActiveCell()).toEqual({ row: 2, col: 4 });

    const flat = await createGrid({
      columns: [{ field: "x", cellDataType: "text", width: 100 }],
      rowResize: false,
    });
    const fitRows = vi.spyOn(flat.grid.rowHeights, "fit");
    flat.grid.selection.setActiveCell(2, 0);
    expect(press(flat.grid, alt("Enter", true))).toEqual({ preventDefault: false });
    expect(fitRows).not.toHaveBeenCalled();

    flat.grid.selection.clearSelection();
    expect(press(flat.grid, alt("Enter"))).toEqual({ preventDefault: false });
  });

  it("still commits an open editor on Alt+Enter", async () => {
    const { grid } = await createGrid();
    const fitColumns = vi.spyOn(grid.columns, "fit");
    const commit = vi.spyOn(grid.edit, "commit");
    grid.selection.setActiveCell(1, 1);

    expect(press(grid, alt("Enter"), { row: 1, col: 1 })).toEqual({ preventDefault: true });
    expect(commit).toHaveBeenCalledTimes(1);
    expect(fitColumns).not.toHaveBeenCalled();
  });
});

describe("rowResize on the grid", () => {
  it("gates every row gesture while off", async () => {
    const { grid, rowEvents } = await createGrid({ rowResize: false });
    const fitRows = vi.spyOn(grid.rowHeights, "fit");
    expect(grid.rowHeights.isResizable()).toBe(false);
    grid.selection.setActiveCell(3, 2);

    expect(press(grid, alt("ArrowDown"))).toEqual({ preventDefault: false });
    expect(press(grid, alt("Enter", true))).toEqual({ preventDefault: false });
    grid.input.handleResizeDoubleClick({ axis: "row", rowIndex: 3 });
    const pointer = { clientX: 0, clientY: 0, button: 0, shiftKey: false, ctrlKey: false, metaKey: false };
    expect(grid.input.handleRowResizeMouseDown(3, ROW_HEIGHT, pointer)).toEqual({
      preventDefault: false,
      stopPropagation: false,
    });
    expect(grid.input.getDragState().rowResize).toBeNull();

    expect(heightAt(grid, 3)).toBe(ROW_HEIGHT);
    expect(fitRows).not.toHaveBeenCalled();
    expect(rowEvents).toEqual([]);
  });

  it("follows setResizable at runtime without publishing anything", async () => {
    const { grid, rowEvents } = await createGrid({ rowResize: false });
    grid.selection.setActiveCell(3, 2);
    const listener = vi.fn();
    grid.onBatchInstruction(listener);

    grid.rowHeights.setResizable(true);
    expect(listener).not.toHaveBeenCalled();
    expect(grid.rowHeights.isResizable()).toBe(true);
    expect(press(grid, alt("ArrowDown")).preventDefault).toBe(true);
    expect(heightAt(grid, 3)).toBe(ROW_HEIGHT + 4);

    grid.rowHeights.setResizable(false);
    expect(press(grid, alt("ArrowDown"))).toEqual({ preventDefault: false });
    expect(heightAt(grid, 3)).toBe(ROW_HEIGHT + 4);
    expect(rowEvents).toHaveLength(1);
  });
});

describe("edge handle double-click", () => {
  it("fits the handle's column or row, skipping a resizable: false column", async () => {
    const { grid } = await createGrid();
    const fitColumns = vi.spyOn(grid.columns, "fit");
    const fitRows = vi.spyOn(grid.rowHeights, "fit");

    grid.input.handleResizeDoubleClick({ axis: "column", colIndex: 5 });
    grid.input.handleResizeDoubleClick({ axis: "row", rowIndex: 7 });
    grid.input.handleResizeDoubleClick({ axis: "column", colIndex: 4 });

    expect(fitColumns.mock.calls).toEqual([[["d"]]]);
    expect(fitRows.mock.calls).toEqual([[[7]]]);
  });
});

describe("InputEventAdapter resize keys", () => {
  const createAdapter = (grid: GridCore<Row>) => {
    const unused = {} as InputEventAdapterDeps<Row>["autoScroll"];
    return new InputEventAdapter<Row>({
      getCore: () => grid,
      getBodyEl: () => document.body,
      autoScroll: unused,
      pendingRowDrag: unused as unknown as InputEventAdapterDeps<Row>["pendingRowDrag"],
      pendingCellTap: unused as unknown as InputEventAdapterDeps<Row>["pendingCellTap"],
      onDragStateChange: () => undefined,
    });
  };

  it("normalizes Alt+Arrow in RTL and passes Alt to the grid", async () => {
    const { grid } = await createGrid();
    const adapter = createAdapter(grid);
    vi.spyOn(window, "getComputedStyle").mockReturnValue({ direction: "rtl" } as CSSStyleDeclaration);

    grid.selection.setActiveCell(0, 5);
    adapter.keyDown(new KeyboardEvent("keydown", { key: "ArrowRight", altKey: true }), grid.selection.getActiveCell(), null, false);
    expect(widthOf(grid, "d")).toBe(92);
  });
});
