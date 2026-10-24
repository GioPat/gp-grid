// packages/core/tests/grid-core-pinning.test.ts

import { describe, expect, it, vi } from "vitest";
import { GridCore } from "../src/grid-core";
import { createClientDataSource } from "../src/data-source";
import type { ColumnDefinition, GridInstruction } from "../src/types";

const def = (field: string, extra: Partial<ColumnDefinition> = {}): ColumnDefinition => ({
  field,
  cellDataType: "text",
  width: 100,
  ...extra,
});

const wideColumns = (count: number): ColumnDefinition[] =>
  Array.from({ length: count }, (_, index) =>
    def(`c${index}`, { width: 50 + (index % 3) * 10 }));

interface Fixture {
  grid: GridCore<Record<string, unknown>>;
  instructions: GridInstruction[];
  batches: GridInstruction[][];
}

const createGrid = (options: {
  columns?: ColumnDefinition[];
  viewportWidth?: number;
  viewportHeight?: number;
  columnLayout?: "fit" | "fixed";
  onColumnPinned?: (event: unknown) => void;
} = {}): Fixture => {
  const columns = options.columns ?? wideColumns(100);
  const grid = new GridCore<Record<string, unknown>>({
    columns,
    dataSource: createClientDataSource(
      Array.from({ length: 5 }, (_, index) => ({ id: index })),
    ),
    rowHeight: 32,
    headerHeight: 32,
    columnLayout: options.columnLayout ?? "fixed",
    onColumnPinned: options.onColumnPinned as never,
  });
  const instructions: GridInstruction[] = [];
  const batches: GridInstruction[][] = [];
  grid.onBatchInstruction((batch) => {
    instructions.push(...batch);
    batches.push(batch);
  });
  return { grid, instructions, batches };
};

const ids = (grid: GridCore<Record<string, unknown>>): string[] =>
  grid.geometry.getColumnLayout().columns.map((column) => column.columnId);

const lastWindow = (
  batches: GridInstruction[][],
): Extract<GridInstruction, { type: "SET_COLUMN_WINDOW" }> | undefined => {
  for (let index = batches.length - 1; index >= 0; index -= 1) {
    const found = batches[index]!.find((instruction) => instruction.type === "SET_COLUMN_WINDOW");
    if (found?.type === "SET_COLUMN_WINDOW") return found;
  }
  return undefined;
};

