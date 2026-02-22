// packages/core/src/state-reducer.ts

import type { GridInstruction } from "./types";
import type { SlotData, HeaderData, GridState } from "./types/ui-state";
import type { Row } from "./types";

/**
 * Apply a single instruction to mutable slot/header Maps and return
 * other state changes as a partial object.
 *
 * Returns `null` when only the Maps were mutated (no primitive field changes).
 */
export const applyInstruction = <TData = Row>(
  instruction: GridInstruction,
  slots: Map<string, SlotData<TData>>,
  headers: Map<number, HeaderData>,
): Partial<GridState<TData>> | null => {
  switch (instruction.type) {
    case "CREATE_SLOT":
      slots.set(instruction.slotId, {
        slotId: instruction.slotId,
        rowIndex: -1,
        rowData: {} as TData,
        translateY: 0,
      });
      return null;

    case "DESTROY_SLOT":
      slots.delete(instruction.slotId);
      return null;

    case "ASSIGN_SLOT": {
      const existing = slots.get(instruction.slotId);
      if (existing) {
        slots.set(instruction.slotId, {
          ...existing,
          rowIndex: instruction.rowIndex,
          rowData: instruction.rowData as TData,
        });
      }
      return null;
    }

    case "MOVE_SLOT": {
      const existing = slots.get(instruction.slotId);
      if (existing) {
        slots.set(instruction.slotId, {
          ...existing,
          translateY: instruction.translateY,
        });
      }
      return null;
    }

    case "SET_ACTIVE_CELL":
      return { activeCell: instruction.position };

    case "SET_SELECTION_RANGE":
      return { selectionRange: instruction.range };

    case "UPDATE_VISIBLE_RANGE":
      return {
        visibleRowRange: { start: instruction.start, end: instruction.end },
        rowsWrapperOffset: instruction.rowsWrapperOffset,
      };

    case "SET_HOVER_POSITION":
      return { hoverPosition: instruction.position };

    case "START_EDIT":
      return {
        editingCell: {
          row: instruction.row,
          col: instruction.col,
          initialValue: instruction.initialValue,
        },
      };

    case "STOP_EDIT":
      return { editingCell: null };

    case "SET_CONTENT_SIZE":
      return {
        contentWidth: instruction.width,
        contentHeight: instruction.height,
        viewportWidth: instruction.viewportWidth,
        viewportHeight: instruction.viewportHeight,
        rowsWrapperOffset: instruction.rowsWrapperOffset,
      };

    case "UPDATE_HEADER":
      headers.set(instruction.colIndex, {
        column: instruction.column,
        sortDirection: instruction.sortDirection,
        sortIndex: instruction.sortIndex,
        hasFilter: instruction.hasFilter,
      });
      return null;

    case "OPEN_FILTER_POPUP":
      return {
        filterPopup: {
          isOpen: true,
          colIndex: instruction.colIndex,
          column: instruction.column,
          anchorRect: instruction.anchorRect,
          distinctValues: instruction.distinctValues,
          currentFilter: instruction.currentFilter,
        },
      };

    case "CLOSE_FILTER_POPUP":
      return { filterPopup: null };

    case "DATA_LOADING":
      return { isLoading: true, error: null };

    case "DATA_LOADED":
      return { isLoading: false, totalRows: instruction.totalRows };

    case "DATA_ERROR":
      return { isLoading: false, error: instruction.error };

    case "ROWS_ADDED":
    case "ROWS_REMOVED":
      return { totalRows: instruction.totalRows };

    case "ROWS_UPDATED":
    case "TRANSACTION_PROCESSED":
      return null;

    case "COLUMNS_CHANGED":
      return { columns: instruction.columns };

    default:
      return null;
  }
};
