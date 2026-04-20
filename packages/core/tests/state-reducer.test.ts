// packages/core/tests/state-reducer.test.ts

import { describe, it, expect, beforeEach } from "vitest";
import { applyInstruction } from "../src/state-reducer";
import type {
  SlotData,
  HeaderData,
} from "../src/types/ui-state";
import type {
  ColumnDefinition,
  GridInstruction,
} from "../src/types";

interface Row {
  id: number;
  name: string;
}

const column: ColumnDefinition = {
  field: "name",
  cellDataType: "text",
  width: 120,
};

describe("applyInstruction", () => {
  let slots: Map<string, SlotData<Row>>;
  let headers: Map<number, HeaderData>;

  beforeEach(() => {
    slots = new Map();
    headers = new Map();
  });

  describe("slot lifecycle", () => {
    it("creates a slot with default values and returns null", () => {
      const result = applyInstruction<Row>(
        { type: "CREATE_SLOT", slotId: "s1" },
        slots,
        headers,
      );

      expect(result).toBeNull();
      expect(slots.size).toBe(1);
      const slot = slots.get("s1");
      expect(slot).toEqual({
        slotId: "s1",
        rowIndex: -1,
        rowData: {},
        translateY: 0,
      });
    });

    it("destroys an existing slot", () => {
      slots.set("s1", {
        slotId: "s1",
        rowIndex: 0,
        rowData: { id: 1, name: "a" },
        translateY: 0,
      });

      const result = applyInstruction<Row>(
        { type: "DESTROY_SLOT", slotId: "s1" },
        slots,
        headers,
      );

      expect(result).toBeNull();
      expect(slots.has("s1")).toBe(false);
    });

    it("destroying a non-existent slot is a no-op", () => {
      const result = applyInstruction<Row>(
        { type: "DESTROY_SLOT", slotId: "missing" },
        slots,
        headers,
      );

      expect(result).toBeNull();
      expect(slots.size).toBe(0);
    });

    it("assigns rowIndex and rowData onto an existing slot, preserving translateY", () => {
      slots.set("s1", {
        slotId: "s1",
        rowIndex: -1,
        rowData: {} as Row,
        translateY: 64,
      });

      const rowData: Row = { id: 42, name: "Alice" };
      const result = applyInstruction<Row>(
        {
          type: "ASSIGN_SLOT",
          slotId: "s1",
          rowIndex: 3,
          rowData,
        },
        slots,
        headers,
      );

      expect(result).toBeNull();
      expect(slots.get("s1")).toEqual({
        slotId: "s1",
        rowIndex: 3,
        rowData,
        translateY: 64,
      });
    });

    it("ASSIGN_SLOT on an unknown slot id is ignored", () => {
      const result = applyInstruction<Row>(
        {
          type: "ASSIGN_SLOT",
          slotId: "missing",
          rowIndex: 1,
          rowData: { id: 1, name: "x" },
        },
        slots,
        headers,
      );

      expect(result).toBeNull();
      expect(slots.size).toBe(0);
    });

    it("moves a slot's translateY while preserving other fields", () => {
      slots.set("s1", {
        slotId: "s1",
        rowIndex: 2,
        rowData: { id: 2, name: "b" },
        translateY: 0,
      });

      const result = applyInstruction<Row>(
        { type: "MOVE_SLOT", slotId: "s1", translateY: 256 },
        slots,
        headers,
      );

      expect(result).toBeNull();
      expect(slots.get("s1")?.translateY).toBe(256);
      expect(slots.get("s1")?.rowIndex).toBe(2);
      expect(slots.get("s1")?.rowData).toEqual({ id: 2, name: "b" });
    });

    it("MOVE_SLOT on an unknown slot id is ignored", () => {
      const result = applyInstruction<Row>(
        { type: "MOVE_SLOT", slotId: "missing", translateY: 10 },
        slots,
        headers,
      );

      expect(result).toBeNull();
      expect(slots.size).toBe(0);
    });
  });

  describe("scroll / selection / hover / edit", () => {
    it("SCROLL_TO returns pendingScrollTop", () => {
      const result = applyInstruction<Row>(
        { type: "SCROLL_TO", scrollTop: 512 },
        slots,
        headers,
      );
      expect(result).toEqual({ pendingScrollTop: 512 });
    });

    it("SET_ACTIVE_CELL returns the provided position", () => {
      const result = applyInstruction<Row>(
        { type: "SET_ACTIVE_CELL", position: { row: 2, col: 3 } },
        slots,
        headers,
      );
      expect(result).toEqual({ activeCell: { row: 2, col: 3 } });
    });

    it("SET_ACTIVE_CELL with null clears the active cell", () => {
      const result = applyInstruction<Row>(
        { type: "SET_ACTIVE_CELL", position: null },
        slots,
        headers,
      );
      expect(result).toEqual({ activeCell: null });
    });

    it("SET_SELECTION_RANGE returns the range", () => {
      const range = { start: { row: 0, col: 0 }, end: { row: 1, col: 1 } };
      const result = applyInstruction<Row>(
        { type: "SET_SELECTION_RANGE", range },
        slots,
        headers,
      );
      expect(result).toEqual({ selectionRange: range });
    });

    it("SET_SELECTION_RANGE with null clears the range", () => {
      const result = applyInstruction<Row>(
        { type: "SET_SELECTION_RANGE", range: null },
        slots,
        headers,
      );
      expect(result).toEqual({ selectionRange: null });
    });

    it("UPDATE_VISIBLE_RANGE returns range and rowsWrapperOffset", () => {
      const result = applyInstruction<Row>(
        {
          type: "UPDATE_VISIBLE_RANGE",
          start: 10,
          end: 40,
          rowsWrapperOffset: 320,
        },
        slots,
        headers,
      );
      expect(result).toEqual({
        visibleRowRange: { start: 10, end: 40 },
        rowsWrapperOffset: 320,
      });
    });

    it("SET_HOVER_POSITION returns the position", () => {
      const result = applyInstruction<Row>(
        { type: "SET_HOVER_POSITION", position: { row: 4, col: 1 } },
        slots,
        headers,
      );
      expect(result).toEqual({ hoverPosition: { row: 4, col: 1 } });
    });

    it("SET_HOVER_POSITION with null clears hover", () => {
      const result = applyInstruction<Row>(
        { type: "SET_HOVER_POSITION", position: null },
        slots,
        headers,
      );
      expect(result).toEqual({ hoverPosition: null });
    });

    it("START_EDIT returns an editingCell with row/col/initialValue", () => {
      const result = applyInstruction<Row>(
        { type: "START_EDIT", row: 1, col: 2, initialValue: "hello" },
        slots,
        headers,
      );
      expect(result).toEqual({
        editingCell: { row: 1, col: 2, initialValue: "hello" },
      });
    });

    it("STOP_EDIT clears the editingCell", () => {
      const result = applyInstruction<Row>(
        { type: "STOP_EDIT" },
        slots,
        headers,
      );
      expect(result).toEqual({ editingCell: null });
    });
  });

  describe("layout / headers", () => {
    it("SET_CONTENT_SIZE returns width/height/viewport/offset", () => {
      const result = applyInstruction<Row>(
        {
          type: "SET_CONTENT_SIZE",
          width: 800,
          height: 10_000,
          viewportWidth: 800,
          viewportHeight: 600,
          rowsWrapperOffset: 1280,
        },
        slots,
        headers,
      );
      expect(result).toEqual({
        contentWidth: 800,
        contentHeight: 10_000,
        viewportWidth: 800,
        viewportHeight: 600,
        rowsWrapperOffset: 1280,
      });
    });

    it("UPDATE_HEADER stores header data under colIndex and returns null", () => {
      const result = applyInstruction<Row>(
        {
          type: "UPDATE_HEADER",
          colIndex: 2,
          column,
          sortDirection: "asc",
          sortIndex: 0,
          hasFilter: true,
        },
        slots,
        headers,
      );
      expect(result).toBeNull();
      expect(headers.get(2)).toEqual({
        column,
        sortDirection: "asc",
        sortIndex: 0,
        hasFilter: true,
      });
    });

    it("UPDATE_HEADER overwrites a previously stored header", () => {
      headers.set(1, {
        column,
        sortDirection: "desc",
        sortIndex: 1,
        hasFilter: true,
      });

      applyInstruction<Row>(
        {
          type: "UPDATE_HEADER",
          colIndex: 1,
          column,
          hasFilter: false,
        },
        slots,
        headers,
      );

      expect(headers.get(1)).toEqual({
        column,
        sortDirection: undefined,
        sortIndex: undefined,
        hasFilter: false,
      });
    });
  });

  describe("filter popup", () => {
    it("OPEN_FILTER_POPUP returns a fully-populated filterPopup", () => {
      const anchorRect = { top: 10, left: 20, width: 100, height: 24 };
      const result = applyInstruction<Row>(
        {
          type: "OPEN_FILTER_POPUP",
          colIndex: 1,
          column,
          anchorRect,
          distinctValues: ["a", "b"],
          currentFilter: undefined,
        },
        slots,
        headers,
      );
      expect(result).toEqual({
        filterPopup: {
          isOpen: true,
          colIndex: 1,
          column,
          anchorRect,
          distinctValues: ["a", "b"],
          currentFilter: undefined,
        },
      });
    });

    it("CLOSE_FILTER_POPUP clears the popup", () => {
      const result = applyInstruction<Row>(
        { type: "CLOSE_FILTER_POPUP" },
        slots,
        headers,
      );
      expect(result).toEqual({ filterPopup: null });
    });
  });

  describe("data loading", () => {
    it("DATA_LOADING sets isLoading true and clears error", () => {
      const result = applyInstruction<Row>(
        { type: "DATA_LOADING" },
        slots,
        headers,
      );
      expect(result).toEqual({ isLoading: true, error: null });
    });

    it("DATA_LOADED sets isLoading false and totalRows", () => {
      const result = applyInstruction<Row>(
        { type: "DATA_LOADED", totalRows: 123 },
        slots,
        headers,
      );
      expect(result).toEqual({ isLoading: false, totalRows: 123 });
    });

    it("DATA_ERROR sets isLoading false and records error", () => {
      const result = applyInstruction<Row>(
        { type: "DATA_ERROR", error: "boom" },
        slots,
        headers,
      );
      expect(result).toEqual({ isLoading: false, error: "boom" });
    });
  });

  describe("row mutations / transactions", () => {
    it("ROWS_ADDED returns totalRows", () => {
      const result = applyInstruction<Row>(
        {
          type: "ROWS_ADDED",
          indices: [10, 11],
          count: 2,
          totalRows: 42,
        },
        slots,
        headers,
      );
      expect(result).toEqual({ totalRows: 42 });
    });

    it("ROWS_REMOVED returns totalRows", () => {
      const result = applyInstruction<Row>(
        {
          type: "ROWS_REMOVED",
          indices: [0],
          totalRows: 41,
        },
        slots,
        headers,
      );
      expect(result).toEqual({ totalRows: 41 });
    });

    it("ROWS_UPDATED returns null (no primitive field changes)", () => {
      const result = applyInstruction<Row>(
        { type: "ROWS_UPDATED", indices: [1, 2] },
        slots,
        headers,
      );
      expect(result).toBeNull();
    });

    it("TRANSACTION_PROCESSED returns null", () => {
      const result = applyInstruction<Row>(
        {
          type: "TRANSACTION_PROCESSED",
          added: 1,
          removed: 0,
          updated: 2,
        },
        slots,
        headers,
      );
      expect(result).toBeNull();
    });
  });

  describe("columns", () => {
    it("COLUMNS_CHANGED returns the new columns array", () => {
      const columns: ColumnDefinition[] = [
        column,
        { field: "id", cellDataType: "number", width: 60 },
      ];
      const result = applyInstruction<Row>(
        { type: "COLUMNS_CHANGED", columns },
        slots,
        headers,
      );
      expect(result).toEqual({ columns });
    });
  });

  describe("instructions without reducer-side effects", () => {
    const passthroughInstructions: GridInstruction[] = [
      { type: "START_FILL", sourceRange: { start: { row: 0, col: 0 }, end: { row: 0, col: 0 } } },
      { type: "UPDATE_FILL", targetRow: 1, targetCol: 1 },
      { type: "COMMIT_FILL", filledCells: [] },
      { type: "CANCEL_FILL" },
      { type: "COMMIT_EDIT", row: 0, col: 0, value: "v" },
      { type: "START_COLUMN_RESIZE", colIndex: 0, initialWidth: 100 },
      { type: "UPDATE_COLUMN_RESIZE", colIndex: 0, currentWidth: 120 },
      { type: "COMMIT_COLUMN_RESIZE", colIndex: 0, newWidth: 130 },
      { type: "CANCEL_COLUMN_RESIZE" },
      { type: "START_COLUMN_MOVE", sourceColIndex: 0 },
      { type: "UPDATE_COLUMN_MOVE", currentX: 10, currentY: 0, dropTargetIndex: 1 },
      { type: "COMMIT_COLUMN_MOVE", sourceColIndex: 0, targetColIndex: 1 },
      { type: "CANCEL_COLUMN_MOVE" },
      { type: "START_ROW_DRAG", sourceRowIndex: 0 },
      { type: "UPDATE_ROW_DRAG", currentX: 0, currentY: 10, dropTargetIndex: 1 },
      { type: "COMMIT_ROW_DRAG", sourceRowIndex: 0, targetRowIndex: 1 },
      { type: "CANCEL_ROW_DRAG" },
    ];

    it.each(passthroughInstructions)(
      "returns null and does not mutate maps for %o",
      (instruction) => {
        const result = applyInstruction<Row>(instruction, slots, headers);
        expect(result).toBeNull();
        expect(slots.size).toBe(0);
        expect(headers.size).toBe(0);
      },
    );
  });
});