describe("GridCore pinning", () => {
  it("moves a pinned column to its region and reports the effective state", () => {
    const { grid } = createGrid({ columnLayout: "fixed" });
    grid.setViewport(0, 0, 200, 320);

    grid.columns.setPinned("c3", "start");
    expect(ids(grid)[0]).toBe("c3");
    expect(grid.columns.getState().find((state) => state.columnId === "c3")).toMatchObject({
      pinned: "start",
      region: "start",
    });

    grid.columns.setPinned("c3", null);
    expect(ids(grid)[0]).toBe("c0");
    expect(grid.columns.getState().find((state) => state.columnId === "c3")).toMatchObject({
      pinned: null,
      region: "center",
    });
  });

  it("returns an unpinned column to its base-order slot", () => {
    const { grid } = createGrid({ columns: [def("a"), def("b"), def("c")], columnLayout: "fixed" });
    grid.columns.move(2, 0);
    expect(ids(grid)).toEqual(["c", "a", "b"]);

    grid.columns.setPinned("c", "end");
    expect(ids(grid)).toEqual(["a", "b", "c"]);
    grid.columns.setPinned("c", null);
    expect(ids(grid)).toEqual(["c", "a", "b"]);
  });

  it("fires onColumnPinned once per applied change and never on a no-op", () => {
    const onColumnPinned = vi.fn();
    const { grid } = createGrid({ onColumnPinned });

    grid.columns.setPinned("c1", "start");
    expect(onColumnPinned).toHaveBeenCalledTimes(1);
    expect(onColumnPinned).toHaveBeenCalledWith({ columnId: "c1", pinned: "start" });

    grid.columns.setPinned("c1", "start");
    expect(onColumnPinned).toHaveBeenCalledTimes(1);

    grid.columns.setPinned("missing", "start");
    expect(onColumnPinned).toHaveBeenCalledTimes(1);

    grid.columns.setPinned("c1", null);
    expect(onColumnPinned).toHaveBeenLastCalledWith({ columnId: "c1", pinned: null });
  });

  it("treats an explicit unpin as beating a definition default", () => {
    const { grid } = createGrid({
      columns: [def("a", { pinned: "start" }), def("b")],
      columnLayout: "fixed",
    });
    expect(ids(grid)).toEqual(["a", "b"]);
    expect(grid.columns.getState()[0]).toMatchObject({ pinned: "start", region: "start" });

    grid.columns.setState([{ columnId: "a", pinned: null }]);
    expect(grid.columns.getState()[0]).toMatchObject({ pinned: null, region: "center" });
    expect(ids(grid)).toEqual(["a", "b"]);

    grid.columns.resetState(["a"]);
    expect(grid.columns.getState()[0]).toMatchObject({ pinned: "start", region: "start" });
  });

  it("clears the selection range when a pin reorders the visual layout", () => {
    const { grid } = createGrid({ columns: [def("a"), def("b"), def("c")], columnLayout: "fixed" });
    grid.selection.setSelectionRange({ startRow: 0, startCol: 0, endRow: 1, endCol: 2 });

    grid.columns.setPinned("c", "start");
    expect(grid.selection.getSelectionRange()).toBeNull();
  });

  it("adopts the target's pin when a move crosses a region", () => {
    const onColumnPinned = vi.fn();
    const { grid } = createGrid({
      columns: [def("a"), def("b"), def("c")],
      columnLayout: "fixed",
      onColumnPinned,
    });
    grid.columns.setPinned("a", "start");
    expect(ids(grid)).toEqual(["a", "b", "c"]);

    // Drop "c" before the start-pinned column "a": it adopts "start".
    grid.columns.move(2, 0);
    expect(grid.columns.getState().find((state) => state.columnId === "c")).toMatchObject({
      pinned: "start",
    });
    expect(onColumnPinned).toHaveBeenCalledWith({ columnId: "c", pinned: "start" });
  });

  it("keeps a move inside its own region without changing the pin", () => {
    const onColumnPinned = vi.fn();
    const { grid } = createGrid({
      columns: [def("a"), def("b"), def("c"), def("d")],
      columnLayout: "fixed",
      onColumnPinned,
    });
    grid.columns.setPinned("a", "start");
    grid.columns.setPinned("b", "start");

    // Both are start pins, so this move stays inside the region.
    grid.columns.move(1, 0);
    expect(ids(grid)).toEqual(["b", "a", "c", "d"]);
    expect(onColumnPinned).toHaveBeenCalledTimes(2);
  });

  it("publishes a bounded center window and moves it with scrollLeft only", () => {
    const { grid, instructions, batches } = createGrid({});
    grid.setViewport(0, 0, 200, 320);
    expect(ids(grid)).toHaveLength(100);

    const initial = lastWindow(batches);
    expect(initial).toBeDefined();
    const readonlyCount = initial!.window.center.length;
    expect(readonlyCount).toBeGreaterThan(0);
    expect(readonlyCount).toBeLessThan(100);

    instructions.length = 0;
    batches.length = 0;
    grid.setViewport(0, 4_000, 200, 320);

    const moved = lastWindow(batches);
    expect(moved).toBeDefined();
    expect(moved!.window.center.length).toBeLessThan(100);
    expect(instructions.some((instruction) => instruction.type === "ASSIGN_SLOT")).toBe(false);
    expect(instructions.some((instruction) => instruction.type === "UPDATE_VISIBLE_RANGE")).toBe(false);
  });

  it("emits nothing when a horizontal scroll does not move the range", () => {
    const { grid, batches } = createGrid({});
    grid.setViewport(0, 0, 200, 320);
    batches.length = 0;

    grid.setViewport(0, 4, 200, 320);
    expect(batches).toHaveLength(0);
  });

  it("keeps an edited column mounted while it sits outside the window", () => {
    const columns = wideColumns(1000);
    columns[600] = def("c600", { width: columns[600]!.width, editable: true });
    const { grid } = createGrid({ columns });
    grid.setViewport(0, 0, 200, 320);

    expect(grid.edit.start(0, 600)).toBe(true);
    const window = grid.geometry.getColumnWindow();
    expect(window.range.end).toBeLessThan(600);
    expect(window.center.map((column) => column.columnId)).toContain("c600");

    grid.edit.commit();
    expect(grid.edit.getState()).toBeNull();
  });

  it("commits an open edit before its column is hidden", () => {
    const { grid } = createGrid({ columns: [def("a", { editable: true }), def("b")], columnLayout: "fixed" });
    grid.edit.start(0, 0);
    grid.columns.setState([{ columnId: "a", hidden: true }]);

    expect(grid.edit.getState()).toBeNull();
  });

  it("releases the edit retention after the edit closes", () => {
    const columns = wideColumns(100);
    columns[60] = def("c60", { width: columns[60]!.width, editable: true });
    const { grid } = createGrid({ columns });
    grid.setViewport(0, 0, 200, 320);
    // Scroll far away so the edited column is outside the window first.
    grid.setViewport(0, 4_000, 200, 320);
    const before = grid.geometry.getColumnWindow();
    expect(before.center.map((column) => column.columnId)).not.toContain("c60");

    grid.edit.start(0, 60);
    const during = grid.geometry.getColumnWindow();
    expect(during.center.map((column) => column.columnId)).toContain("c60");

    grid.edit.cancel();
    const after = grid.geometry.getColumnWindow();
    expect(after.center.map((column) => column.columnId)).not.toContain("c60");
  });

  it("skips hidden columns when moving keyboard focus", () => {
    const { grid } = createGrid({
      columns: [def("a"), def("b"), def("c"), def("d")],
      columnLayout: "fixed",
    });
    grid.columns.setState([{ columnId: "b", hidden: true }]);
    grid.selection.setActiveCell(0, 0);

    grid.selection.moveFocus("right", false);
    expect(grid.selection.getActiveCell()).toEqual({ row: 0, col: 2 });

    grid.selection.moveFocus("left", false);
    expect(grid.selection.getActiveCell()).toEqual({ row: 0, col: 0 });
  });
});
