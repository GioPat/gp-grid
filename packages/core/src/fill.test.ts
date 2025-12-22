// packages/core/src/fill.test.ts

import { describe, it, expect, vi, beforeEach } from "vitest";
import { FillManager, type FillManagerOptions } from "./fill";
import type { GridInstruction, CellValue } from "./types";

function createMockOptions(
  rowCount = 10,
  colCount = 5,
  initialData?: CellValue[][]
): FillManagerOptions & { getData: () => CellValue[][] } {
  const data: CellValue[][] = initialData ?? [];
  
  // Initialize empty data if not provided
  if (!initialData) {
    for (let r = 0; r < rowCount; r++) {
      const row: CellValue[] = [];
      for (let c = 0; c < colCount; c++) {
        row.push(`R${r}C${c}`);
      }
      data.push(row);
    }
  }

  return {
    getRowCount: () => rowCount,
    getColumnCount: () => colCount,
    getCellValue: (row, col) => data[row]?.[col] ?? null,
    getColumn: (col) => ({
      field: `col${col}`,
      cellDataType: "text" as const,
      width: 100,
    }),
    setCellValue: (row, col, value) => {
      if (data[row]) {
        data[row][col] = value;
      }
    },
    getData: () => data,
  };
}

describe("FillManager", () => {
  let manager: FillManager;
  let options: ReturnType<typeof createMockOptions>;
  let emittedInstructions: GridInstruction[];

  beforeEach(() => {
    options = createMockOptions();
    manager = new FillManager(options);
    emittedInstructions = [];
    manager.onInstruction((instruction) => {
      emittedInstructions.push(instruction);
    });
  });

  describe("startFillDrag", () => {
    it("should initialize fill state with source range", () => {
      const sourceRange = { startRow: 0, startCol: 0, endRow: 2, endCol: 0 };
      manager.startFillDrag(sourceRange);

      const state = manager.getState();
      expect(state).toEqual({
        sourceRange,
        targetRow: 2,
        targetCol: 0,
      });
    });

    it("should emit START_FILL instruction", () => {
      const sourceRange = { startRow: 0, startCol: 0, endRow: 2, endCol: 0 };
      manager.startFillDrag(sourceRange);

      expect(emittedInstructions).toContainEqual({
        type: "START_FILL",
        sourceRange,
      });
    });

    it("should set isActive to true", () => {
      expect(manager.isActive()).toBe(false);
      
      manager.startFillDrag({ startRow: 0, startCol: 0, endRow: 0, endCol: 0 });
      
      expect(manager.isActive()).toBe(true);
    });
  });

  describe("updateFillDrag", () => {
    it("should update target position", () => {
      manager.startFillDrag({ startRow: 0, startCol: 0, endRow: 0, endCol: 0 });
      manager.updateFillDrag(5, 0);

      const state = manager.getState();
      expect(state?.targetRow).toBe(5);
      expect(state?.targetCol).toBe(0);
    });

    it("should emit UPDATE_FILL instruction", () => {
      manager.startFillDrag({ startRow: 0, startCol: 0, endRow: 0, endCol: 0 });
      emittedInstructions = [];

      manager.updateFillDrag(5, 0);

      expect(emittedInstructions).toContainEqual({
        type: "UPDATE_FILL",
        targetRow: 5,
        targetCol: 0,
      });
    });

    it("should clamp target to valid bounds", () => {
      manager.startFillDrag({ startRow: 0, startCol: 0, endRow: 0, endCol: 0 });
      manager.updateFillDrag(100, 100);

      const state = manager.getState();
      expect(state?.targetRow).toBe(9); // Max row
      expect(state?.targetCol).toBe(4); // Max col
    });

    it("should clamp negative values to zero", () => {
      manager.startFillDrag({ startRow: 5, startCol: 2, endRow: 5, endCol: 2 });
      manager.updateFillDrag(-5, -5);

      const state = manager.getState();
      expect(state?.targetRow).toBe(0);
      expect(state?.targetCol).toBe(0);
    });

    it("should do nothing if not active", () => {
      manager.updateFillDrag(5, 0);

      expect(manager.getState()).toBeNull();
      expect(emittedInstructions).toHaveLength(0);
    });
  });

  describe("cancelFillDrag", () => {
    it("should clear fill state", () => {
      manager.startFillDrag({ startRow: 0, startCol: 0, endRow: 0, endCol: 0 });
      manager.cancelFillDrag();

      expect(manager.getState()).toBeNull();
      expect(manager.isActive()).toBe(false);
    });

    it("should emit CANCEL_FILL instruction", () => {
      manager.startFillDrag({ startRow: 0, startCol: 0, endRow: 0, endCol: 0 });
      emittedInstructions = [];

      manager.cancelFillDrag();

      expect(emittedInstructions).toContainEqual({ type: "CANCEL_FILL" });
    });

    it("should do nothing if not active", () => {
      manager.cancelFillDrag();

      expect(emittedInstructions).toHaveLength(0);
    });
  });

  describe("commitFillDrag - constant pattern", () => {
    it("should fill down with constant value (single source cell)", () => {
      // Source: single cell with value "A"
      const data: CellValue[][] = [
        ["A", "B"],
        [null, null],
        [null, null],
      ];
      options = createMockOptions(3, 2, data);
      manager = new FillManager(options);

      manager.startFillDrag({ startRow: 0, startCol: 0, endRow: 0, endCol: 0 });
      manager.updateFillDrag(2, 0);
      manager.commitFillDrag();

      expect(options.getData()[1][0]).toBe("A");
      expect(options.getData()[2][0]).toBe("A");
    });

    it("should emit COMMIT_FILL with filled cells", () => {
      const data: CellValue[][] = [
        ["A"],
        [null],
        [null],
      ];
      options = createMockOptions(3, 1, data);
      manager = new FillManager(options);
      manager.onInstruction((i) => emittedInstructions.push(i));

      manager.startFillDrag({ startRow: 0, startCol: 0, endRow: 0, endCol: 0 });
      manager.updateFillDrag(2, 0);
      manager.commitFillDrag();

      const commitInstruction = emittedInstructions.find(
        (i) => i.type === "COMMIT_FILL"
      );
      expect(commitInstruction).toBeDefined();
      if (commitInstruction?.type === "COMMIT_FILL") {
        expect(commitInstruction.filledCells).toEqual([
          { row: 1, col: 0, value: "A" },
          { row: 2, col: 0, value: "A" },
        ]);
      }
    });
  });

  describe("commitFillDrag - arithmetic sequence", () => {
    it("should detect and continue arithmetic sequence (1, 2, 3 -> 4, 5, 6)", () => {
      const data: CellValue[][] = [
        [1],
        [2],
        [3],
        [null],
        [null],
        [null],
      ];
      options = createMockOptions(6, 1, data);
      manager = new FillManager(options);

      manager.startFillDrag({ startRow: 0, startCol: 0, endRow: 2, endCol: 0 });
      manager.updateFillDrag(5, 0);
      manager.commitFillDrag();

      expect(options.getData()[3][0]).toBe(4);
      expect(options.getData()[4][0]).toBe(5);
      expect(options.getData()[5][0]).toBe(6);
    });

    it("should handle arithmetic sequence with step > 1", () => {
      const data: CellValue[][] = [
        [10],
        [20],
        [30],
        [null],
        [null],
      ];
      options = createMockOptions(5, 1, data);
      manager = new FillManager(options);

      manager.startFillDrag({ startRow: 0, startCol: 0, endRow: 2, endCol: 0 });
      manager.updateFillDrag(4, 0);
      manager.commitFillDrag();

      expect(options.getData()[3][0]).toBe(40);
      expect(options.getData()[4][0]).toBe(50);
    });

    it("should handle negative arithmetic sequence", () => {
      const data: CellValue[][] = [
        [10],
        [7],
        [4],
        [null],
        [null],
      ];
      options = createMockOptions(5, 1, data);
      manager = new FillManager(options);

      manager.startFillDrag({ startRow: 0, startCol: 0, endRow: 2, endCol: 0 });
      manager.updateFillDrag(4, 0);
      manager.commitFillDrag();

      expect(options.getData()[3][0]).toBe(1);
      expect(options.getData()[4][0]).toBe(-2);
    });

    it("should handle two-cell arithmetic sequence", () => {
      const data: CellValue[][] = [
        [1],
        [2],
        [null],
        [null],
      ];
      options = createMockOptions(4, 1, data);
      manager = new FillManager(options);

      manager.startFillDrag({ startRow: 0, startCol: 0, endRow: 1, endCol: 0 });
      manager.updateFillDrag(3, 0);
      manager.commitFillDrag();

      expect(options.getData()[2][0]).toBe(3);
      expect(options.getData()[3][0]).toBe(4);
    });
  });

  describe("commitFillDrag - repeating pattern", () => {
    it("should repeat pattern (A, B -> A, B, A, B)", () => {
      const data: CellValue[][] = [
        ["A"],
        ["B"],
        [null],
        [null],
        [null],
        [null],
      ];
      options = createMockOptions(6, 1, data);
      manager = new FillManager(options);

      manager.startFillDrag({ startRow: 0, startCol: 0, endRow: 1, endCol: 0 });
      manager.updateFillDrag(5, 0);
      manager.commitFillDrag();

      expect(options.getData()[2][0]).toBe("A");
      expect(options.getData()[3][0]).toBe("B");
      expect(options.getData()[4][0]).toBe("A");
      expect(options.getData()[5][0]).toBe("B");
    });

    it("should repeat three-value pattern", () => {
      const data: CellValue[][] = [
        ["X"],
        ["Y"],
        ["Z"],
        [null],
        [null],
        [null],
      ];
      options = createMockOptions(6, 1, data);
      manager = new FillManager(options);

      manager.startFillDrag({ startRow: 0, startCol: 0, endRow: 2, endCol: 0 });
      manager.updateFillDrag(5, 0);
      manager.commitFillDrag();

      expect(options.getData()[3][0]).toBe("X");
      expect(options.getData()[4][0]).toBe("Y");
      expect(options.getData()[5][0]).toBe("Z");
    });
  });

  describe("commitFillDrag - fill up (reverse)", () => {
    it("should fill up with constant value", () => {
      const data: CellValue[][] = [
        [null],
        [null],
        ["A"],
      ];
      options = createMockOptions(3, 1, data);
      manager = new FillManager(options);

      manager.startFillDrag({ startRow: 2, startCol: 0, endRow: 2, endCol: 0 });
      manager.updateFillDrag(0, 0);
      manager.commitFillDrag();

      expect(options.getData()[0][0]).toBe("A");
      expect(options.getData()[1][0]).toBe("A");
    });

    it("should fill up with arithmetic sequence in reverse", () => {
      const data: CellValue[][] = [
        [null],
        [null],
        [null],
        [1],
        [2],
        [3],
      ];
      options = createMockOptions(6, 1, data);
      manager = new FillManager(options);

      manager.startFillDrag({ startRow: 3, startCol: 0, endRow: 5, endCol: 0 });
      manager.updateFillDrag(0, 0);
      manager.commitFillDrag();

      expect(options.getData()[2][0]).toBe(0);
      expect(options.getData()[1][0]).toBe(-1);
      expect(options.getData()[0][0]).toBe(-2);
    });
  });

  describe("commitFillDrag - multi-column fill", () => {
    it("should fill multiple columns with their respective patterns", () => {
      const data: CellValue[][] = [
        [1, "A"],
        [2, "B"],
        [null, null],
        [null, null],
      ];
      options = createMockOptions(4, 2, data);
      manager = new FillManager(options);

      manager.startFillDrag({ startRow: 0, startCol: 0, endRow: 1, endCol: 1 });
      manager.updateFillDrag(3, 1);
      manager.commitFillDrag();

      // Column 0: arithmetic sequence
      expect(options.getData()[2][0]).toBe(3);
      expect(options.getData()[3][0]).toBe(4);

      // Column 1: repeating pattern
      expect(options.getData()[2][1]).toBe("A");
      expect(options.getData()[3][1]).toBe("B");
    });
  });

  describe("getState", () => {
    it("should return null when not active", () => {
      expect(manager.getState()).toBeNull();
    });

    it("should return a copy of state", () => {
      manager.startFillDrag({ startRow: 0, startCol: 0, endRow: 0, endCol: 0 });
      
      const state1 = manager.getState();
      const state2 = manager.getState();
      
      expect(state1).not.toBe(state2);
      expect(state1).toEqual(state2);
    });
  });

  describe("instruction listener", () => {
    it("should support multiple listeners", () => {
      const listener1 = vi.fn();
      const listener2 = vi.fn();

      manager.onInstruction(listener1);
      manager.onInstruction(listener2);

      manager.startFillDrag({ startRow: 0, startCol: 0, endRow: 0, endCol: 0 });

      expect(listener1).toHaveBeenCalled();
      expect(listener2).toHaveBeenCalled();
    });

    it("should support unsubscribing", () => {
      const listener = vi.fn();
      const unsubscribe = manager.onInstruction(listener);

      manager.startFillDrag({ startRow: 0, startCol: 0, endRow: 0, endCol: 0 });
      expect(listener).toHaveBeenCalledTimes(1);

      unsubscribe();
      listener.mockClear();

      manager.cancelFillDrag();
      expect(listener).not.toHaveBeenCalled();
    });
  });
});
