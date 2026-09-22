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

/** Row ID type for transaction operations. `1` and `"1"` are distinct. */
export type RowId = string | number;

/**
 * A displayed row and its identity. Built on request — the grid never
 * allocates one per row. 002 only produces `kind: "record"`; groups and
 * aggregates are planned for later releases.
 */
export interface ViewRow<TData = unknown> {
  kind: "record";
  /** Source identity; the view index when the source exposes none. */
  id: RowId;
  viewIndex: number;
  /** Source record, absent for record-less (columnar) rows. */
  record?: TData;
}

/** Sort direction type */
export type SortDirection = "asc" | "desc" | null;

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
  /** Edit session token; editor callbacks tagged with another one are ignored. */
  editId: number;
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

/** Event emitted when a cell value is changed via editing, fill drag, or paste */
export interface CellValueChangedEvent<TData = unknown> {
  /** Stable row ID (from getRowId) */
  rowId: RowId;
  /** Normalized column identity: `colId ?? field`. */
  columnId: string;
  /** Current view column index (resolved-layout position). */
  colIndex: number;
  /** Column field name */
  field: string;
  /** Previous cell value */
  oldValue: CellValue;
  /** New cell value */
  newValue: CellValue;
  /** The full row data object */
  rowData: TData;
}

/** Which supported write entry point a refused write came from. */
export type WriteRejectionOperation =
  | "setCellValue"
  | "edit"
  | "paste"
  | "fill"
  | "row-move";

/** Emitted when a write is refused because the bound source is read-only. */
export interface CellWriteRejectedEvent {
  /** View row index the write targeted; the dragged row for `row-move` */
  row: number;
  /** Column index the write targeted; `-1` when the operation has no column */
  col: number;
  /** Source field key, when the column exists */
  field: string;
  /** Why the write was refused */
  reason: "read-only-source";
  /** Attempted write entry point that was refused */
  operation: WriteRejectionOperation;
}

/** The slot is the virtualized row, this represents the state of the slot */
export interface SlotState {
  /** Slot ID */
  slotId: string;
  /** Row index */
  rowIndex: number;
  /** Row data */
  rowData: unknown;
  /**
   * Monotonic assignment generation. Bumped every time the slot is assigned
   * (including recycling), so a late callback can be told apart from the
   * assignment that produced it.
   */
  generation: number;
  /** Translate Y position of the slot, we use translateY to optimize the rendering of the slots (Relies on the GP) */
  translateY: number;
}
