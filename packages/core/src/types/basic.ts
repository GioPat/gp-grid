// packages/core/src/types/basic.ts
// Basic types: primitives, cell values, positions, ranges

/** Cell data type primitive types */
export type CellDataType =
  | "text"
  | "number"
  | "boolean"
  | "date"
  | "dateString"
  | "dateTime"
  | "dateTimeString"
  | "object";

/** Cell value type */
export type CellValue = string | number | boolean | Date | object | null;

/** Row type */
export type Row = unknown;

/** Row ID type for transaction operations */
export type RowId = string | number;

/** Sort direction type */
export type SortDirection = "asc" | "desc";

/** Sort model type */
export type SortModel = { colId: string; direction: SortDirection };

/** Cell position */
export interface CellPosition {
  row: number;
  col: number;
}

/** Cell range */
export interface CellRange {
  startRow: number;
  startCol: number;
  endRow: number;
  endCol: number;
}

/** Selection state */
export interface SelectionState {
  /** Active cell position */
  activeCell: CellPosition | null;
  /** Selection range */
  range: CellRange | null;
  /** Anchor cell for shift-extend selection */
  anchor: CellPosition | null;
  /** Whether selection mode is active (ctrl held) */
  selectionMode: boolean;
}

/** Edit state */
export interface EditState {
  /** Row index */
  row: number;
  /** Column index */
  col: number;
  /** Initial value */
  initialValue: CellValue;
  /** Current value */
  currentValue: CellValue;
}

/** Fill handle state */
export interface FillHandleState {
  /** Source range */
  sourceRange: CellRange;
  /** Target row */
  targetRow: number;
  /** Target column */
  targetCol: number;
}

/** The slot is the virtualized row, this represents the state of the slot */
export interface SlotState {
  /** Slot ID */
  slotId: string;
  /** Row index */
  rowIndex: number;
  /** Row data */
  rowData: Row;
  /** Translate Y position of the slot, we use translateY to optimize the rendering of the slots (Relies on the GP) */
  translateY: number;
}
