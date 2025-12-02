// gp-grid-core/src/types.ts

// =============================================================================
// Basic Types
// =============================================================================

export type CellDataType =
  | "text"
  | "number"
  | "boolean"
  | "date"
  | "dateString"
  | "dateTime"
  | "dateTimeString"
  | "object";

export type CellValue = string | number | boolean | Date | object | null;
export type Row = unknown;

export type SortDirection = "asc" | "desc";
export type SortModel = { colId: string; direction: SortDirection };
export type FilterModel = Record<string, string>;

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

export interface SelectionState {
  activeCell: CellPosition | null;
  range: CellRange | null;
  /** Anchor cell for shift-extend selection */
  anchor: CellPosition | null;
  /** Whether selection mode is active (ctrl held) */
  selectionMode: boolean;
}

// =============================================================================
// Edit State
// =============================================================================

export interface EditState {
  row: number;
  col: number;
  initialValue: CellValue;
  currentValue: CellValue;
}

// =============================================================================
// Fill Handle State
// =============================================================================

export interface FillHandleState {
  sourceRange: CellRange;
  targetRow: number;
  targetCol: number;
}

// =============================================================================
// Slot (Virtual Scroll Pool)
// =============================================================================

export interface SlotState {
  slotId: string;
  rowIndex: number;
  rowData: Row;
  translateY: number;
}

// =============================================================================
// DataSource
// =============================================================================

export interface DataSourceRequest {
  pagination: {
    pageIndex: number;
    pageSize: number;
  };
  sort?: SortModel[];
  filter?: FilterModel;
}

export interface DataSourceResponse<TData = Row> {
  rows: TData[];
  totalRows: number;
}

export interface DataSource<TData = Row> {
  fetch(request: DataSourceRequest): Promise<DataSourceResponse<TData>>;
}

// =============================================================================
// Grid Instructions (Declarative Commands)
// =============================================================================

// Slot lifecycle instructions
export interface CreateSlotInstruction {
  type: "CREATE_SLOT";
  slotId: string;
}

export interface DestroySlotInstruction {
  type: "DESTROY_SLOT";
  slotId: string;
}

export interface AssignSlotInstruction {
  type: "ASSIGN_SLOT";
  slotId: string;
  rowIndex: number;
  rowData: Row;
}

export interface MoveSlotInstruction {
  type: "MOVE_SLOT";
  slotId: string;
  translateY: number;
}

// Selection instructions
export interface SetActiveCellInstruction {
  type: "SET_ACTIVE_CELL";
  position: CellPosition | null;
}

export interface SetSelectionRangeInstruction {
  type: "SET_SELECTION_RANGE";
  range: CellRange | null;
}

// Edit instructions
export interface StartEditInstruction {
  type: "START_EDIT";
  row: number;
  col: number;
  initialValue: CellValue;
}

export interface StopEditInstruction {
  type: "STOP_EDIT";
}

export interface CommitEditInstruction {
  type: "COMMIT_EDIT";
  row: number;
  col: number;
  value: CellValue;
}

// Layout instructions
export interface SetContentSizeInstruction {
  type: "SET_CONTENT_SIZE";
  width: number;
  height: number;
}

export interface UpdateHeaderInstruction {
  type: "UPDATE_HEADER";
  colIndex: number;
  column: ColumnDefinition;
  sortDirection?: SortDirection;
  sortIndex?: number;
}

// Fill handle instructions
export interface StartFillInstruction {
  type: "START_FILL";
  sourceRange: CellRange;
}

export interface UpdateFillInstruction {
  type: "UPDATE_FILL";
  targetRow: number;
  targetCol: number;
}

export interface CommitFillInstruction {
  type: "COMMIT_FILL";
  filledCells: Array<{ row: number; col: number; value: CellValue }>;
}

export interface CancelFillInstruction {
  type: "CANCEL_FILL";
}

// Data instructions
export interface DataLoadingInstruction {
  type: "DATA_LOADING";
}

export interface DataLoadedInstruction {
  type: "DATA_LOADED";
  totalRows: number;
}

export interface DataErrorInstruction {
  type: "DATA_ERROR";
  error: string;
}

// Union type of all instructions
export type GridInstruction =
  // Slot lifecycle
  | CreateSlotInstruction
  | DestroySlotInstruction
  | AssignSlotInstruction
  | MoveSlotInstruction
  // Selection
  | SetActiveCellInstruction
  | SetSelectionRangeInstruction
  // Editing
  | StartEditInstruction
  | StopEditInstruction
  | CommitEditInstruction
  // Layout
  | SetContentSizeInstruction
  | UpdateHeaderInstruction
  // Fill handle
  | StartFillInstruction
  | UpdateFillInstruction
  | CommitFillInstruction
  | CancelFillInstruction
  // Data
  | DataLoadingInstruction
  | DataLoadedInstruction
  | DataErrorInstruction;

// =============================================================================
// Grid Options
// =============================================================================

export interface GridCoreOptions<TData = Row> {
  columns: ColumnDefinition[];
  dataSource: DataSource<TData>;
  rowHeight: number;
  headerHeight?: number;
  overscan?: number;
}

// =============================================================================
// Renderer Params (for adapters)
// =============================================================================

export interface CellRendererParams {
  value: CellValue;
  rowData: Row;
  column: ColumnDefinition;
  rowIndex: number;
  colIndex: number;
  isActive: boolean;
  isSelected: boolean;
  isEditing: boolean;
}

export interface EditRendererParams extends CellRendererParams {
  initialValue: CellValue;
  onValueChange: (newValue: CellValue) => void;
  onCommit: () => void;
  onCancel: () => void;
}

export interface HeaderRendererParams {
  column: ColumnDefinition;
  colIndex: number;
  sortDirection?: SortDirection;
  sortIndex?: number;
  onSort: (direction: SortDirection | null, addToExisting: boolean) => void;
}

// =============================================================================
// Instruction Listener
// =============================================================================

export type InstructionListener = (instruction: GridInstruction) => void;
export type BatchInstructionListener = (instructions: GridInstruction[]) => void;
