// Touch tap-to-select behavior of InputHandler: on touch, selection is
// deferred from pointerdown to an explicit tap confirmation so scroll
// gestures never select a cell (and never show the fill handle).

import { describe, it, expect, beforeEach } from "vitest";
import { GridCore } from "../src/grid-core";
import { createClientDataSource } from "../src/data-source";
import type { ColumnDefinition, PointerEventData } from "../src/types";

interface TestRow {
  id: number;
  name: string;
}

const sampleData: TestRow[] = [
  { id: 1, name: "Alice" },
  { id: 2, name: "Bob" },
  { id: 3, name: "Charlie" },
];

const columns: ColumnDefinition[] = [
  { field: "id", cellDataType: "number", width: 50, rowDrag: true },
  { field: "name", cellDataType: "text", width: 150, editable: true },
];

const pointerEvent = (
  overrides: Partial<PointerEventData> = {},
): PointerEventData => ({
  clientX: 10,
  clientY: 20,
  button: 0,
  shiftKey: false,
  ctrlKey: false,
  metaKey: false,
  pointerType: "mouse",
  ...overrides,
});

describe("InputHandler touch tap-to-select", () => {
  let grid: GridCore<TestRow>;

  beforeEach(async () => {
    grid = new GridCore<TestRow>({
      columns,
      dataSource: createClientDataSource([...sampleData]),
      rowHeight: 32,
      headerHeight: 40,
    });
    await grid.initialize();
  });

  describe("plain cell (no rowDrag)", () => {
    it("defers selection on touch pointerdown and requests tap tracking", () => {
      const result = grid.input.handleCellMouseDown(
        1,
        1,
        pointerEvent({ pointerType: "touch" }),
      );

      expect(grid.selection.getActiveCell()).toBeNull();
      expect(result.startTap).toBe(true);
      expect(result.startDrag).toBeUndefined();
      expect(result.focusContainer).toBe(false);
    });

    it("selects the cell when the pending tap is confirmed", () => {
      grid.input.handleCellMouseDown(1, 1, pointerEvent({ pointerType: "touch" }));

      expect(grid.input.confirmPendingCellTap()).toBe(true);
      expect(grid.selection.getActiveCell()).toEqual({ row: 1, col: 1 });
    });

    it("does not select when the pending tap is cancelled (scroll gesture)", () => {
      grid.input.handleCellMouseDown(1, 1, pointerEvent({ pointerType: "touch" }));
      grid.input.cancelPendingCellTap();

      expect(grid.input.confirmPendingCellTap()).toBe(false);
      expect(grid.selection.getActiveCell()).toBeNull();
    });

    it("confirming twice only selects once", () => {
      grid.input.handleCellMouseDown(1, 1, pointerEvent({ pointerType: "touch" }));

      expect(grid.input.confirmPendingCellTap()).toBe(true);
      expect(grid.input.confirmPendingCellTap()).toBe(false);
    });
  });

  describe("mouse regression", () => {
    it("selects immediately and starts a selection drag", () => {
      const result = grid.input.handleCellMouseDown(2, 1, pointerEvent());

      expect(grid.selection.getActiveCell()).toEqual({ row: 2, col: 1 });
      expect(result.startDrag).toBe("selection");
      expect(result.focusContainer).toBe(true);
      expect(result.startTap).toBeUndefined();
    });

    it("keeps shift-click range extension", () => {
      grid.input.handleCellMouseDown(0, 1, pointerEvent());
      const result = grid.input.handleCellMouseDown(
        2,
        1,
        pointerEvent({ shiftKey: true }),
      );

      expect(result.startDrag).toBeUndefined();
      expect(grid.selection.getState().range).toEqual({
        startRow: 0,
        startCol: 1,
        endRow: 2,
        endCol: 1,
      });
    });
  });

  describe("row-drag column on touch", () => {
    it("does not select on pointerdown but tracks both pending states", () => {
      const result = grid.input.handleCellMouseDown(
        1,
        0,
        pointerEvent({ pointerType: "touch" }),
      );

      expect(grid.selection.getActiveCell()).toBeNull();
      expect(result.startDrag).toBe("row-drag-pending");
      expect(result.startTap).toBe(true);
    });

    it("selects the dragged row when the long-press confirms", () => {
      grid.input.handleCellMouseDown(1, 0, pointerEvent({ pointerType: "touch" }));

      expect(grid.input.confirmPendingRowDrag()).toBe(true);
      expect(grid.selection.getActiveCell()).toEqual({ row: 1, col: 0 });
      // The tap record was cleared, so a later pointerup is a no-op.
      expect(grid.input.confirmPendingCellTap()).toBe(false);
    });

    it("selects via tap confirmation when released before the hold", () => {
      grid.input.handleCellMouseDown(1, 0, pointerEvent({ pointerType: "touch" }));
      grid.input.cancelPendingRowDrag();

      expect(grid.input.confirmPendingCellTap()).toBe(true);
      expect(grid.selection.getActiveCell()).toEqual({ row: 1, col: 0 });
    });

    it("selects immediately with a mouse (drag starts right away)", () => {
      const result = grid.input.handleCellMouseDown(1, 0, pointerEvent());

      expect(result.startDrag).toBe("row-drag");
      expect(grid.selection.getActiveCell()).toEqual({ row: 1, col: 0 });
    });
  });
});
