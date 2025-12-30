// packages/react/src/gridState/reducer.ts

import type { GridInstruction } from "gp-grid-core";
import type { SlotData, HeaderData, GridState, GridAction } from "./types";

// =============================================================================
// Initial State
// =============================================================================

export function createInitialState(): GridState {
  return {
    slots: new Map(),
    activeCell: null,
    selectionRange: null,
    editingCell: null,
    contentWidth: 0,
    contentHeight: 0,
    headers: new Map(),
    filterPopup: null,
    isLoading: false,
    error: null,
    totalRows: 0,
    visibleRowRange: null,
  };
}

// =============================================================================
// Instruction Handler
// =============================================================================

/**
 * Apply a single instruction to mutable slot maps and return other state changes.
 * This allows batching multiple slot operations efficiently.
 */
export function applyInstruction(
  instruction: GridInstruction,
  slots: Map<string, SlotData>,
  headers: Map<number, HeaderData>,
): Partial<GridState> | null {
  switch (instruction.type) {
    case "CREATE_SLOT":
      slots.set(instruction.slotId, {
        slotId: instruction.slotId,
        rowIndex: -1,
        rowData: {},
        translateY: 0,
      });
      return null; // Slots map is mutated

    case "DESTROY_SLOT":
      slots.delete(instruction.slotId);
      return null;

    case "ASSIGN_SLOT": {
      const existing = slots.get(instruction.slotId);
      if (existing) {
        slots.set(instruction.slotId, {
          ...existing,
          rowIndex: instruction.rowIndex,
          rowData: instruction.rowData,
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
      return { visibleRowRange: { start: instruction.start, end: instruction.end } };

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
      };

    case "UPDATE_HEADER":
      headers.set(instruction.colIndex, {
        column: instruction.column,
        sortDirection: instruction.sortDirection,
        sortIndex: instruction.sortIndex,
        sortable: instruction.sortable,
        filterable: instruction.filterable,
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

    // Transaction instructions
    case "ROWS_ADDED":
    case "ROWS_REMOVED":
      return { totalRows: instruction.totalRows };

    case "ROWS_UPDATED":
    case "TRANSACTION_PROCESSED":
      // These don't change state directly - slot updates come via ASSIGN_SLOT
      return null;

    default:
      return null;
  }
}

// =============================================================================
// Reducer
// =============================================================================

export function gridReducer(state: GridState, action: GridAction): GridState {
  if (action.type === "RESET") {
    return createInitialState();
  }

  // Process batch of instructions in one state update
  const { instructions } = action;
  if (instructions.length === 0) {
    return state;
  }

  // Create mutable copies of Maps to batch updates
  const newSlots = new Map(state.slots);
  const newHeaders = new Map(state.headers);
  let stateChanges: Partial<GridState> = {};

  // Apply all instructions
  for (const instruction of instructions) {
    const changes = applyInstruction(instruction, newSlots, newHeaders);
    if (changes) {
      stateChanges = { ...stateChanges, ...changes };
    }
  }

  // Return new state with all changes applied
  return {
    ...state,
    ...stateChanges,
    slots: newSlots,
    headers: newHeaders,
  };
}
