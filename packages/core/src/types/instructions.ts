// packages/core/src/types/instructions.ts
// Grid instruction types (declarative commands)

import type {
  Row,
  CellValue,
  CellPosition,
  CellRange,
  SortDirection,
} from "./basic";
import type { ColumnDefinition } from "./columns";
import type { ColumnFilterModel } from "./filters";

// Re-use ColumnDefinition for column change instructions

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

/** Update visible range instruction - emitted on scroll or when selection moves outside visible viewport */
export interface UpdateVisibleRangeInstruction {
  type: "UPDATE_VISIBLE_RANGE";
  start: number;
  end: number;
  /**
   * Y offset for the rows wrapper container when virtualization is active.
   * This allows rows to use small translateY values (viewport-relative)
   * instead of absolute positions (millions of pixels).
   */
  rowsWrapperOffset: number;
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
  viewportHeight: number;
  /**
   * Y offset for the rows wrapper container when virtualization is active.
   * This allows rows to use small translateY values (viewport-relative)
   * instead of absolute positions (millions of pixels).
   */
  rowsWrapperOffset: number;
}

/** Update header instruction */
export interface UpdateHeaderInstruction {
  type: "UPDATE_HEADER";
  colIndex: number;
  column: ColumnDefinition;
  sortDirection?: SortDirection;
  sortIndex?: number;
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
  indices: number[];
  count: number;
  totalRows: number;
}

/** Rows removed instruction */
export interface RowsRemovedInstruction {
  type: "ROWS_REMOVED";
  indices: number[];
  totalRows: number;
}

/** Rows updated instruction */
export interface RowsUpdatedInstruction {
  type: "ROWS_UPDATED";
  indices: number[];
}

/** Transaction processed instruction */
export interface TransactionProcessedInstruction {
  type: "TRANSACTION_PROCESSED";
  added: number;
  removed: number;
  updated: number;
}

// =============================================================================
// Column Change Instructions
// =============================================================================

/** Columns changed (after resize, reorder, etc.) */
export interface ColumnsChangedInstruction {
  type: "COLUMNS_CHANGED";
  columns: ColumnDefinition[];
}

// =============================================================================
// Column Resize Instructions
// =============================================================================

/** Column resize started */
export interface StartColumnResizeInstruction {
  type: "START_COLUMN_RESIZE";
  colIndex: number;
  initialWidth: number;
}

/** Column resize in progress */
export interface UpdateColumnResizeInstruction {
  type: "UPDATE_COLUMN_RESIZE";
  colIndex: number;
  currentWidth: number;
}

/** Column resize committed */
export interface CommitColumnResizeInstruction {
  type: "COMMIT_COLUMN_RESIZE";
  colIndex: number;
  newWidth: number;
}

/** Column resize cancelled */
export interface CancelColumnResizeInstruction {
  type: "CANCEL_COLUMN_RESIZE";
}

// =============================================================================
// Column Move Instructions
// =============================================================================

/** Column move started */
export interface StartColumnMoveInstruction {
  type: "START_COLUMN_MOVE";
  sourceColIndex: number;
}

/** Column move position updated */
export interface UpdateColumnMoveInstruction {
  type: "UPDATE_COLUMN_MOVE";
  currentX: number;
  currentY: number;
  dropTargetIndex: number | null;
}

/** Column move committed */
export interface CommitColumnMoveInstruction {
  type: "COMMIT_COLUMN_MOVE";
  sourceColIndex: number;
  targetColIndex: number;
}

/** Column move cancelled */
export interface CancelColumnMoveInstruction {
  type: "CANCEL_COLUMN_MOVE";
}

// =============================================================================
// Row Drag Instructions
// =============================================================================

/** Row drag started */
export interface StartRowDragInstruction {
  type: "START_ROW_DRAG";
  sourceRowIndex: number;
}

/** Row drag position updated */
export interface UpdateRowDragInstruction {
  type: "UPDATE_ROW_DRAG";
  currentX: number;
  currentY: number;
  dropTargetIndex: number | null;
}

/** Row drag committed */
export interface CommitRowDragInstruction {
  type: "COMMIT_ROW_DRAG";
  sourceRowIndex: number;
  targetRowIndex: number;
}

/** Row drag cancelled */
export interface CancelRowDragInstruction {
  type: "CANCEL_ROW_DRAG";
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
  | TransactionProcessedInstruction
  /** Column changes */
  | ColumnsChangedInstruction
  /** Column resize */
  | StartColumnResizeInstruction
  | UpdateColumnResizeInstruction
  | CommitColumnResizeInstruction
  | CancelColumnResizeInstruction
  /** Column move */
  | StartColumnMoveInstruction
  | UpdateColumnMoveInstruction
  | CommitColumnMoveInstruction
  | CancelColumnMoveInstruction
  /** Row drag */
  | StartRowDragInstruction
  | UpdateRowDragInstruction
  | CommitRowDragInstruction
  | CancelRowDragInstruction;

// =============================================================================
// Instruction Listeners
// =============================================================================

/** Instruction listener: Single instruction Listener that receives a single instruction, used by frameworks to update their state */
export type InstructionListener = (instruction: GridInstruction) => void;

/** Batch instruction listener: Batch instruction Listener that receives an array of instructions, used by frameworks to update their state */
export type BatchInstructionListener = (
  instructions: GridInstruction[],
) => void;
