// A press while a fling or wheel glide moves the content only stops it.

import { beforeEach, describe, expect, it } from "vitest";
import { GridCore } from "../src/grid-core";
import { createClientDataSource } from "../src/data-source";
import type { ColumnDefinition, InputResult, PointerEventData } from "../src/types";

interface Row {
  id: number;
  name: string;
}

const columns: ColumnDefinition[] = [
  { field: "id", cellDataType: "number", width: 50, sortable: true },
  { field: "name", cellDataType: "text", width: 150 },
];

const press = (overrides: Partial<PointerEventData> = {}): PointerEventData => ({
  clientX: 10,
  clientY: 20,
  button: 0,
  shiftKey: false,
  ctrlKey: false,
  metaKey: false,
  pointerType: "mouse",
  ...overrides,
});

const swallowed: InputResult = { preventDefault: true, stopPropagation: true };

describe("InputHandler scroll motion gate", () => {
  let grid: GridCore<Row>;
  let motion: { active: boolean; interrupts: number };

  beforeEach(async () => {
    grid = new GridCore<Row>({
      columns,
      dataSource: createClientDataSource([
        { id: 1, name: "Alice" },
        { id: 2, name: "Bob" },
      ]),
      rowHeight: 32,
      headerHeight: 40,
      rowResize: true,
    });
    await grid.initialize();
    motion = { active: true, interrupts: 0 };
    grid.viewport.setScrollMotionHandle({
      isActive: () => motion.active,
      interrupt: () => {
        motion.active = false;
        motion.interrupts += 1;
      },
    });
  });

  const pointerEntries: Array<[string, (g: GridCore<Row>) => InputResult, InputResult["startDrag"]]> = [
    ["cell", (g) => g.input.handleCellMouseDown(0, 1, press()), "selection"],
    ["header", (g) => g.input.handleHeaderMouseDown(0, 50, 40, press()), "column-move"],
    ["column resize", (g) => g.input.handleHeaderResizeMouseDown(0, 50, press()), "column-resize"],
    ["row resize", (g) => g.input.handleRowResizeMouseDown(0, 32, press()), "row-resize"],
    [
      "fill handle",
      (g) => g.input.handleFillHandleMouseDown({ row: 0, col: 1 }, null, press()),
      "fill",
    ],
  ];

  it.each(pointerEntries)("swallows a %s press that stops the motion, then works", (_, run, drag) => {
    expect(run(grid)).toEqual(swallowed);
    expect(motion.interrupts).toBe(1);
    expect(grid.input.getDragState().isDragging).toBe(false);
    expect(grid.selection.getActiveCell()).toBeNull();

    expect(run(grid).startDrag).toBe(drag);
    expect(motion.interrupts).toBe(1);
  });

  it("stops the motion on a non-primary cell press too", () => {
    expect(grid.input.handleCellMouseDown(0, 1, press({ button: 2 }))).toEqual(swallowed);
    expect(motion.interrupts).toBe(1);
  });

  it("swallows the header click that stops the motion", () => {
    grid.input.handleHeaderClick("id", false);
    expect(motion.interrupts).toBe(1);
    expect(grid.sortFilter.getSortModel()).toEqual([]);

    grid.input.handleHeaderClick("id", false);
    expect(grid.sortFilter.getSortModel()).toEqual([{ colId: "id", direction: "asc" }]);
  });

  it("swallows a resize double-click that stops the motion", () => {
    grid.input.handleResizeDoubleClick({ axis: "column", colIndex: 0 });
    expect(motion.interrupts).toBe(1);
    expect(motion.active).toBe(false);
  });

  it("swallows a group toggle that stops the motion", () => {
    expect(grid.input.handleGroupToggle(0)).toEqual({ status: "unchanged" });
    expect(motion.interrupts).toBe(1);
    expect(grid.input.handleGroupToggle(0)).toEqual({ status: "unsupported" });
  });

  it("only gates a touch press, leaving the stop to touchstart", () => {
    expect(grid.input.handleCellMouseDown(0, 1, press({ pointerType: "touch" }))).toEqual(swallowed);
    expect(grid.input.handleGroupToggle(0, "touch")).toEqual({ status: "unchanged" });
    expect(motion).toEqual({ active: true, interrupts: 0 });
    expect(grid.input.confirmPendingCellTap()).toBe(false);
  });

  it("lets presses through when nothing moves", () => {
    motion.active = false;
    expect(grid.input.handleCellMouseDown(0, 1, press()).startDrag).toBe("selection");
    expect(motion.interrupts).toBe(0);
  });
});

describe("InputHandler.handleWheel", () => {
  const createGrid = async (rowCount: number): Promise<GridCore<Row>> => {
    const rows = Array.from({ length: rowCount }, (_, id) => ({ id, name: `r${id}` }));
    const grid = new GridCore<Row>({
      columns,
      dataSource: createClientDataSource(rows),
      rowHeight: 36,
      headerHeight: 40,
    });
    await grid.initialize();
    grid.setViewport(0, 0, 800, 600);
    return grid;
  };

  it("leaves native scrolling alone on an unscaled grid", async () => {
    const grid = await createGrid(10);
    expect(grid.input.handleWheel(100, 50, 0.1)).toBeNull();
  });

  it("dampens only the scaled vertical axis and normalizes line and page deltas", async () => {
    const grid = await createGrid(1_500_000);
    expect(grid.viewport.isScaling()).toBe(true);

    const pixels = grid.input.handleWheel(100, 50, 0.1, 0);
    expect(pixels?.dy).toBeCloseTo(10, 6);
    expect(pixels?.dx).toBe(50);
    expect(grid.input.handleWheel(3, 2, 0.1, 1)).toEqual({ dy: expect.closeTo(12, 6), dx: 80 });
    expect(grid.input.handleWheel(1, 0, 0.1, 2)).toEqual({ dy: expect.closeTo(80, 6), dx: 0 });
  });
});
