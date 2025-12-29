// gp-grid-core/src/types.ts

// =============================================================================
// Basic Types
// =============================================================================

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

// =============================================================================
// Filter Types
// =============================================================================

/** Text filter operators */
export type TextFilterOperator =
  | "contains"
  | "notContains"
  | "equals"
  | "notEquals"
  | "startsWith"
  | "endsWith"
  | "blank"
  | "notBlank";

/** Number filter operators (symbols for display) */
export type NumberFilterOperator =
  | "="
  | "!="
  | ">"
  | "<"
  | ">="
  | "<="
  | "between"
  | "blank"
  | "notBlank";

/** Date filter operators */
export type DateFilterOperator =
  | "="
  | "!="
  | ">"
  | "<"
  | "between"
  | "blank"
  | "notBlank";

/** Filter combination mode */
export type FilterCombination = "and" | "or";

/** Text filter condition */
export interface TextFilterCondition {
  type: "text";
  operator: TextFilterOperator;
  value?: string;
  /** Selected distinct values for checkbox-style filtering */
  selectedValues?: Set<string>;
  /** Include blank values */
  includeBlank?: boolean;
}

/** Number filter condition */
export interface NumberFilterCondition {
  type: "number";
  operator: NumberFilterOperator;
  value?: number;
  /** Second value for "between" operator */
  valueTo?: number;
}

/** Date filter condition */
export interface DateFilterCondition {
  type: "date";
  operator: DateFilterOperator;
  value?: Date | string;
  /** Second value for "between" operator */
  valueTo?: Date | string;
}

/** Union of filter condition types */
export type FilterCondition =
  | TextFilterCondition
  | NumberFilterCondition
  | DateFilterCondition;

/** Column filter model with multiple conditions */
export interface ColumnFilterModel {
  conditions: FilterCondition[];
  combination: FilterCombination;
}

/** Filter model type - maps column ID to filter */
export type FilterModel = Record<string, ColumnFilterModel>;

// =============================================================================
// Column Definition
// =============================================================================

export interface ColumnDefinition {
  field: string;
  colId?: string;
  cellDataType: CellDataType;
  width: number;
  headerName?: string;
  editable?: boolean;
  /** Whether column is sortable. Default: true when sortingEnabled */
  sortable?: boolean;
  /** Whether column is filterable. Default: true */
  filterable?: boolean;
  /** Renderer key for adapter lookup, or inline renderer function */
  cellRenderer?: string;
  editRenderer?: string;
  headerRenderer?: string;
}

// =============================================================================
// Cell Position & Range
// =============================================================================

export interface CellPosition {
  row: number;
  col: number;
}

export interface CellRange {
  startRow: number;
  startCol: number;
  endRow: number;
  endCol: number;
}

// =============================================================================
// Selection State
// =============================================================================

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

// =============================================================================
// Edit State
// =============================================================================

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

// =============================================================================
// Fill Handle State
// =============================================================================

/** Fill handle state */
export interface FillHandleState {
  /** Source range */
  sourceRange: CellRange;
  /** Target row */
  targetRow: number;
  /** Target column */
  targetCol: number;
}

// =============================================================================
// Slot (Virtual Scroll Pool)
// =============================================================================

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

// =============================================================================
// DataSource
// =============================================================================

/** Data source request */
export interface DataSourceRequest {
  /** Pagination */
  pagination: {
    /** Page index */
    pageIndex: number;
    /** Page size */
    pageSize: number;
  };
  /** Sort */
  sort?: SortModel[];
  /** Filter */
  filter?: FilterModel;
}

/** Data source response */
export interface DataSourceResponse<TData = Row> {
  /** Rows */
  rows: TData[];
  /** Total rows */
  totalRows: number;
}

export interface DataSource<TData = Row> {
  fetch(request: DataSourceRequest): Promise<DataSourceResponse<TData>>;
}

// =============================================================================
// Grid Instructions (Declarative Commands)
// =============================================================================

/** Slot lifecycle instructions */
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

/** Selection instructions */
export interface SetActiveCellInstruction {
  type: "SET_ACTIVE_CELL";
  position: CellPosition | null;
}

/** Set selection range instruction */
export interface SetSelectionRangeInstruction {
  type: "SET_SELECTION_RANGE";
  range: CellRange | null;
}

/** Edit instructions */
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

/** Layout instructions */
export interface SetContentSizeInstruction {
  type: "SET_CONTENT_SIZE";
  width: number;
  height: number;
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

/** Fill handle instructions */
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
// Grid Options
// =============================================================================

/** Grid core options */
export interface GridCoreOptions<TData = Row> {
  /** Column definitions */
  columns: ColumnDefinition[];
  /** Data source */
  dataSource: DataSource<TData>;
  /** Row height */
  rowHeight: number;
  /** Header height: Default to row height */
  headerHeight?: number;
  /** Overscan: How many rows to render outside the viewport */
  overscan?: number;
  /** Enable/disable sorting globally. Default: true */
  sortingEnabled?: boolean;
  /** Debounce time for transactions in ms. Default 50. Set to 0 for sync. */
  transactionDebounceMs?: number;
  /** Function to extract unique ID from row. Required for mutations. */
  getRowId?: (row: TData) => RowId;
}

// =============================================================================
// Renderer Params (for adapters)
// =============================================================================

/** Cell renderer params */
export interface CellRendererParams {
  /** Cell value */
  value: CellValue;
  /** Row data */
  rowData: Row;
  /** Column definition */
  column: ColumnDefinition;
  /** Row index */
  rowIndex: number;
  /** Column index */
  colIndex: number;
  /** Is active cell */
  isActive: boolean;
  /** Is selected cell */
  isSelected: boolean;
  /** Is editing cell */
  isEditing: boolean;
}

/** Edit renderer params */
export interface EditRendererParams extends CellRendererParams {
  /** Initial value */
  initialValue: CellValue;
  /** On value change */
  onValueChange: (newValue: CellValue) => void;
  /** On commit */
  onCommit: () => void;
  /** On cancel */
  onCancel: () => void;
}

/** Header renderer params */
export interface HeaderRendererParams {
  /** Column definition */
  column: ColumnDefinition;
  /** Column index */
  colIndex: number;
  /** Sort direction */
  sortDirection?: SortDirection;
  /** Sort index */
  sortIndex?: number;
  /** Whether column is sortable */
  sortable: boolean;
  /** Whether column is filterable */
  filterable: boolean;
  /** Whether column has an active filter */
  hasFilter: boolean;
  /** On sort */
  onSort: (direction: SortDirection | null, addToExisting: boolean) => void;
  /** On filter click */
  onFilterClick: () => void;
}

// =============================================================================
// Instruction Listener
// =============================================================================

/** Instruction listener: Single instruction Listener that receives a single instruction, used by frameworks to update their state */
export type InstructionListener = (instruction: GridInstruction) => void;
/** Batch instruction listener: Batch instruction Listener that receives an array of instructions, used by frameworks to update their state */
export type BatchInstructionListener = (instructions: GridInstruction[]) => void;
