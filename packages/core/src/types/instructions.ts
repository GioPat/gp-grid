// packages/core/src/types/instructions.ts
// Grid instruction types (declarative commands)

import type { Row, CellValue, CellPosition, CellRange, SortDirection } from "./basic";
import type { ColumnDefinition } from "./columns";
import type { ColumnFilterModel } from "./filters";

// =============================================================================
// Slot Lifecycle Instructions
// =============================================================================

/** Create slot instruction */
export interface CreateSlotInstruction {
  type: "CREATE_SLOT";
  slotId: string;
}

/** Destroy slot instruction */
export interface DestroySlotInstruction {
  type: "DESTROY_SLOT";
  slotId: string;
}

/** Assign slot instruction */
export interface AssignSlotInstruction {
  type: "ASSIGN_SLOT";
  slotId: string;
  rowIndex: number;
  rowData: Row;
}

/** Move slot instruction */
export interface MoveSlotInstruction {
  type: "MOVE_SLOT";
  slotId: string;
  translateY: number;
}

// =============================================================================
// Selection Instructions
// =============================================================================

/** Set active cell instruction */
export interface SetActiveCellInstruction {
  type: "SET_ACTIVE_CELL";
  position: CellPosition | null;
}

/** Set hover position instruction (for highlighting) */
export interface SetHoverPositionInstruction {
  type: "SET_HOVER_POSITION";
  position: CellPosition | null;
}

/** Set selection range instruction */
export interface SetSelectionRangeInstruction {
  type: "SET_SELECTION_RANGE";
  range: CellRange | null;
}

/** Update visible range instruction - emitted when selection moves outside visible viewport */
export interface UpdateVisibleRangeInstruction {
  type: "UPDATE_VISIBLE_RANGE";
  start: number;
  end: number;
}

// =============================================================================
// Edit Instructions
// =============================================================================

/** Start edit instruction */
export interface StartEditInstruction {
  type: "START_EDIT";
  row: number;
  col: number;
  initialValue: CellValue;
}

/** Stop edit instruction */
export interface StopEditInstruction {
  type: "STOP_EDIT";
}

/** Commit edit instruction */
export interface CommitEditInstruction {
  type: "COMMIT_EDIT";
  row: number;
  col: number;
  value: CellValue;
}

// =============================================================================
// Layout Instructions
// =============================================================================

/** Set content size instruction */
export interface SetContentSizeInstruction {
  type: "SET_CONTENT_SIZE";
  width: number;
  height: number;
  viewportWidth: number;
}

/** Update header instruction */
export interface UpdateHeaderInstruction {
  type: "UPDATE_HEADER";
  colIndex: number;
  column: ColumnDefinition;
  sortDirection?: SortDirection;
  sortIndex?: number;
  /** Whether column is sortable */
  sortable: boolean;
  /** Whether column is filterable */
  filterable: boolean;
  /** Whether column has an active filter */
  hasFilter: boolean;
}

// =============================================================================
// Filter Popup Instructions
// =============================================================================

/** Open filter popup instruction */
export interface OpenFilterPopupInstruction {
  type: "OPEN_FILTER_POPUP";
  colIndex: number;
  column: ColumnDefinition;
  anchorRect: { top: number; left: number; width: number; height: number };
  distinctValues: CellValue[];
  currentFilter?: ColumnFilterModel;
}

/** Close filter popup instruction */
export interface CloseFilterPopupInstruction {
  type: "CLOSE_FILTER_POPUP";
}

// =============================================================================
// Fill Handle Instructions
// =============================================================================

/** Start fill instruction */
export interface StartFillInstruction {
  type: "START_FILL";
  sourceRange: CellRange;
}

/** Update fill instruction */
export interface UpdateFillInstruction {
  type: "UPDATE_FILL";
  targetRow: number;
  targetCol: number;
}

/** Commit fill instruction */
export interface CommitFillInstruction {
  type: "COMMIT_FILL";
  filledCells: Array<{ row: number; col: number; value: CellValue }>;
}

/** Cancel fill instruction */
export interface CancelFillInstruction {
  type: "CANCEL_FILL";
}

// =============================================================================
// Data Loading Instructions
// =============================================================================

/** Data loading instruction */
export interface DataLoadingInstruction {
  type: "DATA_LOADING";
}

/** Data loaded instruction */
export interface DataLoadedInstruction {
  type: "DATA_LOADED";
  totalRows: number;
}

/** Data error instruction */
export interface DataErrorInstruction {
  type: "DATA_ERROR";
  error: string;
}

// =============================================================================
// Transaction Instructions
// =============================================================================

/** Rows added instruction */
export interface RowsAddedInstruction {
  type: "ROWS_ADDED";
  count: number;
  totalRows: number;
}

/** Rows removed instruction */
export interface RowsRemovedInstruction {
  type: "ROWS_REMOVED";
  count: number;
  totalRows: number;
}

/** Rows updated instruction */
export interface RowsUpdatedInstruction {
  type: "ROWS_UPDATED";
  count: number;
}

/** Transaction processed instruction */
export interface TransactionProcessedInstruction {
  type: "TRANSACTION_PROCESSED";
  added: number;
  removed: number;
  updated: number;
}

// =============================================================================
// Union Type
// =============================================================================

/** Union type of all instructions */
export type GridInstruction =
  /** Slot lifecycle */
  | CreateSlotInstruction
  | DestroySlotInstruction
  | AssignSlotInstruction
  | MoveSlotInstruction
  /** Selection */
  | SetActiveCellInstruction
  | SetSelectionRangeInstruction
  | UpdateVisibleRangeInstruction
  /** Highlighting */
  | SetHoverPositionInstruction
  /** Editing */
  | StartEditInstruction
  | StopEditInstruction
  | CommitEditInstruction
  /** Layout */
  | SetContentSizeInstruction
  | UpdateHeaderInstruction
  /** Filter popup */
  | OpenFilterPopupInstruction
  | CloseFilterPopupInstruction
  /** Fill handle */
  | StartFillInstruction
  | UpdateFillInstruction
  | CommitFillInstruction
  | CancelFillInstruction
  /** Data */
  | DataLoadingInstruction
  | DataLoadedInstruction
  | DataErrorInstruction
  /** Transactions */
  | RowsAddedInstruction
  | RowsRemovedInstruction
  | RowsUpdatedInstruction
  | TransactionProcessedInstruction;

// =============================================================================
// Instruction Listeners
// =============================================================================

/** Instruction listener: Single instruction Listener that receives a single instruction, used by frameworks to update their state */
export type InstructionListener = (instruction: GridInstruction) => void;

/** Batch instruction listener: Batch instruction Listener that receives an array of instructions, used by frameworks to update their state */
export type BatchInstructionListener = (instructions: GridInstruction[]) => void;
