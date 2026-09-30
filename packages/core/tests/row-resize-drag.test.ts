// packages/core/tests/row-resize-drag.test.ts
// PRD 007 D4: dragging a row's bottom edge through `InputHandler`.

import { describe, expect, it } from "vitest";
import { GridCore } from "../src/grid-core";
import { createClientDataSource } from "../src/data-source";
import { MIN_ROW_RESIZE_HEIGHT, clampRowHeight } from "../src/input";
import type {
  AutoFitOptions,
  ColumnDefinition,
  FreezeRowsOptions,
  GridInstruction,
  RowResizedEvent,
} from "../src/types";
import type { PointerEventData } from "../src/types/input";

interface Row {
  id: number;
}

const ROW_HEIGHT = 32;
const START_Y = 300;

const columns: ColumnDefinition[] = [
  { field: "id", cellDataType: "number", width: 100 },
];

const pointer = (dy: number, button = 0): PointerEventData => ({
  clientX: 10,
  clientY: START_Y + dy,
  button,
  shiftKey: false,
  ctrlKey: false,
  metaKey: false,
});

const bounds = { top: 0, left: 0, width: 400, height: 320, scrollTop: 0, scrollLeft: 0 };

const createGrid = async (options: { freezeRows?: FreezeRowsOptions; autoFit?: AutoFitOptions } = {}) => {
  const events: RowResizedEvent[] = [];
  const grid = new GridCore<Row>({
    columns,
    dataSource: createClientDataSource(Array.from({ length: 200 }, (_, id) => ({ id: id + 1_000 }))),
    rowHeight: ROW_HEIGHT,
    getRowId: (row) => row.id,
    freezeRows: options.freezeRows,
    autoFit: options.autoFit,
    rowResize: true,
    onRowResized: (event) => events.push(event),
  });
  await grid.initialize();
  grid.setViewport(0, 0, 400, 320);
  return { grid, events };
};

const record = (grid: GridCore<Row>): GridInstruction[][] => {
  const batches: GridInstruction[][] = [];
  grid.onBatchInstruction((batch) => batches.push([...batch]));
  return batches;
};

const heightAt = (grid: GridCore<Row>, viewIndex: number): number => {
  const rowBounds = grid.geometry.getRowBounds(viewIndex, "content");
  return rowBounds === undefined ? 0 : rowBounds.end - rowBounds.start;
};

describe("clampRowHeight", () => {
  it("clamps into [16, maxRowHeight] and lets the maximum win", () => {
    expect(MIN_ROW_RESIZE_HEIGHT).toBe(16);
    expect(clampRowHeight(4, 320)).toBe(16);
    expect(clampRowHeight(400, 320)).toBe(320);
    expect(clampRowHeight(40, 320)).toBe(40);
    expect(clampRowHeight(4, 10)).toBe(10);
  });
});

describe("RowResizeDrag", () => {
  it("previews, then commits the height and fires one onRowResized on release", async () => {
    const { grid, events } = await createGrid();

    expect(grid.input.handleRowResizeMouseDown(2, ROW_HEIGHT, pointer(0))).toEqual({
      preventDefault: true,
      stopPropagation: true,
      startDrag: "row-resize",
    });
    grid.input.handleDragMove(pointer(40), bounds);

    const state = grid.input.getDragState();
    expect(state.dragType).toBe("row-resize");
    expect(state.rowResize).toEqual({
      rowIndex: 2,
      rowId: 1_002,
      initialHeight: ROW_HEIGHT,
      currentHeight: 72,
      lineY: 2 * ROW_HEIGHT + 72,
      region: "suffix",
    });
    expect(heightAt(grid, 2)).toBe(ROW_HEIGHT);

    grid.input.handleDragEnd();

    expect(heightAt(grid, 2)).toBe(72);
    expect(grid.rowHeights.getOverrides()).toEqual([{ rowId: 1_002, height: 72 }]);
    expect(events).toEqual([{ rowId: 1_002, height: 72, viewIndex: 2 }]);
    expect(grid.input.getDragState().rowResize).toBeNull();
  });

  it("clamps the preview into [16, maxRowHeight]", async () => {
    const { grid } = await createGrid({ autoFit: { maxRowHeight: 100 } });
    grid.input.handleRowResizeMouseDown(0, ROW_HEIGHT, pointer(0));

    grid.input.handleDragMove(pointer(-200), bounds);
    expect(grid.input.getDragState().rowResize?.currentHeight).toBe(16);
    grid.input.handleDragMove(pointer(500), bounds);
    expect(grid.input.getDragState().rowResize?.currentHeight).toBe(100);
  });

  it("places lineY in the frozen band and below it in the suffix", async () => {
    const { grid } = await createGrid({ freezeRows: { count: 3 } });
    grid.setViewport(640, 0, 400, 320);

    grid.input.handleRowResizeMouseDown(1, ROW_HEIGHT, pointer(0));
    grid.input.handleDragMove(pointer(8), bounds);
    expect(grid.input.getDragState().rowResize).toMatchObject({
      region: "frozen",
      lineY: ROW_HEIGHT + 40,
    });
    grid.input.handleDragEnd();

    const suffixRow = grid.geometry.getVisibleRowWindow().start + 1;
    const suffixTop = grid.geometry.getRowBounds(suffixRow, "viewport")?.start ?? Number.NaN;
    grid.input.handleRowResizeMouseDown(suffixRow, ROW_HEIGHT, pointer(0));
    grid.input.handleDragMove(pointer(8), bounds);
    expect(grid.input.getDragState().rowResize).toMatchObject({
      region: "suffix",
      lineY: suffixTop + 40,
    });
  });

  it("commits nothing for a press without movement or a drag back to the start", async () => {
    const { grid, events } = await createGrid();
    const batches = record(grid);

    grid.input.handleRowResizeMouseDown(2, ROW_HEIGHT, pointer(0));
    grid.input.handleDragEnd();
    grid.input.handleRowResizeMouseDown(2, ROW_HEIGHT, pointer(0));
    grid.input.handleDragMove(pointer(30), bounds);
    grid.input.handleDragMove(pointer(0), bounds);
    grid.input.handleDragEnd();

    expect(batches).toEqual([]);
    expect(events).toEqual([]);
    expect(grid.rowHeights.getOverrides()).toEqual([]);
  });

  it("ignores a non-primary button and a row that is not loaded", async () => {
    const { grid } = await createGrid();
    const ignored = { preventDefault: false, stopPropagation: false };

    expect(grid.input.handleRowResizeMouseDown(2, ROW_HEIGHT, pointer(0, 2))).toEqual(ignored);
    expect(grid.input.handleRowResizeMouseDown(5_000, ROW_HEIGHT, pointer(0))).toEqual(ignored);
    expect(grid.input.getDragState().isDragging).toBe(false);
  });
});
