// packages/react/src/gridState/reducer.ts

import type { GridInstruction, Row } from "gp-grid-core";
import type { SlotData, HeaderData, GridState, GridAction } from "./types";

// =============================================================================
// Initial State
// =============================================================================

export interface InitialStateArgs {
  initialWidth?: number;
  initialHeight?: number;
}

export function createInitialState<TData = Row>(args?: InitialStateArgs): GridState<TData> {
  return {
    slots: new Map(),
    activeCell: null,
    selectionRange: null,
    editingCell: null,
    contentWidth: 0,
    contentHeight: args?.initialHeight ?? 0,
    viewportWidth: args?.initialWidth ?? 0,
    headers: new Map(),
    filterPopup: null,
    isLoading: false,
    error: null,
    totalRows: 0,
    visibleRowRange: null,
    hoverPosition: null,
  };
}

// =============================================================================
// Instruction Handler
// =============================================================================

/**
 * Apply a single instruction to mutable slot maps and return other state changes.
 * This allows batching multiple slot operations efficiently.
 */
export function applyInstruction<TData = Row>(
  instruction: GridInstruction,
  slots: Map<string, SlotData<TData>>,
  headers: Map<number, HeaderData>,
): Partial<GridState<TData>> | null {
  switch (instruction.type) {
    case "CREATE_SLOT":
      slots.set(instruction.slotId, {
        slotId: instruction.slotId,
        rowIndex: -1,
        rowData: {} as TData,
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
      return { visibleRowRange: { start: instruction.start, end: instruction.end } };

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

export function gridReducer<TData = Row>(state: GridState<TData>, action: GridAction): GridState<TData> {
  if (action.type === "RESET") {
    return createInitialState<TData>();
  }

  // Process batch of instructions in one state update
  const { instructions } = action;
  if (instructions.length === 0) {
    return state;
  }

  // Create mutable copies of Maps to batch updates
  const newSlots = new Map(state.slots);
  const newHeaders = new Map(state.headers);
  let stateChanges: Partial<GridState<TData>> = {};

  // Apply all instructions
  for (const instruction of instructions) {
    const changes = applyInstruction<TData>(instruction, newSlots, newHeaders);
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
