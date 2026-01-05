// packages/vue/src/gridState/useGridState.ts

import { reactive, readonly } from "vue";
import type {
  GridInstruction,
  GridState,
  SlotData,
  HeaderData,
} from "gp-grid-core";

// =============================================================================
// Initial State
// =============================================================================

export interface InitialStateArgs {
  initialWidth?: number;
  initialHeight?: number;
}

function createInitialState(args?: InitialStateArgs): GridState {
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
  };
}

// =============================================================================
// Instruction Handler
// =============================================================================

/**
 * Apply a single instruction to mutable state
 */
function applyInstruction(
  instruction: GridInstruction,
  state: GridState,
): void {
  switch (instruction.type) {
    case "CREATE_SLOT":
      state.slots.set(instruction.slotId, {
        slotId: instruction.slotId,
        rowIndex: -1,
        rowData: {},
        translateY: 0,
      });
      break;

    case "DESTROY_SLOT":
      state.slots.delete(instruction.slotId);
      break;

    case "ASSIGN_SLOT": {
      const existing = state.slots.get(instruction.slotId);
      if (existing) {
        state.slots.set(instruction.slotId, {
          ...existing,
          rowIndex: instruction.rowIndex,
          rowData: instruction.rowData,
        });
      }
      break;
    }

    case "MOVE_SLOT": {
      const existing = state.slots.get(instruction.slotId);
      if (existing) {
        state.slots.set(instruction.slotId, {
          ...existing,
          translateY: instruction.translateY,
        });
      }
      break;
    }

    case "SET_ACTIVE_CELL":
      state.activeCell = instruction.position;
      break;

    case "SET_SELECTION_RANGE":
      state.selectionRange = instruction.range;
      break;

    case "UPDATE_VISIBLE_RANGE":
      state.visibleRowRange = { start: instruction.start, end: instruction.end };
      break;

    case "START_EDIT":
      state.editingCell = {
        row: instruction.row,
        col: instruction.col,
        initialValue: instruction.initialValue,
      };
      break;

    case "STOP_EDIT":
      state.editingCell = null;
      break;

    case "SET_CONTENT_SIZE":
      state.contentWidth = instruction.width;
      state.contentHeight = instruction.height;
      state.viewportWidth = instruction.viewportWidth;
      break;

    case "UPDATE_HEADER":
      state.headers.set(instruction.colIndex, {
        column: instruction.column,
        sortDirection: instruction.sortDirection,
        sortIndex: instruction.sortIndex,
        sortable: instruction.sortable,
        filterable: instruction.filterable,
        hasFilter: instruction.hasFilter,
      });
      break;

    case "OPEN_FILTER_POPUP":
      state.filterPopup = {
        isOpen: true,
        colIndex: instruction.colIndex,
        column: instruction.column,
        anchorRect: instruction.anchorRect,
        distinctValues: instruction.distinctValues,
        currentFilter: instruction.currentFilter,
      };
      break;

    case "CLOSE_FILTER_POPUP":
      state.filterPopup = null;
      break;

    case "DATA_LOADING":
      state.isLoading = true;
      state.error = null;
      break;

    case "DATA_LOADED":
      state.isLoading = false;
      state.totalRows = instruction.totalRows;
      break;

    case "DATA_ERROR":
      state.isLoading = false;
      state.error = instruction.error;
      break;

    // Transaction instructions
    case "ROWS_ADDED":
    case "ROWS_REMOVED":
      state.totalRows = instruction.totalRows;
      break;

    case "ROWS_UPDATED":
    case "TRANSACTION_PROCESSED":
      // These don't change state directly - slot updates come via ASSIGN_SLOT
      break;
  }
}

// =============================================================================
// Composable
// =============================================================================

/**
 * Vue composable for managing grid state
 */
export function useGridState(args?: InitialStateArgs) {
  const state = reactive<GridState>(createInitialState(args));

  /**
   * Apply a batch of instructions to the state
   */
  function applyInstructions(instructions: GridInstruction[]): void {
    for (const instruction of instructions) {
      applyInstruction(instruction, state);
    }
  }

  /**
   * Reset state to initial values
   */
  function reset(): void {
    const initial = createInitialState();
    state.slots = initial.slots;
    state.activeCell = initial.activeCell;
    state.selectionRange = initial.selectionRange;
    state.editingCell = initial.editingCell;
    state.contentWidth = initial.contentWidth;
    state.contentHeight = initial.contentHeight;
    state.viewportWidth = initial.viewportWidth;
    state.headers = initial.headers;
    state.filterPopup = initial.filterPopup;
    state.isLoading = initial.isLoading;
    state.error = initial.error;
    state.totalRows = initial.totalRows;
    state.visibleRowRange = initial.visibleRowRange;
  }

  return {
    state,
    applyInstructions,
    reset,
  };
}

// Re-export for backwards compatibility
export { createInitialState };
