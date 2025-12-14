// packages/core/src/selection.test.ts

import { describe, it, expect, vi, beforeEach } from "vitest";
import { SelectionManager, type SelectionManagerOptions } from "./selection";
import type { GridInstruction } from "./types";

function createMockOptions(
  rowCount = 10,
  colCount = 5
): SelectionManagerOptions {
  const data: Record<string, unknown>[][] = [];
  for (let r = 0; r < rowCount; r++) {
    const row: Record<string, unknown>[] = [];
    for (let c = 0; c < colCount; c++) {
      row.push({ value: `R${r}C${c}` });
    }
    data.push(row);
  }

  return {
    getRowCount: () => rowCount,
    getColumnCount: () => colCount,
    getCellValue: (row, col) => data[row]?.[col]?.value ?? null,
    getRowData: (row) => data[row] ?? undefined,
    getColumn: (col) => ({
      field: `col${col}`,
      cellDataType: "text" as const,
      width: 100,
    }),
  };
}

describe("SelectionManager", () => {
  let manager: SelectionManager;
  let options: SelectionManagerOptions;
  let emittedInstructions: GridInstruction[];

  beforeEach(() => {
    options = createMockOptions();
    manager = new SelectionManager(options);
    emittedInstructions = [];
    manager.onInstruction((instruction) => {
      emittedInstructions.push(instruction);
    });
  });

  describe("startSelection", () => {
    it("should set active cell on basic selection", () => {
      manager.startSelection({ row: 2, col: 3 });

      const state = manager.getState();
      expect(state.activeCell).toEqual({ row: 2, col: 3 });
      expect(state.anchor).toEqual({ row: 2, col: 3 });
      expect(state.range).toBeNull();
    });

    it("should emit SET_ACTIVE_CELL and SET_SELECTION_RANGE instructions", () => {
      manager.startSelection({ row: 1, col: 1 });

      expect(emittedInstructions).toHaveLength(2);
      expect(emittedInstructions[0]).toEqual({
        type: "SET_ACTIVE_CELL",
        position: { row: 1, col: 1 },
      });
      expect(emittedInstructions[1]).toEqual({
        type: "SET_SELECTION_RANGE",
        range: null,
      });
    });

    it("should extend selection with shift key", () => {
      manager.startSelection({ row: 1, col: 1 });
      emittedInstructions = [];

      manager.startSelection({ row: 4, col: 3 }, { shift: true });

      const state = manager.getState();
      expect(state.activeCell).toEqual({ row: 4, col: 3 });
      expect(state.anchor).toEqual({ row: 1, col: 1 }); // Anchor unchanged
      expect(state.range).toEqual({
        startRow: 1,
        startCol: 1,
        endRow: 4,
        endCol: 3,
      });
    });

    it("should set selection mode with ctrl key", () => {
      manager.startSelection({ row: 2, col: 2 }, { ctrl: true });

      const state = manager.getState();
      expect(state.selectionMode).toBe(true);
    });

    it("should clamp position to valid bounds", () => {
      manager.startSelection({ row: 100, col: 100 });

      const state = manager.getState();
      expect(state.activeCell).toEqual({ row: 9, col: 4 }); // Max valid indices
    });

    it("should clamp negative positions to zero", () => {
      manager.startSelection({ row: -5, col: -3 });

      const state = manager.getState();
      expect(state.activeCell).toEqual({ row: 0, col: 0 });
    });
  });

  describe("moveFocus", () => {
    it("should select first cell if no active cell", () => {
      manager.moveFocus("down");

      const state = manager.getState();
      expect(state.activeCell).toEqual({ row: 0, col: 0 });
    });

    it("should move down", () => {
      manager.startSelection({ row: 2, col: 2 });
      emittedInstructions = [];

      manager.moveFocus("down");

      const state = manager.getState();
      expect(state.activeCell).toEqual({ row: 3, col: 2 });
      expect(state.range).toBeNull();
    });

    it("should move up", () => {
      manager.startSelection({ row: 2, col: 2 });
      manager.moveFocus("up");

      const state = manager.getState();
      expect(state.activeCell).toEqual({ row: 1, col: 2 });
    });

    it("should move left", () => {
      manager.startSelection({ row: 2, col: 2 });
      manager.moveFocus("left");

      const state = manager.getState();
      expect(state.activeCell).toEqual({ row: 2, col: 1 });
    });

    it("should move right", () => {
      manager.startSelection({ row: 2, col: 2 });
      manager.moveFocus("right");

      const state = manager.getState();
      expect(state.activeCell).toEqual({ row: 2, col: 3 });
    });

    it("should not move past top boundary", () => {
      manager.startSelection({ row: 0, col: 2 });
      manager.moveFocus("up");

      const state = manager.getState();
      expect(state.activeCell).toEqual({ row: 0, col: 2 });
    });

    it("should not move past bottom boundary", () => {
      manager.startSelection({ row: 9, col: 2 });
      manager.moveFocus("down");

      const state = manager.getState();
      expect(state.activeCell).toEqual({ row: 9, col: 2 });
    });

    it("should not move past left boundary", () => {
      manager.startSelection({ row: 2, col: 0 });
      manager.moveFocus("left");

      const state = manager.getState();
      expect(state.activeCell).toEqual({ row: 2, col: 0 });
    });

    it("should not move past right boundary", () => {
      manager.startSelection({ row: 2, col: 4 });
      manager.moveFocus("right");

      const state = manager.getState();
      expect(state.activeCell).toEqual({ row: 2, col: 4 });
    });

    it("should extend selection when extend is true", () => {
      manager.startSelection({ row: 2, col: 2 });
      emittedInstructions = [];

      manager.moveFocus("down", true);
      manager.moveFocus("right", true);

      const state = manager.getState();
      expect(state.activeCell).toEqual({ row: 3, col: 3 });
      expect(state.anchor).toEqual({ row: 2, col: 2 });
      expect(state.range).toEqual({
        startRow: 2,
        startCol: 2,
        endRow: 3,
        endCol: 3,
      });
    });

    it("should set anchor when extending without existing anchor", () => {
      manager.startSelection({ row: 2, col: 2 });
      // Clear anchor manually to test edge case
      manager.clearSelection();
      manager.setActiveCell(2, 2);

      manager.moveFocus("down", true);

      const state = manager.getState();
      expect(state.anchor).toEqual({ row: 2, col: 2 });
    });
  });

  describe("selectAll", () => {
    it("should select all cells", () => {
      manager.selectAll();

      const state = manager.getState();
      expect(state.range).toEqual({
        startRow: 0,
        startCol: 0,
        endRow: 9,
        endCol: 4,
      });
    });

    it("should set active cell to first cell if none exists", () => {
      manager.selectAll();

      const state = manager.getState();
      expect(state.activeCell).toEqual({ row: 0, col: 0 });
    });

    it("should keep existing active cell", () => {
      manager.startSelection({ row: 3, col: 2 });
      manager.selectAll();

      const state = manager.getState();
      expect(state.activeCell).toEqual({ row: 3, col: 2 });
    });

    it("should not select if grid is empty", () => {
      const emptyOptions = createMockOptions(0, 0);
      const emptyManager = new SelectionManager(emptyOptions);

      emptyManager.selectAll();

      const state = emptyManager.getState();
      expect(state.range).toBeNull();
    });
  });

  describe("clearSelection", () => {
    it("should clear all selection state", () => {
      manager.startSelection({ row: 2, col: 2 });
      manager.moveFocus("down", true);
      emittedInstructions = [];

      manager.clearSelection();

      const state = manager.getState();
      expect(state.activeCell).toBeNull();
      expect(state.range).toBeNull();
      expect(state.anchor).toBeNull();
      expect(state.selectionMode).toBe(false);
    });

    it("should emit null position and range", () => {
      manager.startSelection({ row: 2, col: 2 });
      emittedInstructions = [];

      manager.clearSelection();

      expect(emittedInstructions).toContainEqual({
        type: "SET_ACTIVE_CELL",
        position: null,
      });
      expect(emittedInstructions).toContainEqual({
        type: "SET_SELECTION_RANGE",
        range: null,
      });
    });
  });

  describe("setActiveCell", () => {
    it("should set active cell and anchor", () => {
      manager.setActiveCell(3, 2);

      const state = manager.getState();
      expect(state.activeCell).toEqual({ row: 3, col: 2 });
      expect(state.anchor).toEqual({ row: 3, col: 2 });
      expect(state.range).toBeNull();
    });

    it("should clamp to valid bounds", () => {
      manager.setActiveCell(100, 100);

      const state = manager.getState();
      expect(state.activeCell).toEqual({ row: 9, col: 4 });
    });
  });

  describe("setSelectionRange", () => {
    it("should set selection range", () => {
      const range = { startRow: 1, startCol: 1, endRow: 3, endCol: 3 };
      manager.setSelectionRange(range);

      const state = manager.getState();
      expect(state.range).toEqual(range);
    });

    it("should emit SET_SELECTION_RANGE instruction", () => {
      const range = { startRow: 1, startCol: 1, endRow: 3, endCol: 3 };
      manager.setSelectionRange(range);

      expect(emittedInstructions).toContainEqual({
        type: "SET_SELECTION_RANGE",
        range,
      });
    });
  });

  describe("isSelected", () => {
    it("should return false when no range", () => {
      expect(manager.isSelected(2, 2)).toBe(false);
    });

    it("should return true for cells in range", () => {
      manager.startSelection({ row: 1, col: 1 });
      manager.startSelection({ row: 3, col: 3 }, { shift: true });

      expect(manager.isSelected(2, 2)).toBe(true);
      expect(manager.isSelected(1, 1)).toBe(true);
      expect(manager.isSelected(3, 3)).toBe(true);
    });

    it("should return false for cells outside range", () => {
      manager.startSelection({ row: 1, col: 1 });
      manager.startSelection({ row: 3, col: 3 }, { shift: true });

      expect(manager.isSelected(0, 0)).toBe(false);
      expect(manager.isSelected(4, 4)).toBe(false);
      expect(manager.isSelected(2, 4)).toBe(false);
    });

    it("should handle inverted ranges (end < start)", () => {
      manager.startSelection({ row: 3, col: 3 });
      manager.startSelection({ row: 1, col: 1 }, { shift: true });

      expect(manager.isSelected(2, 2)).toBe(true);
    });
  });

  describe("isActiveCell", () => {
    it("should return false when no active cell", () => {
      expect(manager.isActiveCell(0, 0)).toBe(false);
    });

    it("should return true for active cell", () => {
      manager.startSelection({ row: 2, col: 3 });
      expect(manager.isActiveCell(2, 3)).toBe(true);
    });

    it("should return false for non-active cells", () => {
      manager.startSelection({ row: 2, col: 3 });
      expect(manager.isActiveCell(2, 2)).toBe(false);
      expect(manager.isActiveCell(3, 3)).toBe(false);
    });
  });

  describe("getSelectedData", () => {
    it("should return empty array when no selection", () => {
      const data = manager.getSelectedData();
      expect(data).toEqual([]);
    });

    it("should return single cell data when only active cell", () => {
      manager.startSelection({ row: 2, col: 3 });
      const data = manager.getSelectedData();
      expect(data).toEqual([["R2C3"]]);
    });

    it("should return range data as 2D array", () => {
      manager.startSelection({ row: 0, col: 0 });
      manager.startSelection({ row: 1, col: 1 }, { shift: true });

      const data = manager.getSelectedData();
      expect(data).toEqual([
        ["R0C0", "R0C1"],
        ["R1C0", "R1C1"],
      ]);
    });

    it("should handle inverted ranges correctly", () => {
      manager.startSelection({ row: 1, col: 1 });
      manager.startSelection({ row: 0, col: 0 }, { shift: true });

      const data = manager.getSelectedData();
      expect(data).toEqual([
        ["R0C0", "R0C1"],
        ["R1C0", "R1C1"],
      ]);
    });
  });

  describe("getActiveCell", () => {
    it("should return null when no active cell", () => {
      expect(manager.getActiveCell()).toBeNull();
    });

    it("should return active cell position", () => {
      manager.startSelection({ row: 2, col: 3 });
      expect(manager.getActiveCell()).toEqual({ row: 2, col: 3 });
    });
  });

  describe("getSelectionRange", () => {
    it("should return null when no range", () => {
      expect(manager.getSelectionRange()).toBeNull();
    });

    it("should return selection range", () => {
      manager.startSelection({ row: 1, col: 1 });
      manager.startSelection({ row: 3, col: 3 }, { shift: true });

      expect(manager.getSelectionRange()).toEqual({
        startRow: 1,
        startCol: 1,
        endRow: 3,
        endCol: 3,
      });
    });
  });

  describe("instruction listener", () => {
    it("should support multiple listeners", () => {
      const listener1 = vi.fn();
      const listener2 = vi.fn();

      manager.onInstruction(listener1);
      manager.onInstruction(listener2);

      manager.startSelection({ row: 0, col: 0 });

      expect(listener1).toHaveBeenCalled();
      expect(listener2).toHaveBeenCalled();
    });

    it("should support unsubscribing", () => {
      const listener = vi.fn();
      const unsubscribe = manager.onInstruction(listener);

      manager.startSelection({ row: 0, col: 0 });
      expect(listener).toHaveBeenCalledTimes(2); // SET_ACTIVE_CELL + SET_SELECTION_RANGE

      unsubscribe();
      listener.mockClear();

      manager.startSelection({ row: 1, col: 1 });
      expect(listener).not.toHaveBeenCalled();
    });
  });
});
